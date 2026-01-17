import React, { useState } from 'react';
import { Plus, FileText, Trash2, Search } from 'lucide-react';
import { useNotebook } from '../../state/AppNotebookContext';
import { useDarkMode } from '../../hooks/useDarkMode';
import { cn } from '../../lib/utils';

export const FileExplorer: React.FC = () => {
    const { fileList, currentNotebookId, openNotebook, createNotebook, deleteNotebook } = useNotebook();
    const [searchTerm, setSearchTerm] = useState('');
    useDarkMode();

    const filteredFiles = fileList.filter(f =>
        f.title.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const storageUsage = Math.min(100, (fileList.length / 50) * 100);

    return (
        <div className="flex flex-col h-full bg-[#F8FAF8] dark:bg-slate-900 animate-in fade-in duration-500">
            <div className="p-4 space-y-4">
                <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm transition-all hover:shadow-md">
                    <div className="flex items-center justify-between mb-3 text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">
                        <span>Notebook Storage</span>
                        <span className={storageUsage > 80 ? 'text-red-500' : 'text-purple-500 dark:text-purple-400'}>{fileList.length} / 50</span>
                    </div>
                    <div className="h-1.5 w-full bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden mb-2">
                        <div
                            className={`h-full rounded-full transition-all duration-1000 ${storageUsage > 80 ? 'bg-red-400' : 'bg-gradient-to-r from-purple-400 to-blue-400'}`}
                            style={{ width: `${storageUsage}%` }}
                        />
                    </div>
                    <p className="text-[9px] text-gray-400 dark:text-gray-500 font-medium italic">Notebooks are saved locally in your browser.</p>
                </div>

                <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                    <input
                        type="text"
                        placeholder="Filter notebooks..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-purple-100 dark:focus:ring-purple-900 transition-all font-medium text-gray-700 dark:text-gray-200"
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-4">
                <div className="grid grid-cols-1 gap-2">
                    {filteredFiles.map((file) => (
                        <div
                            key={file.id}
                            className={cn(
                                "group relative p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between",
                                currentNotebookId === file.id
                                    ? "bg-purple-50 dark:bg-purple-900/30 border-purple-200 dark:border-purple-800 shadow-sm"
                                    : "bg-white dark:bg-slate-800 border-gray-100 dark:border-slate-800 hover:border-purple-200 dark:hover:border-purple-800 hover:shadow-sm"
                            )}
                            onClick={() => openNotebook(file.id)}
                        >
                            <div className="flex items-center gap-3 truncate">
                                <FileText size={16} className={currentNotebookId === file.id ? "text-purple-600 dark:text-purple-400" : "text-gray-400 dark:text-gray-500 group-hover:text-purple-400"} />
                                <div className="truncate">
                                    <div className={`text-xs font-bold truncate ${currentNotebookId === file.id ? 'text-purple-900 dark:text-gray-100' : 'text-gray-700 dark:text-gray-300'}`}>
                                        {file.title}
                                    </div>
                                    <div className="text-[9px] text-gray-400 dark:text-gray-500 font-mono mt-0.5">
                                        Last saved: {new Date(file.updatedAt).toLocaleTimeString()}
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (confirm('Permanently delete this notebook?')) {
                                        deleteNotebook(file.id);
                                    }
                                }}
                                className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 rounded-lg transition-all"
                            >
                                <Trash2 size={12} />
                            </button>
                        </div>
                    ))}
                    {filteredFiles.length === 0 && (
                        <div className="text-center py-12 px-4 border-2 border-dashed border-gray-200 dark:border-slate-800 rounded-2xl animate-in fade-in duration-500">
                            <Plus size={24} className="mx-auto text-gray-100 dark:text-slate-600 mb-2" />
                            <p className="text-xs text-gray-400 dark:text-slate-400 font-medium">No notebooks found.</p>
                        </div>
                    )}
                </div>
            </div>

            <div className="p-4 mt-auto">
                <button
                    onClick={() => createNotebook()}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-purple-600 dark:bg-purple-700 text-white rounded-xl shadow-lg shadow-purple-200 dark:shadow-none hover:bg-purple-700 dark:hover:bg-purple-600 transition-all font-bold text-sm transform active:scale-95"
                >
                    <Plus size={18} /> New Notebook
                </button>
            </div>
        </div>
    );
};
