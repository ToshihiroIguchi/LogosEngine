import { describe, expect, it } from 'vitest';
import { convertToJupyterNotebook } from './exportUtils';
import type { Cell } from '../types';

const cell = (over: Partial<Cell>): Cell => ({
    id: 'c1',
    type: 'code',
    content: '',
    outputs: [],
    isExecuting: false,
    ...over,
});

describe('convertToJupyterNotebook', () => {
    it('puts cell ids at the top level (nbformat 4.5) and not in metadata', () => {
        const nb = convertToJupyterNotebook({ cells: [cell({ id: 'abc-123', content: 'x' })] });
        const user = nb.cells[1];
        expect(user.id).toBe('abc-123');
        expect(user.metadata).not.toHaveProperty('id');
        expect(nb.cells[0].id).toBe('logos-setup-cell');
    });

    it('sanitizes ids that violate the nbformat id pattern', () => {
        const nb = convertToJupyterNotebook({ cells: [cell({ id: 'bad id!/' })] });
        expect(nb.cells[1].id).toMatch(/^[a-zA-Z0-9-_]{1,64}$/);
    });

    it('wraps text/latex output in $$ delimiters', () => {
        const nb = convertToJupyterNotebook({
            cells: [cell({
                content: 'x',
                executionCount: 1,
                outputs: [{ type: 'latex', value: 'x^{2}', rawText: 'x**2', timestamp: 0, isResult: true }],
            })],
        });
        const out = (nb.cells[1] as { outputs: Array<{ data: Record<string, string> }> }).outputs[0];
        expect(out.data['text/latex']).toBe('$$x^{2}$$');
    });

    it('transpiles caret and equation syntax in exported code', () => {
        const nb = convertToJupyterNotebook({ cells: [cell({ content: 'solve([x+y=1, x-y=2], [x, y]) + 2^3' })] });
        const src = ([] as string[]).concat((nb.cells[1] as { source: string | string[] }).source).join('');
        expect(src).toContain('Eq(x+y, 1)');
        expect(src).toContain('2**3');
    });
});

describe('convertToJupyterNotebook output details', () => {
    const outputsOf = (nb: ReturnType<typeof convertToJupyterNotebook>) =>
        (nb.cells[1] as unknown as { outputs: Array<Record<string, unknown>> }).outputs;

    it('stores tracebacks one string per line without trailing newlines', () => {
        const nb = convertToJupyterNotebook({
            cells: [cell({ outputs: [{ type: 'error', value: 'bad', errorName: 'ValueError', traceback: 'a\nb\n', timestamp: 0 }] })],
        });
        expect(outputsOf(nb)[0].traceback).toEqual(['a', 'b']);
    });

    it('exports display() values as display_data and results as execute_result', () => {
        const nb = convertToJupyterNotebook({
            cells: [cell({
                executionCount: 2,
                outputs: [
                    { type: 'latex', value: 'a', timestamp: 0 },
                    { type: 'latex', value: 'b', timestamp: 0, isResult: true },
                ],
            })],
        });
        expect(outputsOf(nb).map((o) => o.output_type)).toEqual(['display_data', 'execute_result']);
    });

    it('keeps stderr streams', () => {
        const nb = convertToJupyterNotebook({
            cells: [cell({ outputs: [{ type: 'text', value: 'w', stream: 'stderr', timestamp: 0 }] })],
        });
        expect(outputsOf(nb)[0]).toMatchObject({ output_type: 'stream', name: 'stderr' });
    });

    it('uses a custom transpiler when given (engine-provided rewrite)', () => {
        const nb = convertToJupyterNotebook(
            { cells: [cell({ content: 'solve(x=1)' })] },
            { transpile: (code) => `# via engine\n${code}` },
        );
        const src = ([] as string[]).concat((nb.cells[1] as { source: string | string[] }).source).join('');
        expect(src.startsWith('# via engine')).toBe(true);
    });
});
