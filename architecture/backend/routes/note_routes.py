# backend/routes/note_routes.py
from flask import Blueprint, request, jsonify
from ..services.note_service import NoteService

note_bp = Blueprint('notes', __name__)

@note_bp.route('/', methods=['GET'])
def get_notes():
    """Retrieve all user notes (requires decryption password)"""
    return jsonify({"message": "Retrieve notes logic goes here"})

@note_bp.route('/create', methods=['POST'])
def create_note():
    """Create a new note, encrypt it, and embed via steganography"""
    data = request.json
    # Expected: title, content, carrier_image_id, encryption_password
    # NoteService.create_secure_note(...)
    return jsonify({"message": "Create secure note logic goes here"})

@note_bp.route('/<int:note_id>', methods=['GET'])
def get_note(note_id):
    """Retrieve and decrypt a single note"""
    return jsonify({"message": f"Retrieve note {note_id} logic goes here"})
