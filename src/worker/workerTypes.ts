import type { Output } from '../types';

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
    error?: string;
}

export interface WorkerReadyResponse {
    type: 'READY';
}
