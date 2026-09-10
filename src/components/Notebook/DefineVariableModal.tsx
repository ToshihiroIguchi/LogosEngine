import React, { useState, useEffect, useMemo } from 'react';
import { X, Check, Code2, Zap, Sliders, Copy, HelpCircle } from 'lucide-react';
import { KatexRenderer } from '../UI/KatexRenderer';
import { useNotebook } from '../../state/AppNotebookContext';
import type { Variable, VariableAssumptions } from '../../types';

interface DefineVariableModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialVariable?: Variable | null;
}

interface PresetOption {
    id: string;
    label: string;
    description: string;
    tex: string;
    assumptions: VariableAssumptions;
    badgeColor: string;
}

const PRESETS: PresetOption[] = [
    {
        id: 'positive',
        label: 'Positive',
        description: 'Real number > 0 (x > 0)',
        tex: 'x > 0',
        assumptions: { positive: true },
        badgeColor: 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
    },
    {
        id: 'nonnegative',
        label: 'Non-negative',
        description: 'Real number ≥ 0 (x ≥ 0)',
        tex: 'x \\ge 0',
        assumptions: { nonnegative: true },
        badgeColor: 'border-teal-500 bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300'
    },
    {
        id: 'real',
        label: 'Real',
        description: 'Any real number (x ∈ ℝ)',
        tex: 'x \\in \\mathbb{R}',
        assumptions: { real: true },
        badgeColor: 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
    },
    {
        id: 'integer',
        label: 'Integer',
        description: 'Any integer (n ∈ ℤ)',
        tex: 'n \\in \\mathbb{Z}',
        assumptions: { integer: true },
        badgeColor: 'border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'
    },
    {
        id: 'positive_integer',
        label: 'Natural (Integer > 0)',
        description: 'Natural number (n ∈ ℕ, n > 0)',
        tex: 'n \\in \\mathbb{N}_{>0}',
        assumptions: { integer: true, positive: true },
        badgeColor: 'border-lime-500 bg-lime-50 dark:bg-lime-950/40 text-lime-700 dark:text-lime-300'
    },
    {
        id: 'negative',
        label: 'Negative',
        description: 'Real number < 0 (x < 0)',
        tex: 'x < 0',
        assumptions: { negative: true },
        badgeColor: 'border-orange-500 bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300'
    },
    {
        id: 'nonpositive',
        label: 'Non-positive',
        description: 'Real number ≤ 0 (x ≤ 0)',
        tex: 'x \\le 0',
        assumptions: { nonpositive: true },
        badgeColor: 'border-rose-500 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'
    },
    {
        id: 'nonzero',
        label: 'Non-zero',
        description: 'Non-zero number (x ≠ 0)',
        tex: 'x \\ne 0',
        assumptions: { nonzero: true },
        badgeColor: 'border-purple-500 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300'
    },
    {
        id: 'unconstrained',
        label: 'Unconstrained',
        description: 'General number including complex (x ∈ ℂ)',
        tex: 'x \\in \\mathbb{C}',
        assumptions: {},
        badgeColor: 'border-gray-400 bg-gray-50 dark:bg-slate-800 text-gray-700 dark:text-gray-300'
    }
];

export const DefineVariableModal: React.FC<DefineVariableModalProps> = ({
    isOpen,
    onClose,
    initialVariable
}) => {
    const { defineVariable, insertTextAtCursor } = useNotebook();

    const [varName, setVarName] = useState('x');
    const [selectedPreset, setSelectedPreset] = useState<string>('positive');
    const [assumptions, setAssumptions] = useState<VariableAssumptions>({ positive: true });
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [isApplying, setIsApplying] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    // Synchronize initialVariable when modal opens
    useEffect(() => {
        if (!isOpen) return;

        // Reset error state
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setError(null);
        if (initialVariable) {
            setVarName(initialVariable.name);
            const initAssumptions = initialVariable.assumptions || {};
            setAssumptions(initAssumptions);

            // Match preset if possible
            const matched = PRESETS.find(p => {
                const keys = Object.keys(p.assumptions);
                if (keys.length === 0 && Object.keys(initAssumptions).length === 0) return true;
                return keys.length > 0 && keys.every(k => initAssumptions[k] === p.assumptions[k]);
            });
            setSelectedPreset(matched ? matched.id : 'custom');
        } else {
            setVarName('x');
            setSelectedPreset('positive');
            setAssumptions({ positive: true });
        }
    }, [isOpen, initialVariable]);

    const handleSelectPreset = (preset: PresetOption) => {
        setSelectedPreset(preset.id);
        setAssumptions({ ...preset.assumptions });
        setError(null);
    };

    const handleToggleAssumption = (key: string) => {
        setSelectedPreset('custom');
        setAssumptions(prev => {
            const next = { ...prev };
            if (next[key]) {
                delete next[key];
            } else {
                next[key] = true;
                // Conflict resolution
                if (key === 'positive') {
                    delete next['negative'];
                    delete next['nonpositive'];
                } else if (key === 'negative') {
                    delete next['positive'];
                    delete next['nonnegative'];
                }
            }
            return next;
        });
    };

    // Generated Python code
    const generatedCode = useMemo(() => {
        const cleanName = varName.trim() || 'x';
        const names = cleanName.replace(/,/g, ' ').split(/\s+/).filter(Boolean);
        const joinedNames = names.join(' ');
        const tupleLhs = names.join(', ');

        const kwargsList: string[] = [];
        Object.entries(assumptions).forEach(([k, v]) => {
            if (v === true) kwargsList.push(`${k}=True`);
            else if (v === false) kwargsList.push(`${k}=False`);
        });

        const kwargsStr = kwargsList.length > 0 ? `, ${kwargsList.join(', ')}` : '';
        if (names.length <= 1) {
            return `${cleanName} = symbols('${joinedNames}'${kwargsStr})`;
        } else {
            return `${tupleLhs} = symbols('${joinedNames}'${kwargsStr})`;
        }
    }, [varName, assumptions]);

    // Math representation for KaTeX preview
    const mathDisplayTex = useMemo(() => {
        const cleanName = varName.trim() || 'x';
        const parts: string[] = [];

        if (assumptions.positive && assumptions.integer) {
            parts.push(`${cleanName} \\in \\mathbb{N}_{>0} \\quad (${cleanName} > 0, \\text{integer})`);
        } else if (assumptions.positive) {
            parts.push(`${cleanName} > 0 \\quad (${cleanName} \\in \\mathbb{R}_{>0})`);
        } else if (assumptions.nonnegative) {
            parts.push(`${cleanName} \\ge 0 \\quad (${cleanName} \\in \\mathbb{R}_{\\ge 0})`);
        } else if (assumptions.negative) {
            parts.push(`${cleanName} < 0 \\quad (${cleanName} \\in \\mathbb{R}_{<0})`);
        } else if (assumptions.nonpositive) {
            parts.push(`${cleanName} \\le 0 \\quad (${cleanName} \\in \\mathbb{R}_{\\le 0})`);
        } else if (assumptions.integer) {
            parts.push(`${cleanName} \\in \\mathbb{Z}`);
        } else if (assumptions.real) {
            parts.push(`${cleanName} \\in \\mathbb{R}`);
        } else if (assumptions.nonzero) {
            parts.push(`${cleanName} \\ne 0`);
        } else {
            parts.push(`${cleanName} \\in \\mathbb{C}`);
        }

        return parts.join(' , ');
    }, [varName, assumptions]);

    // Action: Apply immediately to WASM Pyodide context
    const handleApplyToSession = async () => {
        const cleanName = varName.trim();
        if (!cleanName) {
            setError('Please enter a variable name');
            return;
        }

        // Validate identifier names
        const names = cleanName.replace(/,/g, ' ').split(/\s+/).filter(Boolean);
        const validIdentifierRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
        for (const n of names) {
            if (!validIdentifierRegex.test(n)) {
                setError(`'${n}' is not a valid variable name (alphanumeric and underscore only)`);
                return;
            }
        }

        setIsApplying(true);
        setError(null);
        try {
            await defineVariable(cleanName, assumptions);
            setIsApplying(false);
            onClose();
        } catch (err: unknown) {
            setIsApplying(false);
            setError(err instanceof Error ? err.message : 'Failed to define variable');
        }
    };

    // Action: Insert Python code into active cell
    const handleInsertCode = () => {
        insertTextAtCursor(`${generatedCode}\n`);
        onClose();
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(generatedCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-y-auto">
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-slate-950/60 dark:bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
                onClick={onClose}
            />

            {/* Dialog */}
            <div className="relative bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-lg w-full p-6 animate-in zoom-in-95 fade-in duration-200 overflow-hidden my-auto">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 pb-4 mb-5">
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg">
                            <Sliders size={20} />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">
                                {initialVariable ? `Configure Assumptions for '${initialVariable.name}'` : 'Define Variable & Assumptions'}
                            </h2>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                Apply assumptions (positive, real, etc.) to SymPy symbols to simplify expressions and constrain results
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-all"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Variable Name Input */}
                <div className="mb-4">
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                        Variable Name (Symbol)
                    </label>
                    <input
                        type="text"
                        value={varName}
                        onChange={(e) => {
                            setVarName(e.target.value);
                            setError(null);
                        }}
                        placeholder="e.g. x, y, r, radius (comma-separated)"
                        className="w-full px-3 py-2 bg-gray-50 dark:bg-slate-800/80 border border-gray-200 dark:border-slate-700 rounded-lg text-sm font-mono text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    />
                </div>

                {/* Range Presets Grid */}
                <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                        <label className="text-xs font-bold text-gray-700 dark:text-gray-300">
                            Presets & Assumptions
                        </label>
                        <span className="text-[10px] text-gray-400 dark:text-gray-500">Click to select</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        {PRESETS.map((preset) => {
                            const isSelected = selectedPreset === preset.id;
                            return (
                                <button
                                    key={preset.id}
                                    type="button"
                                    onClick={() => handleSelectPreset(preset)}
                                    className={`flex flex-col items-start p-2.5 rounded-xl border text-left transition-all relative ${
                                        isSelected
                                            ? `${preset.badgeColor} ring-2 ring-blue-500/40 shadow-sm`
                                             : 'border-gray-200 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800/60 text-gray-700 dark:text-gray-300'
                                    }`}
                                >
                                    <div className="flex items-center justify-between w-full mb-1">
                                        <span className="text-[11px] font-bold truncate">{preset.label}</span>
                                        {isSelected && <Check size={12} className="shrink-0" />}
                                    </div>
                                    <div className="text-[12px] font-mono mb-0.5">
                                        <KatexRenderer tex={preset.tex} />
                                    </div>
                                    <span className="text-[9px] text-gray-400 dark:text-gray-500 leading-tight line-clamp-1">
                                        {preset.description}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Advanced Assumptions Toggle */}
                <div className="mb-4">
                    <button
                        type="button"
                        onClick={() => setShowAdvanced(!showAdvanced)}
                        className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                    >
                        {showAdvanced ? '− Hide advanced assumptions' : '+ Specify individual assumptions'}
                    </button>

                    {showAdvanced && (
                        <div className="mt-2.5 p-3 bg-gray-50 dark:bg-slate-800/60 rounded-xl border border-gray-200 dark:border-slate-800 grid grid-cols-2 gap-2 text-xs">
                            {[
                                { key: 'positive', label: 'positive (x > 0)' },
                                { key: 'nonnegative', label: 'nonnegative (x ≥ 0)' },
                                { key: 'negative', label: 'negative (x < 0)' },
                                { key: 'nonpositive', label: 'nonpositive (x ≤ 0)' },
                                { key: 'real', label: 'real (x ∈ ℝ)' },
                                { key: 'integer', label: 'integer (n ∈ ℤ)' },
                                { key: 'nonzero', label: 'nonzero (x ≠ 0)' },
                                { key: 'complex', label: 'complex (x ∈ ℂ)' },
                            ].map(({ key, label }) => (
                                <label key={key} className="flex items-center gap-2 cursor-pointer text-gray-700 dark:text-gray-300 select-none">
                                    <input
                                        type="checkbox"
                                        checked={!!assumptions[key]}
                                        onChange={() => handleToggleAssumption(key)}
                                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <span className="font-mono text-[11px]">{label}</span>
                                </label>
                            ))}
                        </div>
                    )}
                </div>

                {/* Preview Box */}
                <div className="mb-5 p-3.5 bg-slate-900 dark:bg-black rounded-xl text-white border border-slate-800 shadow-inner">
                    <div className="flex items-center justify-between text-[11px] text-gray-400 mb-2 border-b border-slate-800 pb-1.5">
                        <span className="flex items-center gap-1.5 font-bold">
                            <HelpCircle size={12} />
                            Preview & Generated Code
                        </span>
                        <button
                            onClick={handleCopy}
                            className="flex items-center gap-1 text-[10px] hover:text-blue-400 transition-colors"
                            title="Copy code"
                        >
                            {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                            {copied ? 'Copied' : 'Copy'}
                        </button>
                    </div>

                    <div className="flex items-center justify-between mb-2 px-1 text-sm text-blue-300">
                        <span className="text-xs text-gray-400">Mathematical Form:</span>
                        <div className="font-mono">
                            <KatexRenderer tex={mathDisplayTex} />
                        </div>
                    </div>

                    <div className="bg-slate-950 p-2 rounded-lg font-mono text-xs text-emerald-400 overflow-x-auto border border-slate-800/80">
                        <code>{generatedCode}</code>
                    </div>
                </div>

                {/* Error Message */}
                {error && (
                    <div className="mb-4 p-2.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg text-xs text-red-600 dark:text-red-400 font-medium">
                        {error}
                    </div>
                )}

                {/* Action Buttons */}
                <div className="flex items-center gap-2.5">
                    <button
                        type="button"
                        onClick={handleApplyToSession}
                        disabled={isApplying}
                        className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-98 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-blue-500/20 cursor-pointer"
                        title="Apply this variable definition immediately to the Python session"
                    >
                        <Zap size={14} className={isApplying ? 'animate-spin' : ''} />
                        {isApplying ? 'Applying...' : (initialVariable ? 'Update Session' : 'Apply to Session')}
                    </button>

                    <button
                        type="button"
                        onClick={handleInsertCode}
                        className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 active:scale-98 text-gray-800 dark:text-gray-200 text-xs font-bold rounded-xl transition-all border border-gray-200 dark:border-slate-700 cursor-pointer"
                        title="Insert definition code into active cell"
                    >
                        <Code2 size={14} />
                        Insert into Cell
                    </button>

                    <button
                        type="button"
                        onClick={onClose}
                        className="px-3 py-2.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors cursor-pointer"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};
