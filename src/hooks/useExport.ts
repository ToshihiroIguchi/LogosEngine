import { useCallback } from 'react';
import type { Cell } from '../types';
import { useNotebookActions } from '../state/AppNotebookContext';
import { downloadJsonFile } from '../utils/fileUtils';
import { downloadNotebook, transpileCode } from '../utils/exportUtils';

/** Notebook download helpers shared by the header menu and the file explorer. */
export function useExport() {
    const { transpileCodes } = useNotebookActions();

    const exportJson = useCallback((cells: Cell[], title: string) => {
        const dateStr = new Date().toISOString().slice(0, 10);
        downloadJsonFile(`${title}-${dateStr}.json`, { title, cells, version: '1.0' });
    }, []);

    /** Uses the running engine's own syntax rewriter so the export matches what executed. */
    const exportJupyter = useCallback(async (cells: Cell[], title: string) => {
        const sources = [...new Set(cells.filter((c) => c.type === 'code').map((c) => c.content))];
        const converted = await transpileCodes(sources);
        const lookup = new Map<string, string>();
        if (converted && converted.length === sources.length) {
            sources.forEach((src, i) => lookup.set(src, converted[i]));
        }
        downloadNotebook({ cells }, `${title}.ipynb`, {
            transpile: (code) => lookup.get(code) ?? transpileCode(code)
        });
    }, [transpileCodes]);

    return { exportJson, exportJupyter };
}
