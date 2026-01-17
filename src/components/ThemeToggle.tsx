import React, { useState } from 'react';
import { Moon, Sun, Monitor } from 'lucide-react';
import { useDarkMode, type Theme } from '../hooks/useDarkMode';

export const ThemeToggle: React.FC = () => {
    const { theme, setTheme } = useDarkMode();
    const [isOpen, setIsOpen] = useState(false);

    const themes: { id: Theme; icon: any; label: string }[] = [
        { id: 'light', icon: Sun, label: 'Light' },
        { id: 'dark', icon: Moon, label: 'Dark' },
        { id: 'system', icon: Monitor, label: 'System' },
    ];

    const currentTheme = themes.find((t) => t.id === theme) || themes[0];

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-slate-800 text-gray-600 dark:text-gray-300 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700 transition-all font-medium text-xs"
            >
                <currentTheme.icon size={14} />
                <span className="capitalize">{theme} Mode</span>
            </button>

            {isOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
                    <div className="absolute top-full mt-2 right-0 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-xl w-36 py-1.5 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                        {themes.map((t) => (
                            <button
                                key={t.id}
                                onClick={() => {
                                    setTheme(t.id);
                                    setIsOpen(false);
                                }}
                                className={`w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors ${theme === t.id
                                    ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 font-semibold'
                                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700'
                                    }`}
                            >
                                <t.icon size={14} />
                                {t.label}
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};
