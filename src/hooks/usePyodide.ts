import { useState, useEffect, useCallback, useRef } from 'react';
import type {
    WorkerInitMessage, WorkerRequest, WorkerResponse, WorkerNotification, CompletionResponse
} from '../worker/workerTypes';
import type { Documentation, Variable, VariableAssumptions } from '../types';

const INIT_TIMEOUT_MS = 120_000;
const COMPLETION_TIMEOUT_MS = 3_000;
const TRANSPILE_TIMEOUT_MS = 8_000;
/** How long a soft interrupt may take before the engine is restarted instead. */
const SOFT_INTERRUPT_GRACE_MS = 3_000;
const SIGINT = 2;

/** Extracts the identifier prefix right before the cursor. Returns null when completing an attribute (after '.'). */
function getCompletionPrefix(code: string, position: number): string | null {
    const before = code.slice(0, position);
    const match = before.match(/([A-Za-z_]\w*)$/);
    const prefix = match ? match[1] : '';
    const preceding = before.slice(0, before.length - prefix.length);
    if (/\.\s*$/.test(preceding)) return null;
    return prefix;
}

function errorResponse(id: string, message: string, interrupted = false): WorkerResponse {
    return {
        id,
        status: 'ERROR',
        interrupted,
        results: [{
            type: 'error',
            value: message,
            errorName: interrupted ? 'KeyboardInterrupt' : undefined,
            timestamp: Date.now()
        }],
        error: message,
        message
    };
}

type Resolver = (response: WorkerResponse) => void;

export type InterruptMode = 'soft' | 'hard';

export function usePyodide(onEngineReset?: () => void) {
    const [isReady, setIsReady] = useState(false);
    const [initError, setInitError] = useState<string | null>(null);
    const [isGraphicsReady, setIsGraphicsReady] = useState(false);
    const [graphicsError, setGraphicsError] = useState<string | null>(null);

    const workerRef = useRef<Worker | null>(null);
    const pendingRef = useRef<Map<string, Resolver>>(new Map());
    const initTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const softTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const initErrorRef = useRef<string | null>(null);
    const interruptViewRef = useRef<Uint8Array | null>(null);
    const cancelViewRef = useRef<Int32Array | null>(null);
    const epochRef = useRef(0);
    const onEngineResetRef = useRef(onEngineReset);
    // initWorker restarts itself on a fatal crash; the ref avoids referring to it inside its own body
    const initWorkerRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        onEngineResetRef.current = onEngineReset;
    }, [onEngineReset]);

    const failPending = useCallback((message: string, interrupted = false) => {
        const pending = pendingRef.current;
        pendingRef.current = new Map();
        pending.forEach((resolve, id) => resolve(errorResponse(id, message, interrupted)));
    }, []);

    const reportInitError = useCallback((message: string) => {
        initErrorRef.current = message;
        setInitError(message);
        failPending(message);
    }, [failPending]);

    const initWorker = useCallback(() => {
        initErrorRef.current = null;
        setIsReady(false);
        setIsGraphicsReady(false);
        setGraphicsError(null);
        setInitError(null);

        if (initTimerRef.current) clearTimeout(initTimerRef.current);
        if (softTimerRef.current) clearTimeout(softTimerRef.current);
        workerRef.current?.terminate();
        // Nothing sent to the old worker will ever be answered
        failPending('Execution interrupted and engine reset.', true);

        const worker = new Worker(new URL('../worker/pyodide.worker.ts', import.meta.url), { type: 'module' });
        workerRef.current = worker;

        // Soft interrupt needs SharedArrayBuffer, which requires cross-origin isolation
        const canShare = typeof SharedArrayBuffer !== 'undefined' && globalThis.crossOriginIsolated === true;
        const init: WorkerInitMessage = { action: 'INIT' };
        if (canShare) {
            const interruptBuffer = new SharedArrayBuffer(1);
            const cancelBuffer = new SharedArrayBuffer(4);
            interruptViewRef.current = new Uint8Array(interruptBuffer);
            cancelViewRef.current = new Int32Array(cancelBuffer);
            epochRef.current = 0;
            init.interruptBuffer = interruptBuffer;
            init.cancelBuffer = cancelBuffer;
        } else {
            interruptViewRef.current = null;
            cancelViewRef.current = null;
        }
        worker.postMessage(init);

        initTimerRef.current = setTimeout(() => {
            if (workerRef.current !== worker) return;
            reportInitError('Engine initialization timed out. Check your network connection and retry.');
        }, INIT_TIMEOUT_MS);

        worker.onerror = (event) => {
            if (workerRef.current !== worker) return;
            if (initTimerRef.current) clearTimeout(initTimerRef.current);
            reportInitError(`Engine error: ${event.message || 'unknown error'}`);
        };

        worker.onmessage = (event: MessageEvent<WorkerResponse | WorkerNotification>) => {
            if (workerRef.current !== worker) return;
            const data = event.data;

            if ('type' in data && data.type) {
                switch (data.type) {
                    case 'ERROR':
                        if (initTimerRef.current) clearTimeout(initTimerRef.current);
                        reportInitError(data.message || 'Engine initialization failed.');
                        return;
                    case 'READY':
                        if (initTimerRef.current) clearTimeout(initTimerRef.current);
                        initErrorRef.current = null;
                        setInitError(null);
                        setIsReady(true);
                        return;
                    case 'GRAPHICS_READY':
                        setGraphicsError(null);
                        setIsGraphicsReady(true);
                        return;
                    case 'GRAPHICS_FAILED':
                        setGraphicsError(data.message || 'Graphics extensions failed to load.');
                        return;
                    case 'FATAL':
                        console.error('Engine crashed:', data.message);
                        // The restarted engine starts empty; pending requests fail as "interrupted"
                        onEngineResetRef.current?.();
                        initWorkerRef.current?.();
                        return;
                    case 'PROFILE':
                        console.groupCollapsed('Logos Engine startup profile');
                        console.table(data.timings);
                        console.groupEnd();
                        return;
                }
                return;
            }

            const response = data as WorkerResponse;
            const resolver = pendingRef.current.get(response.id);
            if (resolver) {
                pendingRef.current.delete(response.id);
                resolver(response);
            }
        };
    }, [failPending, reportInitError]);

    useEffect(() => {
        initWorkerRef.current = initWorker;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        initWorker();
        return () => {
            if (initTimerRef.current) clearTimeout(initTimerRef.current);
            if (softTimerRef.current) clearTimeout(softTimerRef.current);
            workerRef.current?.terminate();
            workerRef.current = null;
        };
    }, [initWorker]);

    /** Sends a request. The worker answers in order and holds requests until the engine is up. */
    const send = useCallback((request: Omit<WorkerRequest, 'id'>): Promise<WorkerResponse> => {
        const id = crypto.randomUUID();
        const worker = workerRef.current;
        if (!worker || initErrorRef.current) {
            return Promise.resolve(errorResponse(id, initErrorRef.current ?? 'Engine is not available.'));
        }
        return new Promise((resolve) => {
            pendingRef.current.set(id, resolve);
            worker.postMessage({ ...request, id } satisfies WorkerRequest);
        });
    }, []);

    const hardReset = useCallback(() => {
        onEngineResetRef.current?.();
        initWorker();
    }, [initWorker]);

    /**
     * Stops running code. With cross-origin isolation this raises KeyboardInterrupt and keeps all
     * variables; otherwise (or if Python does not react in time) the engine is restarted.
     */
    const interrupt = useCallback((): InterruptMode => {
        const interruptView = interruptViewRef.current;
        const cancelView = cancelViewRef.current;
        if (!interruptView || !cancelView || pendingRef.current.size === 0) {
            hardReset();
            return 'hard';
        }

        // Drop everything already sent, then ask the running code to stop
        epochRef.current = Atomics.add(cancelView, 0, 1) + 1;
        interruptView[0] = SIGINT;

        const waiting = new Set(pendingRef.current.keys());
        const worker = workerRef.current;
        if (softTimerRef.current) clearTimeout(softTimerRef.current);
        softTimerRef.current = setTimeout(() => {
            if (workerRef.current !== worker) return;
            if ([...waiting].some((id) => pendingRef.current.has(id))) {
                console.warn('Soft interrupt timed out; restarting the engine.');
                hardReset();
            }
        }, SOFT_INTERRUPT_GRACE_MS);
        return 'soft';
    }, [hardReset]);

    const execute = useCallback((code: string, notebookId?: string, executionCount?: number): Promise<WorkerResponse> => {
        return send({ action: 'EXECUTE', code, notebookId, executionCount, epoch: epochRef.current });
    }, [send]);

    const getCompletions = useCallback(async (code: string, position: number, notebookId?: string): Promise<CompletionResponse> => {
        const prefix = getCompletionPrefix(code, position);
        if (prefix === null || prefix.length === 0) return { id: '', completions: [] };

        const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), COMPLETION_TIMEOUT_MS));
        const response = await Promise.race([send({ action: 'GET_COMPLETIONS', code: prefix, notebookId }), timeout]);
        return { id: '', completions: response?.completions ?? [] };
    }, [send]);

    /** Resets a notebook context. With `dispose`, the context is freed and not recreated. */
    const resetContext = useCallback(async (notebookId?: string, dispose = false): Promise<void> => {
        await send({ action: 'RESET_CONTEXT', code: dispose ? 'dispose' : '', notebookId });
    }, [send]);

    const deleteVariable = useCallback((variableName: string, notebookId?: string) =>
        send({ action: 'DELETE_VARIABLE', code: variableName, notebookId }), [send]);

    const defineVariable = useCallback((variableName: string, assumptions: VariableAssumptions = {}, notebookId?: string) =>
        send({ action: 'DEFINE_VARIABLE', code: variableName, notebookId, assumptions }), [send]);

    const getVariables = useCallback(async (notebookId?: string): Promise<Variable[]> => {
        const response = await send({ action: 'GET_VARIABLES', code: '', notebookId });
        return response.variables ?? [];
    }, [send]);

    const searchDocs = useCallback((query: string, notebookId?: string) =>
        send({ action: 'GET_DOCS', code: query, notebookId }), [send]);

    const getHelp = useCallback(async (name: string, notebookId?: string): Promise<Documentation | null> => {
        const response = await send({ action: 'GET_HELP', code: name, notebookId });
        return response.help ?? null;
    }, [send]);

    /** Converts equation / caret syntax with the same engine that runs the code. null = unavailable. */
    const transpileCodes = useCallback(async (codes: string[]): Promise<string[] | null> => {
        if (codes.length === 0) return [];
        const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), TRANSPILE_TIMEOUT_MS));
        const response = await Promise.race([send({ action: 'TRANSPILE', code: '', codes }), timeout]);
        return response && response.status === 'SUCCESS' ? response.transpiled ?? null : null;
    }, [send]);

    const retryGraphics = useCallback(() => {
        setGraphicsError(null);
        void send({ action: 'RETRY_EXTENSIONS', code: '' });
    }, [send]);

    return {
        isReady, initError, retryInit: initWorker,
        isGraphicsReady, graphicsError, retryGraphics,
        execute, interrupt, getCompletions, resetContext,
        deleteVariable, defineVariable, getVariables, searchDocs, getHelp, transpileCodes
    };
}
