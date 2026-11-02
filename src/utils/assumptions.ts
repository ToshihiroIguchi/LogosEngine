import type { VariableAssumptions } from '../types';

/**
 * SymPy raises InconsistentAssumptions for these combinations, so enabling one switches the others off.
 */
export const ASSUMPTION_CONFLICTS: Record<string, string[]> = {
    positive: ['negative', 'nonpositive'],
    negative: ['positive', 'nonnegative'],
    nonnegative: ['negative'],
    nonpositive: ['positive']
};

/** Flips one assumption, resolving conflicts with the others. Returns a new object. */
export function toggleAssumption(prev: VariableAssumptions, key: string): VariableAssumptions {
    const next: VariableAssumptions = { ...prev };
    if (next[key] === true) {
        delete next[key];
        return next;
    }
    next[key] = true;
    for (const other of ASSUMPTION_CONFLICTS[key] ?? []) delete next[other];
    return next;
}

const enabledKeys = (assumptions: VariableAssumptions) =>
    Object.keys(assumptions).filter((k) => assumptions[k] === true).sort();

/** The preset whose enabled assumptions equal exactly the given ones, or null. */
export function matchPresetId(
    assumptions: VariableAssumptions,
    presets: { id: string; assumptions: VariableAssumptions }[]
): string | null {
    const wanted = enabledKeys(assumptions).join(',');
    const found = presets.find((p) => enabledKeys(p.assumptions).join(',') === wanted);
    return found ? found.id : null;
}

/** Python keywords cannot be used as variable names. */
export const PYTHON_KEYWORDS = new Set([
    'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue',
    'def', 'del', 'elif', 'else', 'except', 'finally', 'for', 'from', 'global', 'if', 'import',
    'in', 'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try', 'while',
    'with', 'yield'
]);
