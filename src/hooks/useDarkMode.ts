import { useState, useEffect, useCallback } from 'react';

export type Theme = 'light' | 'dark' | 'system';

export const useDarkMode = () => {
    const [theme, setThemeState] = useState<Theme>(() => {
        const saved = localStorage.getItem('theme');
        return (saved as Theme) || 'light';
    });
    const [isDark, setIsDark] = useState(false);

    const applyTheme = useCallback((currentTheme: Theme) => {
        const root = window.document.documentElement;
        const darkMatch = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const shouldBeDark =
            currentTheme === 'dark' ||
            (currentTheme === 'system' && darkMatch);

        if (shouldBeDark) {
            root.classList.add('dark');
        } else {
            root.classList.remove('dark');
        }
        // Defer state update to avoid set-state-in-effect warning
        setTimeout(() => setIsDark(shouldBeDark), 0);
    }, []);

    const setTheme = (newTheme: Theme) => {
        setThemeState(newTheme);
        localStorage.setItem('theme', newTheme);
    };

    useEffect(() => {
        applyTheme(theme);

        if (theme === 'system') {
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            const handleChange = () => applyTheme('system');
            mediaQuery.addEventListener('change', handleChange);
            return () => mediaQuery.removeEventListener('change', handleChange);
        }
    }, [theme, applyTheme]);

    return { theme, setTheme, isDark };
};
