import React from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { useDarkMode } from '../../hooks/useDarkMode';

interface ConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title?: string;
    message?: string;
    confirmLabel?: string;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    title = "Factory Reset",
    message = "This will delete ALL notebooks and reset the application to its factory state. This action cannot be undone.",
    confirmLabel = "Delete Everything"
}) => {
    useDarkMode();
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-red-950/20 dark:bg-black/80 backdrop-blur-sm animate-in fade-in duration-300"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-md w-full animate-in zoom-in-95 fade-in duration-300 overflow-hidden ring-1 ring-red-100 dark:ring-red-900/50">
                <div className="p-8">
                    <div className="flex flex-col items-center text-center gap-4 mb-6">
                        <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-full text-red-500 border border-red-100 dark:border-red-900/50 mb-2">
                            <AlertTriangle size={36} strokeWidth={1.5} />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-gray-900 dark:text-gray-100 tracking-tight leading-none mb-3">
                                {title}
                            </h2>
                            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium leading-relaxed">
                                {message}
                            </p>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <button
                            onClick={() => {
                                onConfirm();
                                onClose();
                            }}
                            className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-xl transition-all transform active:scale-95 shadow-lg shadow-red-200 dark:shadow-red-900/20"
                        >
                            <Trash2 size={16} />
                            {confirmLabel}
                        </button>
                        <button
                            onClick={onClose}
                            className="w-full px-6 py-3.5 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-300 text-sm font-bold rounded-xl transition-all"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
