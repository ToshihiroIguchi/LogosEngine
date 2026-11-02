import type { NotebookState, Cell } from '../types';
import { downloadBlob, sanitizeFileName } from './fileUtils';
import type {
    INotebookContent,
    NotebookCell,
    ICodeCell,
    IMarkdownCell,
    CodeCellOutput,
    IExecuteResult,
    IDisplayData,
    IStream,
    IError
} from '../types/nbformat';

// --- Constants ---

const KERNEL_SPEC = {
    display_name: "Python 3",
    language: "python",
    name: "python3"
};

const LANGUAGE_INFO = {
    codemirror_mode: {
        name: "ipython",
        version: 3
    },
    file_extension: ".py",
    mimetype: "text/x-python",
    name: "python",
    nbconvert_exporter: "python",
    pygments_lexer: "ipython3",
    version: "3.13"
};

// Target functions that support Equation syntax (x=1)
const TARGET_FUNCS = new Set(['solve', 'dsolve', 'nsolve', 'solveset', 'nonlinsolve', 'linsolve']);

// SymPy reserved keywords that should NOT be converted to Eq(k, v).
// Mirrors STATIC_RESERVED_ARGS in worker/python/preprocess.py (the engine is the primary
// implementation; this TypeScript version is only the fallback while the engine is not ready).
const SYMPY_RESERVED_ARGS = new Set([
    'check', 'simplify', 'rational', 'manual', 'implicit', 'hint', 'force', 'dict', 'set',
    'verify', 'exclude', 'quick', 'cubics', 'quartics', 'quintics', 'domain', 'symbols',
    'flags', 'minimal', 'warn', 'numerical', 'particular', 'positive',
    'ics', 'func', 'xi', 'eta',
    'prec', 'tol', 'solver', 'maxsteps', 'bisect', 'modules'
]);
// Valid keywords only for dsolve; ordinary variable names everywhere else
const DSOLVE_ONLY_ARGS = new Set(['n', 'x0']);

export interface ExportOptions {
    /** Rewrites a code cell for standard Python. Defaults to the built-in transpiler. */
    transpile?: (code: string) => string;
}

// --- Main Export Function ---

/**
 * Converts internal NotebookState to Jupyter Notebook format (v4.5)
 * Strategy: Code-First.
 * - Outputs from the notebook are included as-is (converted to nbformat outputs).
 * - Setup cell is injected to ensure environment is ready.
 * - Syntax is transpiled to ensure standard Python compatibility.
 */
export function convertToJupyterNotebook(state: NotebookState, options: ExportOptions = {}): INotebookContent {
    // 1. Create Setup Cell
    const setupCell = createSetupCell();

    // 2. Convert User Cells
    const userCells: NotebookCell[] = state.cells.map((cell) => convertCell(cell, options));

    // 3. Combine
    const allCells = [setupCell, ...userCells];

    return {
        nbformat: 4,
        nbformat_minor: 5,
        metadata: {
            kernelspec: KERNEL_SPEC,
            language_info: LANGUAGE_INFO,
            "logos_engine": {
                "version": "1.0.0",
                "export_strategy": "code_only"
            }
        },
        cells: allCells
    };
}

// --- Cell Conversion ---

function convertCell(cell: Cell, options: ExportOptions): NotebookCell {
    if (cell.type === 'markdown') {
        const mdCell: IMarkdownCell = {
            id: sanitizeCellId(cell.id),
            cell_type: 'markdown',
            metadata: {},
            source: splitLines(cell.content)
        };
        return mdCell;
    } else {
        // Transpile code for compatibility
        const transpiledCode = (options.transpile ?? transpileCode)(cell.content);

        const codeCell: ICodeCell = {
            id: sanitizeCellId(cell.id),
            cell_type: 'code',
            execution_count: cell.executionCount || null,
            metadata: {},
            source: splitLines(transpiledCode),
            outputs: convertOutputs(cell.outputs, cell.executionCount)
        };
        return codeCell;
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function convertOutputs(outputs: any[], executionCount?: number): CodeCellOutput[] {
    if (!outputs) return [];
    return outputs.map(out => {
        if (out.type === 'error') {
            // nbformat stores one string per line without trailing newlines (Jupyter joins them)
            const tracebackLines = out.traceback
                ? out.traceback.replace(/\n$/, '').split('\n')
                : [out.value || ''];
            return {
                output_type: 'error',
                ename: out.errorName || 'Error',
                evalue: out.value || '',
                traceback: tracebackLines
            } as IError;
        }

        if (out.type === 'image') {
            let base64Data = out.value || '';
            const commaIndex = base64Data.indexOf(',');
            if (commaIndex !== -1) {
                base64Data = base64Data.substring(commaIndex + 1);
            }
            return {
                output_type: 'display_data',
                data: {
                    'image/png': base64Data
                },
                metadata: {}
            } as IDisplayData;
        }

        if (out.type === 'latex') {
            const data = {
                // Jupyter renders text/latex only when wrapped in math delimiters
                'text/latex': `$$${out.value}$$`,
                'text/plain': out.rawText || out.value
            };
            if (!out.isResult) {
                return { output_type: 'display_data', data, metadata: {} } as IDisplayData;
            }
            return {
                output_type: 'execute_result',
                execution_count: executionCount || null,
                data,
                metadata: {}
            } as IExecuteResult;
        }

        // Default text output
        if (out.isResult) {
            return {
                output_type: 'execute_result',
                execution_count: executionCount || null,
                data: {
                    'text/plain': out.value
                },
                metadata: {}
            } as IExecuteResult;
        } else {
            return {
                output_type: 'stream',
                name: out.stream === 'stderr' ? 'stderr' : 'stdout',
                text: splitLines(out.value)
            } as IStream;
        }
    });
}

function createSetupCell(): ICodeCell {
    const setupCode = [
        "# LogosEngine Export: Environment Setup",
        "",
        "# 1. Core Imports",
        "import sympy",
        "from sympy import *",
        "from sympy.vector import *",
        "import matplotlib.pyplot as plt",
        "from sympy.plotting import plot",
        "",
        "# 2. Magic Commands",
        "%matplotlib inline",
        "",
        "# 3. Initialize Printing",
        "init_printing()",
        "",
        "# 4. Define Default Symbols (Standard LogosEngine Context)",
        "x, y, z, t = symbols('x y z t')"
    ].join('\n');

    return {
        id: "logos-setup-cell",
        cell_type: 'code',
        execution_count: null,
        metadata: {
            collapsed: true
        },
        source: splitLines(setupCode),
        outputs: []
    };
}

// --- Syntax Transpilation ---

/**
 * Transpiles LogosEngine specific syntax to standard Python/SymPy.
 * Main target: `solve(x=1)` -> `solve(Eq(x, 1))`
 * Ignores comments and string literals.
 */
export function transpileCode(code: string): string {
    let result = "";
    let i = 0;

    while (i < code.length) {
        // 1. Skip Python comments (# ...)
        if (code[i] === '#') {
            let end = code.indexOf('\n', i);
            if (end === -1) end = code.length;
            result += code.substring(i, end);
            i = end;
            continue;
        }

        // 2. Skip triple-quoted strings ('''...''' or """...""")
        if (code.startsWith('"""', i) || code.startsWith("'''", i)) {
            const quote = code.startsWith('"""', i) ? '"""' : "'''";
            let end = i + 3;
            while (end < code.length) {
                if (code.startsWith(quote, end)) {
                    // Check if escaped by an odd number of backslashes
                    let backslashes = 0;
                    let k = end - 1;
                    while (k >= i && code[k] === '\\') {
                        backslashes++;
                        k--;
                    }
                    if (backslashes % 2 === 0) {
                        end += 3;
                        break;
                    }
                }
                end++;
            }
            result += code.substring(i, Math.min(end, code.length));
            i = end;
            continue;
        }

        // 3. Skip single/double quoted strings ('...' or "...")
        if (code[i] === '"' || code[i] === "'") {
            const quote = code[i];
            let end = i + 1;
            while (end < code.length) {
                if (code[end] === quote) {
                    let backslashes = 0;
                    let k = end - 1;
                    while (k >= i && code[k] === '\\') {
                        backslashes++;
                        k--;
                    }
                    if (backslashes % 2 === 0) {
                        end += 1;
                        break;
                    }
                }
                // Stop scanning if we hit a newline (invalid Python string, but prevents infinite loop)
                if (code[end] === '\n') {
                    break;
                }
                end++;
            }
            result += code.substring(i, Math.min(end, code.length));
            i = end;
            continue;
        }

        // 4. Check for caret operator (^ or ^=)
        if (code[i] === '^') {
            if (i + 1 < code.length && code[i + 1] === '=') {
                result += '**=';
                i += 2;
                continue;
            } else {
                result += '**';
                i++;
                continue;
            }
        }

        // 5. Check for target function start
        let matchFound = false;
        for (const func of TARGET_FUNCS) {
            const prefix = code.substring(i);
            if (prefix.startsWith(func)) {
                // Check boundary before
                const isWordStart = i === 0 || !/[a-zA-Z0-9_]/.test(code[i - 1]);
                if (!isWordStart) continue;
                // Skip attribute / method calls such as `obj.solve(a=1)`
                let b = i - 1;
                while (b >= 0 && (code[b] === ' ' || code[b] === '\t')) b--;
                if (b >= 0 && code[b] === '.') continue;

                const afterName = prefix.substring(func.length);
                const openParenMatch = afterName.match(/^\s*\(/);

                if (openParenMatch) {
                    const openParenIndex = i + func.length + openParenMatch.index!;
                    const closeParenIndex = findMatchingParen(code, openParenIndex);

                    if (closeParenIndex !== -1) {
                        const argsContent = code.substring(openParenIndex + 1, closeParenIndex);
                        const processedArgs = processFunctionArgs(argsContent, func);

                        result += code.substring(i, openParenIndex + 1); // "solve("
                        result += processedArgs;
                        result += ")";

                        i = closeParenIndex + 1;
                        matchFound = true;
                        break;
                    }
                }
            }
        }

        if (!matchFound) {
            result += code[i];
            i++;
        }
    }
    return result;
}

/**
 * If a string literal starts at `i`, returns the index just past its end.
 * Otherwise returns `i` unchanged.
 */
function skipStringLiteral(code: string, i: number): number {
    const ch = code[i];
    if (ch !== '"' && ch !== "'") return i;
    const quote = code.startsWith(ch.repeat(3), i) ? ch.repeat(3) : ch;
    let k = i + quote.length;
    while (k < code.length) {
        if (code[k] === '\\') {
            k += 2;
            continue;
        }
        if (code.startsWith(quote, k)) return k + quote.length;
        if (quote.length === 1 && code[k] === '\n') return k;
        k++;
    }
    return code.length;
}

/** If a comment starts at `i`, returns the index of its line break; otherwise `i`. */
function skipComment(code: string, i: number): number {
    if (code[i] !== '#') return i;
    const end = code.indexOf('\n', i);
    return end === -1 ? code.length : end;
}

/** Removes # comments (not those inside strings), keeping line breaks. */
function stripComments(code: string): string {
    let out = '';
    for (let k = 0; k < code.length; k++) {
        const skipped = skipStringLiteral(code, k);
        if (skipped !== k) {
            out += code.substring(k, skipped);
            k = skipped - 1;
            continue;
        }
        const afterComment = skipComment(code, k);
        if (afterComment !== k) {
            k = afterComment - 1;
            continue;
        }
        out += code[k];
    }
    return out;
}

function findMatchingParen(code: string, start: number): number {
    let depth = 0;
    for (let k = start; k < code.length; k++) {
        const skipped = skipStringLiteral(code, k);
        if (skipped !== k) {
            k = skipped - 1;
            continue;
        }
        const afterComment = skipComment(code, k);
        if (afterComment !== k) {
            k = afterComment - 1;
            continue;
        }
        if (code[k] === '(') depth++;
        if (code[k] === ')') depth--;
        if (depth === 0) return k;
    }
    return -1;
}

function processFunctionArgs(argsStr: string, funcName: string): string {
    // Split by comma, respecting nested parens/brackets/braces and string literals
    const args: string[] = [];
    let lastSplit = 0;
    let depth = 0;

    for (let k = 0; k < argsStr.length; k++) {
        const skipped = skipStringLiteral(argsStr, k);
        if (skipped !== k) {
            k = skipped - 1;
            continue;
        }
        const afterComment = skipComment(argsStr, k);
        if (afterComment !== k) {
            k = afterComment - 1;
            continue;
        }
        const char = argsStr[k];
        if (char === '(' || char === '[' || char === '{') depth++;
        if (char === ')' || char === ']' || char === '}') depth--;

        if (char === ',' && depth === 0) {
            args.push(argsStr.substring(lastSplit, k));
            lastSplit = k + 1;
        }
    }
    args.push(argsStr.substring(lastSplit)); // Last arg

    const newArgs = args.map(arg => {
        // Blanks and comments before the argument stay where they are
        const leading = arg.match(/^(?:\s|#[^\n]*)*/)![0];
        const body = arg.slice(leading.length);

        // Look for a top-level '=' in this argument
        let eqIndex = -1;
        let d = 0;
        for (let i = 0; i < body.length; i++) {
            const skipped = skipStringLiteral(body, i);
            if (skipped !== i) {
                i = skipped - 1;
                continue;
            }
            const afterComment = skipComment(body, i);
            if (afterComment !== i) {
                i = afterComment - 1;
                continue;
            }
            const c = body[i];
            if (c === '(' || c === '[' || c === '{') d++;
            if (c === ')' || c === ']' || c === '}') d--;

            // Found top-level '=' that is not '==', '<=', '>=', '!='
            if (c === '=' && d === 0) {
                const prev = i > 0 ? body[i - 1] : '';
                const next = i < body.length - 1 ? body[i + 1] : '';
                if (prev !== '=' && prev !== '!' && prev !== '<' && prev !== '>' && next !== '=') {
                    eqIndex = i;
                    break;
                }
            }
        }

        if (eqIndex !== -1) {
            // Comments inside an equation cannot survive being moved into Eq(...)
            const lhs = stripComments(body.substring(0, eqIndex)).trim();
            const rhs = stripComments(body.substring(eqIndex + 1)).trim();

            // Check if LHS is a simple identifier (keyword arg candidate)
            const isSimpleIdentifier = /^[a-zA-Z_]\w*$/.test(lhs);

            if (isSimpleIdentifier && (SYMPY_RESERVED_ARGS.has(lhs) || (funcName === 'dsolve' && DSOLVE_ONLY_ARGS.has(lhs)))) {
                // Reserved keyword argument (e.g. check=True) -> keep as is
                return `${leading}${lhs}=${transpileCode(rhs)}`;
            }
            // Complex LHS (x+1=0) OR simple LHS not reserved (x=1) -> Equation
            return `${leading}Eq(${transpileCode(lhs)}, ${transpileCode(rhs)})`;
        }

        // A list / tuple argument may itself contain equations: solve([x+y=1, x-y=2])
        const trimmed = body.trim();
        if ((trimmed[0] === '[' || trimmed[0] === '(') && trimmed.length > 1) {
            const open = body.indexOf(trimmed[0]);
            const close = findMatchingBracket(body, open);
            if (close === body.trimEnd().length - 1) {
                const inner = body.substring(open + 1, close);
                const trailing = body.substring(close + 1);
                return `${leading}${trimmed[0]}${processFunctionArgs(inner, funcName)}${trimmed[0] === '[' ? ']' : ')'}${trailing}`;
            }
        }

        return transpileCode(arg);
    });

    return newArgs.join(',');
}

function findMatchingBracket(code: string, start: number): number {
    let depth = 0;
    for (let k = start; k < code.length; k++) {
        const skipped = skipStringLiteral(code, k);
        if (skipped !== k) {
            k = skipped - 1;
            continue;
        }
        const afterComment = skipComment(code, k);
        if (afterComment !== k) {
            k = afterComment - 1;
            continue;
        }
        if (code[k] === '(' || code[k] === '[' || code[k] === '{') depth++;
        if (code[k] === ')' || code[k] === ']' || code[k] === '}') depth--;
        if (depth === 0) return k;
    }
    return -1;
}


// --- Helpers ---

/** nbformat 4.5 cell ids must match ^[a-zA-Z0-9-_]+$ and be 1-64 characters long. */
function sanitizeCellId(id: string): string {
    const cleaned = (id || '').replace(/[^a-zA-Z0-9-_]/g, '-').slice(0, 64);
    return cleaned || crypto.randomUUID();
}

function splitLines(text: string): string[] {
    if (!text) return [];
    return text.split('\n').map((line, index, arr) => {
        if (index < arr.length - 1) return line + "\n";
        return line;
    });
}

export function downloadNotebook(state: NotebookState, filename: string = "notebook.ipynb", options: ExportOptions = {}) {
    try {
        const notebook = convertToJupyterNotebook(state, options);
        const blob = new Blob([JSON.stringify(notebook, null, 2)], { type: "application/json" });
        downloadBlob(`${sanitizeFileName(filename.replace(/\.ipynb$/i, ''))}.ipynb`, blob);
    } catch (e) {
        console.error("Failed to export notebook:", e);
        alert("Failed to generate .ipynb file. See console for details.");
    }
}
