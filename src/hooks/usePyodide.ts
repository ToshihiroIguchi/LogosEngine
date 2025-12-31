import { useState, useEffect, useCallback, useRef } from 'react';
import type { WorkerRequest, WorkerResponse } from '../worker/workerTypes';

export function usePyodide() {
    const [isReady, setIsReady] = useState(false);
    const workerRef = useRef<Worker | null>(null);
    const resolversRef = useRef<Map<string, (response: WorkerResponse) => void>>(new Map());
    const queueRef = useRef<Array<{ id: string; code: string; resolve: (response: WorkerResponse) => void }>>([]);

    useEffect(() => {
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
        return () => worker.terminate();
    }, []);

    const execute = useCallback((code: string): Promise<WorkerResponse> => {
        if (!workerRef.current) return Promise.reject(new Error('Worker not initialized'));

        const id = crypto.randomUUID();

        return new Promise((resolve) => {
            if (!isReady) {
                // Queue the execution for when the engine becomes ready
                queueRef.current.push({ id, code, resolve });
            } else {
                // Execute immediately
                resolversRef.current.set(id, resolve);
                const request: WorkerRequest = { id, action: 'EXECUTE', code };
                workerRef.current?.postMessage(request);
            }
        });
    }, [isReady]);

    return { isReady, execute };
}
