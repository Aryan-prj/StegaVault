# backend/services/security_service.py
from ...security.key_derivation import derive_key
from ...security.encryption import encrypt_data, decrypt_data
from ...security.steganography import embed_payload, extract_payload
import os

class SecurityService:
    @staticmethod
    def secure_and_embed(plain_text, carrier_path, password):
        """
        The core pipeline: Note -> AES -> LSB -> Stego Image
        """
        # 1. Derive Key
        salt = os.urandom(16)
        key = derive_key(password, salt)
        
        # 2. Encrypt
        encrypted_content, nonce = encrypt_data(plain_text.encode('utf-8'), key)
        
        # 3. Embed (Steganography)
        # Note: In the future, this module will call ai.adaptive_embedding.get_embedding_map()
        stego_path = carrier_path.replace('carrier_', 'stego_')
        embed_payload(carrier_path, encrypted_content, stego_path)
        
        return encrypted_content, nonce, salt, stego_path

    @staticmethod
    def extract_and_decrypt(stego_path, password, salt, nonce):
        """
        The recovery pipeline: Stego Image -> LSB -> AES -> Note
        """
        # 1. Extract payload from image
        encrypted_content = extract_payload(stego_path)
        
        # 2. Derive key
        key = derive_key(password, salt)
        
        # 3. Decrypt
        plain_text = decrypt_data(encrypted_content, key, nonce)
        
        return plain_text.decode('utf-8')
