import { describe, expect, it } from 'vitest';
import { matchPresetId, toggleAssumption } from './assumptions';

describe('toggleAssumption', () => {
    it('enables and disables a key', () => {
        const on = toggleAssumption({}, 'real');
        expect(on).toEqual({ real: true });
        expect(toggleAssumption(on, 'real')).toEqual({});
    });

    it.each([
        ['positive', { negative: true, nonpositive: true }, { positive: true }],
        ['negative', { positive: true, nonnegative: true }, { negative: true }],
        ['nonnegative', { negative: true }, { nonnegative: true }],
        ['nonpositive', { positive: true }, { nonpositive: true }],
    ])('enabling %s removes what SymPy would reject', (key, before, after) => {
        expect(toggleAssumption(before, key)).toEqual(after);
    });

    it('keeps unrelated assumptions', () => {
        expect(toggleAssumption({ integer: true }, 'positive')).toEqual({ integer: true, positive: true });
    });

    it('does not mutate its input', () => {
        const before = { positive: true };
        toggleAssumption(before, 'negative');
        expect(before).toEqual({ positive: true });
    });
});

describe('matchPresetId', () => {
    const presets = [
        { id: 'positive', assumptions: { positive: true } },
        { id: 'positive_integer', assumptions: { integer: true, positive: true } },
        { id: 'unconstrained', assumptions: {} },
    ];

    it('prefers the exact match', () => {
        expect(matchPresetId({ integer: true, positive: true }, presets)).toBe('positive_integer');
        expect(matchPresetId({ positive: true }, presets)).toBe('positive');
    });

    it('matches the empty set to unconstrained, ignoring false values', () => {
        expect(matchPresetId({}, presets)).toBe('unconstrained');
        expect(matchPresetId({ negative: false }, presets)).toBe('unconstrained');
    });

    it('returns null for combinations without a preset', () => {
        expect(matchPresetId({ real: true, nonzero: true }, presets)).toBeNull();
    });
});
