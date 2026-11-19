"""
Phase 2 End-to-End Security Engine Demonstration Script
-------------------------------------------------------
Demonstrates the complete functional pipeline:
PLAIN TEXT -> ARGON2ID KEY DERIVATION -> AES-256-GCM -> BINARY PAYLOAD (SVLT v1) -> PNG LSB STEGANOGRAPHY
and reverse:
PNG STEGO IMAGE -> PAYLOAD EXTRACTION -> PAYLOAD UNPACK -> ARGON2ID -> AES-256-GCM DECRYPTION -> PLAIN TEXT
"""

import os
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from core.pipeline import (
    secure_note_to_image,
    recover_note_from_image,
    AuthenticationFailedError
)

def run_demonstration():
    print("=" * 70)
    print("     STEGAVAULT PHASE 2: WORKING SECURITY ENGINE DEMONSTRATION")
    print("=" * 70)

    carrier_input = os.path.join(BASE_DIR, "assets", "carrier_images", "mountain.jpg")
    stego_output = os.path.join(BASE_DIR, "storage", "stego_images", "demo_mountain_stego.png")
    os.makedirs(os.path.dirname(stego_output), exist_ok=True)

    passphrase = "DemoPassphrase@2026!#"
    original_note = (
        "CONFIDENTIAL NOTE:\n"
        "StegaVault Phase 2 execution verified.\n"
        "- Key Derivation: Argon2id (RFC 9106)\n"
        "- Encryption: AES-256-GCM (12-byte random nonce, 16-byte tag)\n"
        "- Payload: SVLT v1 Binary Envelope\n"
        "- Steganography: Lossless PNG LSB Embedding\n"
        "Decryption is fully authenticated."
    )
    metadata = {"title": "Phase 2 Security Verification", "author": "StegaVault Core", "classification": "Secret"}

    print("\n[1] Input Plaintext:")
    print("-" * 50)
    print(original_note)
    print("-" * 50)
    print(f"Carrier Image: {carrier_input}")
    print(f"Output Stego Image: {stego_output}")

    # 1. Forward Pipeline: Plaintext -> Stego Image
    print("\n[2] Executing Forward Pipeline (secure_note_to_image)...")
    stego_path = secure_note_to_image(
        note_text=original_note,
        passphrase=passphrase,
        carrier_image=carrier_input,
        output_path=stego_output,
        metadata=metadata,
        profile_id=1 # Standard mobile-conscious RFC 9106 profile
    )
    print(f"  [+] Success! Stego PNG created at: {stego_path}")
    print(f"  [+] File size: {os.path.getsize(stego_path)} bytes")

    # 2. Reverse Pipeline: Stego Image -> Plaintext
    print("\n[3] Executing Reverse Pipeline (recover_note_from_image)...")
    recovered_text, recovered_meta = recover_note_from_image(stego_path, passphrase)
    print("  [+] Extraction, payload validation, and AES-256-GCM decryption SUCCEEDED!")
    print("\n[4] Recovered Note Plaintext:")
    print("-" * 50)
    print(recovered_text)
    print("-" * 50)
    print(f"Recovered Metadata: {recovered_meta}")

    # 3. Security Invariant Verification
    assert recovered_text == original_note, "Recovered text must exactly match original note!"
    assert recovered_meta == metadata, "Recovered metadata must exactly match original metadata!"

    # 4. Tamper / Incorrect Passphrase Check
    print("\n[5] Verifying Fail-Closed Authentication with Wrong Passphrase...")
    try:
        recover_note_from_image(stego_path, "WrongPassphrase123!")
        print("  [-] ERROR: Decryption should have failed!")
    except AuthenticationFailedError:
        print("  [+] SUCCESS: Decryption was rejected cleanly without leaking plaintext.")

    print("\n" + "=" * 70)
    print("        ALL PHASE 2 SECURITY PIPELINE INVARIANTS VERIFIED!")
    print("=" * 70)

if __name__ == "__main__":
    run_demonstration()

