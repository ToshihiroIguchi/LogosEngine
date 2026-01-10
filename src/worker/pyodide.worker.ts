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

# Code Analyzer for Smart Batch Fix
class CodeAnalyzer(ast.NodeVisitor):
    def __init__(self, ctx_keys):
        self.ctx_keys = set(ctx_keys) if ctx_keys else set()
        self.scope_stack = ['global']
        
        # Variables defined in the code (exclusions)
        self.defined_in_scope = {'global': set()}
        
        # Candidates for symbolic definition (Name in Load context)
        self.candidates = set()
        
        # Excluded names (Used as function, attribute, etc.)
        self.excluded = set()
        
        # Builtins and keywords are permanently excluded
        self.reserved = set(dir(builtins)) | set(keyword.kwlist) | \
                        {'I', 'E', 'N', 'S', 'O', 'pi', 'oo', 'zoo', 'nan', 'true', 'false'} # SymPy constants

    def enter_scope(self, scope_name):
        self.scope_stack.append(scope_name)
        self.defined_in_scope[scope_name] = set()

    def exit_scope(self):
        self.scope_stack.pop()

    def visit_FunctionDef(self, node):
        self.defined_in_scope['global'].add(node.name)
        self.enter_scope('function')
        for arg in node.args.args:
            self.defined_in_scope['function'].add(arg.arg)
        self.generic_visit(node)
        self.exit_scope()

    def visit_ClassDef(self, node):
        self.defined_in_scope['global'].add(node.name)
        self.enter_scope('class')
        self.generic_visit(node)
        self.exit_scope()
    
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
        # e.g. f(x) -> f is excluded
        if isinstance(node.func, ast.Name):
            self.excluded.add(node.func.id)
        self.generic_visit(node)

    def visit_Attribute(self, node):
        # Exclude object name in obj.prop
        if isinstance(node.value, ast.Name):
             self.excluded.add(node.value.id)
        self.generic_visit(node)

    def analyze(self):
        # Final set of variables to recommend
        valid_vars = set()
        allowed_greek = {'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa', 'lamda', 'lambda', 'mu', 'nu', 'xi', 'omicron', 'pi', 'rho', 'sigma', 'tau', 'upsilon', 'phi', 'chi', 'psi', 'omega'}
        
        # Debugging
        # print("DEBUG: Candidates:", self.candidates)
        
        for var in self.candidates:
            if var in self.defined_in_scope['global']: 
                # print(f"DEBUG: {var} defined in global")
                continue
            if var in self.excluded: 
                # print(f"DEBUG: {var} excluded")
                continue
            if var in self.reserved: 
                # print(f"DEBUG: {var} reserved")
                continue
            
            # Context check: 
            if var in self.ctx_keys:
                if var not in allowed_greek:
                    # print(f"DEBUG: {var} in ctx (defined)")
                    continue
            
            # Whitelist / Heuristics
            # 1. Single character (a-z, A-Z)
            if len(var) == 1:
                valid_vars.add(var)
            # 2. Known Greek letters
            elif var in allowed_greek:
                valid_vars.add(var)
            # 3. Math-like variables (x1, val1, etc.)
            elif _re.match(r'^[a-zA-Z]+\\d+$', var):
                # print(f"DEBUG: {var} matched alphanumeric")
                valid_vars.add(var)
            # 4. Math-like variables with subscripts (x_1, val_2)
            elif _re.match(r'^[a-zA-Z]+_\\d+$', var):
                valid_vars.add(var)
            # else:
                # print(f"DEBUG: {var} rejected by whitelist")
                     
        return sorted(list(valid_vars))
                     
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
    return {
        "name": name,
        "signature": sig,
        "docstring": doc or "No documentation found.",
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
`;


// initPyodide starting

initPyodide();
async function initPyodide() {
    const start = performance.now();
    console.log('Worker: Initializing Pyodide (v0.29.0)...');
    try {
        const t1 = performance.now();
        pyodide = await loadPyodide({
            indexURL: "https://cdn.jsdelivr.net/pyodide/v0.29.0/full/"
        });
        console.log(`Worker: Pyodide core loaded in ${(performance.now() - t1).toFixed(0)}ms`);

        console.log('Worker: Loading critical packages (sympy)...');
        const t2 = performance.now();
        // STAGE 1: Load only critical packages
        await pyodide.loadPackage(['sympy']);
        console.log(`Worker: Critical packages loaded in ${(performance.now() - t2).toFixed(0)}ms`);

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
        console.log(`Worker: Context setup in ${(performance.now() - t3).toFixed(0)}ms`);

        const total = performance.now() - start;
        console.log(`Worker: Engine Ready (SymPy only). Total init time: ${total.toFixed(0)}ms`);
        self.postMessage({ type: 'READY' });

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
                const symbolName = trimmedCode.substring(1).trim();
                const _get_help = pyodide.globals.get("_get_help");
                const docProxy = _get_help(symbolName, ctx);
                const doc = docProxy ? docProxy.toJs({ dict_converter: Object.fromEntries }) : null;
                if (docProxy) docProxy.destroy();

                self.postMessage({
                    id,
                    status: 'SUCCESS',
                    results: [],
                    documentation: doc
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
