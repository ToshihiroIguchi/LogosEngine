import React from 'react';
import { useNotebook } from '../../context/NotebookContext';
import { Database, X, Hash } from 'lucide-react';

interface VariableInspectorProps {
    isOpen: boolean;
    onClose: () => void;
}

export const VariableInspector: React.FC<VariableInspectorProps> = ({ isOpen, onClose }) => {
    const { variables } = useNotebook();

    if (!isOpen) return null;

    return (
        <div className="w-80 bg-white border-l border-gray-200 flex flex-col shrink-0 h-full animate-in slide-in-from-right-10 duration-300">
            <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gray-50/50">
                <div className="flex items-center gap-2 text-gray-700">
                    <Database size={18} className="text-purple-600" />
                    <h2 className="font-bold text-sm uppercase tracking-tight">Variable Inspector</h2>
                </div>
                <button onClick={onClose} className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors text-gray-400">
                    <X size={18} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto">
                {variables.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center p-8 text-center">
                        <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                            <Hash size={24} className="text-gray-300" />
                        </div>
                        <p className="text-sm text-gray-400 font-medium">No variables defined yet.</p>
                        <p className="text-xs text-gray-500 mt-2">Run a cell to see active symbols.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-50">
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
                )}
            </div>

            <div className="p-4 bg-gray-50 border-t border-gray-100">
                <div className="text-[10px] text-gray-400 font-mono uppercase tracking-widest text-center">
                    {variables.length} Active {variables.length === 1 ? 'Symbol' : 'Symbols'}
                </div>
            </div>
        </div>
    );
};
