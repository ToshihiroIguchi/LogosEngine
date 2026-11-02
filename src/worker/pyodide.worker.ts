import { loadPyodide, version as pyodideVersion, type PyodideInterface } from 'pyodide';
import type { WorkerInitMessage, WorkerRequest, WorkerNotification } from './workerTypes';
import type { Output } from '../types';
import { needsGraphics } from '../utils/graphicsDetect';
import preprocessSource from './python/preprocess.py?raw';
import runtimeSource from './python/runtime.py?raw';

/* eslint-disable @typescript-eslint/no-explicit-any */

let pyodide: PyodideInterface;

// One isolated Python namespace (dict) per notebook
const contexts = new Map<string, any>();
const DEFAULT_NOTEBOOK = 'default';

let extensionsReady = false;
let extensionsFailed: string | null = null;
let extensionsPromise: Promise<void> | null = null;

// Soft-interrupt plumbing (only present when the page is cross-origin isolated)
let interruptView: Uint8Array | null = null;
let cancelView: Int32Array | null = null;

// Core SymPy imports for fast startup (Phase 1)
const CORE_SYMPY_IMPORTS = [
    // Basic
    'symbols', 'Symbol', 'Integer', 'Float', 'Rational', 'S',
    // Algebra / Equations
    'solve', 'nsolve', 'dsolve', 'solveset', 'linsolve', 'nonlinsolve', 'Eq',
    // Calculus
    'diff', 'integrate', 'limit', 'series', 'summation', 'product',
    // Simplification & Expansion
    'simplify', 'expand', 'factor', 'collect', 'cancel', 'apart',
    // Functions
    'sin', 'cos', 'tan', 'exp', 'log', 'sqrt', 'asin', 'acos', 'atan',
    'ceiling', 'floor', 'factorial', 'binomial', 'gcd', 'lcm',
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

const PYTHON_SOURCE = `${preprocessSource}\n${runtimeSource.replaceAll('__CORE_SYMPY_IMPORTS__', CORE_SYMPY_IMPORTS)}`;

// ---------------------------------------------------------------------------
// Python call helpers
// ---------------------------------------------------------------------------

function pyToJs<T>(value: any): T {
    if (value && typeof value.toJs === 'function') {
        try {
            return value.toJs({ dict_converter: Object.fromEntries }) as T;
        } finally {
            value.destroy();
        }
    }
    return value as T;
}

function callPy<T>(name: string, ...args: any[]): T {
    const fn = pyodide.globals.get(name);
    try {
        return pyToJs<T>(fn(...args));
    } finally {
        fn.destroy();
    }
}

function getContext(notebookId?: string) {
    const key = notebookId || DEFAULT_NOTEBOOK;
    let ctx = contexts.get(key);
    if (!ctx) {
        console.log(`Worker: Creating new context for notebook ${key}`);
        ctx = pyodide.runPython('{}');
        callPy('setup_context', ctx);
        if (extensionsReady) callPy('load_extended_context', ctx);
        contexts.set(key, ctx);
    }
    return ctx;
}

function getVariables(ctx: any) {
    return callPy<any[]>('_get_variables', ctx);
}

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

let resolveConfig: () => void = () => { };
const configReceived = new Promise<void>((resolve) => { resolveConfig = resolve; });

function post(message: WorkerNotification | Record<string, unknown>) {
    self.postMessage(message);
}

const enginePromise = initPyodide();
// Requests await this and report the failure themselves
enginePromise.catch(() => { });

async function initPyodide() {
    const start = performance.now();
    const timings: Record<string, number> = {};
    const logTime = (label: string, duration: number) => {
        timings[label] = duration;
        console.log(`Worker: ${label} took ${duration.toFixed(0)}ms`);
    };

    console.log(`Worker: Initializing Pyodide (v${pyodideVersion})...`);
    try {
        // The page sends INIT right after creating the worker; do not wait forever without it.
        await Promise.race([configReceived, new Promise((r) => setTimeout(r, 2000))]);

        const t1 = performance.now();
        pyodide = await loadPyodide({
            indexURL: `https://cdn.jsdelivr.net/pyodide/v${pyodideVersion}/full/`
        });
        logTime('load_pyodide', performance.now() - t1);

        if (interruptView) {
            pyodide.setInterruptBuffer(interruptView);
        }

        const t2 = performance.now();
        await pyodide.loadPackage(['sympy']);
        logTime('load_critical_packages', performance.now() - t2);

        const t3 = performance.now();
        await pyodide.runPythonAsync(PYTHON_SOURCE);
        logTime('run_initial_code', performance.now() - t3);

        getContext(DEFAULT_NOTEBOOK);

        const total = performance.now() - start;
        logTime('total_init', total);
        post({ type: 'READY' });
        post({
            type: 'PROFILE',
            timings: {
                'Load Pyodide Library': timings['load_pyodide'] || 0,
                'Load SymPy': timings['load_critical_packages'] || 0,
                'Run Initial Code': timings['run_initial_code'] || 0,
                'Total Initialization (Phase 1)': total
            }
        });

        // Stage 2: heavy extensions load in the background
        extensionsPromise = loadExtensions();
    } catch (err: any) {
        console.error('Worker: Pyodide initialization failed', err);
        post({ type: 'ERROR', message: `Pyodide initialization failed: ${err?.message ?? err}` });
        throw err;
    }
}

function loadExtensions(): Promise<void> {
    const started = performance.now();
    extensionsFailed = null;
    return (async () => {
        await Promise.all([
            pyodide.loadPackage(['docutils']),
            pyodide.loadPackage(['matplotlib'])
        ]);
        const targets = new Set<any>(contexts.values());
        for (const ctx of targets) callPy('load_extended_context', ctx);
        extensionsReady = true;
        post({ type: 'GRAPHICS_READY' });
        console.log(`Worker: Extensions ready (${(performance.now() - started).toFixed(0)}ms)`);
    })().catch((e) => {
        extensionsFailed = e?.message ? String(e.message) : String(e);
        console.error('Worker: Extension load failed', e);
        post({ type: 'GRAPHICS_FAILED', message: extensionsFailed });
    });
}

// ---------------------------------------------------------------------------
// Request handling (strictly one at a time, in arrival order)
// ---------------------------------------------------------------------------

function isCancelled(epoch: number | undefined): boolean {
    return !!cancelView && Atomics.load(cancelView, 0) > (epoch ?? 0);
}

function errorOutput(value: string, extra: Partial<Output> = {}): Output {
    return { type: 'error', value, timestamp: Date.now(), ...extra };
}

function interruptedResponse(id: string) {
    post({
        id,
        status: 'ERROR',
        interrupted: true,
        results: [errorOutput('Execution interrupted.', { errorName: 'KeyboardInterrupt' })]
    });
}

function buildOutputs(result: any): Output[] {
    const output: Output[] = [];
    const now = Date.now();

    for (const item of result.items ?? []) {
        if (item.kind === 'stream') {
            if (item.text) output.push({ type: 'text', value: item.text, stream: item.stream, timestamp: now });
        } else if (item.kind === 'display') {
            output.push(item.latex
                ? { type: 'latex', value: item.latex, rawText: item.text, tsv: item.tsv || undefined, timestamp: now }
                : { type: 'text', value: item.text, rawText: item.text, tsv: item.tsv || undefined, timestamp: now });
        }
    }

    if (result.error) {
        const e = result.error;
        output.push(errorOutput(e.message ?? '', {
            traceback: e.traceback,
            errorName: e.errorName,
            lineNo: e.lineNo ?? undefined,
            missingVariables: Array.from(e.missingVariables ?? [])
        }));
    }

    if (result.result) {
        const r = result.result;
        output.push({
            type: r.latex ? 'latex' : 'text',
            value: r.latex ? r.latex : r.text,
            rawText: r.text,
            tsv: r.tsv || undefined,
            timestamp: now,
            isResult: true
        });
    }

    for (const img of result.images ?? []) {
        output.push({ type: 'image', value: `data:image/png;base64,${img}`, timestamp: now });
    }
    return output;
}

async function handleExecute(req: WorkerRequest) {
    const { id, code, notebookId, executionCount } = req;

    if (isCancelled(req.epoch)) {
        interruptedResponse(id);
        return;
    }

    const ctx = getContext(notebookId);

    // Wait for extensions BEFORE running when the cell needs them; never re-run a cell afterwards.
    if (!extensionsReady && extensionsPromise) {
        const wantsGraphics = needsGraphics(code);
        if (wantsGraphics || callPy<boolean>('has_unresolved_names', code, ctx)) {
            console.log('Worker: Waiting for extensions to load before execution...');
            await extensionsPromise;
            if (isCancelled(req.epoch)) {
                interruptedResponse(id);
                return;
            }
        }
    }

    if (!extensionsReady && extensionsFailed && needsGraphics(code)) {
        post({
            id,
            status: 'ERROR',
            results: [errorOutput(`Graphics extensions failed to load: ${extensionsFailed}`, { errorName: 'ExtensionError' })]
        });
        return;
    }

    if (interruptView) interruptView[0] = 0;
    const result = callPy<any>('execute_cell', code, ctx, executionCount);
    const interrupted = result.error?.errorName === 'KeyboardInterrupt';
    if (interruptView) interruptView[0] = 0;

    let variables: any[] = [];
    try {
        variables = getVariables(ctx);
    } catch (e) {
        console.warn('Worker: Failed to retrieve variables', e);
    }

    post({ id, status: 'SUCCESS', results: buildOutputs(result), variables, interrupted });
}

async function handleRequest(req: WorkerRequest) {
    const { id, action, code, notebookId } = req;

    switch (action) {
        case 'EXECUTE':
            await handleExecute(req);
            return;

        case 'GET_COMPLETIONS': {
            const completions = callPy<any[]>('_get_completions', code, getContext(notebookId));
            post({ id, status: 'SUCCESS', results: [], completions });
            return;
        }

        case 'GET_DOCS': {
            const searchResults = callPy<any>('_search_docs', code, getContext(notebookId));
            post({ id, status: 'SUCCESS', results: [], searchResults });
            return;
        }

        case 'GET_HELP': {
            // docutils arrives with the extensions; wait so the first lookup is fully formatted
            if (!extensionsReady && extensionsPromise) await extensionsPromise;
            const help = callPy<any>('_get_help', code, getContext(notebookId));
            post({ id, status: 'SUCCESS', results: [], help });
            return;
        }

        case 'GET_VARIABLES': {
            post({ id, status: 'SUCCESS', results: [], variables: getVariables(getContext(notebookId)) });
            return;
        }

        case 'DELETE_VARIABLE': {
            const ctx = getContext(notebookId);
            if (code && ctx.has(code)) ctx.delete(code);
            post({ id, status: 'SUCCESS', results: [], variables: getVariables(ctx) });
            return;
        }

        case 'DEFINE_VARIABLE': {
            const ctx = getContext(notebookId);
            const pyAssumptions = pyodide.toPy(req.assumptions || {});
            try {
                callPy('_define_variable', ctx, code, pyAssumptions);
            } finally {
                pyAssumptions.destroy();
            }
            post({ id, status: 'SUCCESS', results: [], variables: getVariables(ctx) });
            return;
        }

        case 'RESET_CONTEXT': {
            const key = notebookId || DEFAULT_NOTEBOOK;
            const old = contexts.get(key);
            if (old) {
                old.destroy();
                contexts.delete(key);
            }
            // 'dispose' frees the namespace without recreating it
            if (code !== 'dispose') getContext(key);
            post({ id, status: 'SUCCESS', results: [] });
            return;
        }

        case 'TRANSPILE': {
            const sources = req.codes ?? [code];
            const transpiled = sources.map((src) => {
                try {
                    return callPy<string>('transpile_code', src);
                } catch {
                    return src;
                }
            });
            post({ id, status: 'SUCCESS', results: [], transpiled });
            return;
        }

        case 'RETRY_EXTENSIONS': {
            if (!extensionsReady) {
                extensionsPromise = loadExtensions();
                await extensionsPromise;
            }
            post({ id, status: 'SUCCESS', results: [] });
            return;
        }
    }
}

const FATAL_PATTERN = /fatal error|unreachable|memory access out of bounds|out of memory/i;

let chain: Promise<void> = Promise.resolve();

self.onmessage = (event: MessageEvent<WorkerRequest | WorkerInitMessage>) => {
    const data = event.data;

    if (data.action === 'INIT') {
        if (data.interruptBuffer) interruptView = new Uint8Array(data.interruptBuffer);
        if (data.cancelBuffer) cancelView = new Int32Array(data.cancelBuffer);
        resolveConfig();
        return;
    }

    const req = data as WorkerRequest;
    chain = chain.then(async () => {
        try {
            await enginePromise;
        } catch {
            post({ id: req.id, status: 'ERROR', results: [errorOutput('Engine is not available.')] });
            return;
        }
        try {
            await handleRequest(req);
        } catch (err: any) {
            const message = err?.message ? String(err.message) : String(err);
            console.error(`Worker: ${req.action} failed`, err);
            if (FATAL_PATTERN.test(message)) {
                post({ type: 'FATAL', message });
            }
            post({
                id: req.id,
                status: 'ERROR',
                results: [errorOutput(message)],
                error: message,
                message
            });
        }
    });
};
