import React, { useState, useRef } from 'react';
import { Download, PlayCircle, Plus, Loader2, Info, BookOpen, ChevronDown, Upload, Square, Database } from 'lucide-react';
import { useNotebook } from '../../context/NotebookContext';
import { CellItem } from './CellItem';
import { DisclaimerModal } from './DisclaimerModal';
import { Sidebar } from './Sidebar';
import { EXAMPLES } from '../../constants/examples';

export const NotebookContainer: React.FC = () => {
    const {
        cells, addCell, executeAll, interrupt, isReady, insertExample, importNotebook,
        isSidebarOpen, setIsSidebarOpen
    } = useNotebook();
    const [showExamples, setShowExamples] = useState(false);
    const [showDisclaimer, setShowDisclaimer] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const isExecutingAny = cells.some(c => c.isExecuting);

    const handleExport = () => {
        const data = JSON.stringify({ cells, version: '1.0' }, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `notebook-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        URL.revokeObjectURL(url);
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

    return (
        <div className="h-screen bg-[#FDFDFD] flex flex-col overflow-hidden">
            <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileChange}
                className="hidden"
            />

            {/* Header - Fixed at top */}
            <header className="flex-none bg-white/80 backdrop-blur-md border-b border-gray-200/60 px-6 py-3 flex items-center justify-between shadow-sm z-30">
                <div className="flex items-center gap-4">
                    <div className="bg-white p-1 rounded-lg border border-gray-100 shadow-sm"><img src="/logo.png" alt="LogosEngine" className="w-8 h-8 object-contain" /></div>
                    <div>
                        <h1 className="text-lg font-bold text-gray-900 tracking-tight">LogosEngine</h1>
                        <p className="text-[10px] text-gray-400 font-medium tracking-widest uppercase -mt-0.5">Computational Knowledge System</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {!isReady ? (
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 rounded-full border border-amber-100/50">
                            <Loader2 className="animate-spin text-amber-500" size={14} /><span className="text-xs font-semibold text-amber-600">Initializing...</span>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 rounded-full border border-green-100/50">
                            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div><span className="text-xs font-semibold text-green-600">Engine Ready</span>
                        </div>
                    )}
                    <div className="h-6 w-px bg-gray-200 mx-2" />
                    <div className="flex items-center bg-gray-100/50 p-1 rounded-xl border border-gray-200/50 gap-1">
                        <div className="relative">
                            <button
                                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                                className={`flex items-center gap-2 px-4 py-1.5 rounded-lg shadow-sm border transition-all font-medium text-xs ${isSidebarOpen ? 'bg-purple-600 text-white border-purple-700 shadow-purple-100' : 'bg-white text-purple-600 border-gray-200 hover:bg-purple-50'}`}
                            >
                                <Database size={14} />Variables
                            </button>
                        </div>
                        <div className="relative">
                            <button
                                onClick={() => setShowExamples(!showExamples)}
                                className="flex items-center gap-2 px-4 py-1.5 bg-white text-purple-600 rounded-lg shadow-sm border border-gray-200 hover:bg-purple-50 transition-all font-medium text-xs"
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
                        {isExecutingAny && (
                            <button onClick={interrupt} className="flex items-center gap-2 px-4 py-1.5 bg-red-50 text-red-600 rounded-lg shadow-sm border border-red-200 hover:bg-red-100 transition-all font-medium text-xs animate-pulse">
                                <Square size={14} fill="currentColor" />Stop
                            </button>
                        )}
                        <button onClick={executeAll} disabled={!isReady || isExecutingAny} className="flex items-center gap-2 px-4 py-1.5 bg-white text-blue-600 rounded-lg shadow-sm border border-gray-200 hover:bg-blue-50 transition-all font-medium text-xs disabled:opacity-50">
                            <PlayCircle size={14} />Run All
                        </button>
                        <button onClick={handleImport} className="flex items-center gap-2 px-4 py-1.5 text-gray-600 rounded-lg hover:bg-white transition-all font-medium text-xs">
                            <Upload size={14} />Import
                        </button>
                        <button onClick={handleExport} className="flex items-center gap-2 px-4 py-1.5 text-gray-600 rounded-lg hover:bg-white transition-all font-medium text-xs">
                            <Download size={14} />Export
                        </button>
                    </div>
                </div>
            </header>

            {/* Main Content Area + Sidebar */}
            <div className="flex-1 flex overflow-hidden">
                {/* Scrollable Notebook Area */}
                <div className="flex-1 flex flex-col min-w-0 overflow-y-auto scroll-smooth">
                    <main className="flex-1 w-full max-w-7xl mx-auto px-6 py-12">
                        <div className="space-y-4">
                            {cells.map((cell, index) => <CellItem key={cell.id} cell={cell} index={index} />)}
                        </div>
                        <div className="mt-12 flex justify-center pb-24">
                            <button onClick={() => addCell('code')} className="group flex flex-col items-center gap-3 text-gray-300 hover:text-blue-500 transition-all">
                                <div className="p-3 border-2 border-dashed border-gray-200 rounded-2xl group-hover:border-blue-200 group-hover:bg-blue-50/50 transition-all"><Plus size={24} /></div>
                                <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Add Computational Block</span>
                            </button>
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
