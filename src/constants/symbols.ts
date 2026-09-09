import { type LucideIcon } from 'lucide-react';

export interface SymbolItem {
    name: string;
    latex: string;
    code: string;
    description?: string;
    icon?: LucideIcon;
    label?: string;
    colSpan?: number;
}

export interface SymbolCategory {
    category: string;
    items: SymbolItem[];
    layout?: 'grid' | 'wide';
}

export const SYMBOL_CATEGORIES: SymbolCategory[] = [
    {
        category: 'Constants',
        items: [
            { name: 'Pi', latex: '\\pi', code: 'pi', description: 'Ratio of circle circumference to diameter' },
            { name: 'Euler\'s Number', latex: 'e', code: 'E', description: 'Base of natural logarithm (E)' },
            { name: 'Imaginary Unit', latex: 'i', code: 'I', description: 'Square root of -1 (I)' },
            { name: 'Infinity', latex: '\\infty', code: 'oo', description: 'Positive infinity (oo)' },
        ]
    },
    {
        category: 'Basic Math',
        items: [
            { name: 'Square Root', latex: '\\sqrt{\\square}', code: 'sqrt()', description: 'Square root function' },
            { name: 'Absolute', latex: '|x|', code: 'Abs()', description: 'Absolute value' },
            { name: 'Rational', latex: '\\frac{a}{b}', code: 'Rational()', description: 'Exact rational number' },
            { name: 'Exponential', latex: 'e^x', code: 'exp()', description: 'Exponential function' },
            { name: 'Natural Log', latex: '\\ln', code: 'log()', description: 'Natural logarithm' },
            { name: 'Numerical', latex: 'N', code: 'N()', description: 'Numerical Evaluation' },
            { name: 'Sine', latex: '\\sin', code: 'sin()', description: 'Sine function' },
            { name: 'Cosine', latex: '\\cos', code: 'cos()', description: 'Cosine function' },
            { name: 'Tangent', latex: '\\tan', code: 'tan()', description: 'Tangent function' },
            { name: 'ArcSine', latex: '\\sin^{-1}', code: 'asin()', description: 'Inverse Sine' },
            { name: 'ArcCosine', latex: '\\cos^{-1}', code: 'acos()', description: 'Inverse Cosine' },
            { name: 'ArcTangent', latex: '\\tan^{-1}', code: 'atan()', description: 'Inverse Tangent' },
        ]
    },
    {
        category: 'Algebra',
        layout: 'wide',
        items: [
            { name: 'Solve', latex: 'Solve', code: 'solve()', description: 'Solve equations', label: 'Solve' },
            { name: 'Simplify', latex: 'Simplify', code: 'simplify()', description: 'Simplify expression', label: 'Simplify' },
            { name: 'Expand', latex: 'Expand', code: 'expand()', description: 'Expand expression', label: 'Expand' },
            { name: 'Factor', latex: 'Factor', code: 'factor()', description: 'Factor expression', label: 'Factor' },
        ]
    },
    {
        category: 'Calculus',
        layout: 'wide',
        items: [
            {
                name: 'Indefinite Integral',
                latex: '\\int f(x)\\,dx',
                code: 'integrate(${1:x**2}, ${2:x})',
                description: 'Indefinite integral: integrate(expr, var)'
            },
            {
                name: 'Definite Integral',
                latex: '\\int_a^b f(x)\\,dx',
                code: 'integrate(${1:x**2}, (${2:x}, ${3:0}, ${4:1}))',
                description: 'Definite integral: integrate(expr, (var, lower, upper))'
            },
            {
                name: 'Derivative',
                latex: '\\frac{d}{dx}',
                code: 'diff(${1:x**2}, ${2:x})',
                description: 'Derivative: diff(expr, var)'
            },
            {
                name: 'Limit',
                latex: '\\lim',
                code: 'limit(${1:sin(x)/x}, ${2:x}, ${3:0})',
                description: 'Limit: limit(expr, var, target)'
            },
            {
                name: 'Summation',
                latex: '\\sum',
                code: 'summation(${1:k}, (${2:k}, ${3:1}, ${4:n}))',
                description: 'Summation: summation(expr, (var, lower, upper))'
            },
            {
                name: 'Diff Eq',
                latex: 'y\'=y',
                code: 'dsolve(${1:f(x).diff(x) - f(x)}, ${2:f(x)})',
                description: 'Solve differential equation'
            },
            {
                name: 'Series',
                latex: '\\sum c_n x^n',
                code: 'series(${1:sin(x)}, ${2:x}, ${3:0}, ${4:6})',
                description: 'Series expansion around 0'
            },
        ]
    },
    {
        category: 'Linear Algebra',
        items: [
            { name: 'Matrix', latex: '\\begin{bmatrix}a & b\\\\ c & d\\end{bmatrix}', code: 'Matrix([[1, 2], [3, 4]])', description: 'Create 2x2 matrix', colSpan: 2 },
            { name: 'Identity', latex: 'I', code: 'eye()', description: 'Identity matrix: eye(size)' },
            { name: 'Determinant', latex: '\\det', code: 'det()', description: 'Matrix determinant' },
        ]
    },
    {
        category: 'Special Functions',
        items: [
            { name: 'Factorial', latex: 'n!', code: 'factorial()', description: 'Factorial function' },
            { name: 'Binomial', latex: '\\binom{n}{k}', code: 'binomial()', description: 'Binomial coefficient' },
            { name: 'GCD', latex: '\\text{gcd}', code: 'gcd()', description: 'Greatest Common Divisor', label: 'GCD' },
            { name: 'LCM', latex: '\\text{lcm}', code: 'lcm()', description: 'Least Common Multiple', label: 'LCM' },
            { name: 'Ceiling', latex: '\\lceil x \\rceil', code: 'ceiling()', description: 'Ceiling function' },
            { name: 'Floor', latex: '\\lfloor x \\rfloor', code: 'floor()', description: 'Floor function' },
        ]
    },
    {
        category: 'Variable Range & Assumptions',
        layout: 'wide',
        items: [
            { name: 'Positive Symbol', latex: 'x > 0', code: "x = symbols('x', positive=True)", description: 'Positive real symbol (x > 0)', label: 'x > 0 (Positive)' },
            { name: 'Non-negative Symbol', latex: 'x \\ge 0', code: "x = symbols('x', nonnegative=True)", description: 'Non-negative real symbol (x >= 0)', label: 'x ≥ 0 (Non-negative)' },
            { name: 'Real Symbol', latex: 'x \\in \\mathbb{R}', code: "x = symbols('x', real=True)", description: 'Real symbol (x in R)', label: 'x ∈ ℝ (Real)' },
            { name: 'Integer Symbol', latex: 'n \\in \\mathbb{Z}', code: "n = symbols('n', integer=True)", description: 'Integer symbol (n in Z)', label: 'n ∈ ℤ (Integer)' },
            { name: 'Natural Symbol', latex: 'n \\in \\mathbb{N}', code: "n = symbols('n', integer=True, positive=True)", description: 'Natural number symbol (n > 0, integer)', label: 'n ∈ ℕ (Natural)' },
            { name: 'Non-zero Symbol', latex: 'x \\ne 0', code: "x = symbols('x', nonzero=True)", description: 'Non-zero symbol (x != 0)', label: 'x ≠ 0 (Non-zero)' },
        ]
    }
];
