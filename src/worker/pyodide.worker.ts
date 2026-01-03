import { loadPyodide, type PyodideInterface } from 'pyodide';
import type { WorkerRequest, CompletionRequest } from './workerTypes';
import type { Output, Variable } from '../types';

let pyodide: PyodideInterface;

// Isolated context for user variables (Python dictionary)
let user_context: any;
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
# Matplotlib imports removed for concurrent loading
from sympy import *

# Setup the user context with default symbols and functions
def setup_context(ctx):
    # Inject all sympy functions into the user context
    exec("from sympy import *", {}, ctx)
    # Default symbols
    ctx['x'], ctx['y'], ctx['z'], ctx['t'] = ctx['symbols']('x y z t')
    # plt is injected later when ready

def format_error(e):
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
            # compile uses <string>, and we want to stop at the first user-code frame
            if frame.filename == '<string>':
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
    
    return {
        "errorName": error_name,
        "message": message,
        "lineNo": line_no,
        "traceback": formatted_tb
    }

def execute_cell(code, ctx):
    # Close previous figures only if plt is available
    if 'plt' in ctx:
        ctx['plt'].close('all')
    
    stdout_buffer = io.StringIO()
    sys.stdout = stdout_buffer
    error_data = None
    result_val = None
    latex_res = None
    
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

    except Exception as e:
        error_data = format_error(e)
        result_val = None
        
    sys.stdout = sys.__stdout__
    stdout_content = stdout_buffer.getvalue()
    
    if result_val is not None:
        try:
            latex_res = latex(result_val)
        except:
            pass
            
    img_base64 = None
    if 'plt' in ctx and ctx['plt'].get_fignums():
        plt_local = ctx['plt']
        buf = io.BytesIO()
        plt_local.savefig(buf, format='png', bbox_inches='tight')
        buf.seek(0)
        img_base64 = base64.b64encode(buf.read()).decode('utf-8')
        plt_local.close('all')
        
    return {
        "stdout": stdout_content,
        "result": str(result_val) if result_val is not None else None,
        "latex": latex_res,
        "image": img_base64,
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

        // Initialize user context as a Python dictionary
        user_context = pyodide.runPython("{}");
        const setup_context = pyodide.globals.get("setup_context");
        setup_context(user_context);
        setup_context.destroy();

        // Capture ambient keys to hide them from the Variable Inspector
        const initialKeys = pyodide.globals.get('list')(user_context.keys()).toJs();
        ambient_keys = new Set(initialKeys);
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
                inject_plt(user_context);
                inject_plt.destroy();

                matplotlibReady = true;
                self.postMessage({ type: 'GRAPHICS_READY' });
                console.log(`Worker: Matplotlib loaded in background in ${(performance.now() - tBackground).toFixed(0)}ms`);
            } catch (e) {
                console.error('Worker: Failed to load background packages', e);
            }
        })();

    } catch (err) {
        console.error('Worker: Initialization failed:', err);
    }
}

self.onmessage = async (event: MessageEvent<WorkerRequest | CompletionRequest>) => {
    const { id, action } = event.data;

    if (action === 'COMPLETE') {
        try {
            if (!pyodide) throw new Error('Engine not ready');

            const { code, position } = event.data as CompletionRequest;
            const prefix = code.substring(0, position).split(/\s+/).pop() || '';

            const _get_completions = pyodide.globals.get("_get_completions");
            const completionsProxy = _get_completions(prefix, user_context);
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

    if (action === 'EXECUTE') {
        const { code } = event.data as WorkerRequest;
        try {
            if (!pyodide) throw new Error('Engine not ready');

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
                const docProxy = _get_help(symbolName, user_context);
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
            const resultProxy = execute_cell(code, user_context);
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

                if (result.image) {
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
    if (!pyodide || !user_context) return [];

    const vars: Variable[] = [];
    const ignored = new Set([
        '__builtins__', 'symbols', 'Matrix', 'Rational', 'Integer', 'Float',
        'Symbol', 'Function', 'plt', 'x', 'y', 'z', 't', 'setup_context', 'execute_cell', 'format_error'
    ]);

    try {
        const keys = pyodide.globals.get('list')(user_context.keys()).toJs();

        for (const key of keys) {
            // Skip ambient keys (SymPy functions, etc.), internal symbols, or non-string keys
            if (typeof key !== 'string' || ambient_keys.has(key) || ignored.has(key) || key.startsWith('_')) continue;

            try {
                const val = user_context.get(key);
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

initPyodide();
