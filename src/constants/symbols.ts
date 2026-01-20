
export interface SymbolItem {
    name: string;
    latex: string;
    code: string;
    description?: string;
}

export interface SymbolCategory {
    category: string;
    items: SymbolItem[];
}

export const SYMBOL_CATEGORIES: SymbolCategory[] = [
    {
        category: 'Constants',
        items: [
            { name: 'Pi', latex: '\\pi', code: 'pi', description: 'Ratio of circle circumference to diameter' },
            { name: 'Euler\'s Number', latex: 'e', code: 'E', description: 'Base of natural logarithm' },
            { name: 'Imaginary Unit', latex: 'i', code: 'I', description: 'Square root of -1' },
            { name: 'Infinity', latex: '\\infty', code: 'oo', description: 'Positive infinity' },
            { name: 'Complex Infinity', latex: '\\tilde{\\infty}', code: 'zoo', description: 'Complex infinity' },
            { name: 'NaN', latex: '\\text{NaN}', code: 'nan', description: 'Not a Number' },
            { name: 'Euler-Mascheroni', latex: '\\gamma', code: 'EulerGamma', description: 'Euler-Mascheroni constant' },
            { name: 'Golden Ratio', latex: '\\phi', code: 'GoldenRatio', description: 'Golden Ratio' },
        ]
    },
    {
        category: 'Basic Math',
        items: [
            { name: 'Square Root', latex: '\\sqrt{\\square}', code: 'sqrt', description: 'Square root function' },
            { name: 'Rational', latex: '\\frac{a}{b}', code: 'Rational', description: 'Exact rational number' },
            { name: 'Absolute', latex: '|x|', code: 'Abs', description: 'Absolute value' },
            { name: 'Factorial', latex: 'n!', code: 'factorial', description: 'Factorial function' },
            { name: 'Exponential', latex: 'e^x', code: 'exp', description: 'Exponential function' },
            { name: 'Natural Log', latex: '\\ln', code: 'log', description: 'Natural logarithm' },
            { name: 'Sine', latex: '\\sin', code: 'sin', description: 'Sine function' },
            { name: 'Cosine', latex: '\\cos', code: 'cos', description: 'Cosine function' },
            { name: 'Tangent', latex: '\\tan', code: 'tan', description: 'Tangent function' },
        ]
    },
    {
        category: 'Calculus',
        items: [
            { name: 'Integral', latex: '\\int', code: 'Integral', description: 'Symbolic Integral' },
            { name: 'Derivative', latex: '\\frac{d}{dx}', code: 'Derivative', description: 'Symbolic Derivative' },
            { name: 'Limit', latex: '\\lim', code: 'Limit', description: 'Limit of a function' },
            { name: 'Summation', latex: '\\sum', code: 'Sum', description: 'Summation' },
            { name: 'Product', latex: '\\prod', code: 'Product', description: 'Product sequence' },
        ]
    },
    {
        category: 'Linear Algebra',
        items: [
            { name: 'Matrix', latex: '\\begin{bmatrix}\\cdots\\end{bmatrix}', code: 'Matrix', description: 'Create a matrix' },
            { name: 'Identity', latex: 'I', code: 'eye', description: 'Identity matrix' },
            { name: 'Zeros', latex: 'O', code: 'zeros', description: 'Zero matrix' },
            { name: 'Ones', latex: 'J', code: 'ones', description: 'Matrix of ones' },
            { name: 'Determinant', latex: '\\det', code: 'det', description: 'Matrix determinant' },
        ]
    },
    {
        category: 'Logic & Relations',
        items: [
            { name: 'Equal', latex: '=', code: 'Eq', description: 'Equality relation' },
            { name: 'Not Equal', latex: '\\neq', code: 'Ne', description: 'Inequality relation' },
            { name: 'Greater', latex: '>', code: '>', description: 'Greater than' },
            { name: 'Less', latex: '<', code: '<', description: 'Less than' },
            { name: 'Greater Eq', latex: '\\ge', code: '>=', description: 'Greater than or equal' },
            { name: 'Less Eq', latex: '\\le', code: '<=', description: 'Less than or equal' },
            { name: 'And', latex: '\\land', code: '&', description: 'Logical AND' },
            { name: 'Or', latex: '\\lor', code: '|', description: 'Logical OR' },
            { name: 'Not', latex: '\\neg', code: '~', description: 'Logical NOT' },
            { name: 'Implies', latex: '\\implies', code: '>>', description: 'Logical Implication' },
        ]
    },
    {
        category: 'Sets',
        items: [
            { name: 'Integers', latex: '\\mathbb{Z}', code: 'S.Integers', description: 'Set of all integers' },
            { name: 'Reals', latex: '\\mathbb{R}', code: 'S.Reals', description: 'Set of all real numbers' },
            { name: 'Naturals', latex: '\\mathbb{N}', code: 'S.Naturals', description: 'Set of natural numbers' },
            { name: 'Complexes', latex: '\\mathbb{C}', code: 'S.Complexes', description: 'Set of complex numbers' },
            { name: 'Empty Set', latex: '\\emptyset', code: 'S.EmptySet', description: 'The empty set' },
            { name: 'Boolean True', latex: '\\text{True}', code: 'True', description: 'Boolean True' },
            { name: 'Boolean False', latex: '\\text{False}', code: 'False', description: 'Boolean False' },
        ]
    }
];
