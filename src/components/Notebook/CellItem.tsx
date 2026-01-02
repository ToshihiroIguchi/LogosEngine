import React, { useRef } from 'react';
import { Play, Trash2, PlusCircle, Clock, Square } from 'lucide-react';
import MonacoEditor from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import type { Cell } from '../../types';
import { useNotebook } from '../../context/NotebookContext';
import { CellOutput } from './CellOutput';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { registerPythonCompletionProvider } from '../../utils/monacoCompletionProvider';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface CellItemProps {
    cell: Cell;
    index: number;
}

export const CellItem: React.FC<CellItemProps> = ({ cell, index }) => {
    const { updateCell, executeCell, deleteCell, addCell, interrupt, isReady, getCompletions } = useNotebook();
    const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
    const completionProviderRegistered = useRef(false);
    const monacoRef = useRef<any>(null);
    const executeCellRef = useRef(executeCell);

    // Keep the ref updated with the latest executeCell function to prevent stale closures
    React.useEffect(() => {
        executeCellRef.current = executeCell;
    }, [executeCell]);

    const handleEditorDidMount = (editor: editor.IStandaloneCodeEditor, monaco: typeof import('monaco-editor')) => {
        editorRef.current = editor;
        monacoRef.current = monaco;

        if (!completionProviderRegistered.current) {
            registerPythonCompletionProvider(monaco, getCompletions);
            completionProviderRegistered.current = true;
        }

        editor.addAction({
            id: 'execute-cell',
            label: 'Execute Cell',
            keybindings: [
                monaco.KeyMod.Shift | monaco.KeyCode.Enter,
                monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter
            ],
            run: () => {
                executeCellRef.current(cell.id);
            }
        });
    };

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

    const isQueued = cell.isExecuting && !isReady;

    return (
        <div className="group relative mb-6">
            <div className={cn(
                "flex flex-col border rounded-xl transition-colors transition-shadow duration-200 bg-white relative overflow-visible",
                cell.isExecuting ? (isQueued ? "ring-2 ring-amber-400 border-amber-400 shadow-md z-20" : "ring-2 ring-blue-400 border-blue-400 shadow-md z-20") : "border-gray-200 shadow-sm hover:border-gray-300 hover:z-[50] focus-within:z-[50]"
            )}>
                <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50/50 border-b border-gray-100 opacity-60 group-hover:opacity-100 transition-opacity rounded-t-xl">
                    <div className="flex items-center gap-3">
                        <span className="text-[10px] font-bold text-gray-400 font-mono tracking-wider uppercase">
                            {cell.isExecuting ? 'In [*]' : (cell.executionCount ? `In [${cell.executionCount}]` : 'In [ ]')}
                        </span>
                        <span className="text-[10px] font-medium text-gray-500 uppercase tracking-widest bg-gray-200/50 px-1.5 py-0.5 rounded">
                            {cell.type}
                        </span>
                        {isQueued && (
                            <span className="flex items-center gap-1 text-[10px] font-medium text-amber-600 uppercase tracking-widest bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                <Clock size={10} />
                                Queued
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-1">
                        {cell.isExecuting ? (
                            <button onClick={interrupt} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors animate-pulse">
                                <Square size={14} fill="currentColor" />
                            </button>
                        ) : (
                            <button onClick={() => executeCell(cell.id)} disabled={cell.isExecuting} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-30">
                                <Play size={14} fill="currentColor" />
                            </button>
                        )}
                        <button onClick={() => deleteCell(cell.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                            <Trash2 size={14} />
                        </button>
                    </div>
                </div>
                <div className="relative">
                    <MonacoEditor
                        height={Math.max(100, (cell.content.split('\n').length + 1) * 19 + 32) + 'px'}
                        language="python"
                        value={cell.content}
                        onChange={handleContentChange}
                        onMount={handleEditorDidMount}
                        options={{
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
                        }}
                        theme="vs"
                    />
                </div>
                {cell.outputs.length > 0 && (
                    <div className="border-t border-gray-50 rounded-b-xl">
                        <CellOutput outputs={cell.outputs} executionCount={cell.executionCount} />
                    </div>
                )}
            </div>
            <div className="absolute -bottom-4 left-0 right-0 flex justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 z-10 pointer-events-none">
                <button onClick={() => addCell('code', index)} className="pointer-events-auto bg-white border border-gray-200 text-gray-400 hover:text-blue-500 hover:border-blue-300 hover:shadow-lg rounded-full p-1.5 transition-all transform hover:scale-110">
                    <PlusCircle size={18} />
                </button>
            </div>
        </div>
    );
};
