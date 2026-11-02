import React, { useRef } from 'react';
import { Play, Trash2, PlusCircle, Clock, Square, ChevronUp, ChevronDown, Copy, Eye } from 'lucide-react';
import MonacoEditor from '@monaco-editor/react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import 'katex/dist/katex.min.css';
import type { editor } from 'monaco-editor';
import type { Cell } from '../../types';
import { useNotebookActions, useNotebookStatus } from '../../state/AppNotebookContext';
import { ResultView } from './ResultView';
import { cn } from '../../lib/utils';
import { registerPythonCompletionProvider, updateActiveCompletionProvider } from '../../utils/monacoCompletionProvider';
import { useDarkMode } from '../../hooks/useDarkMode';
import { needsGraphics as detectNeedsGraphics } from '../../utils/graphicsDetect';

interface CellItemProps {
    cell: Cell;
    index: number;
}

const SNIPPET_PATTERN = /\$\{\d+:[^}]+\}/;
const SNIPPET_STRIP_PATTERN = /\$\{\d+:([^}]+)\}/g;

const CellItemImpl: React.FC<CellItemProps> = ({ cell, index }) => {
    const {
        updateCell, executeCell, deleteCell, addCell, interrupt, getCompletions,
        setFocusedCellId, selectNextCell,
        setCellEditing, moveCell, duplicateCell, clearCellOutput, toggleCellType, isResultLive,
        registerInsertHandler, unregisterInsertHandler
    } = useNotebookActions();
    const { isReady, isGraphicsReady, focusedCellId } = useNotebookStatus();
    const { isDark } = useDarkMode();
    const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const monacoRef = useRef<any>(null);
    const [editorHeight, setEditorHeight] = React.useState(() =>
        Math.max(100, (cell.content.split('\n').length + 1) * 19 + 32));

    // Latest values for Monaco handlers registered once at mount (avoids stale closures)
    const cellRef = useRef({ id: cell.id, type: cell.type });
    const focusedCellIdRef = useRef(focusedCellId);
    React.useEffect(() => {
        cellRef.current = { id: cell.id, type: cell.type };
        focusedCellIdRef.current = focusedCellId;
    }, [cell.id, cell.type, focusedCellId]);

    // Insert targets must not outlive their editor (deleted cell, markdown preview)
    React.useEffect(() => {
        const id = cell.id;
        return () => unregisterInsertHandler(id);
    }, [cell.id, unregisterInsertHandler]);

    const handleEditorDidMount = React.useCallback((editor: editor.IStandaloneCodeEditor, monaco: typeof import('monaco-editor')) => {
        editorRef.current = editor;
        monacoRef.current = monaco;
        const cellId = cell.id;

        registerPythonCompletionProvider(monaco, getCompletions);
        updateActiveCompletionProvider(getCompletions);

        // Apply theme immediately on mount
        monaco.editor.setTheme(isDark ? 'vs-dark' : 'vs');

        editor.addAction({
            id: 'execute-cell',
            label: 'Execute Cell',
            keybindings: [
                monaco.KeyMod.Shift | monaco.KeyCode.Enter,
                monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter
            ],
            run: async () => {
                const { id: currentId, type: currentType } = cellRef.current;
                if (currentType === 'markdown') {
                    setCellEditing(currentId, false);
                } else {
                    await executeCell(currentId);
                }
                selectNextCell(currentId);
            }
        });

        // Grow with the content, including wrapped lines
        const updateHeight = () => setEditorHeight(Math.max(100, editor.getContentHeight()));
        editor.onDidContentSizeChange(updateHeight);
        updateHeight();

        // Insert handler with Monaco snippet support
        const handleInsert = (text: string, relativeCursorPos?: number) => {
            if (SNIPPET_PATTERN.test(text)) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const snippetController = editor.getContribution('snippetController2') as any;
                if (snippetController && typeof snippetController.insert === 'function') {
                    snippetController.insert(text);
                    editor.focus();
                    return;
                }
                // Fallback: strip snippet syntax if snippetController2 is unavailable
                text = text.replace(SNIPPET_STRIP_PATTERN, '$1');
            }

            const selection = editor.getSelection();
            if (selection) {
                editor.executeEdits('insert-symbol', [{
                    range: new monaco.Range(
                        selection.startLineNumber, selection.startColumn,
                        selection.endLineNumber, selection.endColumn
                    ),
                    text,
                    forceMoveMarkers: true
                }]);

                if (relativeCursorPos) {
                    const newPos = editor.getPosition();
                    if (newPos) {
                        editor.setPosition({
                            lineNumber: newPos.lineNumber,
                            column: newPos.column + relativeCursorPos
                        });
                    }
                }
                editor.focus();
            }
        };

        editor.onDidFocusEditorText(() => {
            updateActiveCompletionProvider(getCompletions);
            registerInsertHandler(cellId, handleInsert);
        });
        editor.onDidDispose(() => unregisterInsertHandler(cellId));

        // Newly created cells ask for focus before the editor exists
        if (focusedCellIdRef.current === cellId) {
            editor.focus();
            setFocusedCellId(null);
            registerInsertHandler(cellId, handleInsert);
        }
    }, [cell.id, getCompletions, isDark, setCellEditing, executeCell, selectNextCell,
        registerInsertHandler, unregisterInsertHandler, setFocusedCellId]);

    // Handle focus when this cell is selected as the next cell
    React.useEffect(() => {
        const shouldFocus = cell.type === 'code' || cell.isEditing !== false;
        if (focusedCellId === cell.id && editorRef.current && shouldFocus) {
            editorRef.current.focus();
            setFocusedCellId(null); // Reset after focusing
        }
    }, [focusedCellId, cell.id, setFocusedCellId, cell.isEditing, cell.type]);

    // Keep the Monaco theme in sync with the app theme
    React.useEffect(() => {
        monacoRef.current?.editor.setTheme(isDark ? 'vs-dark' : 'vs');
    }, [isDark]);

    // Sync error markers
    React.useEffect(() => {
        if (!editorRef.current || !monacoRef.current) return;

        const model = editorRef.current.getModel();
        if (!model) return;

        // Clear markers when executing
        if (cell.isExecuting) {
            monacoRef.current.editor.setModelMarkers(model, 'python', []);
            return;
        }

        const errorOutput = cell.outputs.find(o => o.type === 'error');
        if (errorOutput && typeof errorOutput.lineNo === 'number' && errorOutput.lineNo <= model.getLineCount()) {
            monacoRef.current.editor.setModelMarkers(model, 'python', [{
                startLineNumber: errorOutput.lineNo,
                startColumn: 1,
                endLineNumber: errorOutput.lineNo,
                endColumn: model.getLineMaxColumn(errorOutput.lineNo),
                message: errorOutput.value || errorOutput.errorName || 'Error',
                severity: monacoRef.current.MarkerSeverity.Error
            }]);
        } else {
            monacoRef.current.editor.setModelMarkers(model, 'python', []);
        }
    }, [cell.outputs, cell.isExecuting]);

    const handleContentChange = (value: string | undefined) => {
        updateCell(cell.id, value || '');

        // Proactively clear markers when user edits the code
        if (editorRef.current && monacoRef.current) {
            const model = editorRef.current.getModel();
            if (model) {
                monacoRef.current.editor.setModelMarkers(model, 'python', []);
            }
        }
    };

    // Manual quick fix: define the missing names as symbols and run again
    const handleFixError = React.useCallback((variables: string[]) => {
        if (!variables || variables.length === 0) return;

        const definitionLine = `${variables.join(', ')} = symbols('${variables.join(' ')}')`;
        const newContent = `${definitionLine}\n${cell.content}`;

        updateCell(cell.id, newContent);
        void executeCell(cell.id, newContent);
    }, [cell.id, cell.content, updateCell, executeCell]);

    const needsGraphics = detectNeedsGraphics(cell.content);
    const isQueued = cell.isExecuting && (!isReady || (needsGraphics && !isGraphicsReady));
    const isEditing = cell.isEditing !== false; // For Markdown: true=edit, false=preview
    const showOutputs = cell.type === 'code' || !isEditing;

    const editorOptions = React.useMemo<editor.IStandaloneEditorConstructionOptions>(() => ({
        minimap: { enabled: false },
        lineNumbers: 'off',
        glyphMargin: false,
        folding: false,
        lineDecorationsWidth: 0,
        lineNumbersMinChars: 0,
        scrollBeyondLastLine: false,
        automaticLayout: true,
        fontSize: 14,
        fontFamily: '"JetBrains Mono", "Fira Code", monospace',
        padding: { top: 16, bottom: 16 },
        wordWrap: 'on',
        scrollbar: {
            vertical: 'hidden',
            alwaysConsumeMouseWheel: false,
            horizontal: 'hidden',
        },
        overviewRulerLanes: 0,
        hideCursorInOverviewRuler: true,
        overviewRulerBorder: false,
        suggest: {
            showKeywords: true,
            showSnippets: false,
        },
        quickSuggestions: {
            other: true,
            comments: false,
            strings: false
        },
        suggestOnTriggerCharacters: true,
        acceptSuggestionOnEnter: 'on',
        tabCompletion: 'on',
        readOnly: cell.isExecuting
    }), [cell.isExecuting]);

    const handleExecute = async (e: React.MouseEvent) => {
        e.stopPropagation();

        if (cell.isExecuting) {
            interrupt();
            return;
        }

        if (cell.type === 'markdown') {
            setCellEditing(cell.id, false);
        } else {
            await executeCell(cell.id);
        }
        selectNextCell(cell.id);
    };

    return (
        <div className="group relative mb-6">
            <div className={cn(
                "flex flex-col border rounded-xl transition-colors duration-200 bg-white dark:bg-slate-900 relative overflow-visible print:border-none print:shadow-none",
                cell.isExecuting ? (isQueued ? "ring-2 ring-amber-400 border-amber-400 shadow-md z-20" : "ring-2 ring-blue-400 border-blue-400 shadow-md z-20") : "border-gray-200 dark:border-slate-800 shadow-sm dark:shadow-none hover:border-gray-300 dark:hover:border-slate-700 hover:z-[50] focus-within:z-[50]"
            )}>
                <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50/50 dark:bg-slate-800/30 border-b border-gray-100 dark:border-slate-800 opacity-60 group-hover:opacity-100 transition-opacity rounded-t-xl print:hidden">
                    {/* Left Group: Execute Button & Label */}
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleExecute}
                            disabled={!isReady && !cell.isExecuting}
                            className={cn(
                                "p-1.5 rounded-full transition-all shadow-sm flex-shrink-0 z-10",
                                cell.isExecuting
                                    ? "bg-red-50 text-red-500 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30"
                                    : "bg-blue-50 text-blue-500 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/30 hover:scale-105 active:scale-95"
                            )}
                            title={cell.isExecuting ? "Stop execution (if it cannot be interrupted cleanly the engine restarts and variables are lost)" : "Run Cell (Shift+Enter)"}
                        >
                            {cell.isExecuting ? (
                                <Square size={14} fill="currentColor" />
                            ) : (
                                <Play size={14} fill="currentColor" />
                            )}
                        </button>

                        <div className="flex items-baseline gap-3">
                            <span className="text-xs font-mono text-gray-400 dark:text-slate-500 font-bold tracking-tighter">
                                {cell.isExecuting ? 'In [*]' :
                                    (cell.executionCount === undefined || cell.executionCount === null) ? 'In [ ]' :
                                        `In [${cell.executionCount}]`}
                            </span>

                            {cell.executionTime !== undefined && (
                                <span className="text-[10px] text-gray-400 dark:text-slate-500 font-mono">
                                    {cell.executionTime < 1000
                                        ? `${cell.executionTime}ms`
                                        : `${(cell.executionTime / 1000).toFixed(2)}s`}
                                </span>
                            )}

                            <button
                                onClick={() => {
                                    // Converting to markdown discards the outputs and cannot be undone
                                    if (cell.type === 'code' && cell.outputs.length > 0
                                        && !window.confirm('Switching to a markdown cell discards its outputs. Continue?')) {
                                        return;
                                    }
                                    toggleCellType(cell.id);
                                }}
                                className="text-[9px] font-bold text-gray-300 dark:text-slate-600 select-none uppercase tracking-widest hover:text-blue-500 dark:hover:text-blue-400 cursor-pointer transition-colors"
                                title="Switch cell type"
                            >
                                {cell.type}
                            </button>
                            {isQueued && (
                                <span className="flex items-center gap-1 text-[8px] font-medium text-amber-600 dark:text-amber-400 uppercase tracking-widest bg-amber-50 dark:bg-amber-900/20 px-1 py-0.5 rounded border border-amber-200 dark:border-amber-800 self-center">
                                    <Clock size={8} /> QUEUED
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Right Group: Management Buttons */}
                    <div className="flex items-center gap-1">
                        <button onClick={() => moveCell(cell.id, 'up')} className="p-1 px-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded transition-colors" title="Move Up">
                            <ChevronUp size={14} />
                        </button>
                        <button onClick={() => moveCell(cell.id, 'down')} className="p-1 px-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded transition-colors" title="Move Down">
                            <ChevronDown size={14} />
                        </button>
                        <div className="w-px h-4 bg-gray-200 dark:bg-slate-800 mx-1" />
                        <button onClick={() => duplicateCell(cell.id)} className="p-1 px-1.5 text-gray-400 dark:text-gray-500 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors" title="Duplicate">
                            <Copy size={14} />
                        </button>
                        <div className="w-px h-4 bg-gray-200 dark:bg-slate-800 mx-1" />
                        {cell.type === 'markdown' && !isEditing && (
                            <button onClick={() => setCellEditing(cell.id, true)} className="p-1 px-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors" title="Edit">
                                <Eye size={14} />
                            </button>
                        )}
                        <button onClick={() => deleteCell(cell.id)} className="p-1 px-1.5 text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors" title="Delete">
                            <Trash2 size={14} />
                        </button>
                    </div>
                </div>
                <div className="relative">
                    {cell.type === 'markdown' && !isEditing ? (
                        <div
                            onDoubleClick={() => setCellEditing(cell.id, true)}
                            className="p-6 prose prose-slate dark:prose-invert max-w-none min-h-[50px] cursor-text hover:bg-gray-50/50 dark:hover:bg-slate-800/10 transition-colors rounded-b-xl overflow-x-auto"
                        >
                            <ReactMarkdown
                                remarkPlugins={[remarkMath, remarkGfm]}
                                rehypePlugins={[rehypeKatex]}
                                components={{
                                    // Fenced blocks render as <pre><code>; the nested code resets its inline styling
                                    pre: ({ ...props }) => <pre {...props} className="bg-gray-900 border border-slate-700 text-gray-100 p-4 rounded-lg overflow-x-auto mb-4 font-mono [&_code]:!bg-transparent [&_code]:!p-0 [&_code]:!text-gray-100" />,
                                    code: ({ ...props }: React.ComponentPropsWithoutRef<'code'>) =>
                                        <code {...props} className={cn("bg-gray-100 dark:bg-slate-800 text-purple-600 dark:text-purple-400 px-1 rounded font-mono text-sm", props.className)} />,
                                    h1: ({ ...props }) => <h1 {...props} className="text-3xl font-bold mb-6 mt-8 border-b dark:border-slate-800 pb-2 text-gray-900 dark:text-gray-100 first:mt-2" />,
                                    h2: ({ ...props }) => <h2 {...props} className="text-2xl font-bold mb-4 mt-8 text-gray-800 dark:text-gray-200" />,
                                    h3: ({ ...props }) => <h3 {...props} className="text-xl font-bold mb-3 mt-6 text-gray-800 dark:text-gray-200" />,
                                    ul: ({ ...props }) => <ul {...props} className="list-disc pl-6 mb-4 space-y-1 text-gray-700 dark:text-gray-300" />,
                                    ol: ({ ...props }) => <ol {...props} className="list-decimal pl-6 mb-4 space-y-1 text-gray-700 dark:text-gray-300" />,
                                    p: ({ ...props }) => <p {...props} className="mb-4 leading-relaxed text-gray-700 dark:text-gray-300" />,
                                    table: ({ ...props }) => <div className="overflow-x-auto mb-4"><table {...props} className="min-w-full divide-y divide-gray-200 dark:divide-slate-800 border dark:border-slate-800" /></div>,
                                    th: ({ ...props }) => <th {...props} className="px-4 py-2 bg-gray-50 dark:bg-slate-800/50 font-bold text-left border dark:border-slate-800" />,
                                    td: ({ ...props }) => <td {...props} className="px-4 py-2 border dark:border-slate-800" />,
                                    blockquote: ({ ...props }) => <blockquote {...props} className="border-l-4 border-blue-500 pl-4 italic text-gray-600 dark:text-gray-400 mb-4" />,
                                }}
                            >
                                {cell.content || '*Empty Markdown Cell*'}
                            </ReactMarkdown>
                        </div>
                    ) : (
                        <>
                            <div className="print:hidden">
                                <MonacoEditor
                                    height={`${editorHeight}px`}
                                    language={cell.type === 'markdown' ? 'markdown' : 'python'}
                                    value={cell.content}
                                    onChange={handleContentChange}
                                    onMount={handleEditorDidMount}
                                    options={editorOptions}
                                    theme={isDark ? "vs-dark" : "vs"}
                                />
                            </div>
                            <div className="hidden print:block">
                                {cell.type === 'code' && (
                                    <div className="text-[10px] font-mono text-gray-400 font-bold mb-1 select-none">
                                        {`In [${cell.executionCount || ' '}]`}
                                    </div>
                                )}
                                <pre className="p-4 font-mono text-sm bg-gray-50/50 text-gray-800 border border-gray-200 rounded-lg whitespace-pre-wrap break-all">
                                    {cell.content}
                                </pre>
                            </div>
                        </>
                    )}
                </div>
                {cell.outputs.length > 0 && showOutputs && (
                    <div className="border-t border-gray-100 dark:border-slate-800/50 rounded-b-xl print:border-none">
                        <div className="mt-2">
                            <ResultView
                                outputs={cell.outputs}
                                executionCount={cell.executionCount}
                                onFixError={handleFixError}
                                onClear={() => clearCellOutput(cell.id)}
                                // Out[n] only exists for results computed in this engine session, not for
                                // outputs restored from storage, so the fx actions are not offered for those
                                onMathAction={isResultLive(cell.executionCount) ? (action) => {
                                    if (typeof cell.executionCount !== 'number') return;
                                    const newContent = `${action}(Out[${cell.executionCount}])`;
                                    // addCell inserts after the current index if provided
                                    const newId = addCell('code', index);
                                    updateCell(newId, newContent);
                                    // Focus the new cell
                                    setFocusedCellId(newId);
                                } : undefined}
                            />
                        </div>
                    </div>
                )}
            </div>
            <div className="absolute -bottom-4 left-0 right-0 flex justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 z-10 pointer-events-none print:hidden">
                <button onClick={() => addCell('code', index)} className="pointer-events-auto bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-400 hover:text-blue-500 hover:border-blue-300 hover:shadow-lg rounded-full p-1.5 transition-all transform hover:scale-110">
                    <PlusCircle size={18} />
                </button>
            </div>
        </div>
    );
};

export const CellItem = React.memo(CellItemImpl);
