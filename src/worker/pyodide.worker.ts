import { loadPyodide, type PyodideInterface } from 'pyodide';
import type { WorkerRequest } from './workerTypes';
import type { Output } from '../types';

let pyodide: PyodideInterface;

// Isolated context for user variables (Python dictionary)
let contexts = new Map<string, any>();
let active_context: any;

// Context management helper
function getContext(notebookId?: string) {
    if (!notebookId) {
        // Fallback or initial setup
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

        // Inject extensions if ready
        if (matplotlibReady) {
            const load_extended_context = pyodide.globals.get('load_extended_context');
            if (load_extended_context) {
                load_extended_context(new_ctx);
                load_extended_context.destroy();
            }
        }
        contexts.set(notebookId, new_ctx);
    }

    active_context = contexts.get(notebookId);
    return active_context;
}

// Keys present in the context before user execution
// Keys present in the context before user execution
let matplotlibReady = false;
let extensionsPromise: Promise<void> | null = null;

// Core SymPy imports for fast startup (Phase 1)
// CORRECTED: 'Re' -> 're', 'Im' -> 'im'
const CORE_SYMPY_IMPORTS = [
    // Basic
    'symbols', 'Symbol', 'Integer', 'Float', 'Rational', 'S',
    // Algebra / Equations
    'solve', 'nsolve', 'dsolve', 'solveset', 'linsolve', 'nonlinsolve', 'Eq',
    // Calculus
    'diff', 'integrate', 'limit', 'series', 'summation',
    // Simplification & Expansion
    'simplify', 'expand', 'factor', 'collect', 'cancel', 'apart',
    // Functions
    'sin', 'cos', 'tan', 'exp', 'log', 'sqrt', 'asin', 'acos', 'atan',
    // Matrices
    'Matrix', 'eye', 'zeros', 'ones', 'diag',
    // Complex Numbers
    're', 'im', 'Abs', 'arg', 'conjugate',
    // Constants
    'pi', 'E', 'I', 'oo', 'nan', 'zoo',
    // Logic
    'true', 'false',
    // Latex
    'latex'
].join(', ');

const INITIAL_PYTHON_CODE = `
import sys
import io
import base64
import traceback
import ast
import re as _re
import builtins
import keyword
import tokenize
from io import BytesIO

# NOTE: SymPy is NOT imported globally here (Phase 1 Optimization)

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
    
    # SymPy Reserved Keywords
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
                    should_replace = True
                else:
                    if prev_tok.string not in SYMPY_RESERVED_ARGS:
                        should_replace = True
                    else:
                        should_replace = False
                
                if should_replace:
                    result_tokens.append((tokenize.OP, '-'))
                    result_tokens.append((tokenize.OP, '('))
                    
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
                        if rhs_paren_depth < 0:
                            found_end = True
                            break
                        if rhs_paren_depth == 0 and scan_tok.exact_type == tokenize.COMMA:
                            found_end = True
                            break
                        end_idx += 1
                    
                    if found_end:
                        for k in range(i + 1, end_idx):
                            result_tokens.append((tokens[k].type, tokens[k].string))
                        result_tokens.append((tokenize.OP, ')'))
                        i = end_idx - 1
                    else:
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
        self.defined_in_scope = {'global': set()}
        self.candidates = set()
        self.excluded = set()
        self.reserved = set(keyword.kwlist)
        self.reserved.update(dir(builtins))
        self.reserved.update({'I', 'E', 'N', 'S', 'O', 'pi', 'oo', 'zoo', 'nan', 'true', 'false'})

    def enter_scope(self, scope_name):
        self.scope_stack.append(scope_name)
        self.defined_in_scope[scope_name] = set()

    def exit_scope(self):
        self.scope_stack.pop()

    def visit_FunctionDef(self, node):
        self.defined_in_scope['global'].add(node.name)
        for decorator in node.decorator_list:
            self._exclude_complex_node(decorator)
        self.enter_scope('function')
        for arg in node.args.args:
            self.defined_in_scope['function'].add(arg.arg)
        self.generic_visit(node)
        self.exit_scope()

    def visit_ClassDef(self, node):
        self.defined_in_scope['global'].add(node.name)
        for decorator in node.decorator_list:
            self._exclude_complex_node(decorator)
        for base in node.bases:
            self._exclude_complex_node(base)
        self.enter_scope('class')
        self.generic_visit(node)
        self.exit_scope()
    
    def visit_AnnAssign(self, node):
        self._exclude_complex_node(node.annotation)
        self.generic_visit(node)

    def visit_ExceptHandler(self, node):
        if node.type: self._exclude_complex_node(node.type)
        if node.name: self.defined_in_scope.setdefault(self.scope_stack[-1], set()).add(node.name)
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
        if isinstance(node.ctx, ast.Store):
            if current_scope == 'global':
                 self.defined_in_scope['global'].add(node.id)
            else:
                 self.defined_in_scope.setdefault(current_scope, set()).add(node.id)
        elif isinstance(node.ctx, ast.Load):
             if current_scope == 'global':
                 self.candidates.add(node.id)

    def visit_Call(self, node):
        self._exclude_complex_node(node.func)
        self.generic_visit(node)

    def visit_Attribute(self, node):
        if isinstance(node.value, ast.Name):
             self.excluded.add(node.value.id)
        self.generic_visit(node)
        
    def _exclude_complex_node(self, node):
        if isinstance(node, ast.Name):
            self.excluded.add(node.id)
        elif isinstance(node, ast.Attribute):
            self._exclude_complex_node(node.value)

    def analyze(self):
        valid_vars = set()
        for var in self.candidates:
            if var in self.defined_in_scope['global']: continue
            if var in self.excluded: continue
            if var in self.reserved: continue
            if var in self.ctx_keys: continue
            valid_vars.add(var)
        return sorted(list(valid_vars))

# Setup the user context with default symbols and functions
def setup_context(ctx):
    # Phase 1: Core explicit import
    # This string will be formatted in JS
    code = "from sympy import ${CORE_SYMPY_IMPORTS}"
    exec(code, {}, ctx)
    
    # Default symbols
    ctx['x'], ctx['y'], ctx['z'], ctx['t'] = ctx['symbols']('x y z t')

    # Initialize Out dictionary and _ variable
    ctx['Out'] = {}
    ctx['_'] = None
    
    # plt is injected later

def format_error(e, code=None, ctx_keys=None):
    exc_type, exc_value, exc_traceback = sys.exc_info()
    error_name = exc_type.__name__
    message = str(exc_value)
    
    line_no = None
    if isinstance(e, SyntaxError):
        line_no = e.lineno
    else:
        tb_list = traceback.extract_tb(exc_traceback)
        for frame in reversed(tb_list):
            if frame.filename == '<string>' or frame.filename == '<exec>':
                line_no = frame.lineno
                break
    
    tb_lines = traceback.format_exception(exc_type, exc_value, exc_traceback)
    filtered_tb = []
    for line in tb_lines:
        if 'File "/lib/' in line or 'File "/tokenize.py"' in line:
            continue
        filtered_tb.append(line)
        
    formatted_tb = "".join(filtered_tb)
    
    missing_vars = []
    if error_name == 'NameError' and code is not None:
        try:
            tree = ast.parse(code)
            analyzer = CodeAnalyzer(ctx_keys)
            analyzer.visit(tree)
            missing_vars = analyzer.analyze()
        except:
            pass

    return {
        "errorName": error_name,
        "message": message,
        "lineNo": line_no,
        "traceback": formatted_tb,
        "missingVariables": missing_vars
    }

def execute_cell(code, ctx, execution_count=None):
    if 'plt' in ctx:
        ctx['plt'].close('all')
    
    stdout_buffer = io.StringIO()
    sys.stdout = stdout_buffer
    error_data = None
    result_val = None
    latex_res = None
    
    try:
        try:
            code = preprocess_equation_syntax(code)
        except:
            pass

        tree = ast.parse(code)
        
        if not tree.body:
            pass
        else:
            last_node = tree.body[-1]
            if isinstance(last_node, ast.Expr):
                if len(tree.body) > 1:
                    exec_mod = ast.Module(body=tree.body[:-1], type_ignores=[])
                    exec(compile(exec_mod, '<string>', 'exec'), ctx)
                
                eval_expr = ast.Expression(body=last_node.value)
                result_val = eval(compile(eval_expr, '<string>', 'eval'), ctx)
            else:
                exec(compile(tree, '<string>', 'exec'), ctx)
                result_val = None
            
            if result_val is not None:
                 ctx['_'] = result_val
                 if execution_count is not None:
                    if 'Out' not in ctx: ctx['Out'] = {}
                    ctx['Out'][execution_count] = result_val
                    ctx[f'_{execution_count}'] = result_val
    
    except Exception as e:
        error_data = format_error(e, code=code, ctx_keys=list(ctx.keys()))
        result_val = None
        
    sys.stdout = sys.__stdout__
    stdout_content = stdout_buffer.getvalue()
    
    try:
        from sympy import latex
    except ImportError:
         latex = str

    if result_val is not None:
        try:
            latex_res = latex(result_val)
        except:
            pass
            
    images = []
    if 'plt' in ctx:
        plt_local = ctx['plt']
        for fignum in plt_local.get_fignums():
            plt_local.figure(fignum)
            buf = io.BytesIO()
            plt_local.savefig(buf, format='png', bbox_inches='tight')
            buf.seek(0)
            img_str = base64.b64encode(buf.read()).decode('utf-8')
            images.append(img_str)
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
        if hasattr(val, 'rows') and hasattr(val, 'cols'):
            lines = []
            for r in range(val.rows):
                lines.append("\\t".join([str(val[r, c]) for c in range(val.cols)]))
            return "\\n".join(lines)
        if isinstance(val, (list, tuple)) and len(val) > 0 and isinstance(val[0], (list, tuple)):
            lines = []
            for row in val:
                lines.append("\\t".join([str(x) for x in row]))
            return "\\n".join(lines)
        if isinstance(val, (list, tuple)):
            return "\\n".join([str(x) for x in val])
    except:
        pass
    return None

def convert_rst_to_html(rst_text):
    if not rst_text: return ""
    try:
        import docutils.core
        import re
        processed_rst = re.sub(r'\\$([^\\n$]+)\\$', r':math:\`\\1\`', rst_text)
        settings = {
            'output_encoding': 'unicode',
            'initial_header_level': 3,
            'doctitle_xform': False,
            'report_level': 5,
            'math_output': 'MathJax',
        }
        return docutils.core.publish_string(source=processed_rst, writer_name='html5', settings_overrides=settings)
    except ImportError:
        return f"<div class='info'>Documentation preview unavailable (Loading...)</div><pre>{rst_text}</pre>"
    except Exception as e:
        return f"<div class='error'>Conversion Error: {str(e)}</div><pre>{rst_text}</pre>"

def _get_help(name, ctx):
    import inspect
    if name not in ctx: return None
    obj = ctx[name]
    try: sig = str(inspect.signature(obj))
    except: sig = ""
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
        if name.startswith('_'): continue
        if not prefix or name.startswith(prefix):
            try:
                obj = ctx.get(name) if name in ctx else getattr(builtins, name, None)
                if obj is None: continue
                obj_type = type(obj).__name__
                kind = 'Variable'
                if callable(obj):
                    kind = 'Class' if obj_type == 'type' else 'Function'
                elif obj_type == 'module': kind = 'Module'
                detail = ''
                try: 
                    import inspect
                    if callable(obj) and kind == 'Function': detail = str(inspect.signature(obj))
                except: pass
                completions.append({'label': name, 'kind': kind, 'detail': detail})
            except: pass
    return completions

_search_globals = {"analyzed": False, "stop_words": set("the a an and or of to in is it that this for with as by on at from".split())}

def _analyze_frequencies(ctx):
    import random, collections, sympy, string
    if _search_globals["analyzed"]: return
    try:
        candidates = []
        for name in dir(sympy):
            if not name.startswith('_'):
                try: candidates.append(getattr(sympy, name))
                except: pass
        candidates_with_doc = [c for c in candidates if hasattr(c, '__doc__') and isinstance(c.__doc__, str)]
        sample = random.sample(candidates_with_doc, 100) if len(candidates_with_doc) > 100 else candidates_with_doc
        doc_counts = collections.Counter()
        for obj in sample:
            for w in set(obj.__doc__.lower().split()):
                w_clean = w.strip(string.punctuation)
                if len(w_clean) > 2: doc_counts[w_clean] += 1
        threshold = len(sample) * 0.2
        _search_globals["stop_words"].update({w for w, count in doc_counts.items() if count > threshold})
        _search_globals["analyzed"] = True
    except: pass

def _search_docs(query, ctx):
    import inspect
    _analyze_frequencies(ctx)
    query = query.strip()
    if not query: return {"symbols": [], "mentions": []}
    query_lower = query.lower()
    is_stop_word = query_lower in _search_globals["stop_words"]
    skip_mentions = is_stop_word or len(query) < 3
    symbols = []; mentions = []
    targets = {name: obj for name, obj in ctx.items() if not name.startswith('_')}
    count_mentions = 0
    limit_mentions = 30
    
    for name in sorted(targets.keys()):
        obj = targets[name]
        name_lower = name.lower()
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
            except: pass
        if not skip_mentions and count_mentions < limit_mentions:
            try:
                doc = inspect.getdoc(obj)
                if doc:
                    doc_lower = doc.lower()
                    idx = doc_lower.find(query_lower)
                    if idx != -1:
                        if query_lower not in name_lower:
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
            except: pass

    def symbol_sort_key(item):
        n = item["name"]
        n_low = n.lower()
        q_low = query_lower
        is_exact = n_low == q_low
        is_start = n_low.startswith(q_low)
        return (not is_exact, not is_start, len(n), n)

    symbols.sort(key=symbol_sort_key)
    return {"symbols": symbols[:20], "mentions": mentions}
`;

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

        console.log('Worker: Loading critical packages (sympy)...');
        const t2 = performance.now();
        // STAGE 1: Load only critical packages (SymPy)
        await pyodide.loadPackage(['sympy']);
        logTime('load_critical_packages', performance.now() - t2);

        console.log('Worker: Running initial Python code...');
        const t3 = performance.now();
        await pyodide.runPythonAsync(INITIAL_PYTHON_CODE);
        logTime('run_initial_code', performance.now() - t3);

        console.log('Worker: Setting up user context (Core)...');
        const t4 = performance.now();

        // Initialize default context
        active_context = pyodide.runPython("{}");

        // Setup with CORE imports
        // Manually format the Python string to avoid invalid syntax in interpolated string
        const setup_script = `
import sympy
from sympy import ${CORE_SYMPY_IMPORTS}
x, y, z, t = sympy.symbols('x y z t')

def load_core(ctx):
    # Explicit imports
    ctx['sympy'] = sympy
    # We loop to inject core symbols
    g = globals()
    for name in [${CORE_SYMPY_IMPORTS.split(', ').map(s => `'${s}'`).join(', ')}]:
        if name in g:
            ctx[name] = g[name]
    ctx['x'], ctx['y'], ctx['z'], ctx['t'] = x, y, z, t
`;
        await pyodide.runPythonAsync(setup_script);

        // Call setup_context in python to finalize (Out, etc.)
        const setup_context = pyodide.globals.get("setup_context");
        setup_context(active_context);
        setup_context.destroy();

        logTime('setup_user_context', performance.now() - t4);

        const total = performance.now() - start;
        logTime('total_init', total);

        console.log(`Worker: Engine Ready (Core SymPy). Total init time: ${total.toFixed(0)}ms`);
        self.postMessage({ type: 'READY' });

        self.postMessage({
            type: 'PROFILE',
            timings: {
                'Load Pyodide Library': timings['load_pyodide'] || 0,
                'Load SymPy': timings['load_critical_packages'] || 0,
                'Run Initial Code (Core)': timings['run_initial_code'] || 0,
                'Setup User Context (Core)': timings['setup_user_context'] || 0,
                'Total Initialization (Phase 1)': total
            }
        });

        // STAGE 2: Background Loading (Extensions)
        console.log('Worker: Loading extensions...');
        const tBackground = performance.now();

        extensionsPromise = Promise.all([
            pyodide.loadPackage(['docutils']),
            pyodide.loadPackage(['matplotlib'])
        ]).then(async () => {
            // 2. Load Full SymPy Context & Matplotlib
            await pyodide.runPythonAsync(`
import sympy
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

def load_extended_context(ctx):
    # Import everything from SymPy into the user context
    exec("from sympy import *", {}, ctx)

    # Import vector module (Stage 2)
    try:
        exec("from sympy.vector import *", {}, ctx)
    except ImportError:
        pass
    
    # Explicitly import available plotting functions
    try:
        from sympy.plotting import plot, plot3d, plot_parametric, plot_implicit, plot3d_parametric_surface
        ctx['plot'] = plot
        ctx['plot3d'] = plot3d
        ctx['plot_parametric'] = plot_parametric
        ctx['plot_implicit'] = plot_implicit
        ctx['plot3d_parametric_surface'] = plot3d_parametric_surface
    except ImportError:
        pass
    
    # Inject plotting
    ctx['plt'] = plt
    ctx['matplotlib'] = matplotlib
`);

            // Mark graphics ready
            matplotlibReady = true;

            // Inject into current context
            if (active_context) {
                const load_extended_context = pyodide.globals.get('load_extended_context');
                load_extended_context(active_context);
                load_extended_context.destroy();
            }

            self.postMessage({ type: 'GRAPHICS_READY' });
            console.log(`Worker: Extensions ready (${(performance.now() - tBackground).toFixed(0)}ms)`);

        }).catch(e => {
            console.error('Worker: Background load failed', e);
        });

    } catch (err: any) {
        console.error('Worker: Pyodide initialization failed', err);
        self.postMessage({ type: 'ERROR', message: `Pyodide initialization failed: ${err.message}` });
    }
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
    const { id, action, code, notebookId, executionCount } = event.data;

    if (!pyodide) {
        self.postMessage({ id, status: 'ERROR', results: [{ type: 'error', value: 'Pyodide not authorized or not ready', timestamp: Date.now() }] });
        return;
    }

    const ctx = getContext(notebookId);

    if (action === 'EXECUTE') {
        try {
            // Check for premature plotting/vector usage (Enhanced Regex)
            // Keywords that require full extensions loaded
            const extendedKeywords = /\b(plot\w*|CoordSys3D|divergence|curl|gradient)\s*\(/;

            if (extendedKeywords.test(code) && !matplotlibReady && extensionsPromise) {
                console.log("Worker: Waiting for extensions to load before execution...");
                await extensionsPromise;
            }

            const execute_cell = pyodide.globals.get('execute_cell');
            let result_py = execute_cell(code, ctx, executionCount);
            // STRICT CONVERSION
            let result = result_py.toJs({ dict_converter: Object.fromEntries });

            // RETRY STRATEGY: If NameError occurs while loading, wait and retry
            // This covers generic cases like 'plot3d', 'gamma', etc.
            if (result.error && result.error.errorName === 'NameError' && !matplotlibReady && extensionsPromise) {
                console.log(`Worker: NameError (${result.error.message}) detected during loading. Waiting for extensions...`);
                // Check if the missing variable is likely to be loaded (heuristic)
                // For now, we optimistically wait if ANY NameError occurs during loading phase.

                result_py.destroy(); // Cleanup failed attempt
                await extensionsPromise;

                // Retry execution
                console.log("Worker: Retrying execution after extensions loaded...");
                // Re-get execute_cell in case it changed (though unlikely)
                result_py = execute_cell(code, ctx, executionCount);
                result = result_py.toJs({ dict_converter: Object.fromEntries });
            }

            result_py.destroy();
            execute_cell.destroy();

            const output: Output[] = [];

            if (result.stdout) {
                output.push({ type: 'text', value: result.stdout, timestamp: Date.now() });
            }

            if (result.error) {
                const errorData = result.error;
                output.push({
                    type: 'error',
                    value: errorData.message,
                    traceback: errorData.traceback,
                    errorName: errorData.errorName,
                    lineNo: errorData.lineNo,
                    missingVariables: errorData.missingVariables ? Array.from(errorData.missingVariables) : [],
                    timestamp: Date.now()
                });
            }

            const resultVal = result.result;
            const latexVal = result.latex;
            const tsvVal = result.tsv;

            if (resultVal && resultVal !== 'None') {
                // Determine simplest expression type
                // Use 'latex' type if available to ensure nice rendering, OR 'text' fallback
                // Frontend seems to treat 'text' as plain monospaced, 'latex' as block math?
                // Let's rely on 'latex' property presence.
                const type = latexVal ? 'latex' : 'text';
                const value = latexVal ? latexVal : resultVal;

                output.push({
                    type: type,
                    value: value,
                    tsv: tsvVal || undefined,
                    timestamp: Date.now()
                });
            }

            if (result.images) {
                const images = result.images;
                for (const img of images) {
                    output.push({ type: 'image', value: `data:image/png;base64,${img}`, timestamp: Date.now() });
                }
            }

            self.postMessage({ id, status: 'SUCCESS', results: output });

        } catch (err: any) {
            self.postMessage({ id, status: 'ERROR', results: [{ type: 'error', value: err.message, timestamp: Date.now() }] });
        }
    }
    else if (action === 'GET_COMPLETIONS') {
        try {
            if (!pyodide.globals.has('_get_completions')) {
                self.postMessage({ id, status: 'SUCCESS', completions: [] });
                return;
            }
            const get_completions = pyodide.globals.get('_get_completions');
            const completions = get_completions(code, ctx).toJs();
            get_completions.destroy();
            self.postMessage({ id, status: 'SUCCESS', completions });
        } catch (e) {
            self.postMessage({ id, status: 'ERROR', completions: [] });
        }
    }
    else if (action === 'GET_DOCS') {
        try {
            if (!pyodide.globals.has('_search_docs')) {
                self.postMessage({ id, status: 'SUCCESS', docs: { symbols: [], mentions: [] } });
                return;
            }
            const search_docs = pyodide.globals.get('_search_docs');
            const docs = search_docs(code, ctx).toJs();
            search_docs.destroy();
            self.postMessage({ id, status: 'SUCCESS', docs });
        } catch (e) {
            self.postMessage({ id, status: 'ERROR', docs: { symbols: [], mentions: [] } });
        }
    }
    else if (action === 'GET_HELP') {
        try {
            if (!pyodide.globals.has('_get_help')) {
                self.postMessage({ id, status: 'SUCCESS', help: null });
                return;
            }
            const get_help = pyodide.globals.get('_get_help');
            const help = get_help(code, ctx);
            const helpJs = help ? help.toJs() : null;
            get_help.destroy();
            self.postMessage({ id, status: 'SUCCESS', help: helpJs });
        } catch (e) {
            self.postMessage({ id, status: 'ERROR', help: null });
        }
    }
};
