import React, { useEffect, useRef, useState } from 'react';
import { Copy, Check } from 'lucide-react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import type { Output } from '../../types';

interface CellOutputProps {
    outputs: Output[];
    executionCount?: number;
}

export const CellOutput: React.FC<CellOutputProps> = ({ outputs, executionCount }) => {
    const validOutputs = outputs.filter(o => o.value && o.value.trim().length > 0);

    if (validOutputs.length === 0) return null;

    return (
        <div className="mt-1 space-y-4 border-l-2 border-gray-100 pl-4 py-2 bg-gray-50/30 rounded-r-lg">
            {validOutputs.map((output, idx) => (
                <div key={`${output.timestamp}-${idx}`} className="group relative flex gap-4 animate-in fade-in slide-in-from-top-1 duration-300">
                    {/* Mathematica style Output Label */}
                    <div className="flex-shrink-0 w-12 pt-1 text-right">
                        <span className="text-[10px] font-bold text-gray-400 font-mono tracking-tighter opacity-70">
                            {executionCount ? `Out [${executionCount}]:` : 'Out:'}
                        </span>
                    </div>

                    {/* Output Content Area */}
                    <div className="flex-1 min-w-0 flex flex-col gap-1 relative pr-10">
                        {output.type === 'latex' ? (
                            <LatexRenderer value={output.value} />
                        ) : output.type === 'image' ? (
                            <div className="py-2">
                                <img src={output.value} alt="Plot" className="max-w-full h-auto rounded shadow-sm bg-white border border-gray-100" />
                            </div>
                        ) : output.type === 'error' ? (
                            <pre className="text-red-600 text-sm whitespace-pre-wrap font-mono p-3 bg-red-50 rounded-lg border border-red-100 italic">
                                {output.value}
                            </pre>
                        ) : (
                            <pre className="text-gray-800 text-sm whitespace-pre-wrap font-mono leading-relaxed px-1">
                                {output.value}
                            </pre>
                        )}

                        {/* Hover Copy Button */}
                        {output.type !== 'image' && (
                            <div className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                <CopyButton text={output.value} />
                            </div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
};

const CopyButton: React.FC<{ text: string }> = ({ text }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy text: ', err);
        }
    };

    return (
        <button
            onClick={handleCopy}
            className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-white rounded border border-transparent hover:border-gray-200 transition-all shadow-sm bg-white/50 backdrop-blur-sm"
            title="Copy to clipboard"
        >
            {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
        </button>
    );
};

const LatexRenderer: React.FC<{ value: string }> = ({ value }) => {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (containerRef.current) {
            try {
                katex.render(value, containerRef.current, {
                    throwOnError: false,
                    displayMode: true,
                    fleqn: true
                });
            } catch (err) {
                containerRef.current.textContent = value;
            }
        }
    }, [value]);

    return (
        <div className="overflow-x-auto py-1 text-blue-900 text-left">
            <div ref={containerRef} />
        </div>
    );
};
