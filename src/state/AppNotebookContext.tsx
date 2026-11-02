/*
 * LogosEngine NotebookContext
 * Notebook state is split over three contexts so a keystroke in one cell does not re-render
 * every cell: stable actions, low-frequency engine status, and the changing data.
 */
import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import type { Cell, Output, Variable, VariableAssumptions, Documentation, NotebookMeta, SearchResults } from '../types';
import type { CompletionResponse } from '../worker/workerTypes';

import { usePyodide } from '../hooks/usePyodide';
import { WELCOME_NOTEBOOK_DATA } from '../constants/examples';
import { storage } from '../services/storage';
import { normalizeImportedNotebook } from '../utils/importNotebook';
import { safeStorage } from '../utils/safeStorage';

export type SidebarTab = 'variables' | 'documentation' | 'files' | 'symbols' | 'examples';
export type SaveStatus = 'saved' | 'saving' | 'error';
/** Result of running one cell; Run All stops on anything but 'ok' / 'skipped'. */
export type ExecutionOutcome = 'ok' | 'error' | 'interrupted' | 'skipped';

const SIDEBAR_TABS: SidebarTab[] = ['variables', 'documentation', 'files', 'symbols', 'examples'];
const AUTOSAVE_DELAY_MS = 1000;
const TAB_ID = crypto.randomUUID();
const CHANNEL_NAME = 'logos-engine-notebooks';

export interface NotebookData {
    cells: Cell[];
    variables: Variable[];
    activeDocumentation: Documentation | null;
    searchResults: SearchResults | null;
    activeTab: SidebarTab;
    isSidebarOpen: boolean;
    fileList: NotebookMeta[];
    currentNotebookId: string | null;
    isDirty: boolean;
    saveStatus: SaveStatus;
    saveError: string | null;
    /** The open notebook was changed by another browser tab while it has unsaved edits here. */
    hasConflict: boolean;
}

export interface NotebookStatus {
    isReady: boolean;
    isGraphicsReady: boolean;
    initError: string | null;
    graphicsError: string | null;
    focusedCellId: string | null;
}

export interface NotebookActions {
    setActiveDocumentation: (doc: Documentation | null) => void;
    setActiveTab: (tab: SidebarTab) => void;
    setIsSidebarOpen: (isOpen: boolean) => void;
    setFocusedCellId: (id: string | null) => void;
    retryInit: () => void;
    retryGraphics: () => void;
    addCell: (type: 'code' | 'markdown', index?: number) => string;
    updateCell: (id: string, content: string) => void;
    toggleCellType: (id: string) => void;
    deleteCell: (id: string) => void;
    executeCell: (id: string, codeOverride?: string) => Promise<ExecutionOutcome>;
    executeAll: () => Promise<void>;
    interrupt: () => void;
    importNotebook: (data: unknown, fileName?: string) => Promise<void>;
    insertExample: (code: string) => void;
    selectNextCell: (currentId: string) => void;
    setCellEditing: (id: string, isEditing: boolean) => void;
    moveCell: (id: string, direction: 'up' | 'down') => void;
    duplicateCell: (id: string) => void;
    clearCellOutput: (id: string) => void;
    clearAllOutputs: () => void;
    resetNotebook: () => Promise<void>;
    getCompletions: (code: string, position: number) => Promise<CompletionResponse>;
    deleteVariable: (name: string) => Promise<void>;
    defineVariable: (name: string, assumptions: VariableAssumptions) => Promise<void>;
    searchDocs: (query: string) => Promise<void>;
    openDocumentation: (doc: Documentation) => void;
    transpileCodes: (codes: string[]) => Promise<string[] | null>;
    createNotebook: (title?: string) => Promise<void>;
    openNotebook: (id: string) => Promise<void>;
    deleteNotebook: (id: string) => Promise<void>;
    renameNotebook: (id: string, title: string) => Promise<void>;
    resolveConflict: (choice: 'reload' | 'keep') => Promise<void>;
    registerInsertHandler: (cellId: string, handler: (text: string, relativeCursorPos?: number) => void) => void;
    unregisterInsertHandler: (cellId: string) => void;
    insertTextAtCursor: (text: string, relativeCursorPos?: number) => void;
}

export type NotebookContextType = NotebookData & NotebookStatus & NotebookActions;

const DataContext = createContext<NotebookData | undefined>(undefined);
const StatusContext = createContext<NotebookStatus | undefined>(undefined);
const ActionsContext = createContext<NotebookActions | undefined>(undefined);

function createDefaultCells(): Cell[] {
    return WELCOME_NOTEBOOK_DATA.map((data) => ({
        id: crypto.randomUUID(),
        type: data.type,
        content: data.content,
        outputs: [],
        isExecuting: false
    }));
}

const byRecent = (a: NotebookMeta, b: NotebookMeta) => b.updatedAt - a.updatedAt;

/** Cells as stored: transient execution state is never persisted. */
const toStoredCells = (cells: Cell[]): Cell[] => cells.map((c) => (c.isExecuting ? { ...c, isExecuting: false } : c));

const maxExecutionCount = (cells: Cell[]) =>
    cells.reduce((max, cell) => Math.max(max, cell.executionCount || 0), 0);

function loadSidebarTab(): SidebarTab {
    const saved = safeStorage.get('logos-engine-active-tab');
    return SIDEBAR_TABS.includes(saved as SidebarTab) ? (saved as SidebarTab) : 'files';
}

export const NotebookProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [cells, setCells] = useState<Cell[]>(createDefaultCells);
    const [variables, setVariables] = useState<Variable[]>([]);
    const [activeDocumentation, setActiveDocumentation] = useState<Documentation | null>(null);
    const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
    const [activeTab, setActiveTab] = useState<SidebarTab>(loadSidebarTab);
    const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
        const saved = safeStorage.get('logos-engine-sidebar-open');
        return saved === null ? true : saved === 'true';
    });
    const [focusedCellId, setFocusedCellId] = useState<string | null>(null);
    const [fileList, setFileList] = useState<NotebookMeta[]>([]);
    const [currentNotebookId, setCurrentNotebookId] = useState<string | null>(null);
    const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
    const [saveError, setSaveError] = useState<string | null>(null);
    const [hasConflict, setHasConflict] = useState(false);

    // Always-current mirrors of state for async code
    const cellsRef = useRef(cells);
    const fileListRef = useRef(fileList);
    const currentNotebookIdRef = useRef(currentNotebookId);
    const hasConflictRef = useRef(false);
    useEffect(() => {
        cellsRef.current = cells;
        fileListRef.current = fileList;
        currentNotebookIdRef.current = currentNotebookId;
        hasConflictRef.current = hasConflict;
    }, [cells, fileList, currentNotebookId, hasConflict]);

    const initStartedRef = useRef(false);
    const initDoneRef = useRef(false);
    const deletedIdsRef = useRef<Set<string>>(new Set());
    const executionCountRef = useRef(1);
    // Change tracking without serializing the notebook on every keystroke
    const revisionRef = useRef(0);
    const savedRevisionRef = useRef(0);
    const executingRef = useRef<Set<string>>(new Set());
    const runGenerationRef = useRef(0);
    const openTokenRef = useRef(0);
    const variablesTokenRef = useRef(0);
    const docsTokenRef = useRef(0);
    const channelRef = useRef<BroadcastChannel | null>(null);
    const activeInsertHandler = useRef<{ cellId: string; handler: (text: string, relativeCursorPos?: number) => void } | null>(null);

    const handleEngineReset = useCallback(() => {
        // A restarted engine has empty namespaces and any running Run All must stop
        setVariables([]);
        runGenerationRef.current += 1;
    }, []);

    const {
        isReady, initError, retryInit, isGraphicsReady, graphicsError, retryGraphics,
        execute, interrupt: pyodideInterrupt, getCompletions: getCompletionsWorker, resetContext,
        deleteVariable: deleteVarWorker, defineVariable: defineVarWorker, getVariables: getVariablesWorker,
        searchDocs: searchDocsWorker, getHelp, transpileCodes
    } = usePyodide(handleEngineReset);

    // --- Cell state helpers -------------------------------------------------

    /** Edits that must be saved. */
    const updateCells = useCallback((updater: (prev: Cell[]) => Cell[]) => {
        revisionRef.current += 1;
        setCells(updater);
    }, []);

    /** Execution progress is transient and does not make the notebook dirty. */
    const updateCellsTransient = useCallback((updater: (prev: Cell[]) => Cell[]) => {
        setCells(updater);
    }, []);

    /** Swaps in a notebook that is already saved (opened, imported, created). */
    const replaceCells = useCallback((next: Cell[]) => {
        revisionRef.current += 1;
        savedRevisionRef.current = revisionRef.current;
        setCells(next);
        setSaveStatus('saved');
        setSaveError(null);
        setHasConflict(false);
        hasConflictRef.current = false;
        executionCountRef.current = maxExecutionCount(next) + 1;
        setActiveDocumentation(null);
    }, []);

    const broadcast = useCallback((message: { type: 'saved' | 'list-changed'; id?: string }) => {
        try {
            channelRef.current?.postMessage({ ...message, tabId: TAB_ID });
        } catch {
            // channel closed; other tabs just will not hear about it
        }
    }, []);

    const refreshFileList = useCallback(async () => {
        try {
            const metaList = await storage.getAllMeta();
            setFileList(metaList.sort(byRecent));
        } catch (err) {
            console.error('Failed to read the notebook list:', err);
        }
    }, []);

    // --- Persistence ----------------------------------------------------------

    const persistCurrent = useCallback(async () => {
        const id = currentNotebookIdRef.current;
        if (!id || deletedIdsRef.current.has(id) || hasConflictRef.current) return;
        const revision = revisionRef.current;
        if (revision === savedRevisionRef.current) return;

        const meta = fileListRef.current.find((m) => m.id === id);
        if (!meta) return;
        const updatedMeta = { ...meta, updatedAt: Date.now() };
        try {
            await storage.saveNotebook(updatedMeta, { id, cells: toStoredCells(cellsRef.current) });
        } catch (err) {
            console.error('Failed to save notebook:', err);
            setSaveStatus('error');
            setSaveError(err instanceof Error ? err.message : String(err));
            return;
        }
        if (deletedIdsRef.current.has(id)) return;

        savedRevisionRef.current = Math.max(savedRevisionRef.current, revision);
        setFileList((prev) => (prev.some((m) => m.id === id)
            ? prev.map((m) => (m.id === id ? updatedMeta : m)).sort(byRecent)
            : prev));
        if (currentNotebookIdRef.current === id) {
            const stillDirty = revisionRef.current !== savedRevisionRef.current;
            setSaveStatus(stillDirty ? 'saving' : 'saved');
            setSaveError(null);
        }
        broadcast({ type: 'saved', id });
    }, [broadcast]);

    const flushSave = useCallback(() => persistCurrent(), [persistCurrent]);

    // Auto-save
    useEffect(() => {
        if (!initDoneRef.current || !currentNotebookId) return;
        if (revisionRef.current === savedRevisionRef.current) return;
        setSaveStatus((s) => (s === 'error' ? s : 'saving'));
        const timer = setTimeout(() => { void persistCurrent(); }, AUTOSAVE_DELAY_MS);
        return () => clearTimeout(timer);
    }, [cells, currentNotebookId, persistCurrent, hasConflict]);

    // Warn before unloading while edits are unsaved
    const isDirty = saveStatus !== 'saved';
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

    // --- Loading ----------------------------------------------------------------

    /** Reads a notebook; a missing or empty body is repaired with the default cells. */
    const readNotebookCells = useCallback(async (id: string): Promise<{ cells: Cell[]; repaired: boolean }> => {
        const notebook = await storage.getNotebook(id);
        if (!notebook || !Array.isArray(notebook.cells) || notebook.cells.length === 0) {
            return { cells: createDefaultCells(), repaired: true };
        }
        return { cells: notebook.cells.map((c) => ({ ...c, isExecuting: false })), repaired: false };
    }, []);

    const createNotebook = useCallback(async (title: string = 'Untitled Note') => {
        await flushSave();
        const id = crypto.randomUUID();
        const now = Date.now();
        const meta: NotebookMeta = { id, title, createdAt: now, updatedAt: now };
        const initialCells = createDefaultCells();

        await storage.saveNotebook(meta, { id, cells: initialCells });
        setFileList((prev) => [meta, ...prev]);
        replaceCells(initialCells);
        setCurrentNotebookId(id);
        currentNotebookIdRef.current = id;
        setVariables([]);
        broadcast({ type: 'list-changed' });
    }, [flushSave, replaceCells, broadcast]);

    // Initial load
    useEffect(() => {
        // Guard against double invocation (React StrictMode), which would create two notebooks
        if (initStartedRef.current) return;
        initStartedRef.current = true;

        const init = async () => {
            try {
                const metaList = (await storage.getAllMeta()).sort(byRecent);
                setFileList(metaList);

                const lastId = safeStorage.get('logos-engine-last-id');
                const targetId = lastId && metaList.some((m) => m.id === lastId) ? lastId : metaList[0]?.id;

                if (!targetId) {
                    await createNotebook('Welcome Notebook');
                    return;
                }
                const { cells: loaded, repaired } = await readNotebookCells(targetId);
                replaceCells(loaded);
                setCurrentNotebookId(targetId);
                currentNotebookIdRef.current = targetId;
                if (repaired) revisionRef.current += 1; // persist the repaired body
            } catch (err) {
                console.error('Failed to initialize notebook storage:', err);
                setSaveStatus('error');
                setSaveError(`Notebook storage is unavailable: ${err instanceof Error ? err.message : String(err)}. Changes will not be saved.`);
            } finally {
                initDoneRef.current = true;
            }
        };
        void init();
    }, [createNotebook, readNotebookCells, replaceCells]);

    const openNotebook = useCallback(async (id: string) => {
        if (id === currentNotebookIdRef.current) return;
        const token = ++openTokenRef.current;
        try {
            await flushSave();
            if (token !== openTokenRef.current || deletedIdsRef.current.has(id)) return;
            const { cells: loaded, repaired } = await readNotebookCells(id);
            // A newer open request (or a delete) won while this one was reading
            if (token !== openTokenRef.current || deletedIdsRef.current.has(id)) return;

            replaceCells(loaded);
            setCurrentNotebookId(id);
            currentNotebookIdRef.current = id;
            setVariables([]);
            if (repaired) revisionRef.current += 1;
        } catch (err) {
            console.error('Failed to open notebook:', err);
            alert(`Failed to open the notebook: ${err instanceof Error ? err.message : String(err)}`);
        }
    }, [flushSave, readNotebookCells, replaceCells]);

    const deleteNotebook = useCallback(async (id: string) => {
        deletedIdsRef.current.add(id);
        const wasCurrent = currentNotebookIdRef.current === id;
        if (wasCurrent) {
            // Nothing of the deleted notebook may be written back
            savedRevisionRef.current = revisionRef.current;
            setSaveStatus('saved');
        }
        await storage.deleteNotebook(id);
        void resetContext(id, true);
        setFileList((prev) => prev.filter((m) => m.id !== id));
        broadcast({ type: 'list-changed' });

        if (wasCurrent) {
            currentNotebookIdRef.current = null;
            const metaList = (await storage.getAllMeta()).sort(byRecent);
            if (metaList.length > 0) {
                await openNotebook(metaList[0].id);
            } else {
                await createNotebook();
            }
        }
    }, [resetContext, broadcast, openNotebook, createNotebook]);

    const renameNotebook = useCallback(async (id: string, title: string) => {
        const meta = fileListRef.current.find((m) => m.id === id);
        if (!meta) return;
        const updated = { ...meta, title, updatedAt: Date.now() };
        await storage.updateMeta(updated);
        setFileList((prev) => prev.map((m) => (m.id === id ? updated : m)).sort(byRecent));
        broadcast({ type: 'list-changed' });
    }, [broadcast]);

    const resetNotebook = useCallback(async () => {
        // Factory reset: clear all data
        for (const m of fileListRef.current) {
            deletedIdsRef.current.add(m.id);
            void resetContext(m.id, true);
        }
        savedRevisionRef.current = revisionRef.current;
        await storage.clearAllData();
        safeStorage.remove('logos-engine-last-id');

        const id = crypto.randomUUID();
        const now = Date.now();
        const meta: NotebookMeta = { id, title: 'Welcome Notebook', createdAt: now, updatedAt: now };
        const initialCells = createDefaultCells();
        await storage.saveNotebook(meta, { id, cells: initialCells });

        setFileList([meta]);
        replaceCells(initialCells);
        setCurrentNotebookId(id);
        currentNotebookIdRef.current = id;
        setVariables([]);
        setFocusedCellId(initialCells[0].id);
        broadcast({ type: 'list-changed' });
    }, [resetContext, replaceCells, broadcast]);

    const importNotebook = useCallback(async (data: unknown, fileName?: string) => {
        try {
            const { title, cells: importedCells } = normalizeImportedNotebook(data, fileName);
            await flushSave();

            const id = crypto.randomUUID();
            const now = Date.now();
            const meta: NotebookMeta = { id, title, createdAt: now, updatedAt: now };
            await storage.saveNotebook(meta, { id, cells: importedCells });

            setFileList((prev) => [meta, ...prev]);
            replaceCells(importedCells);
            setCurrentNotebookId(id);
            currentNotebookIdRef.current = id;
            setVariables([]);
            broadcast({ type: 'list-changed' });
        } catch (err) {
            alert(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
        }
    }, [flushSave, replaceCells, broadcast]);

    // Remember the last opened notebook and the sidebar layout
    useEffect(() => {
        if (currentNotebookId) safeStorage.set('logos-engine-last-id', currentNotebookId);
    }, [currentNotebookId]);
    useEffect(() => {
        safeStorage.set('logos-engine-sidebar-open', String(isSidebarOpen));
    }, [isSidebarOpen]);
    useEffect(() => {
        safeStorage.set('logos-engine-active-tab', activeTab);
    }, [activeTab]);

    // --- Other browser tabs -----------------------------------------------------

    const reloadCurrentFromStorage = useCallback(async () => {
        const id = currentNotebookIdRef.current;
        if (!id) return;
        const { cells: loaded } = await readNotebookCells(id);
        if (currentNotebookIdRef.current !== id) return;
        replaceCells(loaded);
    }, [readNotebookCells, replaceCells]);

    useEffect(() => {
        if (typeof BroadcastChannel === 'undefined') return;
        const channel = new BroadcastChannel(CHANNEL_NAME);
        channelRef.current = channel;
        channel.onmessage = (event: MessageEvent) => {
            const message = event.data as { type?: string; id?: string; tabId?: string };
            if (!message || message.tabId === TAB_ID) return;
            if (message.type === 'list-changed') {
                void refreshFileList();
            } else if (message.type === 'saved') {
                void refreshFileList();
                if (message.id && message.id === currentNotebookIdRef.current) {
                    const hasLocalEdits = revisionRef.current !== savedRevisionRef.current;
                    if (hasLocalEdits || executingRef.current.size > 0) {
                        setHasConflict(true);
                        hasConflictRef.current = true;
                    } else {
                        void reloadCurrentFromStorage();
                    }
                }
            }
        };
        return () => {
            channel.close();
            channelRef.current = null;
        };
    }, [refreshFileList, reloadCurrentFromStorage]);

    const resolveConflict = useCallback(async (choice: 'reload' | 'keep') => {
        if (choice === 'reload') {
            await reloadCurrentFromStorage();
        } else {
            setHasConflict(false);
            hasConflictRef.current = false;
            // Overwrite what the other tab saved
            await persistCurrent();
        }
    }, [reloadCurrentFromStorage, persistCurrent]);

    // --- Variables follow the open notebook ---------------------------------------

    useEffect(() => {
        if (!isReady || !currentNotebookId) return;
        const token = ++variablesTokenRef.current;
        void getVariablesWorker(currentNotebookId).then((vars) => {
            if (token === variablesTokenRef.current) setVariables(vars);
        });
    }, [isReady, currentNotebookId, getVariablesWorker]);

    // --- Cell editing -------------------------------------------------------------

    const createCell = useCallback((type: 'code' | 'markdown', content = ''): Cell => ({
        id: crypto.randomUUID(),
        type,
        content,
        outputs: [],
        isExecuting: false,
        isEditing: type === 'markdown'
    }), []);

    const addCell = useCallback((type: 'code' | 'markdown', index?: number) => {
        const newCell = createCell(type);
        updateCells((prev) => {
            if (index === undefined) return [...prev, newCell];
            const next = [...prev];
            next.splice(index + 1, 0, newCell);
            return next;
        });
        return newCell.id;
    }, [createCell, updateCells]);

    const setCellEditing = useCallback((id: string, isEditing: boolean) => {
        updateCells((prev) => prev.map((c) => (c.id === id ? { ...c, isEditing } : c)));
    }, [updateCells]);

    const moveCell = useCallback((id: string, direction: 'up' | 'down') => {
        updateCells((prev) => {
            const index = prev.findIndex((c) => c.id === id);
            if (index === -1) return prev;
            if (direction === 'up' && index === 0) return prev;
            if (direction === 'down' && index === prev.length - 1) return prev;
            const next = [...prev];
            const targetIndex = direction === 'up' ? index - 1 : index + 1;
            [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
            return next;
        });
    }, [updateCells]);

    const duplicateCell = useCallback((id: string) => {
        updateCells((prev) => {
            const index = prev.findIndex((c) => c.id === id);
            if (index === -1) return prev;
            const newCell: Cell = {
                ...prev[index],
                id: crypto.randomUUID(),
                outputs: [],
                executionCount: undefined,
                executionTime: undefined,
                isExecuting: false
            };
            const next = [...prev];
            next.splice(index + 1, 0, newCell);
            return next;
        });
    }, [updateCells]);

    const clearCellOutput = useCallback((id: string) => {
        updateCells((prev) => prev.map((c) => (c.id === id
            ? { ...c, outputs: [], executionCount: undefined, executionTime: undefined }
            : c)));
    }, [updateCells]);

    const clearAllOutputs = useCallback(() => {
        updateCells((prev) => prev.map((c) => ({ ...c, outputs: [], executionCount: undefined, executionTime: undefined })));
    }, [updateCells]);

    const updateCell = useCallback((id: string, content: string) => {
        updateCells((prev) => prev.map((c) => (c.id === id ? { ...c, content } : c)));
    }, [updateCells]);

    const toggleCellType = useCallback((id: string) => {
        updateCells((prev) => prev.map((c) => {
            if (c.id !== id) return c;
            if (c.type === 'code') {
                return { ...c, type: 'markdown', outputs: [], executionCount: undefined, executionTime: undefined, isEditing: true };
            }
            return { ...c, type: 'code', isEditing: undefined };
        }));
    }, [updateCells]);

    const deleteCell = useCallback((id: string) => {
        updateCells((prev) => {
            if (prev.length === 1) {
                return prev.map((c) => (c.id === id
                    ? { ...c, content: '', outputs: [], executionCount: undefined, executionTime: undefined }
                    : c));
            }
            return prev.filter((c) => c.id !== id);
        });
    }, [updateCells]);

    // --- Execution ------------------------------------------------------------------

    /** Stores a result for a cell of a notebook the user has already left. */
    const patchStoredCell = useCallback(async (notebookId: string, cellId: string, patch: Partial<Cell>) => {
        if (deletedIdsRef.current.has(notebookId)) return;
        try {
            const notebook = await storage.getNotebook(notebookId);
            const meta = fileListRef.current.find((m) => m.id === notebookId);
            if (!notebook || !meta) return;
            const nextCells = notebook.cells.map((c) => (c.id === cellId ? { ...c, ...patch, isExecuting: false } : c));
            await storage.saveNotebook({ ...meta, updatedAt: Date.now() }, { id: notebookId, cells: nextCells });
        } catch (err) {
            console.error('Failed to store the result of a background execution:', err);
        }
    }, []);

    const executeCell = useCallback(async (id: string, codeOverride?: string): Promise<ExecutionOutcome> => {
        const cell = cellsRef.current.find((c) => c.id === id);
        const code = codeOverride ?? cell?.content ?? '';
        if (!cell || cell.type !== 'code' || !code.trim()) return 'skipped';
        // A second request while the cell runs (e.g. Shift+Enter twice) must not run it again
        if (executingRef.current.has(id)) return 'skipped';

        executingRef.current.add(id);
        const notebookId = currentNotebookIdRef.current;
        updateCellsTransient((prev) => prev.map((c) => (c.id === id ? { ...c, isExecuting: true } : c)));

        const executionCount = executionCountRef.current;
        executionCountRef.current += 1;
        const startTime = performance.now();

        try {
            const response = await execute(code, notebookId || 'default', executionCount);
            const executionTime = Math.round(performance.now() - startTime);
            const patch: Partial<Cell> = { outputs: response.results, executionCount, executionTime };

            if (currentNotebookIdRef.current === notebookId) {
                updateCells((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch, isExecuting: false } : c)));
                if (response.variables) setVariables(response.variables);
            } else if (notebookId) {
                // The user switched notebooks while this ran: keep the result with its own notebook
                void patchStoredCell(notebookId, id, patch);
            }

            if (response.interrupted) return 'interrupted';
            return response.results.some((o: Output) => o.type === 'error') ? 'error' : 'ok';
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            updateCells((prev) => prev.map((c) => (c.id === id
                ? { ...c, outputs: [{ type: 'error', value: message, timestamp: Date.now() }], isExecuting: false }
                : c)));
            return 'error';
        } finally {
            executingRef.current.delete(id);
            // Covers paths that returned before the state update above
            updateCellsTransient((prev) => (prev.some((c) => c.id === id && c.isExecuting)
                ? prev.map((c) => (c.id === id ? { ...c, isExecuting: false } : c))
                : prev));
        }
    }, [execute, updateCells, updateCellsTransient, patchStoredCell]);

    const executeAll = useCallback(async () => {
        const generation = ++runGenerationRef.current;
        const notebookId = currentNotebookIdRef.current;
        const ids = cellsRef.current.filter((c) => c.type === 'code' && c.content.trim()).map((c) => c.id);
        for (const id of ids) {
            // Stop when interrupted, when the engine restarted, or when the user left the notebook
            if (runGenerationRef.current !== generation || currentNotebookIdRef.current !== notebookId) return;
            const outcome = await executeCell(id);
            if (outcome === 'error' || outcome === 'interrupted') return;
        }
    }, [executeCell]);

    const interrupt = useCallback(() => {
        runGenerationRef.current += 1; // stops Run All
        pyodideInterrupt();
    }, [pyodideInterrupt]);

    const selectNextCell = useCallback((currentId: string) => {
        const list = cellsRef.current;
        const currentIndex = list.findIndex((c) => c.id === currentId);
        if (currentIndex === -1) return;
        if (currentIndex < list.length - 1) {
            setFocusedCellId(list[currentIndex + 1].id);
        } else {
            setFocusedCellId(addCell('code'));
        }
    }, [addCell]);

    // --- Variables, docs, completion --------------------------------------------------

    const deleteVariable = useCallback(async (name: string) => {
        try {
            const response = await deleteVarWorker(name, currentNotebookIdRef.current || 'default');
            if (response.variables) setVariables(response.variables);
        } catch (err) {
            console.error('Failed to delete variable:', err);
        }
    }, [deleteVarWorker]);

    const defineVariable = useCallback(async (name: string, assumptions: VariableAssumptions) => {
        const response = await defineVarWorker(name, assumptions, currentNotebookIdRef.current || 'default');
        if (response.variables) setVariables(response.variables);
        if (response.status === 'ERROR') {
            throw new Error(response.error || response.message || 'Failed to define variable');
        }
    }, [defineVarWorker]);

    const searchDocs = useCallback(async (query: string) => {
        const token = ++docsTokenRef.current;
        try {
            const response = await searchDocsWorker(query, currentNotebookIdRef.current || 'default');
            if (token !== docsTokenRef.current || !response.searchResults) return;
            setSearchResults(response.searchResults);
            setActiveDocumentation(null);
            setActiveTab('documentation');
            setIsSidebarOpen(true);
        } catch (err) {
            console.error('Failed to search docs:', err);
        }
    }, [searchDocsWorker]);

    const openDocumentation = useCallback((doc: Documentation) => {
        setActiveDocumentation(doc);
        if (doc.htmlContent) return;
        // Search results carry no formatted HTML (it is slow to build); fetch it for this one entry
        const token = ++docsTokenRef.current;
        void getHelp(doc.name, currentNotebookIdRef.current || 'default').then((full) => {
            if (full && token === docsTokenRef.current) {
                setActiveDocumentation({ ...full, snippet: doc.snippet });
            }
        });
    }, [getHelp]);

    const getCompletions = useCallback(
        (code: string, position: number) =>
            getCompletionsWorker(code, position, currentNotebookIdRef.current || 'default'),
        [getCompletionsWorker]
    );

    // --- Inserting text into the editor ----------------------------------------------------

    const registerInsertHandler = useCallback((cellId: string, handler: (text: string, relativeCursorPos?: number) => void) => {
        activeInsertHandler.current = { cellId, handler };
    }, []);

    const unregisterInsertHandler = useCallback((cellId: string) => {
        if (activeInsertHandler.current?.cellId === cellId) activeInsertHandler.current = null;
    }, []);

    /** Appends code, reusing a trailing empty code cell. Also the fallback when no editor is active. */
    const appendCode = useCallback((code: string) => {
        const last = cellsRef.current[cellsRef.current.length - 1];
        if (last && last.type === 'code' && !last.content.trim()) {
            updateCells((prev) => prev.map((c) => (c.id === last.id ? { ...c, content: code } : c)));
            setFocusedCellId(last.id);
            return;
        }
        const newCell = createCell('code', code);
        updateCells((prev) => [...prev, newCell]);
        setFocusedCellId(newCell.id);
    }, [createCell, updateCells]);

    const insertExample = useCallback((code: string) => appendCode(code), [appendCode]);

    const insertTextAtCursor = useCallback((text: string, relativeCursorPos?: number) => {
        if (activeInsertHandler.current) {
            activeInsertHandler.current.handler(text, relativeCursorPos);
        } else {
            // Strip snippet syntax for the plain-text fallback
            appendCode(text.replace(/\$\{\d+:([^}]+)\}/g, '$1'));
        }
    }, [appendCode]);

    // --- Context values ------------------------------------------------------------------------

    const data = useMemo<NotebookData>(() => ({
        cells, variables, activeDocumentation, searchResults, activeTab, isSidebarOpen,
        fileList, currentNotebookId, isDirty, saveStatus, saveError, hasConflict
    }), [cells, variables, activeDocumentation, searchResults, activeTab, isSidebarOpen,
        fileList, currentNotebookId, isDirty, saveStatus, saveError, hasConflict]);

    const status = useMemo<NotebookStatus>(() => ({
        isReady, isGraphicsReady, initError, graphicsError, focusedCellId
    }), [isReady, isGraphicsReady, initError, graphicsError, focusedCellId]);

    const actions = useMemo<NotebookActions>(() => ({
        setActiveDocumentation, setActiveTab, setIsSidebarOpen, setFocusedCellId,
        retryInit, retryGraphics,
        addCell, updateCell, toggleCellType, deleteCell, executeCell, executeAll, interrupt,
        importNotebook, insertExample, selectNextCell, setCellEditing, moveCell, duplicateCell,
        clearCellOutput, clearAllOutputs, resetNotebook, getCompletions,
        deleteVariable, defineVariable, searchDocs, openDocumentation, transpileCodes,
        createNotebook, openNotebook, deleteNotebook, renameNotebook, resolveConflict,
        registerInsertHandler, unregisterInsertHandler, insertTextAtCursor
    }), [
        retryInit, retryGraphics, addCell, updateCell, toggleCellType, deleteCell, executeCell, executeAll,
        interrupt, importNotebook, insertExample, selectNextCell, setCellEditing, moveCell, duplicateCell,
        clearCellOutput, clearAllOutputs, resetNotebook, getCompletions, deleteVariable, defineVariable,
        searchDocs, openDocumentation, transpileCodes, createNotebook, openNotebook, deleteNotebook,
        renameNotebook, resolveConflict, registerInsertHandler, unregisterInsertHandler, insertTextAtCursor
    ]);

    return (
        <ActionsContext.Provider value={actions}>
            <StatusContext.Provider value={status}>
                <DataContext.Provider value={data}>
                    {children}
                </DataContext.Provider>
            </StatusContext.Provider>
        </ActionsContext.Provider>
    );
};

function useRequired<T>(value: T | undefined): T {
    if (value === undefined) throw new Error('useNotebook must be used within NotebookProvider');
    return value;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useNotebookActions = () => useRequired(useContext(ActionsContext));
// eslint-disable-next-line react-refresh/only-export-components
export const useNotebookStatus = () => useRequired(useContext(StatusContext));
// eslint-disable-next-line react-refresh/only-export-components
export const useNotebookData = () => useRequired(useContext(DataContext));

/** Everything at once. Re-renders on every change; cells should use the narrower hooks. */
// eslint-disable-next-line react-refresh/only-export-components
export const useNotebook = (): NotebookContextType => {
    const data = useNotebookData();
    const status = useNotebookStatus();
    const actions = useNotebookActions();
    return useMemo(() => ({ ...data, ...status, ...actions }), [data, status, actions]);
};
