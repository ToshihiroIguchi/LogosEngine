#!/usr/bin/env python3
"""Serve Logos Engine with nothing but the Python standard library (no Node.js needed).

Where the files come from, in order of preference:
  1. --dir PATH            an explicit directory containing index.html
  2. ./dist                a local build (``npm run build``)
  3. ./.site-cache         a copy of the published site, downloaded automatically on first run

Usage:
    python serve.py                  # http://127.0.0.1:8300
    python serve.py --open           # also open the browser
    python serve.py --port 9000
    python serve.py --host 0.0.0.0   # reachable from other machines on the LAN
    python serve.py --host 0.0.0.0 --cert cert.pem --key key.pem   # LAN over HTTPS (full features)
    python serve.py --update         # re-download the published site, then serve
"""

import argparse
import http.server
import posixpath
import re
import shutil
import socket
import socketserver
import ssl
import sys
import threading
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
LOCAL_BUILD = ROOT / "dist"
SITE_CACHE = ROOT / ".site-cache"
SITE_URL = "https://toshihiroiguchi.github.io/LogosEngine/"
DEFAULT_PORT = 8300

# Names the bundle refers to by relative path, e.g. "assets/foo-3fa9.js" or "./bar.wasm"
ASSET_REF = re.compile(r"""["'(=\s]((?:\./|\.\./|/)?(?:[\w@.\-]+/)*[\w@.\-]+\.(?:js|mjs|css|wasm|woff2?|ttf|png|svg|json|ico|py|txt))["')\s?#]""")
TEXT_SUFFIXES = (".html", ".js", ".mjs", ".css")


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        # Windows registries sometimes map these to text/plain, which browsers refuse to run
        ".js": "application/javascript",
        ".mjs": "application/javascript",
        ".wasm": "application/wasm",
        ".svg": "image/svg+xml",
    }

    def end_headers(self):
        # Cross-origin isolation enables SharedArrayBuffer (stopping running code without
        # losing variables). Browsers honor it on localhost and HTTPS only.
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "credentialless")
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def lan_addresses() -> list[str]:
    """Best-effort list of this machine's LAN IPv4 addresses."""
    found: set[str] = set()
    try:
        probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        probe.connect(("192.0.2.1", 9))  # TEST-NET address: nothing is sent, it only selects a route
        found.add(probe.getsockname()[0])
        probe.close()
    except OSError:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            found.add(info[4][0])
    except OSError:
        pass
    return sorted(ip for ip in found if not ip.startswith("127."))


def fetch(url: str) -> bytes | None:
    request = urllib.request.Request(url, headers={"User-Agent": "logos-engine-serve.py"})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.read()
    except urllib.error.HTTPError as error:
        if error.code in (403, 404):
            return None
        raise


def download_site(target: Path) -> None:
    """Crawl the published site starting at index.html and store every referenced file."""
    print(f"Downloading Logos Engine from {SITE_URL} ...")
    staging = target.with_name(target.name + ".tmp")
    shutil.rmtree(staging, ignore_errors=True)
    staging.mkdir(parents=True)

    seen: set[str] = set()
    queue = ["index.html"]
    saved = 0
    try:
        while queue:
            rel = queue.pop()
            if rel in seen:
                continue
            seen.add(rel)

            body = fetch(urllib.parse.urljoin(SITE_URL, rel))
            if body is None:
                if rel == "index.html":
                    raise RuntimeError("index.html was not found on the published site")
                continue  # a string that merely looked like a path

            destination = staging / rel
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(body)
            saved += 1

            if rel.endswith(TEXT_SUFFIXES):
                base = posixpath.dirname(rel)
                for match in ASSET_REF.finditer(body.decode("utf-8", errors="ignore")):
                    ref = match.group(1)
                    if ref.startswith("/"):
                        continue
                    resolved = posixpath.normpath(posixpath.join(base, ref))
                    if not resolved.startswith(".."):
                        queue.append(resolved)

        # Files in public/ that nothing references by name; fetch them so the copy is complete
        for extra in ("coi-serviceworker.js", "logo.png", "vite.svg", "_headers"):
            if extra not in seen:
                body = fetch(urllib.parse.urljoin(SITE_URL, extra))
                if body is not None:
                    (staging / extra).write_bytes(body)
                    saved += 1
    except BaseException:
        shutil.rmtree(staging, ignore_errors=True)
        raise

    shutil.rmtree(target, ignore_errors=True)
    staging.rename(target)
    print(f"Saved {saved} files to {target}")


def resolve_directory(args: argparse.Namespace) -> Path:
    if args.dir:
        directory = Path(args.dir).resolve()
        if not (directory / "index.html").is_file():
            sys.exit(f"Error: {directory} does not contain index.html")
        return directory

    if args.update:
        download_site(SITE_CACHE)
        return SITE_CACHE

    if (LOCAL_BUILD / "index.html").is_file():
        return LOCAL_BUILD

    if not (SITE_CACHE / "index.html").is_file():
        try:
            download_site(SITE_CACHE)
        except (urllib.error.URLError, OSError, RuntimeError) as error:
            sys.exit(
                f"Error: could not download the site ({error}).\n"
                "Check your internet connection, or build locally with 'npm install && npm run build'."
            )
    return SITE_CACHE


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve Logos Engine using only Python.")
    parser.add_argument("--host", default="127.0.0.1", help="address to bind (default: 127.0.0.1; use 0.0.0.0 for LAN access)")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help=f"port to listen on (default: {DEFAULT_PORT})")
    parser.add_argument("--dir", help="serve this directory instead of ./dist or the downloaded copy")
    parser.add_argument("--update", action="store_true", help="re-download the published site before serving")
    parser.add_argument("--cert", help="TLS certificate (PEM) to serve over HTTPS; requires --key")
    parser.add_argument("--key", help="TLS private key (PEM); requires --cert")
    parser.add_argument("--open", action="store_true", help="open the page in the default browser")
    args = parser.parse_args()
    if bool(args.cert) != bool(args.key):
        parser.error("--cert and --key must be given together")

    directory = resolve_directory(args)
    handler = lambda *a, **kw: Handler(*a, directory=str(directory), **kw)  # noqa: E731

    try:
        server = Server((args.host, args.port), handler)
    except OSError as error:
        sys.exit(f"Error: cannot listen on {args.host}:{args.port} ({error}). Try another --port.")

    scheme = "http"
    if args.cert:
        try:
            context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            context.load_cert_chain(args.cert, args.key)
        except (ssl.SSLError, OSError) as error:
            sys.exit(f"Error: cannot load the certificate/key ({error})")
        server.socket = context.wrap_socket(server.socket, server_side=True)
        scheme = "https"

    wildcard = args.host in ("0.0.0.0", "")
    shown_host = "localhost" if wildcard or args.host == "127.0.0.1" else args.host
    url = f"{scheme}://{shown_host}:{args.port}/"
    print(f"Serving Logos Engine at {url}")
    if wildcard:
        for ip in lan_addresses():
            print(f"  From other devices on the network: {scheme}://{ip}:{args.port}/")
        if scheme == "http":
            print("  Note: over plain HTTP from another device, stopping a running cell resets the session.")
            print("        Use --cert/--key for HTTPS to get the full feature set (see README).")
    print(f"Files: {directory}")
    print("Press Ctrl+C to stop.")
    if args.open:
        threading.Timer(0.5, webbrowser.open, args=(url,)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
