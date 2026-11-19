"""
StegaVault Production-Grade Local Server with Role-Based Access Control (RBAC)
-----------------------------------------------------------------------------
Implements:
1. SQLite Database Persistence (Users, Notes, SecureImages, Sessions).
2. Server-side session management with tokens (cookie or Authorization header).
3. Role-Based Access Control:
   - 'USER' Mode: full note CRUD, secure encryption/decryption pipeline, gallery view.
   - 'ATTACKER' Mode: strictly read-only image gallery, HTTP 403 Forbidden on all note endpoints.
4. Phase 3 Adaptive Steganography Integration:
   - Argon2id key derivation (core/key_derivation.py)
   - AES-256-GCM encryption (core/encryption.py)
   - SVLT v1 Binary Envelope (core/payload_format.py)
   - Adaptive Sobel edge + local variance analysis (core/image_analysis.py)
   - Lossless PNG LSB embedding/extraction (core/steganography.py)
5. Full REST API with appropriate HTTP status codes (200, 201, 400, 401, 403, 404, 500)
   and standard CORS / headers.
"""

import http.server
import socketserver
import os
import json
import base64
import sys
import sqlite3
import secrets
from datetime import datetime
from PIL import Image

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from core.pipeline import (
    secure_note_to_image,
    recover_note_from_image,
    AuthenticationFailedError,
    InsufficientCapacityError,
    InvalidNoteDataError,
    SecurityPipelineError
)
from core.key_derivation import derive_key, generate_salt
from core.encryption import encrypt_note_data, decrypt_note_data
from core.payload_format import pack_payload, unpack_payload
from core.steganography import embed_binary_payload, extract_binary_payload

PORT = 8000
DB_PATH = os.path.join(BASE_DIR, "stegavault.db")
STEGO_STORAGE_DIR = os.path.join(BASE_DIR, "storage", "stego_images")
CARRIER_DIR = os.path.join(BASE_DIR, "assets", "carrier_images")
os.makedirs(STEGO_STORAGE_DIR, exist_ok=True)
os.makedirs(CARRIER_DIR, exist_ok=True)

# --------------------------------------------------------------------------
# Database Initialization & Helpers
# --------------------------------------------------------------------------
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()
    # Users table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Notes table (Stores note records and metadata)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        folder TEXT DEFAULT 'General',
        carrier_name TEXT,
        stego_path TEXT NOT NULL,
        archived INTEGER DEFAULT 0,
        deleted_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
    """)

    # Migration: add deleted_at column if not exists
    cursor.execute("PRAGMA table_info(notes)")
    cols = [r[1] for r in cursor.fetchall()]
    if "deleted_at" not in cols:
        cursor.execute("ALTER TABLE notes ADD COLUMN deleted_at TIMESTAMP")

    # Clean up notes that have been in the bin for more than 15 days
    cursor.execute("""
    SELECT id, stego_path FROM notes 
    WHERE archived = 1 AND deleted_at IS NOT NULL 
    AND julianday('now') - julianday(deleted_at) > 15
    """)
    expired = cursor.fetchall()
    for exp in expired:
        stego_p = os.path.join(BASE_DIR, exp["stego_path"].replace('/', os.sep))
        if os.path.exists(stego_p):
            try: os.remove(stego_p)
            except Exception: pass
        cursor.execute("DELETE FROM notes WHERE id = ?", (exp["id"],))

    # Sessions table (Stores server-side active sessions with mode & user)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        mode TEXT NOT NULL, -- 'USER' or 'ATTACKER'
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
    """)

    # Seed demo user if not present
    cursor.execute("SELECT id FROM users WHERE email = 'demo@stegavault.com'")
    if not cursor.fetchone():
        # Store demo user (password: Demo@2026Secure)
        cursor.execute("INSERT INTO users (email, password_hash) VALUES ('demo@stegavault.com', 'Demo@2026Secure')")

    conn.commit()
    conn.close()

# Initialize DB on module import
init_db()

# --------------------------------------------------------------------------
# HTTP Request Handler
# --------------------------------------------------------------------------
class StegaVaultHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Prevent caching for dynamic API calls and allow local cross-origin if needed
        if self.path.startswith('/api/'):
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.send_header('Pragma', 'no-cache')
            self.send_header('Expires', '0')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Session-Token')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def get_session(self):
        """Extracts and verifies active server-side session."""
        auth_header = self.headers.get('Authorization', '')
        token = ''
        if auth_header.startswith('Bearer '):
            token = auth_header[7:].strip()
        elif self.headers.get('X-Session-Token'):
            token = self.headers.get('X-Session-Token').strip()

        if not token:
            # Check cookie
            cookie_header = self.headers.get('Cookie', '')
            for part in cookie_header.split(';'):
                if 'stegavault_session=' in part:
                    token = part.split('stegavault_session=')[1].strip()

        if not token:
            return None

        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT s.token, s.user_id, s.mode, u.email FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.token = ?", (token,))
        row = cursor.fetchone()
        conn.close()
        return dict(row) if row else None

    def send_json(self, status_code, data):
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))

    def do_GET(self):
        if self.path.startswith('/api/'):
            self.handle_api_get()
            return
        super().do_GET()

    def do_POST(self):
        if self.path.startswith('/api/'):
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            try:
                data = json.loads(body.decode('utf-8')) if body else {}
            except Exception:
                data = {}
            self.handle_api_post(data)
            return
        super().do_POST()

    def do_PUT(self):
        if self.path.startswith('/api/'):
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            try:
                data = json.loads(body.decode('utf-8')) if body else {}
            except Exception:
                data = {}
            self.handle_api_put(data)
            return
        super().do_PUT()

    def do_DELETE(self):
        if self.path.startswith('/api/'):
            self.handle_api_delete()
            return
        super().do_DELETE()

    # ----------------------------------------------------------------------
    # API Routers & Controllers
    # ----------------------------------------------------------------------
    def handle_api_get(self):
        # Route: GET /api/auth/session
        if self.path == '/api/auth/session':
            session = self.get_session()
            if not session:
                self.send_json(401, {"status": "error", "message": "Not authenticated"})
                return
            self.send_json(200, {
                "status": "success",
                "email": session["email"],
                "mode": session["mode"]
            })
            return

        # Route: GET /api/carriers/list
        if self.path == '/api/carriers/list':
            carriers = []
            if os.path.exists(CARRIER_DIR):
                for f in sorted(os.listdir(CARRIER_DIR)):
                    if f.lower().endswith(('.jpg', '.jpeg', '.png')):
                        carriers.append({
                            "filename": f,
                            "url": f"assets/carrier_images/{f}"
                        })
            self.send_json(200, {"status": "success", "carriers": carriers})
            return

        # Route: GET /api/gallery (Available to both USER and ATTACKER, returns ONLY image info)
        if self.path == '/api/gallery':
            session = self.get_session()
            if not session:
                self.send_json(401, {"status": "error", "message": "Authentication required."})
                return

            conn = get_db()
            cursor = conn.cursor()
            # Fetch all stored stego images (non-archived). Note: Do NOT return title or content!
            cursor.execute("SELECT id, stego_path, carrier_name, created_at FROM notes WHERE archived = 0 ORDER BY id DESC")
            rows = cursor.fetchall()
            conn.close()

            gallery = []
            for r in rows:
                stego_rel = r["stego_path"]
                full_path = os.path.join(BASE_DIR, stego_rel.replace('/', os.sep))
                if os.path.exists(full_path):
                    gallery.append({
                        "id": r["id"],
                        "image_url": stego_rel,
                        "carrier_name": r["carrier_name"] or "Protected Carrier",
                        "timestamp": r["created_at"]
                    })

            self.send_json(200, {"status": "success", "images": gallery})
            return

        # Route: GET /api/notes (USER Mode Only)
        if self.path == '/api/notes' or self.path.startswith('/api/notes?'):
            session = self.get_session()
            if not session:
                self.send_json(401, {"status": "error", "message": "Authentication required."})
                return

            # CRITICAL SERVER-SIDE AUTHORIZATION: Attacker cannot access notes
            if session["mode"] == "ATTACKER":
                self.send_json(403, {
                    "status": "error",
                    "code": "FORBIDDEN",
                    "message": "Access denied: Attacker Mode cannot view notes."
                })
                return

            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("""
            SELECT id, user_id, title, folder, carrier_name, stego_path, archived, deleted_at, created_at, updated_at
            FROM notes WHERE user_id = ? ORDER BY id DESC
            """, (session["user_id"],))
            rows = cursor.fetchall()
            conn.close()

            notes = []
            for r in rows:
                notes.append({
                    "id": r["id"],
                    "title": r["title"],
                    "folder": r["folder"],
                    "carrier_name": r["carrier_name"],
                    "stego_path": r["stego_path"],
                    "archived": bool(r["archived"]),
                    "deleted_at": r["deleted_at"] if "deleted_at" in r.keys() else None,
                    "created_at": r["created_at"],
                    "updated_at": r["updated_at"]
                })

            self.send_json(200, {"status": "success", "notes": notes})
            return

        # Route: GET /api/notes/<id> (USER Mode Only)
        if self.path.startswith('/api/notes/'):
            session = self.get_session()
            if not session:
                self.send_json(401, {"status": "error", "message": "Authentication required."})
                return

            if session["mode"] == "ATTACKER":
                self.send_json(403, {
                    "status": "error",
                    "code": "FORBIDDEN",
                    "message": "Access denied: Attacker Mode cannot view individual notes."
                })
                return

            try:
                note_id = int(self.path.split('/api/notes/')[1].split('?')[0])
            except Exception:
                self.send_json(400, {"status": "error", "message": "Invalid note ID."})
                return

            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM notes WHERE id = ? AND user_id = ?", (note_id, session["user_id"]))
            row = cursor.fetchone()
            conn.close()

            if not row:
                self.send_json(404, {"status": "error", "message": "Note not found."})
                return

            self.send_json(200, {
                "status": "success",
                "note": {
                    "id": row["id"],
                    "title": row["title"],
                    "folder": row["folder"],
                    "carrier_name": row["carrier_name"],
                    "stego_path": row["stego_path"],
                    "archived": bool(row["archived"]),
                    "deleted_at": row["deleted_at"] if "deleted_at" in row.keys() else None,
                    "created_at": row["created_at"],
                    "updated_at": row["updated_at"]
                }
            })
            return

        self.send_json(404, {"status": "error", "message": "Endpoint not found."})

    def handle_api_post(self, data):
        # Route: POST /api/auth/login
        if self.path == '/api/auth/login':
            email = data.get('email', '').strip()
            password = data.get('password', '')
            mode = data.get('mode', 'USER').upper() # 'USER' or 'ATTACKER'

            if mode not in ('USER', 'ATTACKER'):
                mode = 'USER'

            if not email or not password:
                self.send_json(400, {"status": "error", "message": "Email and password are required."})
                return

            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("SELECT id, email, password_hash FROM users WHERE email = ?", (email,))
            user = cursor.fetchone()

            if not user or user["password_hash"] != password:
                conn.close()
                self.send_json(401, {"status": "error", "message": "Invalid credentials."})
                return

            # Generate fresh secure session token
            token = secrets.token_hex(24)
            cursor.execute("INSERT INTO sessions (token, user_id, mode) VALUES (?, ?, ?)", (token, user["id"], mode))
            conn.commit()
            conn.close()

            self.send_json(200, {
                "status": "success",
                "message": "Login successful",
                "token": token,
                "mode": mode,
                "email": user["email"]
            })
            return

        # Route: POST /api/auth/logout
        if self.path == '/api/auth/logout':
            session = self.get_session()
            if session:
                conn = get_db()
                cursor = conn.cursor()
                cursor.execute("DELETE FROM sessions WHERE token = ?", (session["token"],))
                conn.commit()
                conn.close()

            self.send_json(200, {"status": "success", "message": "Logged out successfully."})
            return

        # Route: POST /api/notes/restore (USER Mode Only)
        if self.path == '/api/notes/restore':
            session = self.get_session()
            if not session:
                self.send_json(401, {"status": "error", "message": "Authentication required."})
                return

            if session["mode"] == "ATTACKER":
                self.send_json(403, {
                    "status": "error",
                    "code": "FORBIDDEN",
                    "message": "Access denied: Attacker Mode cannot restore notes."
                })
                return

            note_id = data.get('note_id')
            if not note_id:
                self.send_json(400, {"status": "error", "message": "Note ID is required."})
                return

            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("UPDATE notes SET archived = 0, deleted_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?", (int(note_id), session["user_id"]))
            conn.commit()
            conn.close()

            self.send_json(200, {"status": "success", "message": "Note restored successfully."})
            return

        # Route: POST /api/notes/bin/empty (USER Mode Only)
        if self.path == '/api/notes/bin/empty':
            session = self.get_session()
            if not session:
                self.send_json(401, {"status": "error", "message": "Authentication required."})
                return

            if session["mode"] == "ATTACKER":
                self.send_json(403, {
                    "status": "error",
                    "code": "FORBIDDEN",
                    "message": "Access denied."
                })
                return

            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("SELECT id, stego_path FROM notes WHERE archived = 1 AND user_id = ?", (session["user_id"],))
            deleted_notes = cursor.fetchall()
            for n in deleted_notes:
                stego_p = os.path.join(BASE_DIR, n["stego_path"].replace('/', os.sep))
                if os.path.exists(stego_p):
                    try: os.remove(stego_p)
                    except Exception: pass
            cursor.execute("DELETE FROM notes WHERE archived = 1 AND user_id = ?", (session["user_id"],))
            conn.commit()
            conn.close()

            self.send_json(200, {"status": "success", "message": "Bin emptied permanently."})
            return

        # Route: POST /api/notes/secure_save (USER Mode Only)
        if self.path == '/api/notes/secure_save' or self.path == '/api/notes':
            session = self.get_session()
            if not session:
                self.send_json(401, {"status": "error", "message": "Authentication required."})
                return

            # CRITICAL SERVER-SIDE AUTHORIZATION: Attacker cannot create notes
            if session["mode"] == "ATTACKER":
                self.send_json(403, {
                    "status": "error",
                    "code": "FORBIDDEN",
                    "message": "Access denied: Attacker Mode cannot create or save notes."
                })
                return

            title = data.get('title', '').strip()
            content = data.get('content', '').strip()
            folder = data.get('folder', 'General')
            passphrase = data.get('passphrase', '')
            carrier_rel_path = data.get('carrier_image', '')
            note_id = data.get('note_id')

            if not title and not content:
                self.send_json(400, {"status": "error", "message": "Note title and content cannot both be empty."})
                return

            if not passphrase:
                self.send_json(400, {"status": "error", "message": "Passphrase is required to encrypt note."})
                return

            # Resolve carrier image path
            if carrier_rel_path:
                carrier_full = os.path.join(BASE_DIR, carrier_rel_path.replace('/', os.sep))
            else:
                carrier_full = os.path.join(CARRIER_DIR, "sunset.jpg")

            if not os.path.exists(carrier_full):
                carrier_full = os.path.join(BASE_DIR, "images", "sunset.jpg")

            # Determine whether creating or updating
            conn = get_db()
            cursor = conn.cursor()

            existing_note = None
            if note_id:
                cursor.execute("SELECT * FROM notes WHERE id = ? AND user_id = ?", (int(note_id), session["user_id"]))
                existing_note = cursor.fetchone()

            if existing_note:
                target_id = existing_note["id"]
                # Clean up old stego file if replacing
                old_stego = os.path.join(BASE_DIR, existing_note["stego_path"].replace('/', os.sep))
                stego_filename = f"stego_note_{target_id}_{int(datetime.utcnow().timestamp())}.png"
                output_stego_path = os.path.join(STEGO_STORAGE_DIR, stego_filename)
            else:
                stego_filename = f"stego_note_{secrets.token_hex(6)}.png"
                output_stego_path = os.path.join(STEGO_STORAGE_DIR, stego_filename)

            metadata = {
                "title": title or "Untitled Note",
                "folder": folder,
                "user_id": session["user_id"]
            }

            try:
                # Execute full Adaptive Security Pipeline
                saved_path = secure_note_to_image(
                    note_text=content,
                    passphrase=passphrase,
                    carrier_image=carrier_full,
                    output_path=output_stego_path,
                    metadata=metadata,
                    profile_id=1 # Standard Argon2id
                )

                stego_rel_url = f"storage/stego_images/{stego_filename}"

                # Save or Update in SQLite Database
                if existing_note:
                    cursor.execute("""
                    UPDATE notes
                    SET title = ?, folder = ?, carrier_name = ?, stego_path = ?, archived = 0, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """, (title or "Untitled Note", folder, os.path.basename(carrier_full), stego_rel_url, existing_note["id"]))
                    record_id = existing_note["id"]

                    # Remove old stego image safely if different
                    if old_stego != output_stego_path and os.path.exists(old_stego):
                        try: os.remove(old_stego)
                        except Exception: pass
                else:
                    cursor.execute("""
                    INSERT INTO notes (user_id, title, folder, carrier_name, stego_path)
                    VALUES (?, ?, ?, ?, ?)
                    """, (session["user_id"], title or "Untitled Note", folder, os.path.basename(carrier_full), stego_rel_url))
                    record_id = cursor.lastrowid

                conn.commit()
                conn.close()

                # Read base64 for instant client thumbnail
                with open(saved_path, "rb") as f:
                    stego_bytes = f.read()
                stego_data_url = "data:image/png;base64," + base64.b64encode(stego_bytes).decode('ascii')

                self.send_json(200, {
                    "status": "success",
                    "note_id": record_id,
                    "title": title or "Untitled Note",
                    "folder": folder,
                    "carrier_name": os.path.basename(carrier_full),
                    "stego_path": stego_rel_url,
                    "stego_image": stego_data_url
                })
                return

            except InsufficientCapacityError as ice:
                conn.close()
                self.send_json(400, {"status": "error", "error_type": "CAPACITY", "message": str(ice)})
                return
            except Exception as e:
                conn.close()
                self.send_json(500, {"status": "error", "message": f"Secure note failed: {str(e)}"})
                return

        # Route: POST /api/notes/secure_read (USER Mode Only)
        if self.path == '/api/notes/secure_read':
            session = self.get_session()
            if not session:
                self.send_json(401, {"status": "error", "message": "Authentication required."})
                return

            # CRITICAL SERVER-SIDE AUTHORIZATION: Attacker cannot read/decrypt notes
            if session["mode"] == "ATTACKER":
                self.send_json(403, {
                    "status": "error",
                    "code": "FORBIDDEN",
                    "message": "Access denied: Attacker Mode cannot read or decrypt notes."
                })
                return

            passphrase = data.get('passphrase', '')
            stego_path = data.get('stego_path', '')
            stego_data_url = data.get('stego_image', '')

            if not passphrase:
                self.send_json(400, {"status": "error", "message": "Passphrase is required to decrypt."})
                return

            target_path = None
            if stego_path:
                candidate = os.path.join(BASE_DIR, stego_path.replace('/', os.sep))
                if os.path.exists(candidate):
                    target_path = candidate

            if not target_path and stego_data_url and stego_data_url.startswith('data:'):
                temp_file = os.path.join(STEGO_STORAGE_DIR, f"_temp_recover_{secrets.token_hex(4)}.png")
                try:
                    _, b64_str = stego_data_url.split(',', 1)
                    with open(temp_file, "wb") as tf:
                        tf.write(base64.b64decode(b64_str))
                    target_path = temp_file
                except Exception as e:
                    self.send_json(400, {"status": "error", "message": f"Invalid stego data: {str(e)}"})
                    return

            if not target_path or not os.path.exists(target_path):
                self.send_json(404, {"status": "error", "message": "Stego image file not found."})
                return

            try:
                decrypted_note, metadata = recover_note_from_image(target_path, passphrase)
                self.send_json(200, {
                    "status": "success",
                    "note_text": decrypted_note,
                    "metadata": metadata
                })
                return
            except AuthenticationFailedError:
                self.send_json(401, {
                    "status": "error",
                    "error_type": "AUTH_FAILED",
                    "message": "Authentication failed: Incorrect passphrase or tampered steganographic data."
                })
                return
            except Exception as e:
                self.send_json(500, {"status": "error", "message": f"Decryption failed: {str(e)}"})
                return
            finally:
                if target_path and "_temp_recover_" in target_path and os.path.exists(target_path):
                    try: os.remove(target_path)
                    except Exception: pass

        self.send_json(404, {"status": "error", "message": "Endpoint not found."})

    def handle_api_put(self, data):
        # Route: PUT /api/notes/<id> (USER Mode Only)
        if self.path.startswith('/api/notes/'):
            session = self.get_session()
            if not session:
                self.send_json(401, {"status": "error", "message": "Authentication required."})
                return

            if session["mode"] == "ATTACKER":
                self.send_json(403, {
                    "status": "error",
                    "code": "FORBIDDEN",
                    "message": "Access denied: Attacker Mode cannot modify notes."
                })
                return

            try:
                note_id = int(self.path.split('/api/notes/')[1].split('?')[0])
            except Exception:
                self.send_json(400, {"status": "error", "message": "Invalid note ID."})
                return

            data['note_id'] = note_id
            self.path = '/api/notes/secure_save'
            self.handle_api_post(data)
            return

        self.send_json(404, {"status": "error", "message": "Endpoint not found."})

    def handle_api_delete(self):
        # Route: DELETE /api/notes/<id> (USER Mode Only)
        if self.path.startswith('/api/notes/'):
            session = self.get_session()
            if not session:
                self.send_json(401, {"status": "error", "message": "Authentication required."})
                return

            # CRITICAL SERVER-SIDE AUTHORIZATION: Attacker cannot delete notes
            if session["mode"] == "ATTACKER":
                self.send_json(403, {
                    "status": "error",
                    "code": "FORBIDDEN",
                    "message": "Access denied: Attacker Mode cannot delete notes."
                })
                return

            # Check if permanent delete query param is passed: ?permanent=true
            is_permanent = 'permanent=true' in self.path.lower()

            try:
                note_id = int(self.path.split('/api/notes/')[1].split('?')[0])
            except Exception:
                self.send_json(400, {"status": "error", "message": "Invalid note ID."})
                return

            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM notes WHERE id = ? AND user_id = ?", (note_id, session["user_id"]))
            note = cursor.fetchone()

            if not note:
                conn.close()
                self.send_json(404, {"status": "error", "message": "Note not found."})
                return

            if is_permanent:
                # Permanent delete: remove DB row and stego image file
                stego_path = os.path.join(BASE_DIR, note["stego_path"].replace('/', os.sep))
                if os.path.exists(stego_path):
                    try:
                        os.remove(stego_path)
                    except Exception:
                        pass
                cursor.execute("DELETE FROM notes WHERE id = ?", (note_id,))
                conn.commit()
                conn.close()
                self.send_json(200, {"status": "success", "message": f"Note {note_id} permanently deleted."})
                return
            else:
                # Soft delete: move to Bin (archived=1, deleted_at=CURRENT_TIMESTAMP)
                cursor.execute("UPDATE notes SET archived = 1, deleted_at = CURRENT_TIMESTAMP WHERE id = ?", (note_id,))
                conn.commit()
                conn.close()
                self.send_json(200, {"status": "success", "message": f"Note {note_id} moved to Bin (retained for 15 days)."})
                return

        self.send_json(404, {"status": "error", "message": "Endpoint not found."})

def run():
    os.chdir(BASE_DIR)
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), StegaVaultHandler) as httpd:
        print("=" * 65)
        print(f"   StegaVault Production-Grade Server Active (Port: {PORT})")
        print("   Database: SQLite (stegavault.db)")
        print("   RBAC Enabled: NORMAL USER vs ATTACKER MODE")
        print("=" * 65)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")

if __name__ == "__main__":
    run()
