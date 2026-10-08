# security/password_hashing.py
from werkzeug.security import generate_password_hash, check_password_hash

def hash_password(password: str) -> str:
    """
    Hashes a password for AUTHENTICATION purposes (storing in DB users table).
    NOTE: This is completely separate from Note Encryption!
    """
    return generate_password_hash(password, method='pbkdf2:sha256', salt_length=16)

def verify_password(password_hash: str, password: str) -> bool:
    """
    Verifies a user password against the stored authentication hash.
    """
    return check_password_hash(password_hash, password)
