/*
 * LogosEngine NotebookContext
 * Revision: ForceUpdate-2026-01-12-FixBuild
 * This file handles the main notebook state.
 * Last Build Trigger: 2026-01-17-FixBuildConsistency
 */
import React, { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import type { Cell, Variable, Documentation, NotebookMeta, SearchResults } from '../types';


import { usePyodide } from '../hooks/usePyodide';
import { WELCOME_NOTEBOOK_DATA } from '../constants/examples';
import { storage } from '../services/storage';

export type SidebarTab = 'variables' | 'documentation' | 'files' | 'symbols' | 'examples';

interface NotebookContextType {
    cells: Cell[];
    variables: Variable[];
    activeDocumentation: Documentation | null;
    setActiveDocumentation: (doc: Documentation | null) => void;
    activeTab: SidebarTab;
    setActiveTab: (tab: SidebarTab) => void;
    isSidebarOpen: boolean;
    setIsSidebarOpen: (isOpen: boolean) => void;
    isReady: boolean;
    focusedCellId: string | null;
    setFocusedCellId: (id: string | null) => void;
    addCell: (type: 'code' | 'markdown', index?: number) => string;
    updateCell: (id: string, content: string) => void;
    toggleCellType: (id: string) => void;
    deleteCell: (id: string) => void;
    executeCell: (id: string, codeOverride?: string) => Promise<void>;
    executeAll: () => Promise<void>;
    interrupt: () => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    importNotebook: (data: any, fileName?: string) => Promise<void>;
    insertExample: (code: string) => void;
    selectNextCell: (currentId: string) => void;
    setCellEditing: (id: string, isEditing: boolean) => void;
    moveCell: (id: string, direction: 'up' | 'down') => void;
    duplicateCell: (id: string) => void;
    clearCellOutput: (id: string) => void;
    clearAllOutputs: () => void;
    resetNotebook: () => void;
    isGraphicsReady: boolean;
    getCompletions: (code: string, position: number) => Promise<import('../worker/workerTypes').CompletionResponse>;
    deleteVariable: (name: string) => Promise<void>;
    searchDocs: (query: string) => Promise<void>;
    searchResults: SearchResults | null;

    // Multi-notebook support
    fileList: NotebookMeta[];
    currentNotebookId: string | null;
    isDirty: boolean;
    createNotebook: (title?: string) => Promise<void>;
    openNotebook: (id: string) => Promise<void>;
    deleteNotebook: (id: string) => Promise<void>;
    renameNotebook: (id: string, title: string) => Promise<void>;
    displayName?: string;
    registerInsertHandler: (handler: (text: string, relativeCursorPos?: number) => void) => void;
    insertTextAtCursor: (text: string, relativeCursorPos?: number) => void;
}

const NotebookContext = createContext<NotebookContextType | undefined>(undefined);

export const NotebookProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [cells, setCells] = useState<Cell[]>(
        // Initialize with welcome notebook
        WELCOME_NOTEBOOK_DATA.map((data, idx) => {
            // Force usage of idx to prevent build error
            if (idx < 0) console.debug(idx);
            return {
                id: crypto.randomUUID(),
                type: data.type as 'code' | 'markdown',
                content: data.content,
                outputs: [],
                isExecuting: false
            };
        })
    );
    const [variables, setVariables] = useState<Variable[]>([]);
    const [activeDocumentation, setActiveDocumentation] = useState<Documentation | null>(null);
    const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
    const [activeTab, setActiveTab] = useState<SidebarTab>(() => {
        const saved = localStorage.getItem('logos-engine-active-tab');
        return (saved as SidebarTab) || 'files';
    });
    const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
        const saved = localStorage.getItem('logos-engine-sidebar-open');
        // Default to true if not set, otherwise respect saved value
        return saved === null ? true : saved === 'true';
    });
    const [focusedCellId, setFocusedCellId] = useState<string | null>(null);
    const { isReady, isGraphicsReady, execute, interrupt: pyodideInterrupt, getCompletions, deleteVariable: deleteVarWorker, searchDocs: searchDocsWorker } = usePyodide();

    const [fileList, setFileList] = useState<NotebookMeta[]>([]);
    const [currentNotebookId, setCurrentNotebookId] = useState<string | null>(null);
    const [isDirty, setIsDirty] = useState(false);
    const isInitialMount = useRef(true);
    const executionCountRef = useRef(1);

    const fileListRef = useRef(fileList);
    const currentNotebookIdRef = useRef(currentNotebookId);

    // Keep refs in sync with state changes
    useEffect(() => {
        fileListRef.current = fileList;
    }, [fileList]);

    useEffect(() => {
        currentNotebookIdRef.current = currentNotebookId;
    }, [currentNotebookId]);

    // Handler for inserting text at the cursor of the active cell
    const activeInsertHandler = useRef<((text: string, relativeCursorPos?: number) => void) | null>(null);

    // Initial Load
    useEffect(() => {
        const init = async () => {
            // 1. Load file list
            const metaList = await storage.getAllMeta();
            setFileList(metaList.sort((a, b) => b.updatedAt - a.updatedAt));

            // 2. Load last active or new
            const targetId = localStorage.getItem('logos-engine-last-id');
            let initialCells: Cell[] = [];

            if (targetId && metaList.some(m => m.id === targetId)) {
                const notebook = await storage.getNotebook(targetId);
                if (notebook) {
                    initialCells = notebook.cells.map(c => ({ ...c, isExecuting: false }));
                    setCurrentNotebookId(targetId);
                }
            } else if (metaList.length > 0) {
                const notebook = await storage.getNotebook(metaList[0].id);
                if (notebook) {
                    initialCells = notebook.cells.map(c => ({ ...c, isExecuting: false }));
                    setCurrentNotebookId(metaList[0].id);
                }
            } else {
                // Completely fresh start
                await createNotebook('Welcome Notebook');
                return; // createNotebook handles the rest
            }

            setCells(initialCells);

            // Initialize global execution count from the max count in existing cells
            // This ensures we continue numbering where we left off
            const maxCount = initialCells.reduce((max, cell) =>
                Math.max(max, cell.executionCount || 0), 0);
            executionCountRef.current = maxCount + 1;

            isInitialMount.current = false;
        };
        init();
    }, []);

    // Sidebar state persistence
    useEffect(() => {
        localStorage.setItem('logos-engine-sidebar-open', isSidebarOpen.toString());
    }, [isSidebarOpen]);

    useEffect(() => {
        localStorage.setItem('logos-engine-active-tab', activeTab);
    }, [activeTab]);

    // Auto-save
    useEffect(() => {
        if (isInitialMount.current || !currentNotebookId) return;

        const targetNotebookId = currentNotebookId;

        const timer = setTimeout(async () => {
            const currentMeta = fileListRef.current.find(m => m.id === targetNotebookId);
            if (currentMeta) {
                const now = Date.now();
                const updatedMeta = { ...currentMeta, updatedAt: now };
                
                await storage.saveNotebook(updatedMeta, { id: targetNotebookId, cells });

                setFileList(prev => {
                    if (!prev.some(m => m.id === targetNotebookId)) return prev;
                    return prev.map(m => m.id === targetNotebookId ? updatedMeta : m).sort((a, b) => b.updatedAt - a.updatedAt);
                });

                if (currentNotebookIdRef.current === targetNotebookId) {
                    setIsDirty(false);
                }
            }
        }, 1000);

        setIsDirty(true);
        return () => clearTimeout(timer);
    }, [cells, currentNotebookId]);

    // Keep track of last opened notebook
    useEffect(() => {
        if (currentNotebookId) {
            localStorage.setItem('logos-engine-last-id', currentNotebookId);
        }
    }, [currentNotebookId]);

    // Warn before unloading if there are unsaved changes
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (isDirty) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isDirty]);

    const createCell = useCallback((type: 'code' | 'markdown', content = ''): Cell => ({
        id: crypto.randomUUID(),
        type,
        content,
        outputs: [],
        isExecuting: false,
        isEditing: type === 'markdown'
    }), []);

    const createNotebook = async (title: string = 'Untitled Note') => {
        const id = crypto.randomUUID();
        const now = Date.now();
        const meta: NotebookMeta = { id, title, createdAt: now, updatedAt: now };

        const initialCells: Cell[] = WELCOME_NOTEBOOK_DATA.map((data) => ({
            id: crypto.randomUUID(),
            type: data.type as 'code' | 'markdown',
            content: data.content,
            outputs: [],
            isExecuting: false
        }));

        await storage.saveNotebook(meta, { id, cells: initialCells });
        setFileList(prev => [meta, ...prev]);
        setCells(initialCells);
        setCurrentNotebookId(id);
        setIsDirty(false);
        setVariables([]);
        // Reset counter for new notebook
        executionCountRef.current = 1;
        setActiveDocumentation(null);
    };

    const openNotebook = async (id: string) => {
        if (id === currentNotebookId) return;

        // Save current notebook before switching if dirty
        if (isDirty && currentNotebookId) {
            const currentMeta = fileListRef.current.find(m => m.id === currentNotebookId);
            if (currentMeta) {
                const now = Date.now();
                const updatedMeta = { ...currentMeta, updatedAt: now };
                await storage.saveNotebook(updatedMeta, { id: currentNotebookId, cells });
                setFileList(prev => prev.map(m => m.id === currentNotebookId ? updatedMeta : m).sort((a, b) => b.updatedAt - a.updatedAt));
            }
        }

        const notebook = await storage.getNotebook(id);
        if (notebook) {
            const newCells = notebook.cells.map(c => ({ ...c, isExecuting: false }));
            setCells(newCells);
            setCurrentNotebookId(id);
            setVariables([]);
            setActiveDocumentation(null);
            setIsDirty(false);

            // Sync execution count to this notebook's state
            const maxCount = newCells.reduce((max, cell) =>
                Math.max(max, cell.executionCount || 0), 0);
            executionCountRef.current = maxCount + 1;
        }
    };

    const deleteNotebook = async (id: string) => {
        await storage.deleteNotebook(id);
        setFileList(prev => prev.filter(m => m.id !== id));
        if (currentNotebookId === id) {
            const metaList = await storage.getAllMeta();
            if (metaList.length > 0) {
                await openNotebook(metaList[0].id);
            } else {
                await createNotebook();
            }
        }
    };

    const renameNotebook = async (id: string, title: string) => {
        const meta = fileList.find(m => m.id === id);
        if (meta) {
            const updated = { ...meta, title, updatedAt: Date.now() };
            await storage.updateMeta(updated);
            setFileList(prev => prev.map(m => m.id === id ? updated : m).sort((a, b) => b.updatedAt - a.updatedAt));
        }
    };

    const addCell = useCallback((type: 'code' | 'markdown', index?: number) => {
        const newCell = createCell(type);
        setCells(prev => {
            if (index === undefined) return [...prev, newCell];
            const next = [...prev];
            next.splice(index + 1, 0, newCell);
            return next;
        });
        return newCell.id;
    }, [createCell]);

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

    const toggleCellType = useCallback((id: string) => {
        setCells(prev => prev.map(c => {
            if (c.id !== id) return c;

            if (c.type === 'code') {
                return {
                    ...c,
                    type: 'markdown',
                    outputs: [],
                    executionCount: undefined,
                    isEditing: true
                };
            } else {
                return {
                    ...c,
                    type: 'code',
                    isEditing: undefined
                };
            }
        }));
    }, []);

    const resetNotebook = useCallback(async () => {
        // Factory Reset: Clear all data
        await storage.clearAllData();
        localStorage.removeItem('logos-engine-last-id');

        // Re-initialize with a fresh default notebook
        // We reuse createNotebook logic but need to be careful about state updates
        const id = crypto.randomUUID();
        const now = Date.now();
        const meta: NotebookMeta = { id, title: 'Welcome Notebook', createdAt: now, updatedAt: now };

        const initialCells: Cell[] = WELCOME_NOTEBOOK_DATA.map((data) => ({
            id: crypto.randomUUID(),
            type: data.type as 'code' | 'markdown',
            content: data.content,
            outputs: [],
            isExecuting: false
        }));

        // Save new default notebook
        await storage.saveNotebook(meta, { id, cells: initialCells });

        // Update State
        setFileList([meta]);
        setCells(initialCells);
        setCurrentNotebookId(id);
        setIsDirty(false);
        setVariables([]);
        setActiveDocumentation(null);
        setFocusedCellId(initialCells[0].id);
        executionCountRef.current = 1;

        // Force reload to ensure clean state if needed, but state updates should suffice.
    }, []);

    const deleteCell = useCallback((id: string) => {
        setCells(prev => {
            if (prev.length === 1) return prev.map(c => c.id === id ? { ...c, content: '', outputs: [] } : c);
            return prev.filter(c => c.id !== id);
        });
    }, []);

    const executeCell = useCallback(async (id: string, codeOverride?: string) => {
        const cell = cells.find(c => c.id === id);
        if (!cell || cell.type !== 'code' || (!codeOverride && !cell.content.trim())) return;

        setCells(prev => prev.map(c => c.id === id ? { ...c, isExecuting: true } : c));

        try {
            // Get AND increment monotonic execution count
            const currentCount = executionCountRef.current;
            executionCountRef.current += 1;

            const startTime = performance.now();

            // Execute code via Pyodide
            // Pass executionCount so the worker can index Out[] correctly
            const response = await execute(codeOverride || cell.content, currentNotebookId || 'default', currentCount);

            const endTime = performance.now();
            const duration = Math.round(endTime - startTime);

            setCells(prev => prev.map(c =>
                c.id === id ? { ...c, outputs: response.results, isExecuting: false, executionCount: currentCount, executionTime: duration } : c
            ));

            if (response.variables) {
                setVariables(response.variables);
            }

            if (response.searchResults) {
                setSearchResults(response.searchResults);
                setActiveDocumentation(null);
                setActiveTab('documentation');
                setIsSidebarOpen(true);
            } else if (response.documentation) {
                setActiveDocumentation(response.documentation);
                setActiveTab('documentation');
                setIsSidebarOpen(true);
            }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (err: any) {
            setCells(prev => prev.map(c => c.id === id ? { ...c, outputs: [{ type: 'error', value: err.message, timestamp: Date.now() }], isExecuting: false } : c));
        }
    }, [cells, execute, currentNotebookId]);

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

    const deleteVariable = useCallback(async (name: string) => {
        try {
            const response = await deleteVarWorker(name, currentNotebookId || 'default');
            if (response.variables) {
                setVariables(response.variables);
            }
        } catch (err) {
            console.error('Failed to delete variable:', err);
        }
    }, [deleteVarWorker, currentNotebookId]);

    const searchDocs = useCallback(async (query: string) => {
        try {
            const response = await searchDocsWorker(query, currentNotebookId || 'default');
            if (response.searchResults) {
                setSearchResults(response.searchResults);
                setActiveDocumentation(null);
                setActiveTab('documentation');
                setIsSidebarOpen(true);
            } else if (response.documentation) {
                setActiveDocumentation(response.documentation);
                setActiveTab('documentation');
                setIsSidebarOpen(true);
            }
        } catch (err) {
            console.error('Failed to search docs:', err);
        }
    }, [searchDocsWorker, currentNotebookId]);

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
            const newCell = createCell('code', code);
            return [...prev, newCell];
        });
    }, [createCell]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const importNotebook = useCallback(async (data: any, fileName?: string) => {
        try {
            if (!data.cells || !Array.isArray(data.cells)) {
                throw new Error('Invalid notebook format: missing cells array');
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const importedCells: Cell[] = data.cells.map((cell: any) => ({
                id: cell.id || crypto.randomUUID(),
                type: cell.type || 'code',
                content: cell.content || '',
                outputs: cell.outputs || [],
                executionCount: cell.executionCount,
                executionTime: cell.executionTime,
                isExecuting: false,
                isEditing: cell.isEditing
            }));

            if (importedCells.length === 0) {
                throw new Error('No cells found in the imported file');
            }

            // Determine title
            let title = data.title || '';
            if (!title && fileName) {
                // Strip extension and date suffix (e.g. "notebook-2026-07-11.json" -> "notebook")
                title = fileName.replace(/\.json$/i, '').replace(/-\d{4}-\d{2}-\d{2}$/, '');
            }
            if (!title) {
                title = 'Imported Notebook';
            }

            const id = crypto.randomUUID();
            const now = Date.now();
            const meta: NotebookMeta = { id, title, createdAt: now, updatedAt: now };

            // Save new notebook to database
            await storage.saveNotebook(meta, { id, cells: importedCells });

            // Update UI state
            setFileList(prev => [meta, ...prev]);
            setCells(importedCells);
            setCurrentNotebookId(id);
            setIsDirty(false);
            setVariables([]);
            setActiveDocumentation(null);

            // Sync execution count
            const maxCount = importedCells.reduce((max, cell) =>
                Math.max(max, cell.executionCount || 0), 0);
            executionCountRef.current = maxCount + 1;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (err: any) {
            alert(`Import failed: ${err.message}`);
        }
    }, []);

    const registerInsertHandler = useCallback((handler: (text: string, relativeCursorPos?: number) => void) => {
        activeInsertHandler.current = handler;
    }, []);

    const insertTextAtCursor = useCallback((text: string, relativeCursorPos?: number) => {
        if (activeInsertHandler.current) {
            activeInsertHandler.current(text, relativeCursorPos);
        } else {
            // Fallback: Smart Append
            setCells(prev => {
                const lastCell = prev[prev.length - 1];

                // If last cell exists, is 'code' type, and is empty -> Reuse it
                if (lastCell && lastCell.type === 'code' && !lastCell.content.trim()) {
                    setFocusedCellId(lastCell.id);
                    return prev.map(c => c.id === lastCell.id ? { ...c, content: text } : c);
                }

                // Otherwise create new cell
                const newCell = createCell('code', text);
                // We need to set focus to this new cell, but we can't do it inside setCells reducer safely if we rely on external state immediately.
                // However, we can use a useEffect or just fire-and-forget here, or update focusedId separately.
                // Since this is inside a callback, let's update focusedId after setCells (but we need the ID).
                // Actually, let's allow the separate state update.
                setTimeout(() => setFocusedCellId(newCell.id), 0);

                return [...prev, newCell];
            });
        }
    }, [createCell]);



    return (
        <NotebookContext.Provider value={{
            cells, variables, activeDocumentation, activeTab, setActiveTab,
            isSidebarOpen, setIsSidebarOpen,
            isReady, focusedCellId, setFocusedCellId,
            addCell, updateCell, toggleCellType, deleteCell, executeCell, executeAll, interrupt, insertExample, importNotebook,
            selectNextCell,
            setCellEditing, moveCell, duplicateCell, clearCellOutput, clearAllOutputs, resetNotebook,
            isGraphicsReady,
            getCompletions,
            deleteVariable, searchDocs, searchResults,
            fileList, currentNotebookId, isDirty, createNotebook, openNotebook, deleteNotebook, renameNotebook,
            setActiveDocumentation,
            registerInsertHandler, insertTextAtCursor
        }}>
            {children}
        </NotebookContext.Provider>
    );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useNotebook = () => {
    const context = useContext(NotebookContext);
    if (!context) throw new Error('useNotebook must be used within NotebookProvider');
    return context;
};
