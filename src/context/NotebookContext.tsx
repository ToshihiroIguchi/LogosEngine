import React, { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import type { Cell, Variable, Documentation } from '../types';
import { usePyodide } from '../hooks/usePyodide';
import { WELCOME_CODE } from '../constants/examples';

export type SidebarTab = 'variables' | 'documentation';

interface NotebookContextType {
    cells: Cell[];
    variables: Variable[];
    activeDocumentation: Documentation | null;
    activeTab: SidebarTab;
    setActiveTab: (tab: SidebarTab) => void;
    isSidebarOpen: boolean;
    setIsSidebarOpen: (isOpen: boolean) => void;
    isReady: boolean;
    focusedCellId: string | null;
    setFocusedCellId: (id: string | null) => void;
    addCell: (type: 'code' | 'markdown', index?: number) => string;
    updateCell: (id: string, content: string) => void;
    deleteCell: (id: string) => void;
    executeCell: (id: string) => Promise<void>;
    executeAll: () => Promise<void>;
    interrupt: () => void;
    insertExample: (code: string) => void;
    importNotebook: (data: any) => void;
    selectNextCell: (currentId: string) => void;
    setCellEditing: (id: string, isEditing: boolean) => void;
    moveCell: (id: string, direction: 'up' | 'down') => void;
    duplicateCell: (id: string) => void;
    clearCellOutput: (id: string) => void;
    clearAllOutputs: () => void;
    resetNotebook: () => void;
    getCompletions: (code: string, position: number) => Promise<import('../worker/workerTypes').CompletionResponse>;
}

const NotebookContext = createContext<NotebookContextType | undefined>(undefined);

export const NotebookProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [cells, setCells] = useState<Cell[]>([
        { id: '1', type: 'code', content: WELCOME_CODE, outputs: [], isExecuting: false }
    ]);
    const [variables, setVariables] = useState<Variable[]>([]);
    const [activeDocumentation, setActiveDocumentation] = useState<Documentation | null>(null);
    const [activeTab, setActiveTab] = useState<SidebarTab>('variables');
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [focusedCellId, setFocusedCellId] = useState<string | null>(null);
    const { isReady, execute, interrupt: pyodideInterrupt, getCompletions } = usePyodide();
    const isInitialMount = useRef(true);

    // Initial Load
    useEffect(() => {
        const saved = localStorage.getItem('logos-engine-notebook');
        if (saved) {
            try {
                const { cells: savedCells } = JSON.parse(saved);
                if (Array.isArray(savedCells) && savedCells.length > 0) {
                    // Reset execution state but keep content/outputs
                    setCells(savedCells.map(c => ({ ...c, isExecuting: false })));
                }
            } catch (err) {
                console.error('Failed to load saved notebook:', err);
            }
        }
        isInitialMount.current = false;
    }, []);

    // Auto-save
    useEffect(() => {
        if (isInitialMount.current) return;

        const timer = setTimeout(() => {
            localStorage.setItem('logos-engine-notebook', JSON.stringify({ cells }));
        }, 1000); // Debounce save

        return () => clearTimeout(timer);
    }, [cells]);

    const addCell = useCallback((type: 'code' | 'markdown', index?: number) => {
        const id = crypto.randomUUID();
        const newCell: Cell = {
            id,
            type,
            content: '',
            outputs: [],
            isExecuting: false,
            isEditing: type === 'markdown'
        };
        setCells(prev => {
            if (index === undefined) return [...prev, newCell];
            const next = [...prev];
            next.splice(index + 1, 0, newCell);
            return next;
        });
        return id;
    }, []);

    const setCellEditing = useCallback((id: string, isEditing: boolean) => {
        setCells(prev => prev.map(c => c.id === id ? { ...c, isEditing } : c));
    }, []);

    const moveCell = useCallback((id: string, direction: 'up' | 'down') => {
        setCells(prev => {
            const index = prev.findIndex(c => c.id === id);
            if (index === -1) return prev;
            if (direction === 'up' && index === 0) return prev;
            if (direction === 'down' && index === prev.length - 1) return prev;

            const next = [...prev];
            const targetIndex = direction === 'up' ? index - 1 : index + 1;
            [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
            return next;
        });
    }, []);

    const duplicateCell = useCallback((id: string) => {
        setCells(prev => {
            const index = prev.findIndex(c => c.id === id);
            if (index === -1) return prev;
            const original = prev[index];
            const newCell: Cell = {
                ...original,
                id: crypto.randomUUID(),
                outputs: [],
                executionCount: undefined,
                isExecuting: false
            };
            const next = [...prev];
            next.splice(index + 1, 0, newCell);
            return next;
        });
    }, []);

    const clearCellOutput = useCallback((id: string) => {
        setCells(prev => prev.map(c => c.id === id ? { ...c, outputs: [], executionCount: undefined } : c));
    }, []);

    const clearAllOutputs = useCallback(() => {
        setCells(prev => prev.map(c => ({ ...c, outputs: [], executionCount: undefined })));
    }, []);

    const updateCell = useCallback((id: string, content: string) => {
        setCells(prev => prev.map(c => c.id === id ? { ...c, content } : c));
    }, []);

    const resetNotebook = useCallback(() => {
        const newId = crypto.randomUUID();
        const newCell: Cell = {
            id: newId,
            type: 'code',
            content: '',
            outputs: [],
            isExecuting: false
        };
        setCells([newCell]);
        setVariables([]);
        setActiveDocumentation(null);
        setFocusedCellId(newId);
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

            if (response.variables) {
                setVariables(response.variables);
            }

            if (response.documentation) {
                setActiveDocumentation(response.documentation);
                setActiveTab('documentation');
                setIsSidebarOpen(true);
            }
        } catch (err: any) {
            setCells(prev => prev.map(c => c.id === id ? { ...c, outputs: [{ type: 'error', value: err.message, timestamp: Date.now() }], isExecuting: false } : c));
        }
    }, [cells, execute]);

    const selectNextCell = useCallback((currentId: string) => {
        const currentIndex = cells.findIndex(c => c.id === currentId);
        if (currentIndex === -1) return;

        if (currentIndex < cells.length - 1) {
            // Focus existing next cell
            setFocusedCellId(cells[currentIndex + 1].id);
        } else {
            // Create and focus new cell
            const newId = addCell('code');
            setFocusedCellId(newId);
        }
    }, [cells, addCell]);

    const executeAll = useCallback(async () => {
        for (const cell of cells) {
            if (cell.type === 'code' && cell.content.trim()) await executeCell(cell.id);
        }
    }, [cells, executeCell]);

    const interrupt = useCallback(() => {
        pyodideInterrupt();
        setCells(prev => prev.map(c => ({ ...c, isExecuting: false })));
    }, [pyodideInterrupt]);

    const insertExample = useCallback((code: string) => {
        setCells(prev => {
            const lastCell = prev[prev.length - 1];

            // If the last cell is an empty code cell, reuse it
            if (lastCell && lastCell.type === 'code' && !lastCell.content.trim()) {
                // Focus the existing last cell
                setFocusedCellId(lastCell.id);
                return prev.map(c => c.id === lastCell.id ? { ...c, content: code } : c);
            }

            // Otherwise, check if we need to add a new cell
            const newCell: Cell = {
                id: crypto.randomUUID(),
                type: 'code',
                content: code,
                outputs: [],
                isExecuting: false
            };

            // We need to set focus in a useEffect or similar if we want to be 100% sure, 
            // but setting state here usually triggers the effect in CellItem for "newly created cell" logic 
            // if we handle it right. 
            // NOTE: The Context API doesn't allow setting side-effect (setFocusedCellId for new ID) 
            // synchronously inside setCells callback easily for the *new* ID without finding it out first.
            // But since we generate ID here...

            // To properly handle focus for NEW cell, we should do it outside the setCells updater if possible,
            // or use the effect we have. Let's do it like the original unique-id flow.

            return [...prev, newCell];
        });

        // Note: For the "New Cell" case, we can't easily set focus inside the setCells callback 
        // to the *new* ID because we return the state. 
        // However, the original implementation didn't strictly focus the new example cell explicitly 
        // in logic shown (it just appended). 
        // Implementation Plan logic used a simplified return. 
        // Let's stick to the Plan's logic but ensure we handle the 'Reuse' case's focus explicitly as desired.

    }, []);

    const importNotebook = useCallback((data: any) => {
        try {
            if (!data.cells || !Array.isArray(data.cells)) {
                throw new Error('Invalid notebook format: missing cells array');
            }

            const importedCells: Cell[] = data.cells.map((cell: any) => ({
                id: crypto.randomUUID(),
                type: cell.type || 'code',
                content: cell.content || '',
                outputs: [],
                isExecuting: false
            }));

            if (importedCells.length === 0) {
                throw new Error('No cells found in the imported file');
            }

            setCells(importedCells);
        } catch (err: any) {
            alert(`Import failed: ${err.message}`);
        }
    }, []);

    return (
        <NotebookContext.Provider value={{
            cells, variables, activeDocumentation, activeTab, setActiveTab,
            isSidebarOpen, setIsSidebarOpen,
            isReady, focusedCellId, setFocusedCellId,
            addCell, updateCell, deleteCell, executeCell, executeAll, interrupt, insertExample, importNotebook,
            selectNextCell,
            setCellEditing, moveCell, duplicateCell, clearCellOutput, clearAllOutputs, resetNotebook,
            getCompletions
        }}>
            {children}
        </NotebookContext.Provider>
    );
};

export const useNotebook = () => {
    const context = useContext(NotebookContext);
    if (!context) throw new Error('useNotebook must be used within NotebookProvider');
    return context;
};
