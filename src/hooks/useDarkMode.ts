import { useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark' | 'system';

// Theme state is shared by every component that uses this hook.
// (Previously each call kept its own state, so toggling the theme did not reach existing editors.)
const listeners = new Set<() => void>();

function readSavedTheme(): Theme {
    try {
        const saved = localStorage.getItem('theme');
        if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
    } catch {
        // localStorage may be unavailable (private mode, blocked site data)
    }
    return 'light';
}

function computeIsDark(theme: Theme): boolean {
    if (theme === 'dark') return true;
    if (theme === 'system') return window.matchMedia('(prefers-color-scheme: dark)').matches;
    return false;
}

let currentTheme: Theme = readSavedTheme();
let currentIsDark = computeIsDark(currentTheme);

function applyToDom() {
    currentIsDark = computeIsDark(currentTheme);
    document.documentElement.classList.toggle('dark', currentIsDark);
}

function emit() {
    listeners.forEach((l) => l());
}

applyToDom();

// One media-query listener for the whole app (only matters while theme === 'system')
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (currentTheme !== 'system') return;
    applyToDom();
    emit();
});

function setThemeValue(newTheme: Theme) {
    currentTheme = newTheme;
    try {
        localStorage.setItem('theme', newTheme);
    } catch {
        // ignore storage failures; the theme still applies for this session
    }
    applyToDom();
    emit();
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

const getTheme = () => currentTheme;
const getIsDark = () => currentIsDark;

export const useDarkMode = () => {
    const theme = useSyncExternalStore(subscribe, getTheme);
    const isDark = useSyncExternalStore(subscribe, getIsDark);
    return { theme, setTheme: setThemeValue, isDark };
};
