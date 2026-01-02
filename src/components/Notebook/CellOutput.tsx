import React, { useEffect, useRef, useState } from 'react';
import { Copy, Check, ChevronDown, Code, Table, FileText } from 'lucide-react';
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
                    {/* Output Label */}
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
                            <div className="bg-[#FFF5F5] rounded-lg border border-[#FFE3E3] overflow-hidden shadow-sm">
                                <div className="p-3 flex gap-3 items-start">
                                    <div className="bg-[#FF9B9B] p-1.5 rounded-full shadow-inner mt-0.5">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-[11px] font-bold text-[#E53E3E] uppercase tracking-wider font-mono bg-white px-2 py-0.5 rounded border border-[#FED7D7]">
                                                {output.errorName || 'Error'}
                                            </span>
                                            {output.lineNo && (
                                                <span className="text-[10px] text-[#A0AEC0] font-mono">
                                                    at line {output.lineNo}
                                                </span>
                                            )}
                                        </div>
                                        <div className="font-mono text-sm font-medium text-[#2D3748] leading-snug select-text">
                                            {output.value}
                                        </div>
                                        {output.traceback && (
                                            <div className="mt-3 pt-2 border-t border-[#FFE3E3]/50">
                                                <details className="group">
                                                    <summary className="text-[11px] text-[#E53E3E] cursor-pointer hover:underline select-none flex items-center gap-1.5 font-bold transition-all w-fit opacity-80 hover:opacity-100">
                                                        <ChevronDown size={12} className="transition-transform group-open:rotate-180" />
                                                        Traceback
                                                    </summary>
                                                    <div className="mt-3 relative">
                                                        <pre className="text-[11px] text-[#C53030] whitespace-pre-wrap font-mono bg-white/60 p-3 rounded-lg border border-[#FED7D7]/50 overflow-x-auto select-text leading-relaxed">
                                                            {output.traceback}
                                                        </pre>
                                                    </div>
                                                </details>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <pre className="text-gray-800 text-sm whitespace-pre-wrap font-mono leading-relaxed px-1">
                                {output.value}
                            </pre>
                        )}

                        {/* Hover Copy Menu */}
                        {output.type !== 'image' && (
                            <div className="absolute top-0 right-0">
                                <CopyMenu output={output} />
                            </div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
};

const CopyMenu: React.FC<{ output: Output }> = ({ output }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    const handleCopy = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setIsOpen(false);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy text: ', err);
        }
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div
            className={`relative ${isOpen ? 'opacity-100 z-50' : 'opacity-0 group-hover:opacity-100 transition-opacity'}`}
            ref={menuRef}
        >
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-white rounded border border-transparent hover:border-gray-200 transition-all shadow-sm bg-white/50 backdrop-blur-sm flex items-center gap-1"
                title="Copy options"
            >
                {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                <ChevronDown size={10} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute top-full right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-50 py-1 min-w-[140px] animate-in fade-in zoom-in-95 duration-150">
                    <button
                        onClick={() => handleCopy(output.value)}
                        className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-blue-50 flex items-center gap-2 transition-colors font-medium border-b border-gray-50 last:border-0"
                    >
                        <FileText size={12} className="text-blue-400" />
                        Copy as LaTeX
                    </button>
                    {output.rawText && (
                        <button
                            onClick={() => handleCopy(output.rawText!)}
                            className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-blue-50 flex items-center gap-2 transition-colors font-medium border-b border-gray-50 last:border-0"
                        >
                            <Code size={12} className="text-purple-400" />
                            Copy as Code
                        </button>
                    )}
                    {output.tsv && (
                        <button
                            onClick={() => handleCopy(output.tsv!)}
                            className="w-full text-left px-3 py-2 text-xs text-green-700 hover:bg-green-50 flex items-center gap-2 transition-colors font-medium"
                        >
                            <Table size={12} className="text-green-500" />
                            Copy for Excel
                        </button>
                    )}
                </div>
            )}
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
