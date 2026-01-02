import { useState, useEffect, useCallback, useRef } from 'react';
import type { WorkerRequest, WorkerResponse, CompletionRequest, CompletionResponse } from '../worker/workerTypes';

export function usePyodide() {
    const [isReady, setIsReady] = useState(false);
    const workerRef = useRef<Worker | null>(null);
    const resolversRef = useRef<Map<string, (response: WorkerResponse | CompletionResponse) => void>>(new Map());
    const queueRef = useRef<Array<{ id: string; code: string; resolve: (response: WorkerResponse | CompletionResponse) => void }>>([]);

    const initWorker = useCallback(() => {
        setIsReady(false);
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

                // Process queued executions
                const queue = queueRef.current;
                queueRef.current = [];
                queue.forEach(({ id, code, resolve }) => {
                    resolversRef.current.set(id, resolve);
                    const request: WorkerRequest = { id, action: 'EXECUTE', code };
                    worker.postMessage(request);
                });
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

    const execute = useCallback((code: string): Promise<WorkerResponse> => {
        if (!workerRef.current) return Promise.reject(new Error('Worker not initialized'));

        const id = crypto.randomUUID();

        return new Promise((resolve) => {
            if (!isReady) {
                queueRef.current.push({ id, code, resolve: resolve as any });
            } else {
                resolversRef.current.set(id, resolve as any);
                const request: WorkerRequest = { id, action: 'EXECUTE', code };
                workerRef.current?.postMessage(request);
            }
        });
    }, [isReady]);

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

    const getCompletions = useCallback((code: string, position: number): Promise<CompletionResponse> => {
        if (!workerRef.current || !isReady) {
            return Promise.resolve({ id: '', completions: [] });
        }

        const id = crypto.randomUUID();

        return new Promise((resolve) => {
            resolversRef.current.set(id, resolve as any);
            const request: CompletionRequest = { id, action: 'COMPLETE', code, position };
            workerRef.current?.postMessage(request);
        });
    }, [isReady]);

    return { isReady, execute, interrupt, getCompletions };
}
