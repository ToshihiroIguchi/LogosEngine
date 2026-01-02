import http.server
import socketserver
import os
import sys

PORT = 8000
DIRECTORY = "dist"

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        # Enable COOP/COEP for better performance/security if needed
        # self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        # self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        super().end_headers()

# Fix for Windows where .js might be served as text/plain
Handler.extensions_map.update({
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.wasm': 'application/wasm',
})

if not os.path.exists(DIRECTORY):
    print(f"Error: '{DIRECTORY}' folder not found.")
    print("Please run 'npm run build' first to generate the production files.")
    sys.exit(1)

print(f"Serving LogosEngine at http://localhost:{PORT}")
print(f"Reading files from: {os.path.abspath(DIRECTORY)}")

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
        httpd.server_close()
