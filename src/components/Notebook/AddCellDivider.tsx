import React from 'react';
import { Plus, Code, FileText } from 'lucide-react';
import { useNotebook } from '../../state/AppNotebookContext';

interface AddCellDividerProps {
    index: number;
}

export const AddCellDivider: React.FC<AddCellDividerProps> = ({ index }) => {
    const { addCell } = useNotebook();

    return (
        <div className="group relative h-4 z-10 flex items-center justify-center hover:z-20 -my-2 transition-all">
            {/* The line */}
            <div className="w-full h-0.5 bg-blue-500/20 dark:bg-blue-400/20 opacity-0 group-hover:opacity-100 transition-opacity absolute top-1/2 -translate-y-1/2" />

            {/* The buttons */}
            <div className="relative flex gap-2 opacity-0 group-hover:opacity-100 transition-all transform scale-90 group-hover:scale-100 translate-y-1 group-hover:translate-y-0 duration-200">
                <button
                    onClick={() => addCell('code', index)}
                    className="flex items-center gap-1.5 px-3 py-1 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-full shadow-sm hover:shadow-md hover:border-blue-400 dark:hover:border-blue-500 hover:text-blue-500 dark:hover:text-blue-400 text-xs font-bold text-gray-500 dark:text-gray-400 transition-all"
                >
                    <Plus size={12} /> Code
                </button>
                <button
                    onClick={() => addCell('markdown', index)}
                    className="flex items-center gap-1.5 px-3 py-1 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-full shadow-sm hover:shadow-md hover:border-purple-400 dark:hover:border-purple-500 hover:text-purple-500 dark:hover:text-purple-400 text-xs font-bold text-gray-500 dark:text-gray-400 transition-all"
                >
                    <Plus size={12} /> Text
                </button>
            </div>
        </div>
    );
};
