import React, { useState } from 'react';
import { Plus, FileText, MoreVertical, Pencil, Trash2, Check, X } from 'lucide-react';
import { useNotebook } from '../../context/AppNotebookContext';
import { clsx } from 'clsx';

export const FileExplorer: React.FC = () => {
    const { fileList, currentNotebookId, createNotebook, openNotebook, deleteNotebook, renameNotebook } = useNotebook();
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');
    const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

    const handleCreate = () => {
        createNotebook();
    };

    const handleStartRename = (id: string, currentTitle: string) => {
        setEditingId(id);
        setEditValue(currentTitle);
        setMenuOpenId(null);
    };

    const handleSaveRename = async (id: string) => {
        if (editValue.trim()) {
            await renameNotebook(id, editValue.trim());
        }
        setEditingId(null);
    };

    const handleDelete = async (id: string, title: string) => {
        if (confirm(`Are you sure you want to delete "${title}"?`)) {
            await deleteNotebook(id);
        }
        setMenuOpenId(null);
    };

    return (
        <div className="flex flex-col h-full bg-white">
            <div className="p-4 border-b border-gray-100">
                <button
                    onClick={handleCreate}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl shadow-sm shadow-purple-100 transition-all font-semibold text-sm"
                >
                    <Plus size={16} strokeWidth={3} />
                    New Notebook
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
                <div className="space-y-1">
                    {fileList.map((file) => (
                        <div
                            key={file.id}
                            className={clsx(
                                "group relative flex items-center gap-3 p-3 rounded-xl transition-all cursor-pointer",
                                currentNotebookId === file.id
                                    ? "bg-purple-50 text-purple-700 font-medium"
                                    : "hover:bg-gray-50 text-gray-600"
                            )}
                            onClick={() => editingId !== file.id && openNotebook(file.id)}
                        >
                            <div className={clsx(
                                "p-2 rounded-lg transition-colors",
                                currentNotebookId === file.id ? "bg-purple-100" : "bg-gray-100 group-hover:bg-gray-200"
                            )}>
                                <FileText size={16} className={currentNotebookId === file.id ? "text-purple-600" : "text-gray-500"} />
                            </div>

                            <div className="flex-1 min-w-0">
                                {editingId === file.id ? (
                                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                        <input
                                            type="text"
                                            value={editValue}
                                            onChange={(e) => setEditValue(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleSaveRename(file.id)}
                                            autoFocus
                                            className="w-full bg-white border border-purple-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200"
                                        />
                                        <button onClick={() => handleSaveRename(file.id)} className="text-green-600 p-1 hover:bg-green-50 rounded"><Check size={14} /></button>
                                        <button onClick={() => setEditingId(null)} className="text-red-600 p-1 hover:bg-red-50 rounded"><X size={14} /></button>
                                    </div>
                                ) : (
                                    <>
                                        <div className="text-sm truncate pr-6">{file.title}</div>
                                        <div className="text-[10px] text-gray-400 font-normal">
                                            {new Date(file.updatedAt).toLocaleDateString()}
                                        </div>
                                    </>
                                )}
                            </div>

                            {editingId !== file.id && (
                                <div className="absolute right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setMenuOpenId(menuOpenId === file.id ? null : file.id);
                                        }}
                                        className="p-1 hover:bg-gray-200 rounded-md text-gray-400"
                                    >
                                        <MoreVertical size={14} />
                                    </button>

                                    {menuOpenId === file.id && (
                                        <div className="absolute right-0 top-full mt-1 bg-white border border-gray-100 rounded-lg shadow-xl z-50 py-1 w-32 animate-in fade-in zoom-in-95 duration-100">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleStartRename(file.id, file.title); }}
                                                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                                            >
                                                <Pencil size={12} /> Rename
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleDelete(file.id, file.title); }}
                                                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                                            >
                                                <Trash2 size={12} /> Delete
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            <div className="p-4 border-t border-gray-50 bg-gray-50/50">
                <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Storage</div>
                <div className="mt-2 h-1 w-full bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full bg-green-500 w-[5%]" />
                </div>
                <div className="mt-1 text-[9px] text-gray-400">IndexedDB Persistence</div>
            </div>
        </div>
    );
};
