import { useEffect } from 'react';

/** Calls `onEscape` when Escape is pressed while `active` is true (e.g. a dropdown menu is open). */
export function useEscapeKey(active: boolean, onEscape: () => void): void {
    useEffect(() => {
        if (!active) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onEscape();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [active, onEscape]);
}
