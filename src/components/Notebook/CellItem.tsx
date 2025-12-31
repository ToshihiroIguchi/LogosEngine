import React from 'react';
import { Play, Trash2, PlusCircle, Clock } from 'lucide-react';
import type { Cell } from '../../types';
import { useNotebook } from '../../context/NotebookContext';
import { CellOutput } from './CellOutput';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface CellItemProps {
    cell: Cell;
    index: number;
}

export const CellItem: React.FC<CellItemProps> = ({ cell, index }) => {
    const { updateCell, executeCell, deleteCell, addCell, isReady } = useNotebook();

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && e.shiftKey) {
            e.preventDefault();
            executeCell(cell.id);
        }
    };

    const isQueued = cell.isExecuting && !isReady;

    return (
        <div className="group relative mb-6">
            <div className={cn(
                "flex flex-col border rounded-xl overflow-hidden transition-all duration-200 bg-white",
                cell.isExecuting ? (isQueued ? "ring-2 ring-amber-400 border-amber-400 shadow-md" : "ring-2 ring-blue-400 border-blue-400 shadow-md") : "border-gray-200 shadow-sm hover:border-gray-300"
            )}>
                <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50/50 border-b border-gray-100 opacity-60 group-hover:opacity-100 transition-opacity">
                    <div className="flex items-center gap-3">
                        <span className="text-[10px] font-bold text-gray-400 font-mono tracking-wider uppercase">
                            {cell.executionCount ? `[${cell.executionCount}]` : 'In [*]'}
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
                        <button onClick={() => executeCell(cell.id)} disabled={cell.isExecuting} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-30">
                            <Play size={14} fill="currentColor" />
                        </button>
                        <button onClick={() => deleteCell(cell.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                            <Trash2 size={14} />
                        </button>
                    </div>
                </div>
                <div className="relative">
                    <textarea
                        className="w-full p-4 font-mono text-sm bg-transparent outline-none resize-none leading-relaxed min-h-[80px]"
                        value={cell.content}
                        onChange={(e) => updateCell(cell.id, e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Enter code here... (Shift+Enter to run)"
                        rows={Math.max(3, cell.content.split('\n').length)}
                        spellCheck={false}
                    />
                </div>
                {cell.outputs.length > 0 && (
                    <div className="border-t border-gray-50">
                        <CellOutput outputs={cell.outputs} />
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
