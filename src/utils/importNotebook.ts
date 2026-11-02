import type { Cell, Output } from '../types';

/**
 * Turns untrusted imported data (LogosEngine JSON or a Jupyter .ipynb) into safe cells.
 * Nothing from the file is trusted: every field is checked and unknown fields are dropped.
 */

export interface ImportedNotebook {
    title: string;
    cells: Cell[];
}

const OUTPUT_TYPES = new Set(['text', 'latex', 'image', 'error']);
const PNG_DATA_URL = /^data:image\/png;base64,[A-Za-z0-9+/=\s]*$/;
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SETUP_CELL_ID = 'logos-setup-cell';

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function joinSource(source: unknown): string {
    if (typeof source === 'string') return source;
    if (Array.isArray(source)) return source.filter((s) => typeof s === 'string').join('');
    return '';
}

export function normalizeOutput(raw: unknown): Output | null {
    if (!isRecord(raw)) return null;
    const type = raw.type;
    if (typeof type !== 'string' || !OUTPUT_TYPES.has(type)) return null;
    const value = typeof raw.value === 'string' ? raw.value : type === 'error' ? '' : null;
    if (value === null) return null;
    // Image outputs must be PNG data URLs; anything else could point elsewhere
    if (type === 'image' && !PNG_DATA_URL.test(value)) return null;

    const output: Output = {
        type: type as Output['type'],
        value,
        timestamp: typeof raw.timestamp === 'number' && Number.isFinite(raw.timestamp) ? raw.timestamp : Date.now()
    };
    if (typeof raw.rawText === 'string') output.rawText = raw.rawText;
    if (typeof raw.tsv === 'string') output.tsv = raw.tsv;
    if (typeof raw.traceback === 'string') output.traceback = raw.traceback;
    if (typeof raw.errorName === 'string') output.errorName = raw.errorName;
    if (typeof raw.lineNo === 'number' && Number.isInteger(raw.lineNo) && raw.lineNo > 0) output.lineNo = raw.lineNo;
    if (raw.isResult === true) output.isResult = true;
    if (raw.stream === 'stdout' || raw.stream === 'stderr') output.stream = raw.stream;
    if (Array.isArray(raw.missingVariables)) {
        output.missingVariables = raw.missingVariables.filter(
            (v): v is string => typeof v === 'string' && IDENTIFIER.test(v)
        );
    }
    return output;
}

function normalizeCell(raw: unknown, seenIds: Set<string>): Cell {
    const cell = isRecord(raw) ? raw : {};
    let id = typeof cell.id === 'string' && cell.id ? cell.id : crypto.randomUUID();
    if (seenIds.has(id)) id = crypto.randomUUID();
    seenIds.add(id);

    const type = cell.type === 'markdown' ? 'markdown' : 'code';
    const outputs = (Array.isArray(cell.outputs) ? cell.outputs : [])
        .map(normalizeOutput)
        .filter((o): o is Output => o !== null);

    const normalized: Cell = {
        id,
        type,
        content: typeof cell.content === 'string' ? cell.content : '',
        outputs: type === 'code' ? outputs : [],
        isExecuting: false
    };
    if (typeof cell.executionCount === 'number' && Number.isFinite(cell.executionCount)) {
        normalized.executionCount = cell.executionCount;
    }
    if (typeof cell.executionTime === 'number' && Number.isFinite(cell.executionTime)) {
        normalized.executionTime = cell.executionTime;
    }
    if (typeof cell.isEditing === 'boolean') normalized.isEditing = cell.isEditing;
    return normalized;
}

// --- Jupyter (.ipynb) ---

function convertIpynbOutput(raw: unknown, executionCount?: number): Output[] {
    if (!isRecord(raw)) return [];
    const now = Date.now();
    switch (raw.output_type) {
        case 'stream': {
            const text = joinSource(raw.text);
            return text
                ? [{ type: 'text', value: text, stream: raw.name === 'stderr' ? 'stderr' : 'stdout', timestamp: now }]
                : [];
        }
        case 'error': {
            const traceback = Array.isArray(raw.traceback)
                // Jupyter tracebacks carry ANSI colour codes
                // eslint-disable-next-line no-control-regex
                ? raw.traceback.filter((l) => typeof l === 'string').join('\n').replace(/\u001b\[[0-9;]*m/g, '')
                : undefined;
            return [{
                type: 'error',
                value: typeof raw.evalue === 'string' ? raw.evalue : '',
                errorName: typeof raw.ename === 'string' ? raw.ename : 'Error',
                traceback,
                timestamp: now
            }];
        }
        case 'execute_result':
        case 'display_data': {
            const data = isRecord(raw.data) ? raw.data : {};
            const isResult = raw.output_type === 'execute_result' && executionCount !== undefined;
            const outputs: Output[] = [];
            const png = joinSource(data['image/png']).replace(/\s+/g, '');
            if (png) outputs.push({ type: 'image', value: `data:image/png;base64,${png}`, timestamp: now });
            const latex = joinSource(data['text/latex']).trim();
            const plain = joinSource(data['text/plain']);
            if (latex) {
                outputs.push({
                    type: 'latex',
                    value: latex.replace(/^\$\$?/, '').replace(/\$\$?$/, '').trim(),
                    rawText: plain || undefined,
                    isResult,
                    timestamp: now
                });
            } else if (plain && !png) {
                outputs.push({ type: 'text', value: plain, rawText: plain, isResult, timestamp: now });
            }
            return outputs;
        }
        default:
            return [];
    }
}

function convertIpynbCell(raw: unknown, seenIds: Set<string>): Cell | null {
    if (!isRecord(raw)) return null;
    if (raw.id === SETUP_CELL_ID) return null; // the environment cell added by our own export

    const isCode = raw.cell_type === 'code';
    const executionCount = typeof raw.execution_count === 'number' ? raw.execution_count : undefined;
    const outputs = isCode && Array.isArray(raw.outputs)
        ? raw.outputs.flatMap((o) => convertIpynbOutput(o, executionCount))
        : [];

    return normalizeCell({
        id: raw.id,
        type: isCode ? 'code' : 'markdown',
        content: joinSource(raw.source),
        outputs,
        executionCount,
        isEditing: isCode ? undefined : false
    }, seenIds);
}

// --- Entry point ---

export function normalizeImportedNotebook(data: unknown, fileName?: string): ImportedNotebook {
    if (!isRecord(data) || !Array.isArray(data.cells)) {
        throw new Error('Invalid notebook format: missing cells array');
    }

    const seenIds = new Set<string>();
    const isIpynb = typeof data.nbformat === 'number';
    const cells = isIpynb
        ? data.cells.map((c) => convertIpynbCell(c, seenIds)).filter((c): c is Cell => c !== null)
        : data.cells.map((c) => normalizeCell(c, seenIds));

    if (cells.length === 0) {
        throw new Error('No cells found in the imported file');
    }

    let title = typeof data.title === 'string' ? data.title.trim() : '';
    if (!title && isRecord(data.metadata) && typeof data.metadata.title === 'string') {
        title = data.metadata.title.trim();
    }
    if (!title && fileName) {
        // "notebook-2026-07-11.json" -> "notebook"
        title = fileName.replace(/\.(json|ipynb)$/i, '').replace(/-\d{4}-\d{2}-\d{2}$/, '').trim();
    }
    return { title: title || 'Imported Notebook', cells };
}
