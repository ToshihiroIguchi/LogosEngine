import type { Output, Variable, VariableAssumptions, Documentation, SearchResults } from '../types';

export type WorkerAction =
    | 'EXECUTE'
    | 'RESET_CONTEXT'
    | 'DELETE_VARIABLE'
    | 'DEFINE_VARIABLE'
    | 'GET_VARIABLES'
    | 'GET_COMPLETIONS'
    | 'GET_DOCS'
    | 'GET_HELP'
    | 'TRANSPILE'
    | 'RETRY_EXTENSIONS';

/** First message sent to a new worker. Buffers are only present when the page is cross-origin isolated. */
export interface WorkerInitMessage {
    action: 'INIT';
    /** Pyodide interrupt buffer: writing 2 raises KeyboardInterrupt in running Python code. */
    interruptBuffer?: SharedArrayBuffer;
    /** Int32 counter bumped by every interrupt; requests stamped with an older epoch are dropped. */
    cancelBuffer?: SharedArrayBuffer;
}

export interface WorkerRequest {
    id: string;
    action: WorkerAction;
    code: string;
    /** TRANSPILE: several sources at once. */
    codes?: string[];
    notebookId?: string;
    executionCount?: number;
    assumptions?: VariableAssumptions;
    /** Interrupt epoch at the time the request was sent (see WorkerInitMessage.cancelBuffer). */
    epoch?: number;
}

export interface WorkerResponse {
    id: string;
    status: 'SUCCESS' | 'ERROR';
    results: Output[];
    variables?: Variable[];
    documentation?: Documentation;
    searchResults?: SearchResults;
    help?: Documentation | null;
    completions?: CompletionItem[];
    transpiled?: string[];
    interrupted?: boolean;
    error?: string;
    message?: string;
}

/** Unsolicited notifications (no request id). */
export interface WorkerNotification {
    type: 'READY' | 'GRAPHICS_READY' | 'GRAPHICS_FAILED' | 'FATAL' | 'ERROR' | 'PROFILE';
    message?: string;
    timings?: Record<string, number>;
}

export type WorkerMessage = WorkerResponse | WorkerNotification;

export interface CompletionItem {
    label: string;
    kind: 'Function' | 'Variable' | 'Class' | 'Module' | 'Keyword';
    detail?: string;
    documentation?: string;
}

export interface CompletionResponse {
    id: string;
    completions: CompletionItem[];
}
