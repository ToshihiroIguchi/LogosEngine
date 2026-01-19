
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
            { name: 'Catalan', latex: 'G', code: 'Catalan', description: 'Catalan\'s constant' },
            { name: 'Golden Ratio', latex: '\\phi', code: 'GoldenRatio', description: 'Golden Ratio' },
        ]
    },
    {
        category: 'Sets',
        items: [
            { name: 'Integers', latex: '\\mathbb{Z}', code: 'S.Integers', description: 'Set of all integers' },
            { name: 'Reals', latex: '\\mathbb{R}', code: 'S.Reals', description: 'Set of all real numbers' },
            { name: 'Naturals', latex: '\\mathbb{N}', code: 'S.Naturals', description: 'Set of natural numbers' },
            { name: 'Naturals0', latex: '\\mathbb{N}_0', code: 'S.Naturals0', description: 'Set of natural numbers including 0' },
            { name: 'Complexes', latex: '\\mathbb{C}', code: 'S.Complexes', description: 'Set of complex numbers' },
            { name: 'Empty Set', latex: '\\emptyset', code: 'S.EmptySet', description: ' The empty set' },
            { name: 'Universal Set', latex: '\\mathbb{U}', code: 'S.UniversalSet', description: 'The universal set' },
        ]
    },
    {
        category: 'Logic',
        items: [
            { name: 'True', latex: '\\text{True}', code: 'true' },
            { name: 'False', latex: '\\text{False}', code: 'false' },
        ]
    }
];
