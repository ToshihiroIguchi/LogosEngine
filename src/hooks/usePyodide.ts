import { useState, useEffect, useCallback, useRef } from 'react';
import type { WorkerRequest, WorkerResponse, CompletionRequest, CompletionResponse } from '../worker/workerTypes';

export function usePyodide() {
    const [isReady, setIsReady] = useState(false);
    const [isGraphicsReady, setIsGraphicsReady] = useState(false);
    const workerRef = useRef<Worker | null>(null);
    const resolversRef = useRef<Map<string, (response: WorkerResponse | CompletionResponse) => void>>(new Map());
    // Queue now includes executionCount to ensure persistence
    const queueRef = useRef<Array<{ id: string; code: string; notebookId?: string; executionCount?: number; resolve: (response: WorkerResponse | CompletionResponse) => void }>>([]);

    const initWorker = useCallback(() => {
        setIsReady(false);
        setIsGraphicsReady(false);
        if (workerRef.current) {
            workerRef.current.terminate();
        }

        const worker = new Worker(new URL('../worker/pyodide.worker.ts', import.meta.url), {
            type: 'module'
        });

        worker.onmessage = (event) => {
            const data = event.data;
            if (data.type === 'READY') {
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
    }, []);

    useEffect(() => {
        initWorker();
        return () => workerRef.current?.terminate();
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
            const needsGraphics = /\bplot\w*\s*\(/.test(code);
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

            const needsGraphics = /\bplot\w*\s*\(/.test(code);
            const canRun = workerRef.current && isReady && (!needsGraphics || isGraphicsReady);

            if (!canRun) {
                // Queue the execution including executionCount
                queueRef.current.push({ id, code, notebookId, executionCount, resolve: resolve as any });
            } else {
                executeTask();
            }
        });
    }, [isReady, isGraphicsReady]);

    const getCompletions = useCallback((code: string, position: number, notebookId?: string): Promise<CompletionResponse> => {
        if (!workerRef.current || !isReady) return Promise.resolve({ id: '', completions: [] });

        const id = crypto.randomUUID();
        return new Promise((resolve) => {
            resolversRef.current.set(id, (response) => resolve(response as CompletionResponse));
            const request: CompletionRequest = { id, action: 'COMPLETE', code, position, notebookId };
            workerRef.current?.postMessage(request);
        });
    }, [isReady]);

    const resetContext = useCallback((notebookId?: string): Promise<void> => {
        if (!workerRef.current || !isReady) return Promise.resolve();

        const id = crypto.randomUUID();
        return new Promise((resolve) => {
            resolversRef.current.set(id, () => resolve());
            const request: WorkerRequest = { id, action: 'RESET_CONTEXT', code: '', notebookId };
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

    return { isReady, isGraphicsReady, execute, interrupt, getCompletions, resetContext, deleteVariable, searchDocs };
}
