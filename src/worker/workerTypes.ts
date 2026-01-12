import type { Output, Variable, Documentation, SearchResults } from '../types';

export type WorkerAction = 'EXECUTE' | 'INTERRUPT' | 'COMPLETE' | 'RESET_CONTEXT' | 'DELETE_VARIABLE';

export interface WorkerRequest {
    id: string;
    action: WorkerAction;
    code: string;
    notebookId?: string;
    executionCount?: number;
}

export interface WorkerResponse {
    id: string;
    status: 'SUCCESS' | 'ERROR';
    results: Output[];
    variables?: Variable[];
    documentation?: Documentation;
    searchResults?: SearchResults;
    error?: string;
}

export interface WorkerReadyResponse {
    type: 'READY' | 'GRAPHICS_READY' | 'ERROR';
    message?: string;
}

export type WorkerMessage = WorkerResponse | WorkerReadyResponse;

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
    notebookId?: string;
}

export interface CompletionResponse {
    id: string;
    completions: CompletionItem[];
}
