import { loadPyodide, type PyodideInterface } from 'pyodide';
import type { WorkerRequest, CompletionRequest } from './workerTypes';
import type { Output, Variable } from '../types';

let pyodide: PyodideInterface;

// Isolated context for user variables (Python dictionary)
// Isolated context for user variables (Python dictionary)
let contexts = new Map<string, any>();
let active_context: any;

// Context management helper
function getContext(notebookId?: string) {
    if (!notebookId) {
        // Fallback for requests without ID (should be rare) or initial setup
        if (!active_context) {
            active_context = pyodide.runPython("{}");
            const setup_context = pyodide.globals.get("setup_context");
            setup_context(active_context);
            setup_context.destroy();
        }
        return active_context;
    }

    if (!contexts.has(notebookId)) {
        console.log(`Worker: Creating new context for notebook ${notebookId}`);
        const new_ctx = pyodide.runPython("{}");
        const setup_context = pyodide.globals.get("setup_context");
        setup_context(new_ctx);
        setup_context.destroy();

        // Inject plt if ready
        if (matplotlibReady) {
            const inject_plt = pyodide.globals.get('inject_plt');
            if (inject_plt) {
                inject_plt(new_ctx);
                inject_plt.destroy();
            }
        }
        contexts.set(notebookId, new_ctx);
    }

    active_context = contexts.get(notebookId);
    return active_context;
}
// Keys present in the context before user execution (SymPy functions, etc.)
let ambient_keys: Set<string> = new Set();
let matplotlibReady = false;
let matplotlibPromise: Promise<void> | null = null;

const INITIAL_PYTHON_CODE = `
import sys
import io
import base64
import traceback
import ast
import re as _re
import builtins
import keyword
# Matplotlib imports removed for concurrent loading
from sympy import *
import tokenize
from io import BytesIO

def preprocess_equation_syntax(code):
    try:
        # Encoding check
        tokens = list(tokenize.tokenize(BytesIO(code.encode('utf-8')).readline))
    except tokenize.TokenError:
        return code

    # We will store (type, string) tuples only to avoid coordinate issues
    result_tokens = []
    
    # Target functions that expect Equations
    TARGET_FUNCS = {'solve', 'dsolve', 'nsolve', 'solveset', 'nonlinsolve', 'linsolve'}
    
    # SymPy Reserved Keywords (Single Source of Truth)
    SYMPY_RESERVED_ARGS = {
        'check', 'simplify', 'rational', 'manual', 'implicit', 'hint', 
        'force', 'dict', 'set', 'verify', 'exclude', 'quick', 'cubics', 
        'quartics', 'quintics', 'domain', 'symbols', 'flags'
    }
    
    call_stack = [] 
    paren_level = 0
    
    i = 0
    while i < len(tokens):
        tok = tokens[i]
        tok_simple = (tok.type, tok.string)
        
        if tok.exact_type == tokenize.LPAR: # (
            prev_tok = tokens[i-1] if i > 0 else None
            func_name = None
            if prev_tok and prev_tok.type == tokenize.NAME and prev_tok.string in TARGET_FUNCS:
                func_name = prev_tok.string
            
            call_stack.append(func_name)
            paren_level += 1
            result_tokens.append(tok_simple)
            
        elif tok.exact_type == tokenize.RPAR: # )
            paren_level -= 1
            if call_stack:
                call_stack.pop()
            result_tokens.append(tok_simple)
            
        elif tok.exact_type == tokenize.EQUAL: # =
            current_func = call_stack[-1] if call_stack else None
            
            if current_func in TARGET_FUNCS:
                lhs_is_simple_name = False
                prev_tok = tokens[i-1]
                
                if prev_tok.type == tokenize.NAME:
                    prev_prev = tokens[i-2] if i > 1 else None
                    if prev_prev:
                        if prev_prev.exact_type in (tokenize.LPAR, tokenize.COMMA, tokenize.NL, tokenize.NEWLINE, tokenize.INDENT):
                            lhs_is_simple_name = True
                    else:
                        pass
                
                should_replace = False
                if not lhs_is_simple_name:
                    # LHS is an expression -> Always replace
                    should_replace = True
                else:
                    # LHS is simple name. Check Reserved List.
                    if prev_tok.string not in SYMPY_RESERVED_ARGS:
                        should_replace = True
                    else:
                        should_replace = False
                
                if should_replace:
                    # REPLACE '=' with '- ('
                    result_tokens.append((tokenize.OP, '-'))
                    result_tokens.append((tokenize.OP, '('))
                    
                    # SCAN FOR END of RHS to insert ')'
                    scan_idx = i + 1
                    rhs_paren_depth = 0
                    found_end = False
                    end_idx = scan_idx
                    
                    while end_idx < len(tokens):
                        scan_tok = tokens[end_idx]
                        
                        if scan_tok.exact_type == tokenize.LPAR:
                            rhs_paren_depth += 1
                        elif scan_tok.exact_type == tokenize.RPAR:
                            rhs_paren_depth -= 1
                            
                        # Stop if function call closes
                        if rhs_paren_depth < 0:
                            found_end = True
                            break
                        
                        # Stop if comma at base level
                        if rhs_paren_depth == 0 and scan_tok.exact_type == tokenize.COMMA:
                            found_end = True
                            break
                            
                        end_idx += 1
                    
                    if found_end:
                        # Append tokens from i+1 to end_idx (exclusive)
                        for k in range(i + 1, end_idx):
                            result_tokens.append((tokens[k].type, tokens[k].string))
                        
                        # Insert ')'
                        result_tokens.append((tokenize.OP, ')'))
                        
                        i = end_idx - 1
                    else:
                        # Fallback
                        result_tokens.append(tok_simple)
                else:
                    result_tokens.append(tok_simple)
            else:
                result_tokens.append(tok_simple)
        else:
            result_tokens.append(tok_simple)
        i += 1

    return tokenize.untokenize(result_tokens).decode('utf-8')



# Code Analyzer for Smart Batch Fix
class CodeAnalyzer(ast.NodeVisitor):
    def __init__(self, ctx_keys):
        self.ctx_keys = set(ctx_keys) if ctx_keys else set()
        self.scope_stack = ['global']
        
        # Variables defined in the code (exclusions)
        self.defined_in_scope = {'global': set()}
        
        # Candidates for symbolic definition (Name in Load context)
        self.candidates = set()
        
        # Excluded names (Used as function, attribute, type hint, decorator, etc.)
        self.excluded = set()
        
        # Setup Runtime Blacklist
        # 1. Python Reserved Keywords
        self.reserved = set(keyword.kwlist)
        # 2. Builtins (print, list, etc.)
        self.reserved.update(dir(builtins))
        # 3. SymPy Constants (Critical ones that shouldn't be overridden inadvertently)
        self.reserved.update({'I', 'E', 'N', 'S', 'O', 'pi', 'oo', 'zoo', 'nan', 'true', 'false'})

    def enter_scope(self, scope_name):
        self.scope_stack.append(scope_name)
        self.defined_in_scope[scope_name] = set()

    def exit_scope(self):
        self.scope_stack.pop()

    def visit_FunctionDef(self, node):
        self.defined_in_scope['global'].add(node.name)
        # Exclude decorators
        for decorator in node.decorator_list:
            self._exclude_complex_node(decorator)
            
        self.enter_scope('function')
        for arg in node.args.args:
            self.defined_in_scope['function'].add(arg.arg)
        self.generic_visit(node)
        self.exit_scope()

    def visit_ClassDef(self, node):
        self.defined_in_scope['global'].add(node.name)
        # Exclude decorators
        for decorator in node.decorator_list:
            self._exclude_complex_node(decorator)
        # Exclude base classes
        for base in node.bases:
            self._exclude_complex_node(base)
            
        self.enter_scope('class')
        self.generic_visit(node)
        self.exit_scope()
    
    def visit_AnnAssign(self, node):
        # x: int = 10 -> 'int' should be excluded
        self._exclude_complex_node(node.annotation)
        self.generic_visit(node)

    def visit_ExceptHandler(self, node):
        # except Exception as e: -> 'Exception' excluded
        if node.type:
            self._exclude_complex_node(node.type)
        if node.name:
            self.defined_in_scope.setdefault(self.scope_stack[-1], set()).add(node.name)
        self.generic_visit(node)

    def visit_Lambda(self, node):
        self.enter_scope('lambda')
        for arg in node.args.args:
            self.defined_in_scope['lambda'].add(arg.arg)
        self.generic_visit(node)
        self.exit_scope()
    
    def visit_ListComp(self, node):
        self.enter_scope('listcomp')
        self.generic_visit(node)
        self.exit_scope()

    def visit_SetComp(self, node):
        self.enter_scope('setcomp')
        self.generic_visit(node)
        self.exit_scope()
    
    def visit_DictComp(self, node):
        self.enter_scope('dictcomp')
        self.generic_visit(node)
        self.exit_scope()
        
    def visit_GeneratorExp(self, node):
        self.enter_scope('genexp')
        self.generic_visit(node)
        self.exit_scope()

    def visit_Name(self, node):
        current_scope = self.scope_stack[-1]
        
        # If Store, add to current scope definition
        if isinstance(node.ctx, ast.Store):
            if current_scope == 'global':
                 # If global store, it's defined globally (even if appearing later)
                 self.defined_in_scope['global'].add(node.id)
            else:
                 self.defined_in_scope.setdefault(current_scope, set()).add(node.id)

        # If Load in global scope, it is a candidate
        elif isinstance(node.ctx, ast.Load):
             if current_scope == 'global':
                 self.candidates.add(node.id)

    def visit_Call(self, node):
        # Exclude function name from being a candidate
        self._exclude_complex_node(node.func)
        self.generic_visit(node)

    def visit_Attribute(self, node):
        # Exclude object name in obj.prop
        # But allow 'obj' if it's the target of a load, handled by visit_Name? 
        # Actually visit_Attribute visits value. 
        # If we have obj.prop, obj is a Name. 
        # We generally want to treat 'obj' as a VARIABLE if it's not defined.
        # But wait, if obj is undefined, obj.prop causes NameError on obj.
        # So obj SHOULD be a candidate.
        # The previous logic was: exclude obj.prop's obj? No, that prevents 'obj' from being auto-defined.
        # Wait, if I have 'unknown.prop', and 'unknown' is undefined, I want to define 'unknown'.
        # The only thing to exclude is 'prop' if that was somehow a candidate (it's not a Name node usually, it's a field).
        # Ah, previous logic: if isinstance(node.value, ast.Name): self.excluded.add(node.value.id)
        # This meant: "If you call obj.prop, assume 'obj' is an existing object, don't try to make it a symbol."
        # Because symbols don't usually have props. 
        # But if the user wants 'energy.value', and energy is a symbol... symbols DO have props in SymPy.
        # So disabling this exclusion might be better for flexibility?
        # Let's keep it safe: if it's used as an object (attribute access), it's likely NOT a simple symbol we should auto-define.
        # If user writes 'obj.prop', and obj is undefined, making it a Symbol('obj') makes 'obj.prop' into 'Symbol(obj).prop' which works in SymPy?
        # Yes, SymPy symbols are objects.
        # However, for typical usage, if someone writes 'np.sin(x)' and imports are missing, defining 'np' as a Symbol is BAD.
        # So we SHOULD exclude 'names used as objects' to prevent 'np' or 'math' being defined as symbols.
        if isinstance(node.value, ast.Name):
             self.excluded.add(node.value.id)
        self.generic_visit(node)
        
    def _exclude_complex_node(self, node):
        """Helper to recursively find names in a node and exclude them."""
        if isinstance(node, ast.Name):
            self.excluded.add(node.id)
        elif isinstance(node, ast.Attribute):
            self._exclude_complex_node(node.value)
        # We can add more logic here if needed for deeper structures

    def analyze(self):
        # Final set of variables to recommend
        valid_vars = set()
        
        # Debugging
        # print("DEBUG: Candidates:", self.candidates)
        # print("DEBUG: Excluded:", self.excluded)
        
        for var in self.candidates:
            # 1. Defined check
            if var in self.defined_in_scope['global']: 
                continue
            
            # 2. Context exclusion check (Call, Attribute target, Type Hint, etc.)
            if var in self.excluded: 
                continue
            
            # 3. Dynamic Runtime Blacklist Check (Builtins, Keywords, critical SymPy constants)
            if var in self.reserved: 
                continue
            
            # 4. Context Check (Already in current session context?)
            if var in self.ctx_keys:
                 # If it's already defined in the kernel, we don't need to redefine it
                 # Unless... well, NameError means it wasn't found. 
                 # But ctx_keys are passed at init time. 
                 # If it caused NameError, it's NOT in ctx. 
                 # So this check is just a safeguard against race conditions or partial updates.
                 continue

            # 5. Passed all checks -> Valid Candidate (Blacklist approach)
            valid_vars.add(var)
                     
        return sorted(list(valid_vars))


# Setup the user context with default symbols and functions
def setup_context(ctx):
    # Inject all sympy functions into the user context
    exec("from sympy import *", {}, ctx)
    # Default symbols
    ctx['x'], ctx['y'], ctx['z'], ctx['t'] = ctx['symbols']('x y z t')
    
    # Initialize Out dictionary and _ variable
    # We use a dedicated dictionary for Out to prevent accidental overwrites
    ctx['Out'] = {}
    ctx['_'] = None
    
    # plt is injected later when ready

def format_error(e, code=None, ctx_keys=None):
    # Get exception info
    exc_type, exc_value, exc_traceback = sys.exc_info()
    
    # Format message
    error_name = exc_type.__name__
    message = str(exc_value)
    
    # Get line number and handle SyntaxError specially
    line_no = None
    if isinstance(e, SyntaxError):
        line_no = e.lineno
    else:
        # Extract traceback and find the last frame in the user's code
        # Filter out internal Pyodide and worker internal frames
        tb_list = traceback.extract_tb(exc_traceback)
        for frame in reversed(tb_list):
            if frame.filename == '<string>' or frame.filename == '<exec>':
                line_no = frame.lineno
                break
    
    # Format traceback (removing internal frames to keep it professional)
    # We use traceback.format_exception but filter the output if possible
    # For now, we'll keep the full one but maybe strip the header if it's redundant
    tb_lines = traceback.format_exception(exc_type, exc_value, exc_traceback)
    
    # Filter out entries that are purely internal to pyodide/worker setup
    filtered_tb = []
    for line in tb_lines:
        if 'File "/lib/' in line or 'File "/tokenize.py"' in line:
            continue
        filtered_tb.append(line)
        
    formatted_tb = "".join(filtered_tb)
    
    # Extract missing variables for NameError (Smart Batch Fix)
    missing_vars = []
    
    if error_name == 'NameError' and code is not None:
        try:
            tree = ast.parse(code)
            analyzer = CodeAnalyzer(ctx_keys)
            analyzer.visit(tree)
            missing_vars = analyzer.analyze()
        except:
            # Fallback for parsing error
            pass

    return {
        "errorName": error_name,
        "message": message,
        "lineNo": line_no,
        "traceback": formatted_tb,
        "missingVariables": missing_vars
    }

def execute_cell(code, ctx, execution_count=None):
    # Close previous figures only if plt is available
    if 'plt' in ctx:
        ctx['plt'].close('all')
    
    stdout_buffer = io.StringIO()
    sys.stdout = stdout_buffer
    error_data = None
    result_val = None
    latex_res = None
    
    # DEBUG: Check context consistency
    # print(f"Worker DEBUG: Execution Count: {execution_count}")
    
    try:
        # Preprocess equation syntax (x+1=0 -> x+1-(0))
        try:
            code = preprocess_equation_syntax(code)
        except:
            pass

        # AST-based execution for accurate line numbers and REPL-style eval/exec split
        tree = ast.parse(code)
        
        if not tree.body:
            # Empty code
            pass
        else:
            last_node = tree.body[-1]
            if isinstance(last_node, ast.Expr):
                # If the last node is an expression, we evaluate it to get the result
                # 1. Execute all but the last node
                if len(tree.body) > 1:
                    exec_mod = ast.Module(body=tree.body[:-1], type_ignores=[])
                    exec(compile(exec_mod, '<string>', 'exec'), ctx)
                
                # 2. Evaluate the last expression
                eval_expr = ast.Expression(body=last_node.value)
                result_val = eval(compile(eval_expr, '<string>', 'eval'), ctx)
            else:
                # If the last node is not an expression (e.g. assignment), just exec all
                exec(compile(tree, '<string>', 'exec'), ctx)
                result_val = None
            
            # Update Out reference if we have a result and execution count
            if result_val is not None:
                 # Update _ (last result)
                 ctx['_'] = result_val
                 
                 if execution_count is not None:
                    # Ensure Out exists
                    if 'Out' not in ctx:
                        ctx['Out'] = {}
                    
                    ctx['Out'][execution_count] = result_val
                    ctx[f'_{execution_count}'] = result_val
                    # print(f"Worker DEBUG: Saved to Out[{execution_count}]")
    
    except Exception as e:
        error_data = format_error(e, code=code, ctx_keys=list(ctx.keys()))
        result_val = None
        
    sys.stdout = sys.__stdout__
    stdout_content = stdout_buffer.getvalue()
    
    if result_val is not None:
        try:
            latex_res = latex(result_val)
        except:
            pass
            
    images = []
    if 'plt' in ctx:
        plt_local = ctx['plt']
        # Iterate over all figure numbers
        for fignum in plt_local.get_fignums():
            plt_local.figure(fignum) # Set as current figure to save
            buf = io.BytesIO()
            plt_local.savefig(buf, format='png', bbox_inches='tight')
            buf.seek(0)
            img_str = base64.b64encode(buf.read()).decode('utf-8')
            images.append(img_str)
        # Close all figures after capturing
        plt_local.close('all')
        
    return {
        "stdout": stdout_content,
        "result": str(result_val) if result_val is not None else None,
        "latex": latex_res,
        "images": images,
        "error": error_data,
        "tsv": get_tsv(result_val)
    }

def get_tsv(val):
    if val is None: return None
    try:
        # Check for SymPy Matrix
        if hasattr(val, 'rows') and hasattr(val, 'cols'):
            lines = []
            for r in range(val.rows):
                lines.append("\\t".join([str(val[r, c]) for c in range(val.cols)]))
            return "\\n".join(lines)
        
        # Check for list of lists (2D array)
        if isinstance(val, (list, tuple)) and len(val) > 0 and isinstance(val[0], (list, tuple)):
            lines = []
            for row in val:
                lines.append("\\t".join([str(x) for x in row]))
            return "\\n".join(lines)
            
        # Check for flat list
        if isinstance(val, (list, tuple)):
            return "\\n".join([str(x) for x in val])
    except:
        pass
    return None


# Docutils integration for RST to HTML conversion
import docutils.core
def convert_rst_to_html(rst_text):
    import docutils.core
    import re
    if not rst_text:
        return ""
    try:
        # Many docstrings (like SymPy's) use $...$ for inline math, 
        # which isn't standard RST. Convert them to :math:\`...\` roles.
        # We use a simple regex but try to avoid multi-line matches for now 
        # as it can be ambiguous with other $ usage.
        # Note: double backslashes are needed because this is inside a JS template literal.
        processed_rst = re.sub(r'\\$([^\\n$]+)\\$', r':math:\`\\1\`', rst_text)
        
        # Settings to get a clean HTML snippet (body only)
        settings = {
            'output_encoding': 'unicode',
            'initial_header_level': 3,
            'doctitle_xform': False,
            'report_level': 5, # Suppress warnings/errors in output
            'math_output': 'MathJax', # This keeps math as raw LaTeX inside spans
        }
        # Use HTML5 writer
        html = docutils.core.publish_string(
            source=processed_rst,
            writer_name='html5',
            settings_overrides=settings
        )
        return html
    except Exception as e:
        return f"<div class='error'>Conversion Error: {str(e)}</div><pre>{rst_text}</pre>"

def _get_help(name, ctx):
    import inspect
    if name not in ctx:
        return None
    obj = ctx[name]
    try:
        sig = str(inspect.signature(obj))
    except:
        sig = ""
    doc = inspect.getdoc(obj)
    module = inspect.getmodule(obj)
    
    html_doc = convert_rst_to_html(doc) if doc else None
    
    return {
        "name": name,
        "signature": sig,
        "docstring": doc or "No documentation found.",
        "htmlContent": html_doc,
        "module": module.__name__ if module else None
    }

def _get_completions(prefix, ctx):
    import builtins
    completions = []
    
    all_names = set(dir(builtins)) | set(ctx.keys())
    
    for name in all_names:
        if name.startswith('_'):
            continue
        if not prefix or name.startswith(prefix):
            try:
                obj = ctx.get(name) if name in ctx else getattr(builtins, name, None)
                if obj is None:
                    continue
                    
                obj_type = type(obj).__name__
                kind = 'Variable'
                if callable(obj):
                    if obj_type == 'type':
                        kind = 'Class'
                    else:
                        kind = 'Function'
                elif obj_type == 'module':
                    kind = 'Module'
                    
                detail = ''
                try:
                    import inspect
                    if callable(obj) and kind == 'Function':
                        detail = str(inspect.signature(obj))
                except:
                    pass
                    
                completions.append({
                    'label': name,
                    'kind': kind,
                    'detail': detail
                })
            except:
                pass
    
    return completions

# Search implementation with Dynamic Frequency Analysis (Quote-Free Robust Strategy)
_search_globals = {
    "analyzed": False,
    # Define stop words without multiple quotes to avoid syntax errors
    "stop_words": set("the a an and or of to in is it that this for with as by on at from".split())
}

def _analyze_frequencies(ctx):
    import random
    import collections
    import sympy
    import string
    
    if _search_globals["analyzed"]:
        return

    try:
        # Sample docstrings from sympy
        candidates = []
        for name in dir(sympy):
            if not name.startswith('_'):
                try:
                    candidates.append(getattr(sympy, name))
                except:
                    pass
        
        candidates_with_doc = [c for c in candidates if hasattr(c, '__doc__') and isinstance(c.__doc__, str)]
        
        # Sample 100 docs
        sample_size = 100
        if len(candidates_with_doc) > sample_size:
            sample = random.sample(candidates_with_doc, sample_size)
        else:
            sample = candidates_with_doc
            
        doc_counts = collections.Counter()
        for obj in sample:
            doc = obj.__doc__
            # Safe split without quotes
            words = set(doc.lower().split())
            for w in words:
                # Safe strip using standard library
                w_clean = w.strip(string.punctuation)
                if len(w_clean) > 2:
                    doc_counts[w_clean] += 1
                    
        # Threshold: words appearing in > 20% of docs are noise
        threshold = len(sample) * 0.2
        new_stop_words = {w for w, count in doc_counts.items() if count > threshold}
        
        _search_globals["stop_words"].update(new_stop_words)
        _search_globals["analyzed"] = True
    except Exception:
        # Fail-safe: ensure app never crashes due to stats analysis
        pass

def _search_docs(query, ctx):
    import inspect
    
    # 1. Analyze if needed
    _analyze_frequencies(ctx)
    
    query = query.strip()
    if not query:
        return {"symbols": [], "mentions": []}
        
    query_lower = query.lower()
    
    # 2. Check stop words
    is_stop_word = query_lower in _search_globals["stop_words"]
    skip_mentions = is_stop_word or len(query) < 3
    
    symbols = []
    mentions = []
    
    # Gather search targets
    targets = {}
    
    # Add context variables
    for name, obj in ctx.items():
        if not name.startswith('_'):
            targets[name] = obj
            
    count_mentions = 0
    limit_mentions = 30
    
    sorted_names = sorted(targets.keys())
    
    for name in sorted_names:
        obj = targets[name]
        name_lower = name.lower()
        
        # A. Symbol Match
        if query_lower in name_lower:
            try:
                doc = inspect.getdoc(obj)
                module = inspect.getmodule(obj)
                html_doc = convert_rst_to_html(doc) if doc else None
                symbols.append({
                    "name": name,
                    "signature": str(inspect.signature(obj)) if hasattr(obj, '__call__') else "",
                    "docstring": doc or "",
                    "htmlContent": html_doc,
                    "module": module.__name__ if module else None
                })
            except:
                pass
                
        # B. Mention Match
        if not skip_mentions and count_mentions < limit_mentions:
            try:
                doc = inspect.getdoc(obj)
                if doc:
                    doc_lower = doc.lower()
                    idx = doc_lower.find(query_lower)
                    if idx != -1:
                        if query_lower not in name_lower:
                            # Create Snippet
                            start = max(0, idx - 40)
                            end = min(len(doc), idx + 40 + len(query))
                            snippet = "..." + doc[start:end].replace('\\n', ' ') + "..."
                            
                            module = inspect.getmodule(obj)
                            html_doc = convert_rst_to_html(doc) if doc else None
                            mentions.append({
                                "name": name,
                                "signature": str(inspect.signature(obj)) if hasattr(obj, '__call__') else "",
                                "docstring": doc,
                                "htmlContent": html_doc,
                                "module": module.__name__ if module else None,
                                "snippet": snippet
                            })
                            count_mentions += 1
            except:
                pass

    # Sort symbols by relevance:
    # 1. Exact match (e.g. 'sin' == 'sin')
    # 2. Prefix match (e.g. 'sin' in 'sinh')
    # 3. Shortest length (e.g. 'sin' < 'sine_transform')
    # 4. Alphabetical
    def symbol_sort_key(item):
        n = item["name"]
        n_low = n.lower()
        q_low = query_lower
        
        is_exact = n_low == q_low
        is_start = n_low.startswith(q_low)
        
        # False < True in Python (0 < 1). We want True to be first.
        # So we use 'not' or negate.
        # (False, False, ...) comes before (True, ...)
        # We want: 
        # Exact=True -> (0, ...)
        # Exact=False -> (1, ...)
        return (not is_exact, not is_start, len(n), n)

    symbols.sort(key=symbol_sort_key)
                
    return {"symbols": symbols[:20], "mentions": mentions}
`;


// initPyodide starting

initPyodide();
async function initPyodide() {
    const start = performance.now();
    const timings: Record<string, number> = {};
    const logTime = (label: string, duration: number) => {
        timings[label] = duration;
        console.log(`Worker: ${label} took ${duration.toFixed(0)}ms`);
    };

    console.log('Worker: Initializing Pyodide (v0.29.0)...');
    try {
        const t1 = performance.now();
        pyodide = await loadPyodide({
            indexURL: "https://cdn.jsdelivr.net/pyodide/v0.29.0/full/"
        });
        logTime('load_pyodide', performance.now() - t1);

        console.log('Worker: Loading critical packages (sympy, docutils)...');
        const t2 = performance.now();
        // STAGE 1: Load only critical packages
        await pyodide.loadPackage(['sympy', 'docutils']);
        logTime('load_critical_packages', performance.now() - t2);

        console.log('Worker: Running initial Python code...');
        const t3 = performance.now();
        await pyodide.runPythonAsync(INITIAL_PYTHON_CODE);

        // Initialize default context
        active_context = pyodide.runPython("{}");
        const setup_context = pyodide.globals.get("setup_context");
        setup_context(active_context);
        setup_context.destroy();

        // Capture ambient keys to hide them from the Variable Inspector
        ambient_keys = new Set(); // Re-declare ambient_keys
        const keys = pyodide.globals.get('list')(active_context.keys()).toJs();
        // Also exclude hidden Out variables
        ambient_keys.add('Out');
        for (const key of keys) ambient_keys.add(key);

        logTime('init_context', performance.now() - t3);

        const total = performance.now() - start;
        logTime('total_init', total);

        console.log(`Worker: Engine Ready (SymPy only). Total init time: ${total.toFixed(0)}ms`);
        self.postMessage({ type: 'READY' });
        self.postMessage({ type: 'PROFILE', timings });

        // STAGE 2: Load heavy packages in background
        console.log('Worker: Starting background load of matplotlib...');
        const tBackground = performance.now();
        matplotlibPromise = (async () => {
            try {
                await pyodide.loadPackage(['matplotlib']);

                // Post-load setup for matplotlib
                await pyodide.runPythonAsync(`
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
def inject_plt(ctx):
    ctx['plt'] = plt
                `);

                const inject_plt = pyodide.globals.get('inject_plt');
                // Inject into the default/active context for now, or just hold off until needed
                if (active_context) {
                    inject_plt(active_context);
                }
                inject_plt.destroy();

                matplotlibReady = true;
                self.postMessage({ type: 'GRAPHICS_READY' });
                console.log(`Worker: Matplotlib loaded in background in ${(performance.now() - tBackground).toFixed(0)}ms`);
            } catch (e) {
                console.error('Worker: Failed to load background packages', e);
            }
        })();
    } catch (err: any) {
        console.error('Worker: Pyodide initialization failed', err);
        self.postMessage({ type: 'ERROR', message: `Pyodide initialization failed: ${err.message}` });
    }
}

self.onmessage = async (event: MessageEvent<WorkerRequest | CompletionRequest>) => {
    const { id, action } = event.data;

    if (action === 'COMPLETE') {
        try {
            if (!pyodide) throw new Error('Engine not ready');

            const { code, position, notebookId } = event.data as CompletionRequest;
            const prefix = code.substring(0, position).split(/\s+/).pop() || '';

            const ctx = getContext(notebookId);
            const _get_completions = pyodide.globals.get("_get_completions");
            const completionsProxy = _get_completions(prefix, ctx);
            const completions = completionsProxy.toJs({ dict_converter: Object.fromEntries });
            completionsProxy.destroy();

            self.postMessage({
                id,
                completions
            });
            return;
        } catch (err: any) {
            self.postMessage({
                id,
                completions: []
            });
            return;
        }
    }

    if (action === 'RESET_CONTEXT') {
        const { notebookId } = event.data as WorkerRequest;
        try {
            if (!pyodide) throw new Error('Engine not ready');

            console.log(`Worker: Resetting context for notebook ${notebookId}...`);

            if (notebookId && contexts.has(notebookId)) {
                const ctx = contexts.get(notebookId);
                ctx.destroy();
                contexts.delete(notebookId);
                // Creating a new one automatically via getContext next time it's needed
                getContext(notebookId);
            } else if (!notebookId && active_context) {
                // Legacy behavior or fallback? clear active
                active_context.destroy();
                active_context = undefined;
                getContext(); // Recreate default
            }

            console.log('Worker: Context reset complete');

            // Re-inject plt if matplotlib is ready
            if (matplotlibReady) {
                const inject_plt = pyodide.globals.get('inject_plt');
                if (inject_plt) {
                    inject_plt(getContext(notebookId)); // Inject into the (newly created) context
                    inject_plt.destroy();
                }
            }

            self.postMessage({
                id,
                status: 'SUCCESS',
                results: []
            });
            return;
        } catch (err: any) {
            console.error('Worker: Reset failed', err);
            self.postMessage({
                id,
                status: 'ERROR',
                results: [{ type: 'error', value: 'Context reset failed: ' + err.message, timestamp: Date.now() }]
            });
            return;
        }
    }

    if (action === 'EXECUTE') {
        const { code, notebookId, executionCount } = event.data as WorkerRequest;
        try {
            if (!pyodide) throw new Error('Engine not ready');

            const ctx = getContext(notebookId);

            // If the code uses plotting functions, wait for matplotlib if it's still loading
            const containsPlotting = code.includes('plot') || code.includes('plt.');
            if (containsPlotting && !matplotlibReady && matplotlibPromise) {
                console.log('Worker: Waiting for graphics engine to load before executing plot...');
                await matplotlibPromise;
            }

            // Documentation interceptor: Check if code starts with '?'
            const trimmedCode = code.trim();
            if (trimmedCode.startsWith('?')) {
                const query = trimmedCode.substring(1).trim();
                const _search_docs = pyodide.globals.get("_search_docs");
                const resultsProxy = _search_docs(query, ctx);
                const results = resultsProxy.toJs({ dict_converter: Object.fromEntries });
                resultsProxy.destroy();

                self.postMessage({
                    id,
                    status: 'SUCCESS',
                    results: [],
                    searchResults: results // Return specialized search structure
                });
                return;
            }

            const execute_cell = pyodide.globals.get("execute_cell");
            const resultProxy = execute_cell(code, ctx, executionCount);
            const result = resultProxy.toJs({ dict_converter: Object.fromEntries });
            resultProxy.destroy();

            const outputs: Output[] = [];
            const timestamp = Date.now();

            if (result.stdout && result.stdout.trim()) {
                outputs.push({ type: 'text', value: result.stdout, timestamp });
            }

            // Enhanced Error Handling
            if (result.error) {
                // Ensure error is an object, handling legacy string errors if any
                const errorVal = typeof result.error === 'string' ? { message: result.error } : result.error;
                outputs.push({
                    type: 'error',
                    value: errorVal.message,
                    errorName: errorVal.errorName,
                    lineNo: errorVal.lineNo,
                    traceback: errorVal.traceback,
                    missingVariables: errorVal.missingVariables,
                    timestamp
                });
            } else {
                if (result.latex && result.latex !== 'None' && result.latex.trim()) {
                    outputs.push({
                        type: 'latex',
                        value: result.latex,
                        rawText: result.result,
                        tsv: result.tsv,
                        timestamp
                    });
                } else if (result.result && result.result !== 'None' && result.result.trim()) {
                    outputs.push({
                        type: 'text',
                        value: result.result,
                        rawText: result.result,
                        tsv: result.tsv,
                        timestamp
                    });
                }

                if (result.images && Array.isArray(result.images)) {
                    result.images.forEach((img: string) => {
                        outputs.push({ type: 'image', value: `data:image/png;base64,${img}`, timestamp });
                    });
                } else if (result.image) {
                    outputs.push({ type: 'image', value: `data:image/png;base64,${result.image}`, timestamp });
                }
            }

            // After successful execution, get the current user variables
            const variables = getVariables();

            self.postMessage({ id, status: result.error ? 'ERROR' : 'SUCCESS', results: outputs, variables });
        } catch (err: any) {
            self.postMessage({
                id,
                status: 'ERROR',
                results: [{ type: 'error', value: err.message, timestamp: Date.now() }],
                variables: [] // No variables on error, or an empty array
            });
        }
    }

    if (action === 'DELETE_VARIABLE') {
        const { code, notebookId } = event.data as WorkerRequest; // code will contain variable name
        const varName = code;
        try {
            if (!pyodide) throw new Error('Engine not ready');
            const ctx = getContext(notebookId);

            console.log(`Worker: Deleting variable ${varName}`);

            // Check if variable exists
            if (ctx.has(varName)) {
                // Remove from Python context
                pyodide.runPython(`
try:
    if '${varName}' in locals():
        del ${varName}
except:
    pass
`, { globals: ctx });
            }

            // Return updated variables list
            const variables = getVariables();
            self.postMessage({
                id,
                status: 'SUCCESS',
                results: [],
                variables
            });
        } catch (err: any) {
            self.postMessage({
                id,
                status: 'ERROR',
                results: [{ type: 'error', value: `Failed to delete variable: ${err.message}`, timestamp: Date.now() }]
            });
        }
    }

};

function getVariables(): Variable[] {
    if (!pyodide || !active_context) return []; // Use active_context

    const vars: Variable[] = [];
    const ignored = new Set([
        '__builtins__', 'symbols', 'Matrix', 'Rational', 'Integer', 'Float',
        'Symbol', 'Function', 'plt', 'x', 'y', 'z', 't', 'setup_context', 'execute_cell', 'format_error', 'Out'
    ]);

    try {
        const keys = pyodide.globals.get('list')(active_context.keys()).toJs();

        for (const key of keys) {
            // Skip ambient keys (SymPy functions, etc.), internal symbols, or non-string keys
            if (typeof key !== 'string' || ambient_keys.has(key) || ignored.has(key) || key.startsWith('_')) continue;

            try {
                const val = active_context.get(key);
                if (typeof val === 'function') continue;

                const typeName = pyodide.globals.get('type')(val).__name__;
                let strVal = String(val);
                if (strVal.length > 100) strVal = strVal.substring(0, 97) + "...";

                vars.push({ name: key, type: typeName, value: strVal });
            } catch (e) {
                // Skip if error
            }
        }
    } catch (e) {
        console.error('Error fetching variables:', e);
    }
    return vars;
}
