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
            { name: 'Euler\'s Number', latex: 'e', code: 'E', description: 'Base of natural logarithm' },
            { name: 'Imaginary Unit', latex: 'i', code: 'I', description: 'Square root of -1' },
            { name: 'Infinity', latex: '\\infty', code: 'oo', description: 'Positive infinity' },
            { name: 'Euler-Mascheroni', latex: '\\gamma', code: 'EulerGamma', description: 'Euler-Mascheroni constant' },
            { name: 'Golden Ratio', latex: '\\phi', code: 'GoldenRatio', description: 'Golden Ratio' },
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
            { name: 'Sine', latex: '\\sin', code: 'sin()', description: 'Sine function' },
            { name: 'Cosine', latex: '\\cos', code: 'cos()', description: 'Cosine function' },
            { name: 'Tangent', latex: '\\tan', code: 'tan()', description: 'Tangent function' },
            { name: 'ArcSine', latex: '\\sin^{-1}', code: 'asin()', description: 'Inverse Sine' },
            { name: 'ArcCosine', latex: '\\cos^{-1}', code: 'acos()', description: 'Inverse Cosine' },
            { name: 'ArcTangent', latex: '\\tan^{-1}', code: 'atan()', description: 'Inverse Tangent' },
            { name: 'Sinh', latex: '\\sinh', code: 'sinh()', description: 'Hyperbolic Sine' },
            { name: 'Cosh', latex: '\\cosh', code: 'cosh()', description: 'Hyperbolic Cosine' },
            { name: 'Tanh', latex: '\\tanh', code: 'tanh()', description: 'Hyperbolic Tangent' },
            { name: 'Numerical', latex: 'N', code: 'N()', description: 'Numerical Evaluation' },
            { name: 'Degrees', latex: '^\\circ', code: 'deg', description: 'Convert to degrees' },
            { name: 'Radians', latex: 'rad', code: 'rad', description: 'Convert to radians' },
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
        items: [
            { name: 'Integral', latex: '\\int', code: 'Integral()', description: 'Symbolic Integral' },
            { name: 'Derivative', latex: '\\frac{d}{dx}', code: 'Derivative()', description: 'Symbolic Derivative' },
            { name: 'Limit', latex: '\\lim', code: 'Limit()', description: 'Limit of a function' },
            { name: 'Summation', latex: '\\sum', code: 'Sum()', description: 'Summation' },
            { name: 'Product', latex: '\\prod', code: 'Product()', description: 'Product sequence' },
            { name: 'Diff Eq', latex: 'y\'=y', code: 'dsolve()', description: 'Solve differential equation', colSpan: 2 },
            { name: 'Series', latex: '\\sum c_n x^n', code: 'series()', description: 'Series expansion', colSpan: 2 },
        ]
    },
    {
        category: 'Linear Algebra',
        items: [
            { name: 'Matrix', latex: '\\begin{bmatrix}\\cdots\\end{bmatrix}', code: 'Matrix()', description: 'Create a matrix' },
            { name: 'Identity', latex: 'I', code: 'eye()', description: 'Identity matrix' },
            { name: 'Zeros', latex: 'O', code: 'zeros()', description: 'Zero matrix' },
            { name: 'Ones', latex: 'J', code: 'ones()', description: 'Matrix of ones' },
            { name: 'Determinant', latex: '\\det', code: 'det()', description: 'Matrix determinant' },
            { name: 'Inverse', latex: 'A^{-1}', code: '.inv()', description: 'Matrix inverse' },
            { name: 'Transpose', latex: 'A^T', code: '.T', description: 'Matrix Transpose' },
            { name: 'Eigenvals', latex: '\\lambda', code: '.eigenvals()', description: 'Eigenvalues' },
        ]
    },
    {
        category: 'Discrete Math',
        items: [
            { name: 'GCD', latex: '\\text{gcd}', code: 'gcd()', description: 'Greatest Common Divisor', label: 'GCD' },
            { name: 'LCM', latex: '\\text{lcm}', code: 'lcm()', description: 'Least Common Multiple', label: 'LCM' },
            { name: 'Binomial', latex: '\\binom{n}{k}', code: 'binomial()', description: 'Binomial coefficient' },
            { name: 'Factorial', latex: 'n!', code: 'factorial()', description: 'Factorial function' },
        ]
    },
    {
        category: 'Logic & Sets',
        items: [
            { name: 'Equal', latex: '=', code: 'Eq()', description: 'Equality relation' },
            { name: 'Not Equal', latex: '\\neq', code: 'Ne()', description: 'Inequality relation' },
            { name: 'Greater', latex: '>', code: '>', description: 'Greater than' },
            { name: 'Less', latex: '<', code: '<', description: 'Less than' },
            { name: 'Greater Eq', latex: '\\ge', code: '>=', description: 'Greater than or equal' },
            { name: 'Less Eq', latex: '\\le', code: '<=', description: 'Less than or equal' },
            { name: 'And', latex: '\\land', code: '&', description: 'Logical AND' },
            { name: 'Or', latex: '\\lor', code: '|', description: 'Logical OR' },
            { name: 'Not', latex: '\\neg', code: '~', description: 'Logical NOT' },
            { name: 'Implies', latex: '\\implies', code: '>>', description: 'Logical Implication' },
            { name: 'Integers', latex: '\\mathbb{Z}', code: 'S.Integers', description: 'Set of all integers' },
            { name: 'Reals', latex: '\\mathbb{R}', code: 'S.Reals', description: 'Set of all real numbers' },
            { name: 'Naturals', latex: '\\mathbb{N}', code: 'S.Naturals', description: 'Set of natural numbers' },
            { name: 'Complexes', latex: '\\mathbb{C}', code: 'S.Complexes', description: 'Set of complex numbers' },
            { name: 'Empty Set', latex: '\\emptyset', code: 'S.EmptySet', description: 'The empty set' },
        ]
    }
];
