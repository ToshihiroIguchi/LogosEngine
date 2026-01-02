import type { Output, Variable } from '../types';

export type WorkerAction = 'EXECUTE' | 'INTERRUPT';

export interface WorkerRequest {
    id: string;
    action: WorkerAction;
    code: string;
}

export interface WorkerResponse {
    id: string;
    status: 'SUCCESS' | 'ERROR';
    results: Output[];
    variables?: Variable[];
    error?: string;
}

export interface WorkerReadyResponse {
    type: 'READY';
}
