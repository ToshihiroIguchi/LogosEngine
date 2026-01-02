import type { Output, Variable, Documentation } from '../types';

export type WorkerAction = 'EXECUTE' | 'INTERRUPT' | 'COMPLETE';

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

export interface CompletionItem {
    label: string;
    kind: 'Function' | 'Variable' | 'Class' | 'Module' | 'Keyword';
    detail?: string;
    documentation?: string;
}

export interface CompletionRequest {
    id: string;
    action: 'COMPLETE';
    code: string;
    position: number;
}

export interface CompletionResponse {
    id: string;
    completions: CompletionItem[];
}
