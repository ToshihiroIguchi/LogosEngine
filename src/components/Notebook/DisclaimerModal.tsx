import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { useDarkMode } from '../../hooks/useDarkMode';

interface DisclaimerModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const DisclaimerModal: React.FC<DisclaimerModalProps> = ({ isOpen, onClose }) => {
    useDarkMode();
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm animate-in fade-in duration-300"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-xl w-full animate-in zoom-in-95 fade-in duration-300 overflow-hidden">
                <div className="p-8">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="p-3 bg-amber-50 dark:bg-amber-900/30 rounded-2xl text-amber-500 border border-amber-100 dark:border-amber-800/50">
                            <AlertTriangle size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-gray-900 dark:text-gray-100 tracking-tight leading-none uppercase italic border-b-4 border-amber-400 pb-1">Legal Notice & Risk</h2>
                            <p className="text-[10px] text-gray-400 dark:text-gray-500 font-bold uppercase tracking-widest mt-2 px-1">Computational Safeguards</p>
                        </div>
                    </div>

                    <div className="space-y-4 text-sm text-gray-600 dark:text-gray-400 leading-relaxed max-h-[40vh] overflow-y-auto pr-4 scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-slate-800">
                        <p className="border-l-4 border-blue-500 pl-4 bg-blue-50/30 dark:bg-blue-900/10 py-2 rounded-r-lg">
                            <strong className="text-gray-900 dark:text-gray-200">Local Execution:</strong> All calculations, including Python and SymPy, are performed locally in your browser using WebAssembly. Your data never leaves your device and is stored in browser cache (IndexedDB).
                        </p>
                        <p>
                            <strong className="text-gray-900 dark:text-gray-200">Accuracy:</strong> While powered by established computer algebra systems, numerical and symbolic outputs should be verified, especially for mission-critical engineering or research applications.
                        </p>
                        <p>
                            <strong className="text-gray-900 dark:text-gray-200">Experimental Software:</strong> This is a cutting-edge computational IDE. Features and stability may evolve. Ensure critical work is exported as JSON or PDF frequently.
                        </p>
                        <p className="bg-gray-50 dark:bg-slate-800/50 p-3 rounded-xl border border-gray-100 dark:border-slate-800 text-[11px] font-mono leading-tight text-gray-600 dark:text-gray-400">
                            LIMITATION OF LIABILITY: THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED. THE DEVELOPERS SHALL NOT BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY.
                        </p>
                    </div>

                    <div className="mt-8 flex items-center justify-between gap-4">
                        <div className="text-[10px] text-gray-400 dark:text-gray-500 font-mono uppercase tracking-tighter">
                            v0.1.0 • SECURE LOCAL ENVIRONMENT
                        </div>
                        <button
                            onClick={onClose}
                            className="px-6 py-2.5 bg-gray-900 dark:bg-slate-800 text-white text-xs font-bold rounded-xl hover:bg-gray-800 dark:hover:bg-slate-700 transition-all transform active:scale-95 shadow-lg shadow-gray-200 dark:shadow-none"
                        >
                            Understand & Continue
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
