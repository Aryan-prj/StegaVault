# tests/test_encryption.py
import unittest
import os
from security.encryption import encrypt_data, decrypt_data
from security.key_derivation import derive_key

class TestEncryption(unittest.TestCase):
    def test_aes_roundtrip(self):
        """Demonstrates the AES-256-GCM round trip concept"""
        password = "strong_master_password"
        salt = os.urandom(16)
        key = derive_key(password, salt)
        
        plain_text = b"Secret PBL Data"
        
        encrypted_data, nonce = encrypt_data(plain_text, key)
        self.assertNotEqual(plain_text, encrypted_data)
        
        decrypted_data = decrypt_data(encrypted_data, key, nonce)
        self.assertEqual(plain_text, decrypted_data)

if __name__ == '__main__':
    unittest.main()
