"""
encryption_demo.py
------------------
Demonstrates AES-256-GCM encryption for the StegaVault CA2 Presentation.
This is meant for jury explanation, NOT production integration.
"""

import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

def demo_encryption():
    print("=== StegaVault AES-256-GCM Demonstration ===\n")

    # 1. Generate a secure random 256-bit (32-byte) key
    # In production, this key would be derived from a user password using PBKDF2 or Argon2.
    key = AESGCM.generate_key(bit_length=256)
    aesgcm = AESGCM(key)
    print(f"[*] Generated AES-256 Key (hex): {key.hex()}")

    # 2. Define the plaintext note
    plaintext = b"StegaVault CA2 demonstration. Secret note content."
    print(f"\n[*] Plaintext: {plaintext.decode('utf-8')}")

    # 3. Generate a secure random 12-byte nonce
    # GCM mode requires a unique nonce for every encryption operation with the same key.
    nonce = os.urandom(12)
    print(f"[*] Generated Nonce (hex): {nonce.hex()}")

    # 4. Encrypt the plaintext
    # associated_data can be used to authenticate additional unencrypted data, but is None here.
    ciphertext = aesgcm.encrypt(nonce, plaintext, associated_data=None)
    print(f"\n[+] Ciphertext (hex): {ciphertext.hex()}")
    print("    ^ This is the encrypted payload that gets embedded into the carrier image.")

    # 5. Decrypt the ciphertext back to plaintext
    decrypted_plaintext = aesgcm.decrypt(nonce, ciphertext, associated_data=None)
    print(f"\n[+] Decrypted Plaintext: {decrypted_plaintext.decode('utf-8')}")
    
    # 6. Verify success
    if plaintext == decrypted_plaintext:
        print("\n[!] SUCCESS: Encryption and decryption completed successfully.")

if __name__ == "__main__":
    demo_encryption()
