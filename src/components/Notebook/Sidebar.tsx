import React from 'react';
import { useNotebook } from '../../state/AppNotebookContext';
import { Database, X, Hash, BookCopy, Info, FolderOpen, Trash2, Search } from 'lucide-react';
import { FileExplorer } from './FileExplorer';

interface SidebarProps {
    isOpen: boolean;
    onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
    const { variables, activeDocumentation, setActiveDocumentation, activeTab, setActiveTab, fileList, deleteVariable, searchDocs, searchResults } = useNotebook();
    const [searchQuery, setSearchQuery] = React.useState('');

    const [width, setWidth] = React.useState(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('logos-sidebar-width');
            return saved ? parseInt(saved, 10) : 320;
        }
        return 320;
    });
    const [isResizing, setIsResizing] = React.useState(false);

    const startResizing = React.useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setIsResizing(true);
        // Start dragging immediately
        document.body.style.cursor = 'col-resize';
    }, []);

    const stopResizing = React.useCallback(() => {
        setIsResizing(false);
        localStorage.setItem('logos-sidebar-width', width.toString());
        document.body.style.cursor = '';
    }, [width]);

    const resize = React.useCallback((e: MouseEvent) => {
        if (isResizing) {
            const newWidth = window.innerWidth - e.clientX;
            // Min 250px, Max 80% of window
            if (newWidth >= 250 && newWidth < window.innerWidth * 0.8) {
                setWidth(newWidth);
            }
        }
    }, [isResizing]);

    React.useEffect(() => {
        if (isResizing) {
            window.addEventListener('mousemove', resize);
            window.addEventListener('mouseup', stopResizing);
        }
        return () => {
            window.removeEventListener('mousemove', resize);
            window.removeEventListener('mouseup', stopResizing);
        };
    }, [isResizing, resize, stopResizing]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        if (searchQuery.trim()) {
            searchDocs(searchQuery.trim());
        }
    };

    if (!isOpen) return null;

    return (
        <div
            className="bg-white border-l border-gray-200 flex flex-col shrink-0 h-full animate-in slide-in-from-right-10 duration-300 relative group/sidebar"
            style={{ width: `${width}px`, transition: isResizing ? 'none' : 'width 0.3s ease-in-out' }}
        >
            {/* Drag Handle */}
            <div
                className={`absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 z-50 transition-colors ${isResizing ? 'bg-blue-500' : 'bg-transparent'}`}
                onMouseDown={startResizing}
            />

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

            <div className={`flex-1 overflow-y-auto ${isResizing ? 'select-none pointer-events-none' : ''}`}>
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
                                        <div className="flex items-center gap-2">
                                            <span className="px-1.5 py-0.5 bg-gray-100 text-[10px] font-bold text-gray-500 rounded uppercase">
                                                {v.type}
                                            </span>
                                            <button
                                                onClick={() => {
                                                    // Immediate deletion for better UX, or confirm? Plan said 'confirm' or 'immediate'.
                                                    // Let's stick to user request imply 'button to delete'.
                                                    // Providing a confirm is safer.
                                                    if (confirm(`Delete variable '${v.name}'?`)) {
                                                        deleteVariable(v.name);
                                                    }
                                                }}
                                                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 text-gray-400 hover:text-red-500 rounded transition-all"
                                                title="Delete variable"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="font-mono text-[11px] text-gray-600 break-all bg-white p-2 border border-gray-100 rounded-md shadow-sm group-hover:border-blue-100 transition-colors">
                                        {v.value}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )
                ) : (
                    activeTab === 'documentation' ? (
                        <div className="flex flex-col h-full">
                            <div className="p-4 border-b border-gray-100 bg-white sticky top-0 z-10">
                                <form onSubmit={handleSearch} className="relative">
                                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        placeholder="Search docs (e.g. sin, Matrix)..."
                                        className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-all placeholder:text-gray-400"
                                    />
                                </form>
                            </div>
                            {activeDocumentation ? (
                                <div className="p-5 animate-in fade-in slide-in-from-bottom-2 duration-300 flex-1 overflow-y-auto">
                                    {searchResults && (
                                        <button
                                            onClick={() => setActiveDocumentation(null)}
                                            className="mb-4 text-xs flex items-center gap-1 text-gray-500 hover:text-blue-600 transition-colors font-medium"
                                        >
                                            ← Back to results
                                        </button>
                                    )}
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
                            ) : searchResults ? (
                                <div className="divide-y divide-gray-50 overflow-y-auto flex-1">
                                    {/* Symbols (Name Match) */}
                                    {searchResults.symbols.length > 0 && (
                                        <div className="p-2">
                                            <div className="px-2 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50/50 rounded flex items-center gap-2">
                                                <span>Symbols</span>
                                                <span className="bg-gray-200 text-gray-500 px-1.5 rounded-full text-[9px]">{searchResults.symbols.length}</span>
                                            </div>
                                            <div className="mt-1 space-y-0.5">
                                                {searchResults.symbols.map((doc) => (
                                                    <button
                                                        type="button"
                                                        key={doc.name}
                                                        onClick={() => setActiveDocumentation(doc)}
                                                        className="w-full text-left p-2 hover:bg-blue-50 rounded-md group transition-all"
                                                    >
                                                        <div className="flex items-center justify-between">
                                                            <span className="font-mono text-xs font-bold text-blue-600 group-hover:text-blue-700">{doc.name}</span>
                                                            <span className="text-[9px] text-gray-400 group-hover:text-blue-400">{doc.module}</span>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Mentions (Docstring Match) */}
                                    {searchResults.mentions.length > 0 && (
                                        <div className="p-2">
                                            <div className="px-2 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50/50 rounded flex items-center gap-2">
                                                <span>Mentions</span>
                                                <span className="bg-gray-200 text-gray-500 px-1.5 rounded-full text-[9px]">{searchResults.mentions.length}</span>
                                            </div>
                                            <div className="mt-1 space-y-0.5">
                                                {searchResults.mentions.map((doc, idx) => (
                                                    <button
                                                        type="button"
                                                        key={`${doc.name}-${idx}`}
                                                        onClick={() => setActiveDocumentation(doc)}
                                                        className="w-full text-left p-2 hover:bg-purple-50 rounded-md group transition-all"
                                                    >
                                                        <div className="flex items-center justify-between mb-1">
                                                            <span className="font-mono text-xs font-bold text-gray-700 group-hover:text-purple-700">{doc.name}</span>
                                                            <span className="text-[9px] text-gray-400">{doc.module}</span>
                                                        </div>
                                                        {doc.snippet && (
                                                            <div className="text-[10px] text-gray-500 leading-tight border-l-2 border-gray-200 pl-2 group-hover:border-purple-200 font-sans">
                                                                {doc.snippet}
                                                            </div>
                                                        )}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {searchResults.symbols.length === 0 && searchResults.mentions.length === 0 && (
                                        <div className="p-8 text-center bg-gray-50 m-4 rounded-lg border border-gray-100">
                                            <p className="text-xs text-gray-500 font-medium">No results found.</p>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-500">
                                    <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                                        <BookCopy size={24} className="text-gray-300" />
                                    </div>
                                    <p className="text-sm text-gray-400 font-medium">No documentation loaded.</p>
                                    <p className="text-xs text-gray-500 mt-2 italic">Search above or type ?function to view docs.</p>
                                </div>
                            )}
                        </div>
                    ) : null
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
