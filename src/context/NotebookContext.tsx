import React, { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { Cell } from '../types';
import { usePyodide } from '../hooks/usePyodide';
import { WELCOME_CODE } from '../constants/examples';

interface NotebookContextType {
    cells: Cell[];
    isReady: boolean;
    addCell: (type: 'code' | 'markdown', index?: number) => void;
    updateCell: (id: string, content: string) => void;
    deleteCell: (id: string) => void;
    executeCell: (id: string) => Promise<void>;
    executeAll: () => Promise<void>;
    insertExample: (code: string) => void;
}

const NotebookContext = createContext<NotebookContextType | undefined>(undefined);

export const NotebookProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [cells, setCells] = useState<Cell[]>([
        { id: '1', type: 'code', content: WELCOME_CODE, outputs: [], isExecuting: false }
    ]);
    const { isReady, execute } = usePyodide();

    const addCell = useCallback((type: 'code' | 'markdown', index?: number) => {
        const newCell: Cell = { id: crypto.randomUUID(), type, content: '', outputs: [], isExecuting: false };
        setCells(prev => {
            if (index === undefined) return [...prev, newCell];
            const next = [...prev];
            next.splice(index + 1, 0, newCell);
            return next;
        });
    }, []);

    const updateCell = useCallback((id: string, content: string) => {
        setCells(prev => prev.map(c => c.id === id ? { ...c, content } : c));
    }, []);

    const deleteCell = useCallback((id: string) => {
        setCells(prev => {
            if (prev.length === 1) return prev.map(c => c.id === id ? { ...c, content: '', outputs: [] } : c);
            return prev.filter(c => c.id !== id);
        });
    }, []);

    const executeCell = useCallback(async (id: string) => {
        const cell = cells.find(c => c.id === id);
        if (!cell || cell.type !== 'code' || !cell.content.trim()) return;

        setCells(prev => prev.map(c => c.id === id ? { ...c, isExecuting: true } : c));

        try {
            const response = await execute(cell.content);
            setCells(prev => prev.map(c =>
                c.id === id ? { ...c, outputs: response.results, isExecuting: false, executionCount: (c.executionCount || 0) + 1 } : c
            ));
        } catch (err: any) {
            setCells(prev => prev.map(c => c.id === id ? { ...c, outputs: [{ type: 'error', value: err.message, timestamp: Date.now() }], isExecuting: false } : c));
        }
    }, [cells, execute]);

    const executeAll = useCallback(async () => {
        for (const cell of cells) {
            if (cell.type === 'code' && cell.content.trim()) await executeCell(cell.id);
        }
    }, [cells, executeCell]);

    const insertExample = useCallback((code: string) => {
        const newCell: Cell = {
            id: crypto.randomUUID(),
            type: 'code',
            content: code,
            outputs: [],
            isExecuting: false
        };
        setCells(prev => [...prev, newCell]);
    }, []);

    return (
        <NotebookContext.Provider value={{ cells, isReady, addCell, updateCell, deleteCell, executeCell, executeAll, insertExample }}>
            {children}
        </NotebookContext.Provider>
    );
};

export const useNotebook = () => {
    const context = useContext(NotebookContext);
    if (!context) throw new Error('useNotebook must be used within NotebookProvider');
    return context;
};
