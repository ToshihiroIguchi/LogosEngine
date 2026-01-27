import type { NotebookState, Cell } from '../types';
import type {
    INotebookContent,
    NotebookCell,
    ICodeCell,
    IMarkdownCell
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
    version: "3.10"
};

// Target functions that support Equation syntax (x=1)
const TARGET_FUNCS = new Set(['solve', 'dsolve', 'nsolve', 'solveset', 'nonlinsolve', 'linsolve']);

// SymPy reserved keywords that should NOT be converted to Eq(k, v)
const SYMPY_RESERVED_ARGS = new Set([
    'check', 'simplify', 'rational', 'manual', 'implicit', 'hint',
    'force', 'dict', 'set', 'verify', 'exclude', 'quick', 'cubics',
    'quartics', 'quintics', 'domain', 'symbols', 'flags'
]);

// --- Main Export Function ---

/**
 * Converts internal NotebookState to Jupyter Notebook format (v4.5)
 * Strategy: Code-First.
 * - Outputs are empty to keep file size small.
 * - Setup cell is injected to ensure environment is ready.
 * - Syntax is transpiled to ensure standard Python compatibility.
 */
export function convertToJupyterNotebook(state: NotebookState): INotebookContent {
    // 1. Create Setup Cell
    const setupCell = createSetupCell();

    // 2. Convert User Cells
    const userCells: NotebookCell[] = state.cells.map(convertCell);

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

function convertCell(cell: Cell): NotebookCell {
    if (cell.type === 'markdown') {
        const mdCell: IMarkdownCell = {
            cell_type: 'markdown',
            metadata: {
                id: cell.id
            },
            source: splitLines(cell.content)
        };
        return mdCell;
    } else {
        // Transpile code for compatibility
        const transpiledCode = transpileCode(cell.content);

        const codeCell: ICodeCell = {
            cell_type: 'code',
            execution_count: null, // Reset execution count
            metadata: {
                id: cell.id
            },
            source: splitLines(transpiledCode),
            outputs: [] // Intentionally empty to reduce bloat
        };
        return codeCell;
    }
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
        cell_type: 'code',
        execution_count: null,
        metadata: {
            id: "logos-setup-cell",
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
 */
export function transpileCode(code: string): string {
    // Simple tokenizer-like loop to find function calls
    let result = "";
    let i = 0;

    while (i < code.length) {
        // Check for target function start
        let matchFound = false;
        for (const func of TARGET_FUNCS) {
            // Check if code starts with "func(" at current position
            // We need to ensure it's a whole word match
            const prefix = code.substring(i);
            const regex = new RegExp(`^${func}\\s*\\(`, 'y'); // Sticky match
            regex.lastIndex = 0; // Reset for manual usage if needed, but 'y' usually works at start
            // Actually 'y' is tricky in loops. Let's just check string start.
            // A clearer check:
            if (prefix.startsWith(func)) {
                // Check boundary before
                const isWordStart = i === 0 || !/[a-zA-Z0-9_]/.test(code[i - 1]);
                if (!isWordStart) continue;

                const afterName = prefix.substring(func.length);
                const openParenMatch = afterName.match(/^\s*\(/);

                if (openParenMatch) {
                    // FOUND!
                    const openParenIndex = i + func.length + openParenMatch.index!;
                    // Find matching closing paren
                    const closeParenIndex = findMatchingParen(code, openParenIndex);

                    if (closeParenIndex !== -1) {
                        const argsContent = code.substring(openParenIndex + 1, closeParenIndex);
                        const processedArgs = processFunctionArgs(argsContent);

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

function findMatchingParen(code: string, start: number): number {
    let depth = 0;
    for (let k = start; k < code.length; k++) {
        if (code[k] === '(') depth++;
        if (code[k] === ')') depth--;
        if (depth === 0) return k;
    }
    return -1;
}

function processFunctionArgs(argsStr: string): string {
    // Split by comma, respecting nested parens/brackets/braces
    let args: string[] = [];
    let lastSplit = 0;
    let depth = 0;

    for (let k = 0; k < argsStr.length; k++) {
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
        // Look for a top-level '=' in this argument
        let eqIndex = -1;
        let d = 0;
        for (let i = 0; i < arg.length; i++) {
            const c = arg[i];
            if (c === '(' || c === '[' || c === '{') d++;
            if (c === ')' || c === ']' || c === '}') d--;

            // Found top-level '=' that is not '==' (lookahead/behind check)
            if (c === '=' && d === 0) {
                // Check it's not ==, <=, >=, !=
                const prev = i > 0 ? arg[i - 1] : '';
                const next = i < arg.length - 1 ? arg[i + 1] : '';
                if (prev !== '=' && prev !== '!' && prev !== '<' && prev !== '>' && next !== '=') {
                    eqIndex = i;
                    break;
                }
            }
        }

        if (eqIndex !== -1) {
            const lhs = arg.substring(0, eqIndex).trim();
            const rhs = arg.substring(eqIndex + 1).trim();

            // Check if LHS is a simple identifier (keyword arg candidate)
            const isSimpleIdentifier = /^[a-zA-Z_]\w*$/.test(lhs);

            if (isSimpleIdentifier && SYMPY_RESERVED_ARGS.has(lhs)) {
                // It is a reserved keyword argument (e.g. check=True) -> Keep as is
                return arg;
            } else {
                // Complex LHS (x+1=0) OR Simple LHS not reserved (x=1) -> Equation
                return ` Eq(${lhs}, ${rhs})`;
            }
        }

        return arg;
    });

    return newArgs.join(',');
}


// --- Helpers ---

function splitLines(text: string): string[] {
    if (!text) return [];
    return text.split('\n').map((line, index, arr) => {
        if (index < arr.length - 1) return line + "\n";
        return line;
    });
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
