export const WELCOME_CODE = `# Welcome to LogosEngine! 🚀
# A Mathematica-like computational notebook in your browser
# Press Shift+Enter to execute this cell

# Example: Differentiation
diff(sin(x), x)`;

export const EXAMPLES = [
    {
        title: "Basic Calculus",
        code: `# Differentiation
diff(sin(x), x)

# Integration
integrate(1/x, x)

# Definite integral
integrate(x**2, (x, 0, 1))`
    },
    {
        title: "Equation Solving",
        code: `# Solve algebraic equation
solve(x**2 - 4, x)

# Solve system of equations
solve([x + y - 2, x - y], [x, y])`
    },
    {
        title: "Series Expansion",
        code: `# Taylor series
series(exp(x), x, 0, 5)

# Laurent series
series(1/sin(x), x, 0, 3)`
    },
    {
        title: "Simplification",
        code: `# Simplify expression
simplify((x**2 + 2*x + 1)/(x + 1))

# Expand
expand((x + 1)**3)

# Factor
factor(x**2 - 4)`
    },
    {
        title: "Plotting",
        code: `# Simple plot
plot(sin(x))

# Multiple functions
plot(sin(x), cos(x))

# With range
plot(x**2, (x, -5, 5))`
    },
    {
        title: "Matrix Operations",
        code: `# Create matrix
M = Matrix([[1, 2], [3, 4]])

# Determinant
M.det()

# Inverse
M.inv()`
    },
    {
        title: "Limits",
        code: `# Limit
limit(sin(x)/x, x, 0)

# Limit at infinity
limit(1/x, x, oo)`
    },
    {
        title: "Symbolic Variables",
        code: `# Define new symbols
a, b, c = symbols('a b c')

# Solve quadratic formula
solve(a*x**2 + b*x + c, x)`
    }
];
