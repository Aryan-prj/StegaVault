import http.server
import socketserver
import webbrowser
import os
import sys

# Launch server.py
from server import run

if __name__ == "__main__":
    PORT = 8000
    print(f"Starting StegaVault Demo on port {PORT}...")
    print("Press Ctrl+C to stop the server.")
    webbrowser.open(f'http://localhost:{PORT}')
    run()
