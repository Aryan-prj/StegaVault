# backend/services/note_service.py
from ..models.note import Note
from .security_service import SecurityService
from ..extensions import db

class NoteService:
    @staticmethod
    def create_secure_note(user_id, title, plain_content, carrier_image_path, password):
        """
        Coordinates the creation of a note:
        1. SecurityService derives key, encrypts content, generates stego image.
        2. Database records are created for Note and SecureImage.
        """
        # Conceptual
        encrypted_data, nonce, salt, stego_path = SecurityService.secure_and_embed(
            plain_content, carrier_image_path, password
        )
        
        # Save to DB logic here
        pass

    @staticmethod
    def recover_secure_note(note_id, user_id, password):
        """
        Coordinates recovery:
        1. Fetches Note and SecureImage records.
        2. SecurityService extracts LSB payload and decrypts it.
        """
        # Conceptual
        pass
