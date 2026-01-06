import React from 'react';
import { useNotebook } from '../../context/NotebookContext';
import { Database, X, Hash, BookCopy, Info, FolderOpen } from 'lucide-react';
import { FileExplorer } from './FileExplorer';

interface SidebarProps {
    isOpen: boolean;
    onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
    const { variables, activeDocumentation, activeTab, setActiveTab, fileList } = useNotebook();

    if (!isOpen) return null;

    return (
        <div className="w-80 bg-white border-l border-gray-200 flex flex-col shrink-0 h-full animate-in slide-in-from-right-10 duration-300">
            {/* Tab Header */}
            <div className="flex border-b border-gray-100 bg-gray-50/30">
                <button
                    onClick={() => setActiveTab('files')}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 text-[10px] font-bold uppercase tracking-wider transition-all border-b-2 ${activeTab === 'files'
                        ? 'border-purple-600 text-purple-600 bg-white'
                        : 'border-transparent text-gray-400 hover:text-gray-600 hover:bg-gray-100/50'
                        }`}
                >
                    <FolderOpen size={14} />
                    Files
                </button>
                <button
                    onClick={() => setActiveTab('variables')}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 text-[10px] font-bold uppercase tracking-wider transition-all border-b-2 ${activeTab === 'variables'
                        ? 'border-purple-600 text-purple-600 bg-white'
                        : 'border-transparent text-gray-400 hover:text-gray-600 hover:bg-gray-100/50'
                        }`}
                >
                    <Database size={14} />
                    Variables
                </button>
                <button
                    onClick={() => setActiveTab('documentation')}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 text-[10px] font-bold uppercase tracking-wider transition-all border-b-2 ${activeTab === 'documentation'
                        ? 'border-blue-600 text-blue-600 bg-white'
                        : 'border-transparent text-gray-400 hover:text-gray-600 hover:bg-gray-100/50'
                        }`}
                >
                    <BookCopy size={14} />
                    Docs
                </button>
                <button
                    onClick={onClose}
                    className="p-3 hover:bg-red-50 hover:text-red-500 transition-colors text-gray-400 border-l border-gray-100"
                >
                    <X size={16} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto">
                {activeTab === 'files' ? (
                    <FileExplorer />
                ) : activeTab === 'variables' ? (
                    variables.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-500">
                            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                                <Hash size={24} className="text-gray-300" />
                            </div>
                            <p className="text-sm text-gray-400 font-medium">No variables defined yet.</p>
                            <p className="text-xs text-gray-500 mt-2">Run a cell to see active symbols.</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-50 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            {variables.map((v) => (
                                <div key={v.name} className="p-4 hover:bg-gray-50 transition-colors group">
                                    <div className="flex items-center justify-between mb-1.5">
                                        <span className="font-mono text-sm font-bold text-blue-600 truncate">{v.name}</span>
                                        <span className="px-1.5 py-0.5 bg-gray-100 text-[10px] font-bold text-gray-500 rounded uppercase">
                                            {v.type}
                                        </span>
                                    </div>
                                    <div className="font-mono text-[11px] text-gray-600 break-all bg-white p-2 border border-gray-100 rounded-md shadow-sm group-hover:border-blue-100 transition-colors">
                                        {v.value}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )
                ) : (
                    activeDocumentation ? (
                        <div className="p-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <div className="mb-6">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">{activeDocumentation.module || 'Built-in'}</span>
                                </div>
                                <h3 className="text-xl font-bold text-gray-900 mb-2 truncate">{activeDocumentation.name}</h3>
                                {activeDocumentation.signature && (
                                    <div className="bg-gray-900 rounded-lg p-3 font-mono text-xs text-blue-300 overflow-x-auto border border-gray-800 shadow-inner">
                                        <code className="whitespace-nowrap">{activeDocumentation.name}{activeDocumentation.signature}</code>
                                    </div>
                                )}
                            </div>

                            <div className="space-y-4">
                                <div className="flex items-center gap-2 text-gray-400 border-b border-gray-100 pb-2">
                                    <Info size={14} />
                                    <span className="text-[10px] font-bold uppercase tracking-widest">Description</span>
                                </div>
                                <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">
                                    {activeDocumentation.docstring}
                                </pre>
                            </div>
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-500">
                            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                                <BookCopy size={24} className="text-gray-300" />
                            </div>
                            <p className="text-sm text-gray-400 font-medium">No documentation loaded.</p>
                            <p className="text-xs text-gray-500 mt-2 italic">Tip: Type ?function_name at the end of a cell (e.g., ?sin) to see help.</p>
                        </div>
                    )
                )}
            </div>

            <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-between items-center">
                <div className="text-[10px] text-gray-400 font-mono uppercase tracking-widest text-center flex-1">
                    {activeTab === 'files'
                        ? `${fileList.length} Notebooks`
                        : activeTab === 'variables'
                            ? `${variables.length} Active ${variables.length === 1 ? 'Symbol' : 'Symbols'}`
                            : activeDocumentation ? 'Viewing Documentation' : 'Ready for help (?)'}
                </div>
                <div className="text-[9px] text-gray-300 font-mono ml-2" title={`Commit: ${__COMMIT_HASH__}`}>
                    v{__APP_VERSION__}-{__COMMIT_HASH__}
                </div>
            </div>
        </div>
    );
};
