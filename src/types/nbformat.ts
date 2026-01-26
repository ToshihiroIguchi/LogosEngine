export type CellType = 'code' | 'markdown' | 'raw';
export type OutputType = 'execute_result' | 'display_data' | 'stream' | 'error';

export interface IMimeBundle {
    [key: string]: string | string[] | undefined;
    'text/plain'?: string | string[];
    'text/html'?: string | string[];
    'text/latex'?: string | string[];
    'image/png'?: string;
    'image/jpeg'?: string;
    'image/svg+xml'?: string;
    'application/json'?: string | string[];
}

export interface IOutput {
    output_type: OutputType;
    metadata?: Record<string, unknown>;
}

export interface IExecuteResult extends IOutput {
    output_type: 'execute_result';
    execution_count: number | null;
    data: IMimeBundle;
}

export interface IDisplayData extends IOutput {
    output_type: 'display_data';
    data: IMimeBundle;
}

export interface IStream extends IOutput {
    output_type: 'stream';
    name: 'stdout' | 'stderr';
    text: string | string[];
}

export interface IError extends IOutput {
    output_type: 'error';
    ename: string;
    evalue: string;
    traceback: string[];
}

export type CodeCellOutput = IExecuteResult | IDisplayData | IStream | IError;

export interface ICell {
    cell_type: CellType;
    metadata: Record<string, unknown>;
    source: string | string[];
}

export interface IRawCell extends ICell {
    cell_type: 'raw';
}

export interface IMarkdownCell extends ICell {
    cell_type: 'markdown';
}

export interface ICodeCell extends ICell {
    cell_type: 'code';
    execution_count: number | null;
    outputs: CodeCellOutput[];
}

export type NotebookCell = IRawCell | IMarkdownCell | ICodeCell;

export interface INotebookContent {
    nbformat: number;
    nbformat_minor: number;
    metadata: {
        kernelspec: {
            display_name: string;
            language: string;
            name: string;
        };
        language_info: {
            codemirror_mode: {
                name: string;
                version: number;
            };
            file_extension: string;
            mimetype: string;
            name: string;
            nbconvert_exporter: string;
            pygments_lexer: string;
            version: string;
        };
        [key: string]: unknown;
    };
    cells: NotebookCell[];
}
