import React from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

interface KatexRendererProps {
    tex: string;
    options?: katex.KatexOptions;
    className?: string; // Allow extending styles
}

export const KatexRenderer: React.FC<KatexRendererProps> = React.memo(({ tex, options, className }) => {
    // Memoize the HTML string generation
    const html = React.useMemo(() => {
        try {
            return katex.renderToString(tex, {
                throwOnError: false,
                displayMode: false, // Default to inline
                ...options
            });
        } catch (error) {
            console.error('KaTeX rendering error:', error);
            return tex;
        }
    }, [tex, options]);

    // Use a span with dangerouslySetInnerHTML
    return (
        <span
            className={className}
            dangerouslySetInnerHTML={{ __html: html }}
        />
    );
});

KatexRenderer.displayName = 'KatexRenderer';
