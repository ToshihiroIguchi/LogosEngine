import { describe, expect, it } from 'vitest';
import { normalizeImportedNotebook, normalizeOutput } from './importNotebook';

describe('normalizeOutput', () => {
    it('keeps valid fields and drops unknown ones', () => {
        const out = normalizeOutput({ type: 'text', value: 'hi', timestamp: 5, evil: '<script>' });
        expect(out).toEqual({ type: 'text', value: 'hi', timestamp: 5 });
    });

    it('rejects unknown types and non-string values', () => {
        expect(normalizeOutput({ type: 'html', value: 'x' })).toBeNull();
        expect(normalizeOutput({ type: 'text', value: 3 })).toBeNull();
        expect(normalizeOutput(null)).toBeNull();
    });

    it('accepts only PNG data URLs for images', () => {
        expect(normalizeOutput({ type: 'image', value: 'https://example.com/x.png' })).toBeNull();
        expect(normalizeOutput({ type: 'image', value: 'data:image/svg+xml;base64,AAAA' })).toBeNull();
        expect(normalizeOutput({ type: 'image', value: 'data:image/png;base64,iVBOR' })).not.toBeNull();
    });

    it('sanitizes error fields that the UI iterates over', () => {
        const out = normalizeOutput({
            type: 'error', value: 'boom', traceback: 12, missingVariables: ['a', 'b c', 3, 'ok_1'], lineNo: -4
        });
        expect(out?.traceback).toBeUndefined();
        expect(out?.missingVariables).toEqual(['a', 'ok_1']);
        expect(out?.lineNo).toBeUndefined();
    });

    it('allows an error without a message', () => {
        expect(normalizeOutput({ type: 'error', errorName: 'AssertionError' })?.value).toBe('');
    });
});

describe('normalizeImportedNotebook (LogosEngine JSON)', () => {
    it('rejects data without cells', () => {
        expect(() => normalizeImportedNotebook({})).toThrow(/cells/);
        expect(() => normalizeImportedNotebook({ cells: [] })).toThrow(/No cells/);
    });

    it('repairs cell shapes and duplicate ids', () => {
        const { cells } = normalizeImportedNotebook({
            cells: [{ id: 'a', type: 'nope', content: 5, isEditing: 'yes' }, { id: 'a', content: 'x' }, null]
        });
        expect(cells).toHaveLength(3);
        expect(cells[0]).toMatchObject({ type: 'code', content: '', isExecuting: false });
        expect(cells[0].isEditing).toBeUndefined();
        expect(new Set(cells.map((c) => c.id)).size).toBe(3);
    });

    it('derives the title from the file name', () => {
        expect(normalizeImportedNotebook({ cells: [{}] }, 'notes-2026-07-11.json').title).toBe('notes');
        expect(normalizeImportedNotebook({ cells: [{}] }).title).toBe('Imported Notebook');
        expect(normalizeImportedNotebook({ title: 'Mine', cells: [{}] }, 'x.json').title).toBe('Mine');
    });
});

describe('normalizeImportedNotebook (Jupyter)', () => {
    const ipynb = {
        nbformat: 4,
        metadata: {},
        cells: [
            { id: 'logos-setup-cell', cell_type: 'code', source: ['import sympy'], outputs: [] },
            { id: 'md', cell_type: 'markdown', source: ['# Title\n', 'text'] },
            {
                id: 'c1', cell_type: 'code', execution_count: 3, source: ['x', '\n', '+1'],
                outputs: [
                    { output_type: 'stream', name: 'stderr', text: ['warn'] },
                    { output_type: 'execute_result', execution_count: 3, data: { 'text/latex': '$$x + 1$$', 'text/plain': 'x + 1' } },
                    { output_type: 'display_data', data: { 'image/png': 'iVBOR\n' } },
                    { output_type: 'error', ename: 'ValueError', evalue: 'bad', traceback: ['\u001b[31mTrace\u001b[0m', 'line 2'] },
                ]
            },
        ]
    };

    it('skips the export setup cell and joins sources', () => {
        const { cells } = normalizeImportedNotebook(ipynb, 'demo.ipynb');
        expect(cells).toHaveLength(2);
        expect(cells[0]).toMatchObject({ type: 'markdown', content: '# Title\ntext', isEditing: false });
        expect(cells[1]).toMatchObject({ type: 'code', content: 'x\n+1', executionCount: 3 });
    });

    it('converts outputs', () => {
        const outputs = normalizeImportedNotebook(ipynb).cells[1].outputs;
        expect(outputs[0]).toMatchObject({ type: 'text', stream: 'stderr', value: 'warn' });
        expect(outputs[1]).toMatchObject({ type: 'latex', value: 'x + 1', rawText: 'x + 1', isResult: true });
        expect(outputs[2]).toMatchObject({ type: 'image', value: 'data:image/png;base64,iVBOR' });
        expect(outputs[3]).toMatchObject({ type: 'error', errorName: 'ValueError', value: 'bad', traceback: 'Trace\nline 2' });
    });

    it('titles from the file name', () => {
        expect(normalizeImportedNotebook(ipynb, 'demo.ipynb').title).toBe('demo');
    });
});
