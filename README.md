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

## Running with Python (Static Hosting)

If you prefer to use Python for hosting (e.g., in an environment where you don't want to keep Node.js running), you can serve the production build using Python's built-in HTTP server.

### 1. Build the project (Requires Node.js once)
First, generate the static files:
```bash
npm run build
```
This creates a `dist` directory with all necessary files.

### 2. Start the Python Server
Navigate to the `dist` directory and start the server:
```bash
cd dist
python -m http.server 8000
```
Then open `http://localhost:8000` in your browser.

> [!TIP]
> This method is ideal for quick demonstrations or local sharing without the overhead of a development server.

### 3. Python-only Deployment (No Node.js on Server)
If you are deploying to a server that only has Python, you can simply upload the contents of the `dist` folder to that server and run the command above. The application itself runs entirely in the client's browser, so the server only needs to provide the static files.

### 4. Access the Notebook
1. Open your web browser and navigate to the address shown (usually `http://localhost:8000`).
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

## Disclaimer (免責事項)

本ソフトウェアは、「現状のまま（AS IS）」提供されるものであり、明示または黙示を問わず、商品性、特定の目的への適合性、および権利侵害がないことの保証を含め、いかなる保証も行いません。
本ソフトウェアの使用（計算結果の利用を含む）に起因して、ユーザーまたは第三者に生じた損害（直接的、間接的、偶発的、特別、懲罰的、結果的損害を含むがこれに限られない）について、著作権者および開発者は一切の責任を負いません。
ユーザーは、自己の責任において本ソフトウェアを使用するものとします。特に、構造計算、化学反応予測、金融取引などのクリティカルな用途においては、必ず専門家による検証を経てから利用してください。

## Terms of Use (利用規約)

1.  **合法的な利用**: 本ソフトウェアを、法令に違反する目的、または公序良俗に反する目的（マルウェアの作成、サイバー攻撃の試行、違法な取引の計算などを含む）で使用することを禁止します。
2.  **プラットフォームの保護**: 本ソフトウェア上で、仮想通貨のマイニングや、ホスティングサーバー（GitHub Pages等）に過度な負荷をかけるスクリプトを実行することを禁止します。

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
