import type { NotebookState, Cell, Output } from '../types';
import type {
    INotebookContent,
    NotebookCell,
    ICodeCell,
    IMarkdownCell,
    CodeCellOutput,
    IStream,
    IExecuteResult,
    IDisplayData,
    IError
} from '../types/nbformat';

/**
 * Converts internal NotebookState to Jupyter Notebook format (v4.5)
 */
export function convertToJupyterNotebook(state: NotebookState): INotebookContent {
    const cells: NotebookCell[] = state.cells.map(convertCell);

    return {
        nbformat: 4,
        nbformat_minor: 5,
        metadata: {
            kernelspec: {
                display_name: "Python 3 (Pyodide)",
                language: "python",
                name: "python3"
            },
            language_info: {
                codemirror_mode: {
                    name: "ipython",
                    version: 3
                },
                file_extension: ".py",
                mimetype: "text/x-python",
                name: "python",
                nbconvert_exporter: "python",
                pygments_lexer: "ipython3",
                version: "3.10" // Approximate version
            },
            // Preserve app-specific metadata if needed
            "logos_engine": {
                "version": "1.0.0"
            }
        },
        cells: cells
    };
}

function convertCell(cell: Cell): NotebookCell {
    if (cell.type === 'markdown') {
        const mdCell: IMarkdownCell = {
            cell_type: 'markdown',
            metadata: {
                id: cell.id // Preserve ID for round-trip consistency if supported
            },
            source: splitLines(cell.content)
        };
        return mdCell;
    } else {
        const codeCell: ICodeCell = {
            cell_type: 'code',
            execution_count: cell.executionCount ?? null,
            metadata: {
                id: cell.id
            },
            source: splitLines(cell.content),
            outputs: cell.outputs ? cell.outputs.map(convertOutput).filter((o): o is CodeCellOutput => o !== null) : []
        };
        return codeCell;
    }
}

function convertOutput(output: Output): CodeCellOutput | null {
    switch (output.type) {
        case 'text':
            // Differentiate between generic stdout and meaningful result if possible
            // For now, if it's marked as result, treat as execute_result
            if (output.isResult) {
                const result: IExecuteResult = {
                    output_type: 'execute_result',
                    execution_count: null, // Will be filled by parent if needed, but per output it matches cell
                    data: {
                        "text/plain": splitLines(output.value)
                    },
                    metadata: {}
                };
                return result;
            } else {
                const stream: IStream = {
                    output_type: 'stream',
                    name: 'stdout',
                    text: splitLines(output.value)
                };
                return stream;
            }

        case 'latex':
            const latexResult: IExecuteResult = {
                output_type: 'execute_result',
                execution_count: null,
                data: {
                    "text/latex": output.value, // Usually raw latex string
                    "text/plain": output.rawText ? splitLines(output.rawText) : "LaTeX Equation"
                },
                metadata: {}
            };
            return latexResult;

        case 'image':
            // LogosEngine stores images as full data URI (usually)
            // We need to strip the prefix for display_data
            const cleanBase64 = cleanBase64Image(output.value);
            if (!cleanBase64) return null;

            const imageResult: IDisplayData = {
                output_type: 'display_data',
                data: {
                    "image/png": cleanBase64
                },
                metadata: {}
            };
            return imageResult;

        case 'error':
            const errorResult: IError = {
                output_type: 'error',
                ename: output.errorName || "Error",
                evalue: output.value || "",
                traceback: output.traceback ? splitLines(output.traceback) : []
            };
            return errorResult;

        default:
            return null;
    }
}

// Helpers

function splitLines(text: string): string[] {
    // Jupyter prefers array of strings for multiline content, each ending with \n
    if (!text) return [];
    // Split but keep standardizing simple
    return text.split('\n').map((line, index, arr) => {
        // Add \n to all lines except the very last one strictly speaking, 
        // but usually Jupyter likes \n everywhere.
        // However, split removed parsing. Let's just return lines.
        // Better practice: join with \n for simple string or map carefully.
        // For robust 'source' array:
        if (index < arr.length - 1) return line + "\n";
        return line;
    });
}

function cleanBase64Image(dataUri: string): string | null {
    if (!dataUri) return null;
    // Check for standard data URI prefix
    const parts = dataUri.split(',');
    if (parts.length === 2) {
        return parts[1];
    }
    // If it's already raw base64 (no comma), assume it's good
    if (/^[A-Za-z0-9+/=]+$/.test(dataUri.trim())) {
        return dataUri.trim();
    }
    return null;
}

export function downloadNotebook(state: NotebookState, filename: string = "notebook.ipynb") {
    try {
        const notebook = convertToJupyterNotebook(state);
        const blob = new Blob([JSON.stringify(notebook, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (e) {
        console.error("Failed to export notebook:", e);
        alert("Failed to generate .ipynb file. See console for details.");
    }
}
