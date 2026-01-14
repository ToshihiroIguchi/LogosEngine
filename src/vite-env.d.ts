/// <reference types="vite/client" />

declare const __APP_VERSION__: string
declare const __COMMIT_HASH__: string

declare module 'katex/contrib/auto-render' {
    import { KatexOptions } from 'katex';

    interface AutoRenderOptions extends KatexOptions {
        delimiters?: Array<{
            left: string;
            right: string;
            display: boolean;
        }>;
        ignoredTags?: string[];
        ignoredClasses?: string[];
        errorCallback?: (msg: string, err: Error) => void;
        preProcess?: (math: string) => string;
    }

    function renderMathInElement(element: HTMLElement, options?: AutoRenderOptions): void;
    export default renderMathInElement;
}
