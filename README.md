# Logos Engine

**Scientific Computing, Reimagined for the Web.**

A powerful, privacy-first computational notebook that runs entirely in your browser. Powered by WebAssembly.

🚀 **[Live Demo](https://logosengine.tosihihiroiguchigithub.workers.dev/)**

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Python](https://img.shields.io/badge/python-3.11-yellow.svg)
![React](https://img.shields.io/badge/react-19-cyan.svg)
![WASM](https://img.shields.io/badge/WASM-Powered-orange.svg)

---

## Why Logos Engine?

### 🔒 Privacy First & Offline Capable
Logos Engine runs **100% on your device**. Thanks to Pyodide (Python compiled to WebAssembly), your code and data never leave your browser. No server connection is required for calculation, ensuring your data remains private and secure.

### ✨ Zero Setup
Forget about managing Python environments, piping dependencies, or server configurations. Logos Engine delivers a full scientific stack (SymPy, NumPy, Matplotlib) instantly in any modern web browser.

### 🎨 Modern & Intuitive UX
Built with **React 19** and **Tailwind CSS 4**, featuring a carefully crafted UI with:
- **Symbol Sidebars**: Quick insertion of mathematical symbols and functions.
- **Documentation Search**: Instant access to SymPy documentation.
- **Variable Inspector**: Real-time tracking of defined variables.

## Features

- **Symbolic Mathematics**: Solve equations, differentiate, integrate, and manipulate algebraic expressions using the full power of **SymPy**.
- **High-Quality Plotting**: Generate scientific-grade visualization with **Matplotlib**.
- **Intelligent Notebook**: A familiar cell-based interface that supports auto-execution and comfortable editing.
- **Persistent Sessions**: Your work is saved automatically.


## Usage Examples

### 1. Calculus
Use `diff` for derivatives and `integrate` for integrals.

```python
# Derivative of a composite function
diff(sin(x**2) * exp(x), x)
# Output: (2*x*sin(x**2) + 2*x**2*cos(x**2))*exp(x)

# Definite Integral
integrate(exp(-x**2), (x, -oo, oo))
# Output: sqrt(pi)
```

### 2. Linear Algebra
Perform advanced matrix operations effortlessly.

```python
# Eigenvalues of a matrix
M = Matrix([[1, 2], [2, 1]])
M.eigenvals()
# Output: {-1: 1, 3: 1} (Eigenvalue: Multiplicity)
```

### 3. Differential Equations
Solve ordinary differential equations (ODEs).

```python
# Solve f''(x) + 9f(x) = 0
f = symbols('f', cls=Function)
dsolve(f(x).diff(x, x) + 9*f(x), f(x))
# Output: C1*sin(3*x) + C2*cos(3*x)
```

### 4. Advanced Simplification
Simplify complex trigonometric or algebraic expressions.

```python
expr = sin(x)**2 + cos(x)**2
simplify(expr)
# Output: 1
```

## Local Development Setup

To run Logos Engine locally or contribute to development:

### Prerequisites
- **Node.js**: v18+
- **npm**

### Quick Start
1.  **Clone**:
    ```bash
    git clone https://github.com/ToshihiroIguchi/LogosEngine.git
    cd LogosEngine
    ```
2.  **Install**:
    ```bash
    npm install
    ```
3.  **Run**:
    ```bash
    npm run dev
    ```
    Access at `http://localhost:5173`.

### Static Serving (Python)
You can also build the project and serve it using Python only:
```bash
npm run build
python serve.py
# Access at http://localhost:8300
```

## Technology Stack

- **Core**: TypeScript, WebAssembly (WASM)
- **Frontend**: React 19, Vite, Tailwind CSS 4
- **Conversion**: Pyodide (CPython 3.11 port to WASM)
- **Math Engine**: SymPy (Python)
- **Rendering**: KaTeX (LaTeX rendering), Canvas API

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Disclaimer

This software is provided "AS IS" without warranty of any kind. Users use this software at their own risk. For critical applications, please ensure verification by experts.
