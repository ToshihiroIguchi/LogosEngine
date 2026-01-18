import React, { useRef } from 'react';
import { Play, Trash2, PlusCircle, Clock, Square, ChevronUp, ChevronDown, Copy, Eraser, Eye } from 'lucide-react';
import MonacoEditor from '@monaco-editor/react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import 'katex/dist/katex.min.css';
import type { editor } from 'monaco-editor';
import type { Cell } from '../../types';
import { useNotebook } from '../../state/AppNotebookContext';
import { ResultView } from './ResultView';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { registerPythonCompletionProvider } from '../../utils/monacoCompletionProvider';
import { useDarkMode } from '../../hooks/useDarkMode';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface CellItemProps {
    cell: Cell;
    index: number;
}

export const CellItem: React.FC<CellItemProps> = ({ cell, index }) => {
    const {
        updateCell, executeCell, deleteCell, addCell, interrupt, isReady, isGraphicsReady, getCompletions,
        focusedCellId, setFocusedCellId, selectNextCell,
        setCellEditing, moveCell, duplicateCell, clearCellOutput
    } = useNotebook();
    const { isDark } = useDarkMode();
    const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
    const completionProviderRegistered = useRef(false);
    const monacoRef = useRef<any>(null);
    const executeCellRef = useRef(executeCell);
    const selectNextCellRef = useRef(selectNextCell);
    const setCellEditingRef = useRef(setCellEditing);

    // Keep the refs updated with the latest functions to prevent stale closures
    React.useEffect(() => {
        executeCellRef.current = executeCell;
        selectNextCellRef.current = selectNextCell;
        setCellEditingRef.current = setCellEditing;
    }, [executeCell, selectNextCell, setCellEditing]);

    const handleEditorDidMount = React.useCallback((editor: editor.IStandaloneCodeEditor, monaco: typeof import('monaco-editor')) => {
        editorRef.current = editor;
        monacoRef.current = monaco;

        if (!completionProviderRegistered.current) {
            registerPythonCompletionProvider(monaco, getCompletions);
            completionProviderRegistered.current = true;
        }

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
                if (cell.type === 'markdown') {
                    setCellEditingRef.current(cell.id, false);
                } else {
                    await executeCellRef.current(cell.id);
                }
                selectNextCellRef.current(cell.id);
            }
        });

        // Check if we should focus immediately after mounting
        // This is necessary for newly created cells
        if (focusedCellId === cell.id) {
            editor.focus();
            setFocusedCellId(null);
        }
    }, [cell.id, cell.type, focusedCellId, setFocusedCellId, getCompletions]);

    // Handle focus when this cell is selected as the next cell
    React.useEffect(() => {
        const shouldFocus = cell.type === 'code' || cell.isEditing !== false;
        if (focusedCellId === cell.id && editorRef.current && shouldFocus) {
            editorRef.current.focus();
            setFocusedCellId(null); // Reset after focusing
        }
    }, [focusedCellId, cell.id, setFocusedCellId, cell.isEditing, cell.type]);

    // Force sync Monaco theme when isDark changes
    React.useEffect(() => {
        const theme = isDark ? 'vs-dark' : 'vs';
        if (monacoRef.current) {
            monacoRef.current.editor.setTheme(theme);
        }
        if (editorRef.current && monacoRef.current) {
            // Some versions of monaco react need explicit internal theme update via instance
            editorRef.current.updateOptions({ theme: theme });
            // And global call again just to be sure
            monacoRef.current.editor.setTheme(theme);
        }
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
        if (errorOutput && typeof errorOutput.lineNo === 'number') {
            monacoRef.current.editor.setModelMarkers(model, 'python', [{
                startLineNumber: errorOutput.lineNo,
                startColumn: 1,
                endLineNumber: errorOutput.lineNo,
                endColumn: 1000,
                message: errorOutput.value,
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

    const handleFixError = (variables: string[]) => {
        if (!variables || variables.length === 0) return;

        const varsStr = variables.join(', ');
        const symbolsStr = variables.join(' ');
        // Insert at the beginning
        const definitionLine = `${varsStr} = symbols('${symbolsStr}')`;
        const newContent = `${definitionLine}\n${cell.content}`;

        updateCell(cell.id, newContent);
        // Execute immediately with the new content
        executeCell(cell.id, newContent);
    };

    const needsGraphics = /\bplot\w*\s*\(/.test(cell.content);
    const isQueued = cell.isExecuting && (!isReady || (needsGraphics && !isGraphicsReady));
    const isEditing = cell.isEditing !== false; // For Markdown: true=edit, false=preview. For Code: irrelevant for display but handles undefined safely.
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
            vertical: 'auto',
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

    return (
        <div className="group relative mb-6">
            <style dangerouslySetInnerHTML={{
                __html: `
                .dark .monaco-editor,
                .dark .monaco-editor .margin,
                .dark .monaco-editor-background,
                .dark .monaco-editor .inputarea.ime-input {
                    background-color: #0f172a !important;
                }
                .dark .monaco-editor .view-line {
                    color: #e2e8f0 !important;
                }
                /* Syntax Highlighting Forcing for Dark Mode */
                .dark .monaco-editor .mtk1 { color: #e2e8f0 !important; } /* Base text / Variables */
                .dark .monaco-editor .mtk6 { color: #94a3b8 !important; } /* Brackets / Punctuation */
                .dark .monaco-editor .mtk8 { color: #4ade80 !important; } /* Strings / Green */
                .dark .monaco-editor .mtk7 { color: #60a5fa !important; } /* Numbers / Functions (common) */
                .dark .monaco-editor .mtk10 { color: #f87171 !important; } /* Errors / Special */
                .dark .monaco-editor .mtk12 { color: #c084fc !important; } /* Keywords */
                /* Force expand color specifically if it's mtk7 or common */
                .dark .monaco-editor [class*="mtk"] { filter: brightness(1.2); }
                
                /* Better Current Line Highlight - Best Practice */
                .dark .monaco-editor .current-line {
                    background-color: #1e293b !important; /* Slate-800 */
                    border: none !important;
                }
                .dark .monaco-editor .current-line-exact {
                    border: none !important;
                }
            ` }} />
            <div className={cn(
                "flex flex-col border rounded-xl transition-colors duration-200 bg-white dark:bg-slate-900 relative overflow-visible print:border-none print:shadow-none",
                cell.isExecuting ? (isQueued ? "ring-2 ring-amber-400 border-amber-400 shadow-md z-20" : "ring-2 ring-blue-400 border-blue-400 shadow-md z-20") : "border-gray-200 dark:border-slate-800 shadow-sm dark:shadow-none hover:border-gray-300 dark:hover:border-slate-700 hover:z-[50] focus-within:z-[50]"
            )}>
                <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50/50 dark:bg-slate-800/30 border-b border-gray-100 dark:border-slate-800 opacity-60 group-hover:opacity-100 transition-opacity rounded-t-xl print:hidden">
                    <div className="flex items-center gap-3">
                        <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 font-mono tracking-wider uppercase">
                            {cell.isExecuting ? 'In [*]' : (cell.executionCount ? `In [${cell.executionCount}]` : 'In [ ]')}
                        </span>
                        <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-widest bg-gray-200/50 dark:bg-slate-700/50 px-1.5 py-0.5 rounded">
                            {cell.type}
                        </span>
                        {isQueued && (
                            <span className="flex items-center gap-1 text-[10px] font-medium text-amber-600 dark:text-amber-400 uppercase tracking-widest bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800">
                                <Clock size={10} />
                                Queued
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-0.5">
                        <button onClick={() => moveCell(cell.id, 'up')} className="p-1 px-1.5 text-gray-400 dark:text-gray-500 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors" title="Move Up">
                            <ChevronUp size={14} />
                        </button>
                        <button onClick={() => moveCell(cell.id, 'down')} className="p-1 px-1.5 text-gray-400 dark:text-gray-500 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors" title="Move Down">
                            <ChevronDown size={14} />
                        </button>
                        <div className="w-px h-4 bg-gray-200 dark:bg-slate-800 mx-1" />
                        <button onClick={() => duplicateCell(cell.id)} className="p-1 px-1.5 text-gray-400 dark:text-gray-500 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors" title="Duplicate">
                            <Copy size={14} />
                        </button>
                        <button onClick={() => clearCellOutput(cell.id)} className="p-1 px-1.5 text-gray-400 dark:text-gray-500 hover:text-amber-500 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded transition-colors" title="Clear Output">
                            <Eraser size={14} />
                        </button>
                        <div className="w-px h-4 bg-gray-200 dark:bg-slate-800 mx-1" />
                        {cell.type === 'markdown' && !isEditing && (
                            <button onClick={() => setCellEditing(cell.id, true)} className="p-1 px-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors" title="Edit">
                                <Eye size={14} />
                            </button>
                        )}
                        {cell.isExecuting ? (
                            <button onClick={interrupt} className="p-1 px-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors animate-pulse">
                                <Square size={14} fill="currentColor" />
                            </button>
                        ) : (
                            <button
                                onClick={async () => {
                                    if (cell.type === 'markdown') {
                                        setCellEditing(cell.id, false);
                                    } else {
                                        await executeCell(cell.id);
                                    }
                                    selectNextCell(cell.id);
                                }}
                                disabled={cell.isExecuting}
                                className="p-1 px-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors disabled:opacity-30"
                                title={cell.type === 'markdown' ? 'Render' : 'Execute'}
                            >
                                <Play size={14} fill="currentColor" />
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
                                    pre: ({ node, ...props }) => <pre {...props} className="bg-gray-900 border border-slate-700 text-gray-100 p-4 rounded-lg overflow-x-auto mb-4 font-mono" />,
                                    code: ({ node, inline, ...props }: any) =>
                                        inline
                                            ? <code {...props} className="bg-gray-100 dark:bg-slate-800 text-purple-600 dark:text-purple-400 px-1 rounded font-mono text-sm" />
                                            : <code {...props} className="block w-full font-mono" />,
                                    h1: ({ node, ...props }) => <h1 {...props} className="text-3xl font-bold mb-6 mt-8 border-b dark:border-slate-800 pb-2 text-gray-900 dark:text-gray-100 first:mt-2" />,
                                    h2: ({ node, ...props }) => <h2 {...props} className="text-2xl font-bold mb-4 mt-8 text-gray-800 dark:text-gray-200" />,
                                    h3: ({ node, ...props }) => <h3 {...props} className="text-xl font-bold mb-3 mt-6 text-gray-800 dark:text-gray-200" />,
                                    ul: ({ node, ...props }) => <ul {...props} className="list-disc pl-6 mb-4 space-y-1 text-gray-700 dark:text-gray-300" />,
                                    ol: ({ node, ...props }) => <ol {...props} className="list-decimal pl-6 mb-4 space-y-1 text-gray-700 dark:text-gray-300" />,
                                    p: ({ node, ...props }) => <p {...props} className="mb-4 leading-relaxed text-gray-700 dark:text-gray-300" />,
                                    table: ({ node, ...props }) => <div className="overflow-x-auto mb-4"><table {...props} className="min-w-full divide-y divide-gray-200 dark:divide-slate-800 border dark:border-slate-800" /></div>,
                                    th: ({ node, ...props }) => <th {...props} className="px-4 py-2 bg-gray-50 dark:bg-slate-800/50 font-bold text-left border dark:border-slate-800" />,
                                    td: ({ node, ...props }) => <td {...props} className="px-4 py-2 border dark:border-slate-800" />,
                                    blockquote: ({ node, ...props }) => <blockquote {...props} className="border-l-4 border-blue-500 pl-4 italic text-gray-600 dark:text-gray-400 mb-4" />,
                                }}
                            >
                                {cell.content || '*Empty Markdown Cell*'}
                            </ReactMarkdown>
                        </div>
                    ) : (
                        <MonacoEditor
                            key={`editor-${index}`}
                            height={Math.max(100, (cell.content.split('\n').length + 1) * 19 + 32) + 'px'}
                            language={cell.type === 'markdown' ? 'markdown' : 'python'}
                            value={cell.content}
                            onChange={handleContentChange}
                            onMount={handleEditorDidMount}
                            options={editorOptions}
                            theme={isDark ? "vs-dark" : "vs"}
                        />
                    )}
                </div>
                {cell.outputs.length > 0 && showOutputs && (
                    <div className="border-t border-gray-100 dark:border-slate-800/50 rounded-b-xl print:border-none">
                        <div className="mt-2">
                            <ResultView outputs={cell.outputs} executionCount={cell.executionCount} onFixError={handleFixError} />
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
