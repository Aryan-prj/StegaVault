import http.server
import socketserver
import webbrowser
import os

PORT = 8000
Handler = http.server.SimpleHTTPRequestHandler

os.chdir(os.path.dirname(os.path.abspath(__file__)))

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"Starting StegaVault Demo on port {PORT}...")
    print("Press Ctrl+C to stop the server.")
    webbrowser.open(f'http://localhost:{PORT}')
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
