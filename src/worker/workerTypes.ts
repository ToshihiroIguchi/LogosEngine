import type { Output, Variable, Documentation } from '../types';

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
    documentation?: Documentation;
    error?: string;
}

export interface WorkerReadyResponse {
    type: 'READY';
}
