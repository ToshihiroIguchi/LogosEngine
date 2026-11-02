import { describe, expect, it } from 'vitest';
import { transpileCode } from './exportUtils';

const normalize = (s: string) => s.replace(/\s+/g, '');

const cases: Array<[string, string]> = [
    ['solve(x=1)', 'solve(Eq(x, 1))'],
    ['solve(x+1=0)', 'solve(Eq(x+1, 0))'],
    ['solve(x, check=True)', 'solve(x, check=True)'],
    ['nsolve(x=y, z)', 'nsolve(Eq(x, y), z)'],
    ['dsolve(f(x).diff(x) = x)', 'dsolve(Eq(f(x).diff(x), x))'],
    ['solve(x=1, y=2)', 'solve(Eq(x, 1), Eq(y, 2))'],
    ['plot(x**2)', 'plot(x**2)'],
    ['func(x=1)', 'func(x=1)'],
    // Caret exponentiation
    ['2^3', '2**3'],
    ['2.5^2', '2.5**2'],
    ['x^2 + 2*x + 1', 'x**2 + 2*x + 1'],
    ['x ^= 2', 'x **= 2'],
    ['solve(x^2 = 4)', 'solve(Eq(x**2, 4))'],
    ['nsolve(x = y^2, z)', 'nsolve(Eq(x, y**2), z)'],
    // Comment and string literal safety
    ['# solve(x=1)\nsolve(x=1)', '# solve(x=1)\nsolve(Eq(x, 1))'],
    ['# 2^3 is power\n2^3', '# 2^3 is power\n2**3'],
    ['msg = "solve(x=1)"', 'msg = "solve(x=1)"'],
    ['msg = "2^3"', 'msg = "2^3"'],
    ["'''solve(x=1)'''", "'''solve(x=1)'''"],
    ["'''2^3'''", "'''2^3'''"],
    ['"""solve(x=1)"""', '"""solve(x=1)"""'],
    ['"""2^3"""', '"""2^3"""'],
];

describe('transpileCode', () => {
    it.each(cases)('%j', (input, expected) => {
        expect(normalize(transpileCode(input))).toBe(normalize(expected));
    });
});

// Regression tests for known bugs (H6, H7, M1). These fail until fixed.
describe('transpileCode known bugs', () => {
    it('H6: keeps dsolve ics keyword argument', () => {
        const out = transpileCode('dsolve(f(x).diff(x) - f(x), f(x), ics={f(0): 1})');
        expect(normalize(out)).toBe(normalize('dsolve(f(x).diff(x) - f(x), f(x), ics={f(0): 1})'));
    });

    it('H6: keeps nsolve prec/tol keyword arguments', () => {
        const out = transpileCode('nsolve(x**2 - 2, x, 1, prec=30, tol=1e-10)');
        expect(normalize(out)).toBe(normalize('nsolve(x**2 - 2, x, 1, prec=30, tol=1e-10)'));
    });

    it('H7: converts equations inside a list argument', () => {
        const out = transpileCode('solve([x+y=1, x-y=2])');
        expect(normalize(out)).toBe(normalize('solve([Eq(x+y, 1), Eq(x-y, 2)])'));
    });

    it('M1: does not touch method calls named solve', () => {
        const out = transpileCode('obj.solve(a=1)');
        expect(normalize(out)).toBe(normalize('obj.solve(a=1)'));
    });

    it('M1: ignores parentheses inside string literals', () => {
        const out = transpileCode('solve(x = 1, msg=")")');
        expect(out).toContain('")"');
        expect(out).toContain('Eq(x, 1)');
    });
});
