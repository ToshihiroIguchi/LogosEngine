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

## Pythonを使用したサーバーの起動 (静的ホスティング)

Node.js (npm) を常駐させたくない場合や、Python環境メインで利用したい場合は、ビルド済みの静的ファイルをPythonで配信できます。

### 1. ビルド (初回またはコード変更時のみ)
ソースコードをブラウザが解読できる形式に変換するため、一度だけNode.js環境でビルドを行います。
```bash
npm run build
```
これにより、公開用の全ファイルが `dist` フォルダに出力されます。

### 2. Pythonスクリプトによる起動 (推奨)
Windows環境などでJavaScriptファイルが正しく認識されない（MIMEタイプエラー）のを防ぐため、専用の起動スクリプトを用意しています。
```bash
python serve.py
```
実行後、ブラウザで `http://localhost:8300` を開いてください。

### 3. Python標準コマンドによる起動
スクリプトを使わず、標準のワンライナーでも起動可能です（`dist`内に移動して実行します）。
```bash
cd dist
python -m http.server 8300
```

### なぜPythonサーバーが便利なのか？
- **軽量**: Node.jsの重いプロセスを動かし続ける必要がありません。
- **ポータビリティ**: `dist` フォルダと `serve.py` さえあれば、PythonがインストールされているどのPCでも LogosEngine を動かせます。USBメモリに入れて持ち運ぶことも可能です。
- **デプロイの容易さ**: 公開サーバーがPythonのみをサポートしている場合でも、`dist` の中身をアップロードするだけで公開が完了します。

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
