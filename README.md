# LogosEngine

A Mathematica-like computational notebook that runs entirely in your browser using WebAssembly.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Python](https://img.shields.io/badge/python-3.11-blue.svg)
![React](https://img.shields.io/badge/react-19.2-blue.svg)

## Features

- **Symbolic Mathematics**: Powered by SymPy for differentiation, integration, equation solving, and more
- **Graphing**: Create plots using Matplotlib, rendered directly in the browser
- **Browser-Based**: No server required - runs completely in your browser using Pyodide (Python WASM)
- **Notebook Interface**: Familiar cell-based interface with execution history
- **Smart Execution Queue**: Start working immediately - code executes automatically when the engine is ready
- **Example Library**: 8 built-in code templates to help you get started

## Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/ToshihiroIguchi/LogosEngine.git
cd LogosEngine

# Install dependencies
npm install

# Start development server
npm run dev
```

Open http://localhost:5173/ in your browser.

### First Run

1. Wait for "Engine Ready" to appear (30-60 seconds on first load)
2. The welcome cell contains a sample calculation - press `Shift+Enter` to execute
3. Click the purple "Examples" button to explore more features

## Usage Examples

### Differentiation
```python
diff(sin(x), x)
# Output: cos(x)
```

### Integration
```python
integrate(1/x, x)
# Output: log(x)
```

### Plotting
```python
plot(sin(x))
# Displays a graph of sin(x)
```

### Equation Solving
```python
solve(x**2 - 4, x)
# Output: [-2, 2]
```

### Matrix Operations
```python
M = Matrix([[1, 2], [3, 4]])
M.det()
# Output: -2
```

## Keyboard Shortcuts

- `Shift+Enter` - Execute current cell
- `Ctrl+Enter` - Execute cell and stay in place

## Building for Production

```bash
# Create production build
npm run build

# Preview production build
npm run preview
```

The build output will be in the `dist/` directory.

## Technology Stack

- **Frontend**: React 19, TypeScript, Vite
- **Styling**: Tailwind CSS 4
- **Math Rendering**: KaTeX
- **Python Runtime**: Pyodide 0.29.0
- **Symbolic Math**: SymPy
- **Plotting**: Matplotlib

## Browser Compatibility

- Chrome/Edge 90+
- Firefox 88+
- Safari 15+

**Note**: Requires WebAssembly and Web Worker support.

## Architecture

LogosEngine uses a Web Worker architecture to run Python code without blocking the UI:

```
┌─────────────┐         ┌──────────────┐
│   React UI  │ ◄─────► │ Web Worker   │
│             │         │ (Pyodide)    │
└─────────────┘         └──────────────┘
      │                        │
      │                        ▼
      │                 ┌──────────────┐
      │                 │ SymPy        │
      │                 │ Matplotlib   │
      └────────────────►└──────────────┘
           Results
```

## License

MIT License - see LICENSE file for details

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Acknowledgments

- Built with [Pyodide](https://pyodide.org/)
- Powered by [SymPy](https://www.sympy.org/)
- Inspired by Mathematica and Jupyter Notebook
