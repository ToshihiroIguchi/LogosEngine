export const WELCOME_NOTEBOOK_DATA = [
    {
        type: 'code' as const,
        content: `# Welcome to LogosCalc!
# Press Shift + Enter (or the Play button) to run this cell.
# 'x', 'y', 'z', 't' are predefined symbolic variables.

expand((x + 1)**5)`
    },
    {
        type: 'code' as const,
        content: ``
    }
];

// Maintaining backward compatibility for a moment if needed, but Context will update to use DATA.
export const WELCOME_CODE = WELCOME_NOTEBOOK_DATA[1].content;

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
        title: "3D Surface Plot",
        code: `# 3D Surface Plot: Sombrero Function
from sympy.plotting import plot3d

# r is the distance from the origin
r = sqrt(x**2 + y**2)

# plot3d allows visualizing functions of two variables
# We use points=80 for a smooth mesh
plot3d(sin(r)/r, (x, -10, 10), (y, -10, 10), points=80)`
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
        title: "Plotting (2D)",
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
