# LogosEngine

A Mathematica-like computational notebook that runs entirely in your browser using WebAssembly.

🚀 **[Live Demo](https://logosengine.tosihihiroiguchigithub.workers.dev/)**

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

## Local Development Setup

To run LogosEngine on your local machine for development or personal use, follow these detailed steps.

### Prerequisites

- **Node.js**: Version 18.0 or higher is recommended.
- **npm**: Usually comes with Node.js.

### 1. Clone the Repository
Open your terminal and run:
```bash
git clone https://github.com/ToshihiroIguchi/LogosEngine.git
cd LogosEngine
```

### 2. Install Dependencies
Install the required React and build tool dependencies:
```bash
npm install
```

### 3. Start the Development Server
Launch the Vite development server:
```bash
npm run dev
```
By default, the application will be available at `http://localhost:5173/`.

## Serving with Python (Static Hosting)

If you prefer not to keep Node.js (npm) running, or if you primarily use a Python environment, you can serve the pre-built static files using Python.

### 1. Build (First time or after code changes)
The project must be built once in a Node.js environment to transform the source code into a browser-executable format.
```bash
npm run build
```
This will generate the production-ready files in the `dist` folder.

### 2. Serve using Python Script (Recommended)
We provide a dedicated serving script to prevent issues like MIME type errors (commonly seen on Windows where JavaScript files might be incorrectly served).
```bash
python serve.py
```
After running the script, open `http://localhost:8300` in your browser.

### 3. Serve using Standard Python Command
You can also serve the files using a standard one-liner (execute this from within the `dist` directory).
```bash
cd dist
python -m http.server 8300
```

### Why use a Python server?
- **Lightweight**: No need to keep heavy Node.js processes running.
- **Portability**: All you need are the `dist` folder and `serve.py`. LogosEngine can run on any PC with Python installed, even from a USB drive.
- **Ease of Deployment**: Even if your production server only supports Python, you can deploy by simply uploading the contents of the `dist` folder.

### 4. Access the Notebook
1. Open your web browser and navigate to the address shown (usually `http://localhost:8300`).
2. **Initialization**: On the first load, the app will download the Pyodide runtime and required Python packages (SymPy, Matplotlib). This can take 30-60 seconds depending on your connection.
3. **Engine Ready**: Once the status in the header changes to "Engine Ready", you can begin executing Python code.
4. **Execution**: Type your code in a cell and press `Shift+Enter` to run it.

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

## Disclaimer

This software is provided "AS IS" without warranty of any kind, express or implied, including but not limited to the warranties of merchantability, fitness for a particular purpose, and non-infringement. In no event shall the authors or copyright holders be liable for any claim, damages, or other liability, whether in an action of contract, tort, or otherwise, arising from, out of, or in connection with the software or the use or other dealings in the software (including but not limited to results of calculations).

Users use this software at their own risk. For critical applications such as structural calculations, chemical reaction predictions, or financial transactions, please ensure verification by experts before use.

## Terms of Use

1. **Legal Use**: It is prohibited to use this software for any purpose that violates laws or public order (including malware creation, cyberattacks, or calculations for illegal transactions).
2. **Platform Protection**: It is prohibited to use this software for cryptocurrency mining or running scripts that place an excessive load on hosting servers (e.g., GitHub Pages).

## License & Credits

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

### Third Party Libraries
This software uses the following open source libraries:

*   **Pyodide**: Licensed under the Mozilla Public License 2.0 (MPL 2.0).
*   **SymPy**: Licensed under the New BSD License.
*   **React**: Licensed under the MIT License.
*   **Vite**: Licensed under the MIT License.
*   **Tailwind CSS**: Licensed under the MIT License.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Acknowledgments

- Built with [Pyodide](https://pyodide.org/)
- Powered by [SymPy](https://www.sympy.org/)
- Inspired by Mathematica and Jupyter Notebook
