import React, { useEffect, useRef } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import type { Output } from '../../types';

interface CellOutputProps {
    outputs: Output[];
}

export const CellOutput: React.FC<CellOutputProps> = ({ outputs }) => {
    if (outputs.length === 0) return null;

    return (
        <div className="mt-2 space-y-4 border-l-2 border-gray-100 pl-4 py-2 bg-gray-50/30 rounded-r-lg">
            {outputs.map((output, idx) => (
                <div key={`${output.timestamp}-${idx}`} className="animate-in fade-in slide-in-from-top-1 duration-300">
                    {output.type === 'latex' ? (
                        <LatexRenderer value={output.value} />
                    ) : output.type === 'image' ? (
                        <img src={output.value} alt="Plot" className="max-w-full h-auto rounded shadow-sm bg-white" />
                    ) : output.type === 'error' ? (
                        <pre className="text-red-600 text-sm whitespace-pre-wrap font-mono p-2 bg-red-50 rounded border border-red-100 italic">
                            {output.value}
                        </pre>
                    ) : (
                        <pre className="text-gray-800 text-sm whitespace-pre-wrap font-mono leading-relaxed">
                            {output.value}
                        </pre>
                    )}
                </div>
            ))}
        </div>
    );
};

const LatexRenderer: React.FC<{ value: string }> = ({ value }) => {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (containerRef.current) {
            try {
                katex.render(value, containerRef.current, {
                    throwOnError: false,
                    displayMode: true
                });
            } catch (err) {
                containerRef.current.textContent = value;
            }
        }
    }, [value]);

    return <div ref={containerRef} className="overflow-x-auto py-2 text-blue-900" />;
};
