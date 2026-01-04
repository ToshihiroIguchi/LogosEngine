import React, { useState, useRef, useEffect } from 'react';
import {
    Download, PlayCircle, Loader2, Info, BookOpen, ChevronDown, Upload,
    Square, Database, Printer, Eraser, FileText, Code, RefreshCw,
    Pencil, Check, CheckCircle2, CloudUpload, FolderOpen, MoreVertical
} from 'lucide-react';
import { useNotebook } from '../../context/NotebookContext';
import { CellItem } from './CellItem';
import { ErrorBoundary } from '../ErrorBoundary';
import { DisclaimerModal } from './DisclaimerModal';
import { Sidebar } from './Sidebar';
import { EXAMPLES } from '../../constants/examples';

export const NotebookContainer: React.FC = () => {
    const {
        cells, addCell, executeAll, interrupt, isReady, insertExample, importNotebook,
        isSidebarOpen, setIsSidebarOpen, clearAllOutputs, resetNotebook, isGraphicsReady,
        fileList, currentNotebookId, isDirty, renameNotebook, setActiveTab
    } = useNotebook();
    const [showExamples, setShowExamples] = useState(false);
    const [showMenu, setShowMenu] = useState(false);
    const [showDisclaimer, setShowDisclaimer] = useState(false);
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [editTitleValue, setEditTitleValue] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const currentNotebook = fileList.find(m => m.id === currentNotebookId);

    useEffect(() => {
        if (currentNotebook) {
            setEditTitleValue(currentNotebook.title);
        }
    }, [currentNotebook]);

    const isExecutingAny = cells.some(c => c.isExecuting);

    const handleReset = () => {
        if (confirm('Are you sure you want to reset the notebook? All your work will be lost.')) {
            resetNotebook();
        }
    };

    const handleExport = () => {
        const data = JSON.stringify({ cells, version: '1.0' }, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${currentNotebook?.title || 'notebook'}-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const handlePrint = () => {
        window.print();
    };

    const handleImport = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target?.result as string);
                importNotebook(data);
            } catch (err) {
                alert('Failed to parse JSON file. Please ensure it is a valid notebook export.');
            }
        };
        reader.readAsText(file);

        // Reset input so the same file can be selected again
        event.target.value = '';
    };

    const handleInsertExample = (code: string) => {
        insertExample(code);
        setShowExamples(false);
    };

    const handleSaveTitle = async () => {
        if (editTitleValue.trim() && currentNotebookId) {
            await renameNotebook(currentNotebookId, editTitleValue.trim());
        }
        setIsEditingTitle(false);
    };

    const toggleSidebarTab = (tab: 'files' | 'variables') => {
        setActiveTab(tab);
        setIsSidebarOpen(true);
    };

    return (
        <div id="app-root" className="h-screen bg-[#FDFDFD] flex flex-col overflow-hidden">
            <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileChange}
                className="hidden"
            />

            {/* Header - Fixed at top */}
            <header className="flex-none bg-white/80 backdrop-blur-md border-b border-gray-200/60 px-6 py-3 flex items-center justify-between shadow-sm z-30">
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-3">
                        <div className="bg-white p-1.5 rounded-xl border border-gray-100 shadow-sm"><img src="/logo.png" alt="LogosEngine" className="w-8 h-8 object-contain" /></div>
                        <div className="flex items-center">
                            <h1 className="text-xl font-black text-gray-900 tracking-tighter">Logos<span className="text-purple-600">Engine</span></h1>
                        </div>
                    </div>

                    <div className="h-8 w-px bg-gray-200" />

                    <div className="flex items-center gap-3">
                        {isEditingTitle ? (
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={editTitleValue}
                                    onChange={(e) => setEditTitleValue(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSaveTitle()}
                                    onBlur={handleSaveTitle}
                                    autoFocus
                                    className="bg-gray-50 border border-purple-200 rounded-lg px-3 py-1 text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-100 min-w-[200px]"
                                />
                                <button onClick={handleSaveTitle} className="text-green-600 hover:bg-green-50 p-1.5 rounded-lg transition-colors"><Check size={16} /></button>
                            </div>
                        ) : (
                            <div
                                className="group flex items-center gap-2 cursor-pointer hover:bg-gray-50 px-3 py-1.5 rounded-xl transition-all"
                                onClick={() => setIsEditingTitle(true)}
                            >
                                <span className="text-lg font-bold text-gray-900 tracking-tight">
                                    {currentNotebook?.title || 'Loading...'}
                                </span>
                                <Pencil size={14} className="text-gray-300 group-hover:text-purple-400 opacity-0 group-hover:opacity-100 transition-all" />
                            </div>
                        )}

                        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">
                            {isDirty ? (
                                <div className="flex items-center gap-1.5 text-amber-500 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100/50">
                                    <CloudUpload size={12} className="animate-bounce" />
                                    <span>Saving...</span>
                                </div>
                            ) : (
                                <div className="flex items-center gap-1.5 text-green-500 bg-green-50 px-2 py-0.5 rounded-full border border-green-100/50">
                                    <CheckCircle2 size={12} />
                                    <span>Saved</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {!isReady ? (
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 rounded-full border border-amber-100/50">
                            <Loader2 className="animate-spin text-amber-500" size={14} /><span className="text-xs font-semibold text-amber-600">Initializing...</span>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2">
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 rounded-full border border-green-100/50">
                                <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div><span className="text-xs font-semibold text-green-600">Engine Ready</span>
                            </div>
                            {!isGraphicsReady ? (
                                <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50/50 rounded-full border border-blue-100/30">
                                    <Loader2 className="animate-spin text-blue-400" size={12} /><span className="text-[10px] font-semibold text-blue-500">Graphics Loading...</span>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 rounded-full border border-indigo-100/50">
                                    <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></div><span className="text-xs font-semibold text-indigo-600">Graphics Ready</span>
                                </div>
                            )}
                        </div>
                    )}
                    <div className="h-6 w-px bg-gray-200 mx-2" />
                    <div className="flex items-center bg-gray-100/50 p-1 rounded-xl border border-gray-200/50 gap-1">
                        <button
                            onClick={() => toggleSidebarTab('files')}
                            className="flex items-center gap-2 px-3 py-1.5 bg-white text-gray-600 rounded-lg shadow-sm border border-gray-200 hover:bg-gray-50 transition-all font-medium text-xs whitespace-nowrap"
                            title="Open Notebook Explorer"
                        >
                            <FolderOpen size={14} />Notebooks
                        </button>
                        <button
                            onClick={() => toggleSidebarTab('variables')}
                            className="flex items-center gap-2 px-3 py-1.5 bg-white text-purple-600 rounded-lg shadow-sm border border-gray-200 hover:bg-purple-50 transition-all font-medium text-xs whitespace-nowrap"
                        >
                            <Database size={14} />Variables
                        </button>

                        <div className="relative">
                            <button
                                onClick={() => { setShowExamples(!showExamples); setShowMenu(false); }}
                                className="flex items-center gap-2 px-3 py-1.5 bg-white text-purple-600 rounded-lg shadow-sm border border-gray-200 hover:bg-purple-50 transition-all font-medium text-xs whitespace-nowrap"
                            >
                                <BookOpen size={14} />Examples<ChevronDown size={12} className={`transition-transform ${showExamples ? 'rotate-180' : ''}`} />
                            </button>
                            {showExamples && (
                                <div className="absolute top-full mt-2 right-0 bg-white border border-gray-200 rounded-xl shadow-lg w-64 max-h-96 overflow-y-auto z-50">
                                    {EXAMPLES.map((example, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() => handleInsertExample(example.code)}
                                            className="w-full text-left px-4 py-3 hover:bg-purple-50 transition-colors border-b border-gray-100 last:border-b-0"
                                        >
                                            <div className="text-sm font-semibold text-gray-900">{example.title}</div>
                                            <div className="text-xs text-gray-500 mt-1 font-mono truncate">{example.code.split('\n')[1]}</div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="h-6 w-px bg-gray-200 mx-1" />

                        {isExecutingAny && (
                            <button onClick={interrupt} className="flex items-center gap-2 px-4 py-1.5 bg-red-50 text-red-600 rounded-lg shadow-sm border border-red-200 hover:bg-red-100 transition-all font-medium text-xs animate-pulse">
                                <Square size={14} fill="currentColor" />Stop
                            </button>
                        )}
                        <button
                            onClick={executeAll}
                            disabled={!isReady || isExecutingAny}
                            className="flex items-center gap-2 px-4 py-1.5 bg-blue-600 text-white rounded-lg shadow-md border border-blue-500 hover:bg-blue-700 transition-all font-bold text-xs disabled:opacity-50"
                        >
                            <PlayCircle size={14} />Run All
                        </button>

                        <div className="h-6 w-px bg-gray-200 mx-1" />

                        <div className="relative">
                            <button
                                onClick={() => { setShowMenu(!showMenu); setShowExamples(false); }}
                                className={`p-1.5 rounded-lg transition-all ${showMenu ? 'bg-gray-200 text-gray-900' : 'text-gray-500 hover:bg-gray-200/50'}`}
                                title="More Actions"
                            >
                                <MoreVertical size={18} />
                            </button>

                            {showMenu && (
                                <>
                                    <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                                    <div className="absolute top-full mt-2 right-0 bg-white border border-gray-200 rounded-xl shadow-xl w-56 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                                        <button onClick={() => { handleImport(); setShowMenu(false); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                                            <Upload size={14} />Import Notebook
                                        </button>
                                        <button onClick={() => { handleExport(); setShowMenu(false); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                                            <Download size={14} />Export JSON
                                        </button>
                                        <button onClick={() => { handlePrint(); setShowMenu(false); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                                            <Printer size={14} />Print / PDF
                                        </button>

                                        <div className="h-px bg-gray-100 my-2" />

                                        <button onClick={() => { clearAllOutputs(); setShowMenu(false); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-amber-600 hover:bg-amber-50 transition-colors">
                                            <Eraser size={14} />Clear All Outputs
                                        </button>

                                        <div className="h-px bg-gray-100 my-2" />

                                        <button onClick={() => { handleReset(); setShowMenu(false); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors">
                                            <RefreshCw size={14} />Reset Notebook
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content Area + Sidebar */}
            <div className="flex-1 flex overflow-hidden">
                {/* Scrollable Notebook Area */}
                <div id="notebook-scroll-area" className="flex-1 flex flex-col min-w-0 overflow-y-auto scroll-smooth">
                    <main className="flex-1 w-full max-w-7xl mx-auto px-6 py-12">
                        <div className="space-y-4">
                            {cells.map((cell, index) => (
                                <ErrorBoundary key={cell.id}>
                                    <CellItem cell={cell} index={index} />
                                </ErrorBoundary>
                            ))}
                        </div>
                        <div className="mt-12 flex flex-col items-center gap-6 pb-24 print:hidden">
                            <div className="flex items-center gap-4">
                                <button
                                    onClick={() => addCell('code')}
                                    className="group flex flex-col items-center gap-2 text-gray-300 hover:text-blue-500 transition-all"
                                >
                                    <div className="p-3 border-2 border-dashed border-gray-200 rounded-2xl group-hover:border-blue-200 group-hover:bg-blue-50/50 transition-all">
                                        <Code size={20} />
                                    </div>
                                    <span className="text-[9px] font-bold uppercase tracking-widest">Code Cell</span>
                                </button>
                                <div className="h-10 w-px bg-gray-100" />
                                <button
                                    onClick={() => addCell('markdown')}
                                    className="group flex flex-col items-center gap-2 text-gray-300 hover:text-purple-500 transition-all"
                                >
                                    <div className="p-3 border-2 border-dashed border-gray-200 rounded-2xl group-hover:border-purple-200 group-hover:bg-purple-50/50 transition-all">
                                        <FileText size={20} />
                                    </div>
                                    <span className="text-[9px] font-bold uppercase tracking-widest">Markdown Cell</span>
                                </button>
                            </div>
                        </div>
                    </main>
                    <footer className="py-6 px-8 border-t border-gray-100 flex items-center justify-between bg-gray-50/50 mt-auto">
                        <div className="flex items-center gap-3 text-xs text-gray-400 font-mono">
                            <span>PYTHON 3.11</span><span className="opacity-30">•</span><span>SYMPY CORE</span><span className="opacity-30">•</span><span>BROWSER-WASM</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setShowDisclaimer(true)}
                                className="text-[10px] font-bold text-gray-400 hover:text-gray-600 uppercase tracking-tighter hover:underline transition-all"
                            >
                                Legal & Risk
                            </button>
                            <div className="flex items-center gap-1.5 px-3 py-1 bg-white border border-gray-200 rounded-full shadow-sm cursor-help hover:border-blue-300 transition-colors">
                                <Info size={12} className="text-blue-500" /><span className="text-[10px] font-bold text-gray-500 uppercase tracking-tighter">Computational Notebook Environment</span>
                            </div>
                        </div>
                    </footer>
                </div>

                {/* Docked Sidebar */}
                <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
            </div>

            <DisclaimerModal isOpen={showDisclaimer} onClose={() => setShowDisclaimer(false)} />
        </div>
    );
};
