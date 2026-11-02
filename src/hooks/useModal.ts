import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Dialog behaviour: Escape closes, Tab stays inside, focus moves in on open and
 * returns to the previously focused element on close.
 */
export function useModal(isOpen: boolean, onClose: () => void, containerRef: RefObject<HTMLElement | null>) {
    const onCloseRef = useRef(onClose);
    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    useEffect(() => {
        if (!isOpen) return;
        const previouslyFocused = document.activeElement as HTMLElement | null;
        const container = containerRef.current;

        const focusables = () => (container ? Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)) : []);
        // Do not steal focus from an autofocus field inside the dialog
        if (container && !container.contains(document.activeElement)) {
            (focusables()[0] ?? container).focus();
        }

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.stopPropagation();
                onCloseRef.current();
                return;
            }
            if (event.key !== 'Tab') return;
            const items = focusables();
            if (items.length === 0) {
                event.preventDefault();
                return;
            }
            const first = items[0];
            const last = items[items.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };

        document.addEventListener('keydown', onKeyDown, true);
        return () => {
            document.removeEventListener('keydown', onKeyDown, true);
            previouslyFocused?.focus?.();
        };
    }, [isOpen, containerRef]);
}
