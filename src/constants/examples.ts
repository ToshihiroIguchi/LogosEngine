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
diff(sin(x)*exp(x), x)

# Integration
integrate(exp(-x**2), (x, -oo, oo))

# Limit
limit(sin(x)/x, x, 0)`
    },
    {
        title: "Algebra & Equations",
        code: `# Solve quadratic equation
solve(x**2 - x - 1, x)

# Solve system of linear equations
solve([x + y - 2, 2*x - y - 1], [x, y])`
    },
    {
        title: "Differential Equations",
        code: `# Solve Ordinary Differential Equation (ODE)
# y'' - y = e^x
f = Function('f')
dsolve(Derivative(f(x), x, x) - f(x) - exp(x), f(x))`
    },
    {
        title: "Matrix Operations",
        code: `M = Matrix([[1, 2], [2, 1]])

# Eigenvalues
M.eigenvals()

# Eigenvectors
M.eigenvects()

# Determinant & Inverse
(M.det(), M.inv())`
    },
    {
        title: "Number Theory",
        code: `# Prime factorization
factorint(2026)

# Check if prime
isprime(2027)

# Next prime after
nextprime(100)`
    },
    {
        title: "2D Plotting",
        code: `# Standard Plot
plot(sin(x), cos(x), (x, -2*pi, 2*pi))

# Parametric Plot (Circle)
# (x(u), y(u))
plot((cos(x), sin(x)), (x, 0, 2*pi))`
    },
    {
        title: "3D Surface Plot",
        code: `# 3D Surface Plot: Sombrero
r = sqrt(x**2 + y**2)
plot3d(sin(r)/r, (x, -10, 10), (y, -10, 10), points=80)`
    },
    {
        title: "Series Expansion",
        code: `# Taylor Series
series(tan(x), x, 0, 6)

# Laurent Series
series(1/sin(x), x, 0, 4)`
    },
    {
        title: "Simplification",
        code: `# Simplify
simplify(sin(x)**2 + cos(x)**2)

# Expand
expand((x + 1)**5)

# Factor
factor(x**3 - x**2 + x - 1)`
    },
    {
        title: "Complex Numbers",
        code: `# Euler's Identity check
N(exp(I*pi) + 1)

# Complex operations
z = 3 + 4*I
(abs(z), arg(z))`
    }
];
