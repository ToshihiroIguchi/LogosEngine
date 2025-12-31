import { loadPyodide, type PyodideInterface } from 'pyodide';
import type { WorkerRequest } from './workerTypes';
import type { Output } from '../types';

let pyodide: PyodideInterface;

const INITIAL_PYTHON_CODE = `
import sys
import io
import base64
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from sympy import *

# Default symbols
x, y, z, t = symbols('x y z t')

def execute_cell(code):
    # Close previous figures instead of clf() to avoid creating a blank one
    plt.close('all')
    
    stdout_buffer = io.StringIO()
    sys.stdout = stdout_buffer
    error = None
    result_val = None
    latex_res = None
    
    try:
        lines = code.strip().split('\\n')
        if len(lines) > 0:
            exec_code = '\\n'.join(lines[:-1])
            eval_code = lines[-1]
            if exec_code:
                exec(exec_code, globals())
            try:
                result_val = eval(eval_code, globals())
            except:
                exec(eval_code, globals())
                result_val = None
        else:
            result_val = None
    except Exception as e:
        import traceback
        error = traceback.format_exc()
        result_val = None
        
    sys.stdout = sys.__stdout__
    stdout_content = stdout_buffer.getvalue()
    
    if result_val is not None:
        try:
            latex_res = latex(result_val)
        except:
            pass
            
    img_base64 = None
    # Only capture if a figure was actually created/modified
    if plt.get_fignums():
        buf = io.BytesIO()
        plt.savefig(buf, format='png', bbox_inches='tight')
        buf.seek(0)
        img_base64 = base64.b64encode(buf.read()).decode('utf-8')
        plt.close('all')
        
    return {
        "stdout": stdout_content,
        "result": str(result_val) if result_val is not None else None,
        "latex": latex_res,
        "image": img_base64,
        "error": error
    }
`;

async function initPyodide() {
    console.log('Worker: Initializing Pyodide (v0.29.0)...');
    try {
        pyodide = await loadPyodide({
            indexURL: "https://cdn.jsdelivr.net/pyodide/v0.29.0/full/"
        });
        console.log('Worker: Pyodide loaded. Loading packages...');
        await pyodide.loadPackage(['sympy', 'matplotlib']);
        console.log('Worker: Packages loaded. Running initial Python code...');
        await pyodide.runPythonAsync(INITIAL_PYTHON_CODE);
        console.log('Worker: Engine Ready.');
        self.postMessage({ type: 'READY' });
    } catch (err) {
        console.error('Worker: Initialization failed:', err);
    }
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
    const { id, action, code } = event.data;
    if (action === 'EXECUTE') {
        try {
            if (!pyodide) throw new Error('Engine not ready');
            const execute_cell = pyodide.globals.get("execute_cell");
            const resultProxy = execute_cell(code);
            const result = resultProxy.toJs({ dict_converter: Object.fromEntries });
            resultProxy.destroy();

            const outputs: Output[] = [];
            const timestamp = Date.now();

            if (result.stdout && result.stdout.trim()) {
                outputs.push({ type: 'text', value: result.stdout, timestamp });
            }

            if (result.error) {
                outputs.push({ type: 'error', value: result.error, timestamp });
            } else {
                if (result.latex && result.latex !== 'None' && result.latex.trim()) {
                    outputs.push({ type: 'latex', value: result.latex, timestamp });
                } else if (result.result && result.result !== 'None' && result.result.trim()) {
                    outputs.push({ type: 'text', value: result.result, timestamp });
                }

                if (result.image) {
                    outputs.push({ type: 'image', value: `data:image/png;base64,${result.image}`, timestamp });
                }
            }

            self.postMessage({ id, status: result.error ? 'ERROR' : 'SUCCESS', results: outputs });
        } catch (err: any) {
            self.postMessage({
                id,
                status: 'ERROR',
                results: [{ type: 'error', value: err.message, timestamp: Date.now() }]
            });
        }
    }
};

initPyodide();
