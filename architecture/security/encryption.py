# security/encryption.py
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import os

def encrypt_data(data: bytes, key: bytes) -> tuple[bytes, bytes]:
    """
    Encrypts data using AES-256-GCM.
    Key must be exactly 32 bytes.
    Returns: (encrypted_data_with_tag, nonce)
    """
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)  # Standard GCM nonce length is 12 bytes
    
    # Encrypt and automatically append authentication tag
    encrypted_data = aesgcm.encrypt(nonce, data, None)
    return encrypted_data, nonce

def decrypt_data(encrypted_data: bytes, key: bytes, nonce: bytes) -> bytes:
    """
    Decrypts AES-256-GCM data. 
    Verifies authentication tag inherently.
    """
    aesgcm = AESGCM(key)
    return aesgcm.decrypt(nonce, encrypted_data, None)
