
import React, { useRef } from 'react';
import { Play, Trash2, PlusCircle, Square, ChevronUp, ChevronDown, Copy, Eraser, Eye, AlertCircle, Loader2 } from 'lucide-react';
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
        updateCell, executeCell, deleteCell, addCell, interrupt, isReady, getCompletions,
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
        const newContent = `${definitionLine} \n${cell.content} `;

        updateCell(cell.id, newContent);
        // Execute immediately with the new content
        executeCell(cell.id, newContent);
    };

    const isQueued = cell.isExecuting && !isReady;
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
        <div className="group relative mb-4">
            <style dangerouslySetInnerHTML={{
                __html: `
    .dark.monaco-editor,
                .dark.monaco-editor .margin,
                .dark.monaco-editor-background,
                .dark.monaco-editor .inputarea.ime-input {
    background-color: #0f172a!important;
}
                .dark.monaco-editor .view-line {
    color: #e2e8f0!important;
}
                /* Syntax Highlighting Forcing for Dark Mode */
                .dark.monaco-editor .mtk1 { color: #e2e8f0!important; } /* Base text / Variables */
                .dark.monaco-editor .mtk6 { color: #94a3b8!important; } /* Brackets / Punctuation */
                .dark.monaco-editor .mtk8 { color: #4ade80!important; } /* Strings / Green */
                .dark.monaco-editor .mtk7 { color: #60a5fa!important; } /* Numbers / Functions (common) */
                .dark.monaco-editor .mtk10 { color: #f87171!important; } /* Errors / Special */
                .dark.monaco-editor .mtk12 { color: #c084fc!important; } /* Keywords */
                /* Force expand color specifically if it's mtk7 or common */
                .dark.monaco-editor[class*="mtk"] { filter: brightness(1.2); }

                /* Better Current Line Highlight - Best Practice */
                .dark.monaco-editor .current-line {
    background-color: #1e293b!important; /* Slate-800 */
    border: none!important;
}
                .dark.monaco-editor .current-line-exact {
    border: none!important;
}
` }} />
            <div className={cn(
                "flex flex-col border rounded-xl transition-colors duration-200 bg-white dark:bg-slate-900 relative overflow-visible print:border-none print:shadow-none",
                cell.isExecuting ? (isQueued ? "ring-2 ring-amber-400 border-amber-400 shadow-md z-20" : "ring-2 ring-blue-400 border-blue-400 shadow-md z-20") : "border-gray-200 dark:border-slate-800 shadow-sm dark:shadow-none hover:border-gray-300 dark:hover:border-slate-700 hover:z-[50] focus-within:z-[50]"
            )}>

                {/* FLOATING CONTROLS CONTAINER */}

                {/* 1. Left Gutter: Execution Button (VIVID) */}
                <div className="absolute top-3 -left-3 md:left-2 z-30 flex flex-col items-center gap-1 opacity-100">
                    <button
                        onClick={async (e) => {
                            e.stopPropagation();
                            if (cell.isExecuting) {
                                interrupt();
                            } else {
                                if (cell.type === 'markdown') {
                                    setCellEditing(cell.id, false);
                                } else {
                                    await executeCell(cell.id);
                                }
                                selectNextCell(cell.id);
                            }
                        }}
                        className={cn(
                            "flex items-center justify-center w-8 h-8 rounded-full shadow-md border transition-all focus:outline-none backdrop-blur-sm",
                            cell.isExecuting
                                ? "bg-white dark:bg-slate-800 border-2 border-blue-500 dark:border-blue-400 text-blue-500 shadow-lg scale-105"
                                : cell.outputs.some(o => o.type === 'error')
                                    ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-500 hover:bg-red-600 hover:text-white hover:border-red-600 hover:shadow-lg hover:scale-110"
                                    : cell.executionCount
                                        ? "bg-white dark:bg-slate-900 border-green-400 dark:border-green-600 text-green-600 dark:text-green-500 hover:bg-green-600 hover:text-white hover:border-green-600 hover:shadow-lg hover:scale-110" // Executed: Green Border
                                        : "bg-blue-50 dark:bg-slate-800 border-blue-200 dark:border-blue-700 text-blue-600 dark:text-blue-400 hover:bg-blue-600 hover:text-white hover:border-blue-600 hover:shadow-lg hover:scale-110" // Default: Blue
                        )}
                        title={cell.isExecuting ? "Interrupt execution" : "Run cell"}
                    >
                        {cell.isExecuting ? (
                            <div className="relative flex items-center justify-center">
                                <Loader2 size={16} className="animate-spin" />
                                <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100">
                                    <Square size={10} className="fill-current text-red-500" />
                                </div>
                            </div>
                        ) : (
                            <Play size={14} className="fill-current ml-0.5" />
                        )}
                    </button>

                    {/* Execution Info (Count & Time) - Outside the button */}
                    {!cell.isExecuting && cell.executionCount && (
                        <div className="flex flex-col items-center gap-0.5 pointer-events-none fade-in animate-in duration-300">
                            <span className="text-[10px] font-mono font-bold text-green-600 dark:text-green-500 leading-none">
                                [{cell.executionCount}]
                            </span>
                            {cell.lastExecutionTime !== undefined && (
                                <span className="text-[9px] text-gray-400 dark:text-gray-500 font-medium leading-none">
                                    {(cell.lastExecutionTime / 1000).toFixed(1)}s
                                </span>
                            )}
                        </div>
                    )}
                </div>

                {/* 2. Top Right: Action Toolbar */}
                <div className="absolute top-2 right-2 z-30 flex items-center gap-1 bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm p-1 rounded-lg shadow-sm border border-gray-100 dark:border-slate-700 opacity-0 group-hover:opacity-100 transition-all duration-200 translate-y-2 group-hover:translate-y-0">
                    <div className="flex items-center gap-0.5 px-1">
                        <button onClick={() => moveCell(cell.id, 'up')} className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors" title="Move Up">
                            <ChevronUp size={14} />
                        </button>
                        <button onClick={() => moveCell(cell.id, 'down')} className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors" title="Move Down">
                            <ChevronDown size={14} />
                        </button>
                    </div>

                    <div className="w-px h-4 bg-gray-200 dark:bg-slate-700" />

                    <div className="flex items-center gap-0.5 px-1">
                        <button onClick={() => duplicateCell(cell.id)} className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors" title="Duplicate">
                            <Copy size={14} />
                        </button>
                        <button onClick={() => clearCellOutput(cell.id)} className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-amber-500 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded transition-colors" title="Clear Output">
                            <Eraser size={14} />
                        </button>
                        {cell.type === 'markdown' && !isEditing && (
                            <button onClick={() => setCellEditing(cell.id, true)} className="p-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors" title="Edit">
                                <Eye size={14} />
                            </button>
                        )}
                        <button onClick={() => deleteCell(cell.id)} className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors" title="Delete">
                            <Trash2 size={14} />
                        </button>
                    </div>

                    <div className="w-px h-4 bg-gray-200 dark:bg-slate-700" />

                    {/* Cell Type Indicator (Minimal) */}
                    <span className="text-[9px] font-bold text-gray-300 dark:text-slate-600 uppercase tracking-widest px-2 select-none">
                        {cell.type === 'markdown' ? 'MD' : 'PY'}
                    </span>
                </div>

                {/* MAIN CONTENT AREA */}
                <div className="relative pl-12 pr-2 pt-2 pb-2"> {/* Increased left padding for the gutter area */}
                    {cell.type === 'markdown' && !isEditing ? (
                        <div
                            onDoubleClick={() => setCellEditing(cell.id, true)}
                            className="p-2 prose prose-slate dark:prose-invert max-w-none min-h-[50px] cursor-text hover:bg-gray-50/50 dark:hover:bg-slate-800/10 transition-colors rounded-lg overflow-x-auto"
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
                            height={Math.max(80, (cell.content.split('\n').length + 1) * 19 + 20) + 'px'} // Slightly tweaked height calc
                            language={cell.type === 'markdown' ? 'markdown' : 'python'}
                            value={cell.content}
                            onChange={handleContentChange}
                            onMount={handleEditorDidMount}
                            options={editorOptions}
                            theme={isDark ? "vs-dark" : "vs"}
                            loading={
                                <div className="h-full w-full py-3 pl-10 pr-4 bg-white dark:bg-slate-900 overflow-hidden">
                                    <pre className="m-0 p-0 font-mono text-[13px] leading-[19px] text-gray-800 dark:text-slate-200 whitespace-pre">
                                        {cell.content}
                                    </pre>
                                </div>
                            }
                        />
                    )}
                </div>
                {cell.outputs.length > 0 && showOutputs && (
                    <div className="border-t border-gray-100 dark:border-slate-800/50 rounded-b-xl print:border-none ml-12"> {/* Indent outputs too to match gutter */}
                        <div className="mt-2 text-sm">
                            <ResultView outputs={cell.outputs} executionCount={cell.executionCount} onFixError={handleFixError} />
                        </div>
                    </div>
                )}
            </div>

            {/* Add Cell Button (centered bottom) */}
            <div className="absolute -bottom-5 left-0 right-0 flex justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 z-10 pointer-events-none print:hidden">
                <button onClick={() => addCell('code', index)} className="pointer-events-auto bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-400 hover:text-blue-500 hover:border-blue-300 hover:shadow-lg rounded-full p-1.5 transition-all transform hover:scale-110 shadow-sm">
                    <PlusCircle size={18} />
                </button>
            </div>
        </div>
    );
};
