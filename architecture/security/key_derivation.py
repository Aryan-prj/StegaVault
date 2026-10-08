# security/key_derivation.py
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
import os

def derive_key(password: str, salt: bytes, length: int = 32) -> bytes:
    """
    Derives a secure AES key from a user password and a salt using PBKDF2-HMAC-SHA256.
    Returns exactly 'length' bytes (32 bytes for AES-256).
    """
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=length,
        salt=salt,
        iterations=600000, # High iteration count to prevent brute forcing
    )
    return kdf.derive(password.encode('utf-8'))
