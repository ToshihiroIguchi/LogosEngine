import { useState, useEffect, useCallback, useRef } from 'react';
import type { WorkerRequest, WorkerResponse, CompletionRequest, CompletionResponse } from '../worker/workerTypes';
import type { VariableAssumptions } from '../types';

import { needsGraphics as checkNeedsGraphics } from '../utils/graphicsDetect';

const INIT_TIMEOUT_MS = 120_000;
const COMPLETION_TIMEOUT_MS = 3_000;

/** Extracts the identifier prefix right before the cursor. Returns null when completing an attribute (after '.'). */
function getCompletionPrefix(code: string, position: number): string | null {
    const before = code.slice(0, position);
    const match = before.match(/([A-Za-z_]\w*)$/);
    const prefix = match ? match[1] : '';
    const preceding = before.slice(0, before.length - prefix.length);
    if (/\.\s*$/.test(preceding)) return null;
    return prefix;
}

export function usePyodide() {
    const [isReady, setIsReady] = useState(false);
    const [initError, setInitError] = useState<string | null>(null);
    const initTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [isGraphicsReady, setIsGraphicsReady] = useState(false);
    const workerRef = useRef<Worker | null>(null);
    const resolversRef = useRef<Map<string, (response: WorkerResponse | CompletionResponse) => void>>(new Map());
    // Queue now includes executionCount to ensure persistence
    const queueRef = useRef<Array<{ id: string; code: string; notebookId?: string; executionCount?: number; resolve: (response: WorkerResponse | CompletionResponse) => void }>>([]);

    const failPending = useCallback((message: string) => {
        const errorResponse = {
            id: 'init-failed',
            status: 'ERROR' as const,
            results: [{ type: 'error' as const, value: message, timestamp: Date.now() }],
            completions: [],
            error: message
        };
        resolversRef.current.forEach((resolve) => resolve(errorResponse as unknown as WorkerResponse));
        resolversRef.current.clear();
        const queue = queueRef.current;
        queueRef.current = [];
        queue.forEach(({ resolve }) => resolve(errorResponse as unknown as WorkerResponse));
    }, []);

    const initWorker = useCallback(() => {
        setIsReady(false);
        setIsGraphicsReady(false);
        setInitError(null);
        if (workerRef.current) {
            workerRef.current.terminate();
        }
        if (initTimerRef.current) clearTimeout(initTimerRef.current);

        const worker = new Worker(new URL('../worker/pyodide.worker.ts', import.meta.url), {
            type: 'module'
        });

        initTimerRef.current = setTimeout(() => {
            const message = 'Engine initialization timed out. Check your network connection and reload.';
            setInitError(message);
            failPending(message);
        }, INIT_TIMEOUT_MS);

        worker.onerror = (event) => {
            const message = `Engine failed to start: ${event.message || 'unknown error'}`;
            if (initTimerRef.current) clearTimeout(initTimerRef.current);
            setInitError(message);
            failPending(message);
        };

        worker.onmessage = (event) => {
            const data = event.data;
            if (data.type === 'ERROR' && !data.id) {
                if (initTimerRef.current) clearTimeout(initTimerRef.current);
                const message = data.message || 'Engine initialization failed.';
                setInitError(message);
                failPending(message);
                return;
            }
            if (data.type === 'READY') {
                if (initTimerRef.current) clearTimeout(initTimerRef.current);
                setIsReady(true);
                // Process queue...
                const queue = queueRef.current;
                queueRef.current = [];
                queue.forEach(({ id, code, notebookId, executionCount, resolve }) => {
                    resolversRef.current.set(id, resolve);
                    const request: WorkerRequest = { id, action: 'EXECUTE', code, notebookId, executionCount };
                    worker.postMessage(request);
                });
                return;
            }

            if (data.type === 'GRAPHICS_READY') {
                setIsGraphicsReady(true);
                return;
            }

            if (data.type === 'PROFILE') {
                console.group('🚀 Logos Engine Startup Profile');
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                console.table((data as any).timings);
                console.groupEnd();
                return;
            }



            const { id } = data as WorkerResponse;
            const resolver = resolversRef.current.get(id);
            if (resolver) {
                resolver(data as WorkerResponse);
                resolversRef.current.delete(id);
            }
        };

        workerRef.current = worker;
    }, [failPending]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        initWorker();
        return () => {
            if (initTimerRef.current) clearTimeout(initTimerRef.current);
            workerRef.current?.terminate();
        };
    }, [initWorker]);

    // Flush queue when engine becomes ready or graphics become ready
    useEffect(() => {
        if (!workerRef.current || queueRef.current.length === 0) return;

        // Check which items can be processed
        const queue = queueRef.current;
        const remainingQueue: typeof queue = [];

        queue.forEach((item) => {
            const { id, code, notebookId, executionCount, resolve } = item;

            // Logic to determine if this item can be processed
            const needsGraphics = checkNeedsGraphics(code);
            const canRun = isReady && (!needsGraphics || isGraphicsReady);

            if (canRun) {
                resolversRef.current.set(id, resolve);
                const request: WorkerRequest = { id, action: 'EXECUTE', code, notebookId, executionCount };
                workerRef.current?.postMessage(request);
            } else {
                remainingQueue.push(item);
            }
        });

        // Update queue with remaining items
        queueRef.current = remainingQueue;

    }, [isReady, isGraphicsReady]);

    const interrupt = useCallback(() => {
        // Clear all pending state
        resolversRef.current.forEach((resolve) => {
            resolve({
                id: 'interrupted',
                status: 'ERROR',
                results: [{
                    type: 'error',
                    value: 'Execution interrupted and engine reset.',
                    timestamp: Date.now()
                }]
            });
        });
        resolversRef.current.clear();
        queueRef.current = [];

        // Restart the worker
        initWorker();
    }, [initWorker]);

    const execute = useCallback((code: string, notebookId?: string, executionCount?: number): Promise<WorkerResponse> => {
        const id = crypto.randomUUID();
        return new Promise((resolve) => {
            const executeTask = () => {
                resolversRef.current.set(id, resolve as unknown as (response: WorkerResponse | CompletionResponse) => void);
                const request: WorkerRequest = { id, action: 'EXECUTE', code, notebookId, executionCount };
                workerRef.current?.postMessage(request);
            };

            const needsGraphics = checkNeedsGraphics(code);
            const canRun = workerRef.current && isReady && (!needsGraphics || isGraphicsReady);

            if (!canRun) {
                // Queue the execution including executionCount
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                queueRef.current.push({ id, code, notebookId, executionCount, resolve: resolve as any });
            } else {
                executeTask();
            }
        });
    }, [isReady, isGraphicsReady]);

    const getCompletions = useCallback((code: string, position: number, notebookId?: string): Promise<CompletionResponse> => {
        if (!workerRef.current || !isReady) return Promise.resolve({ id: '', completions: [] });

        const prefix = getCompletionPrefix(code, position);
        if (prefix === null) return Promise.resolve({ id: '', completions: [] });

        const id = crypto.randomUUID();
        return new Promise((resolve) => {
            // Never leave a resolver behind if the worker does not answer
            const timer = setTimeout(() => {
                resolversRef.current.delete(id);
                resolve({ id, completions: [] });
            }, COMPLETION_TIMEOUT_MS);
            resolversRef.current.set(id, (response) => {
                clearTimeout(timer);
                const completions = (response as CompletionResponse).completions ?? [];
                resolve({ id, completions });
            });
            const request: CompletionRequest = { id, action: 'GET_COMPLETIONS', code: prefix, notebookId };
            workerRef.current?.postMessage(request);
        });
    }, [isReady]);

    /** Resets a notebook context. With `dispose`, the context is freed and not recreated. */
    const resetContext = useCallback((notebookId?: string, dispose = false): Promise<void> => {
        if (!workerRef.current || !isReady) return Promise.resolve();

        const id = crypto.randomUUID();
        return new Promise((resolve) => {
            resolversRef.current.set(id, () => resolve());
            const request: WorkerRequest = { id, action: 'RESET_CONTEXT', code: dispose ? 'dispose' : '', notebookId };
            workerRef.current?.postMessage(request);
        });
    }, [isReady]);

    const deleteVariable = useCallback((variableName: string, notebookId?: string): Promise<WorkerResponse> => {
        if (!workerRef.current || !isReady) return Promise.reject("Worker not ready");

        const id = crypto.randomUUID();
        return new Promise((resolve) => {
            resolversRef.current.set(id, (response) => resolve(response as WorkerResponse));
            const request: WorkerRequest = {
                id,
                action: 'DELETE_VARIABLE',
                code: variableName, // Passing variable name in code field
                notebookId
            };
            workerRef.current?.postMessage(request);
        });
    }, [isReady]);

    const defineVariable = useCallback((variableName: string, assumptions: VariableAssumptions = {}, notebookId?: string): Promise<WorkerResponse> => {
        if (!workerRef.current || !isReady) return Promise.reject("Worker not ready");

        const id = crypto.randomUUID();
        return new Promise((resolve) => {
            resolversRef.current.set(id, (response) => resolve(response as WorkerResponse));
            const request: WorkerRequest = {
                id,
                action: 'DEFINE_VARIABLE',
                code: variableName,
                notebookId,
                assumptions
            };
            workerRef.current?.postMessage(request);
        });
    }, [isReady]);

    const searchDocs = useCallback((query: string, notebookId?: string): Promise<WorkerResponse> => {
        if (!workerRef.current || !isReady) return Promise.resolve({ id: '', status: 'ERROR', results: [] });

        const id = crypto.randomUUID();
        return new Promise((resolve) => {
            resolversRef.current.set(id, (response) => resolve(response as WorkerResponse));
            const request: WorkerRequest = {
                id,
                action: 'GET_DOCS',
                code: query,
                notebookId
            };
            workerRef.current?.postMessage(request);
        });
    }, [isReady]);

    return { isReady, initError, retryInit: initWorker, isGraphicsReady, execute, interrupt, getCompletions, resetContext, deleteVariable, defineVariable, searchDocs };
}
