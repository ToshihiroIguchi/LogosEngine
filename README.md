# Logos Engine

**Scientific Computing, Reimagined for the Web.**

A powerful, privacy-first computational notebook that runs entirely in your browser. Powered by WebAssembly.

🚀 **[Live Demo](https://logosengine.tosihihiroiguchigithub.workers.dev/)**

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Python](https://img.shields.io/badge/python-3.13-yellow.svg)
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

## Run with Python Only (No Node.js)

`serve.py` starts a local web server using only the Python standard library. There is nothing to `pip install` and Node.js is not required.

### Requirements
- **Python 3.10+**
- **Internet access** the first time (and whenever the browser loads the Python engine): the site files are downloaded once, and the Pyodide runtime is fetched by the browser from the jsDelivr CDN.

### Quick Start
```bash
git clone https://github.com/ToshihiroIguchi/LogosEngine.git
cd LogosEngine
python serve.py --open
```
Then open `http://localhost:8300` (the `--open` flag does this for you). Stop the server with `Ctrl+C`.

On the first run, `serve.py` downloads the published site into `.site-cache/` (about 70 files, a few MB). Later runs reuse that copy and start instantly.

### Where the files are served from
`serve.py` picks the first match:

| Priority | Source | When it is used |
|---|---|---|
| 1 | `--dir PATH` | You pass a directory that contains `index.html` |
| 2 | `dist/` | You built the project yourself with `npm run build` |
| 3 | `.site-cache/` | Downloaded automatically from the published site |

### Options
| Option | Default | Description |
|---|---|---|
| `--port N` | `8300` | Port to listen on |
| `--host ADDR` | `127.0.0.1` | Address to bind. Use `0.0.0.0` to allow access from other machines on your network |
| `--cert FILE` / `--key FILE` | – | Serve over HTTPS with this PEM certificate and private key (both are required together) |
| `--open` | off | Open the page in your default browser |
| `--update` | off | Re-download the published site (refreshes `.site-cache/`) before serving |
| `--dir PATH` | – | Serve a specific directory instead |

Examples:
```bash
python serve.py --port 9000          # use another port
python serve.py --update             # get the latest version
python serve.py --dir ./dist         # serve your own build
python serve.py --host 0.0.0.0       # share on your LAN (plain HTTP)
python serve.py --host 0.0.0.0 --cert cert.pem --key key.pem   # share on your LAN over HTTPS
```

See [Sharing on your LAN](#sharing-on-your-lan) for details.

### Sharing on your LAN
Use `--host 0.0.0.0` to let phones, tablets, and other PCs on the same network open your server.

```bash
python serve.py --host 0.0.0.0
```
The server prints every address it can be reached at, for example:
```
Serving Logos Engine at http://localhost:8300/
  From other devices on the network: http://192.168.1.20:8300/
```
Open the printed `http://<ip>:8300/` address on the other device.

**Plain HTTP vs. HTTPS.** Browsers treat only `localhost` and HTTPS pages as a *secure context*. Some features depend on it:

| Feature | `localhost` | LAN over `http://` | LAN over `https://` |
|---|---|---|---|
| Notebook, SymPy, plots, saving | ✅ | ✅ | ✅ |
| Stop a running cell **keeping your variables** | ✅ | ❌ the engine restarts and variables are lost | ✅ |
| Copy buttons (clipboard) | ✅ | ❌ blocked by the browser | ✅ |

In short, plain HTTP on the LAN works for normal use. If you need to interrupt long computations without losing state, use HTTPS.

**Serving over HTTPS.** Python cannot create certificates by itself, so generate one and pass it with `--cert` and `--key`.

*Option A: [mkcert](https://github.com/FiloSottile/mkcert) (recommended: browsers trust it without warnings on this PC)*
```bash
mkcert -install
mkcert -cert-file cert.pem -key-file key.pem 192.168.1.20 localhost
python serve.py --host 0.0.0.0 --cert cert.pem --key key.pem
```
Other devices must also trust mkcert's root CA (`mkcert -CAROOT` shows where it is), otherwise they show a certificate warning.

*Option B: self-signed certificate with OpenSSL (browsers show a warning you must accept)*
```bash
openssl req -x509 -newkey rsa:2048 -nodes -days 365 -keyout key.pem -out cert.pem   -subj "/CN=logos-engine" -addext "subjectAltName=DNS:localhost,IP:192.168.1.20"
python serve.py --host 0.0.0.0 --cert cert.pem --key key.pem
```
Replace `192.168.1.20` with your own address (the one `serve.py` prints). Then open `https://192.168.1.20:8300/` and accept the warning once. Do not commit `key.pem`.

**Firewall.** The first time Python listens on a network address, Windows asks whether to allow it. Allow access on **private networks**. On macOS and Linux, make sure the port (default `8300`) is not blocked by the firewall. If another device cannot connect, check that both are on the same network and that the printed IP address is the one of the correct network adapter.

**Security.** The server has no login and serves static files only, so anyone who can reach the port can open the app. Only use `--host 0.0.0.0` on networks you trust, never expose the port to the internet, and stop the server (`Ctrl+C`) when you are done. Notebooks live in each visitor's own browser storage; they are never uploaded to or shared through your server, and each device sees its own notebooks. Calculations run in each visitor's browser, so every device needs internet access to the jsDelivr CDN (Pyodide runtime) unless it is cached.

### Notes
- **Interrupt support (SharedArrayBuffer):** the server sends `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` headers so that running code can be stopped without losing variables. Browsers only honor these on `localhost` or HTTPS (see the table above).
- **Offline use:** after the first successful load, calculations need no server round-trips, but the browser still needs the Pyodide files from the CDN unless they are cached.
- **Port already in use:** pass another port with `--port`.
- **Download failed:** check your connection and proxy settings, or build locally with `npm install && npm run build` and rerun `python serve.py`.
- **Reset:** delete the `.site-cache/` folder to force a fresh download.

## Technology Stack

- **Core**: TypeScript, WebAssembly (WASM)
- **Frontend**: React 19, Vite, Tailwind CSS 4
- **Conversion**: Pyodide (CPython 3.13 port to WASM)
- **Math Engine**: SymPy (Python)
- **Rendering**: KaTeX (LaTeX rendering), Canvas API

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Disclaimer

This software is provided "AS IS" without warranty of any kind. Users use this software at their own risk. For critical applications, please ensure verification by experts.
