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

export type ExampleCategory = {
    category: string;
    items: {
        title: string;
        code: string;
        description?: string;
    }[];
};

export const EXAMPLES: ExampleCategory[] = [
    {
        category: "Analysis",
        items: [
            {
                title: "Differentiation",
                code: `# Differentiation of a composite function
diff(sin(x)*exp(-x), x)`
            },
            {
                title: "Integration",
                code: `# Indefinite Integration
integrate(1/(1 + x**2), x)

# Definite Integration (Gaussian integral)
integrate(exp(-x**2), (x, -oo, oo))`
            },
            {
                title: "Limits",
                code: `# Limit at zero
limit(sin(x)/x, x, 0)

# Limit at infinity
limit((1 + 1/x)**x, x, oo)`
            },
            {
                title: "Series Expansion",
                code: `# Taylor Series
series(tan(x), x, 0, 6)

# Laurent Series
series(1/sin(x), x, 0, 4)`
            }
        ]
    },
    {
        category: "Linear Algebra",
        items: [
            {
                title: "Matrix Operations",
                code: `# Define Matrices
A = Matrix([[1, 2], [3, 4]])
B = Matrix([[2, 0], [0, 2]])

# Addition and Multiplication
(A + B, A * B)`
            },
            {
                title: "Eigenvalues & Vectors",
                code: `M = Matrix([[1, 2], [2, 1]])

# Eigenvalues
M.eigenvals()

# Eigenvectors
M.eigenvects()`
            },
            {
                title: "Determinant & Inverse",
                code: `M = Matrix([[1, 2], [3, 4]])
(M.det(), M.inv())`
            }
        ]
    },
    {
        category: "Differential Equations",
        items: [
            {
                title: "1st Order ODE",
                code: `# Solve y' + y = e^x
f = Function('f')
dsolve(Derivative(f(x), x) + f(x) - exp(x), f(x))`
            },
            {
                title: "2nd Order ODE",
                code: `# Solve Damped Harmonic Oscillator: y'' + 2y' + y = 0
f = Function('f')
dsolve(Derivative(f(x), x, x) + 2*Derivative(f(x), x) + f(x), f(x))`
            },
            {
                title: "System of ODEs",
                code: `# Solve system: x' = y, y' = -x
x_func = Function('x')
y_func = Function('y')
dsolve([Derivative(x_func(t), t) - y_func(t), Derivative(y_func(t), t) + x_func(t)])`
            }
        ]
    },
    {
        category: "Vector Analysis",
        items: [
            {
                title: "Vector Fields",
                code: `# Define a coordinate system and vector field
C = CoordSys3D('C')
v = C.x*C.i + C.y*C.j + C.z*C.k

# Divergence
divergence(v)`
            }
        ]
    },
    {
        category: "Discrete Math",
        items: [
            {
                title: "Number Theory",
                code: `# Prime factorization
factorint(2026)

# Primality Test
isprime(2**31 - 1)`
            }
        ]
    },
    {
        category: "Plotting",
        items: [
            {
                title: "2D Plot",
                code: `# Plot with range and style
plot(sin(x), cos(x), (x, -2*pi, 2*pi), title='Trigonometric Functions')`
            },
            {
                title: "3D Surface (Sombrero)",
                code: `# Sombrero Function
r = sqrt(x**2 + y**2)
plot3d(sin(r)/r, (x, -10, 10), (y, -10, 10), points=80)`
            },
            {
                title: "Parametric Plot",
                code: `# Butterfly Curve (Parametric 2D)
u = symbols('u')
plot_parametric(
    sin(u)*(exp(cos(u)) - 2*cos(4*u) - sin(u/12)**5),
    cos(u)*(exp(cos(u)) - 2*cos(4*u) - sin(u/12)**5),
    (u, 0, 12*pi)
)`
            },
            {
                title: "Klein Bottle",
                code: `# Klein Bottle (Figure-8 Immersion)
u, v = symbols('u v')
plot3d_parametric_surface(
    (2 + cos(u/2)*sin(v) - sin(u/2)*sin(2*v)) * cos(u),
    (2 + cos(u/2)*sin(v) - sin(u/2)*sin(2*v)) * sin(u),
    sin(u/2)*sin(v) + cos(u/2)*sin(2*v),
    (u, 0, 2*pi), (v, 0, 2*pi)
)`
            }
        ]
    }
];
