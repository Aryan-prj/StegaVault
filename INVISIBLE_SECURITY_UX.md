# Invisible Security & UX Architecture Documentation

## 1. Overview & Problem Definition

In typical security-focused applications, users are constantly confronted with technical friction:
- Manually entering encryption keys or master passwords for every save/update.
- Manually selecting carrier images or steganographic parameters.
- Exposure of cryptographic terminology (hashes, AES nonces, ciphertexts, LSB ratios) in user-facing views.

**StegaVault's Invisible Security Architecture** removes this friction completely. To the user, StegaVault looks and behaves like an intuitive, fluid note-taking app (e.g., Apple Notes, Notion, Simplenote). All cryptographic derivations, payload packings, adaptive carrier selection, LSB image steganography, extraction, and decryption operate automatically behind the scenes.

---

## 2. User Journey vs. Security Subsystem

| User Experience Event | Visible UI State | Background Invisible Security Pipeline |
| :--- | :--- | :--- |
| **First-Time Sign-In** | One-time setup / sign in | PBKDF2 derivation; initial credential enrollment into platform credential locker. |
| **Normal Launch & Unlock** | "Protected" status badge | Keyring retrieves credential transparently; active in-memory session established. |
| **Create / Edit Note** | Standard text and media editor | No manual passkey requests or carrier selection prompts. |
| **Save Note** | Status: `Saving` &rarr; `Saved` &rarr; `Protected` | 1. JSON payload compiled with metadata.<br>2. Unique 16-byte cryptographic salt generated.<br>3. 32-byte key derived via PBKDF2-HMAC-SHA256.<br>4. AES-256-GCM encryption with 12-byte nonce.<br>5. LSB steganography embeds encrypted bytes into carrier image.<br>6. Resulting PNG stego artifact saved. |
| **Close & Reopen App** | Notes appear immediately in list | In-memory session decrypts notes transparently; notes render with instant previews. |
| **Adversary Storage Audit** | Photo gallery only | Even with raw disk/file inspection, an attacker only discovers benign vacation & landscape images. No plaintext notes or raw keys exist. |

---

## 3. Trusted-Device Key Retention Mechanism

### Platform Integration
StegaVault employs platform-native secure credential vaults:
- **Windows**: Windows Credential Manager (`WinVaultKeyring` via Python `keyring`)
- **macOS**: Apple Keychain
- **Linux**: Freedesktop Secret Service API

### Desktop Prototype Demonstration Mechanism & Limitations
For local desktop demonstration:
1. **Primary Mechanism**: The application attempts to bind to the operating system's platform vault via `keyring.set_password` / `keyring.get_password`.
2. **Session Security**: The active session keeps derived key material in transient process memory (`SESSION_KEY_CACHE`), never in web local storage, frontend code, cookies, or unencrypted text logs.
3. **Fallback Keystore**: If the platform credential daemon is unreachable or operating in a containerized environment, StegaVault falls back to a restricted local datastore `.vault_platform_secure.dat` scoped to the current user.
4. **Limitations**:
   - **Hardware-Enclave Binding**: Desktop software prototypes without TPM 2.0 / Apple Secure Enclave hardware binding can theoretically be accessed if an attacker gains root/admin OS level access on that exact machine.
   - **Process Memory Dumping**: While in memory, sensitive key material can theoretically be probed by kernel-level debuggers.
   - **Browser Context Isolation**: While raw keys are never written to HTML5 LocalStorage, the communication between frontend and localhost server occurs over standard HTTP loopback in the demo prototype. In a production desktop app (e.g. Electron/Tauri), this runs via IPC channels over internal process boundaries with HTTPS/WSS.

---

## 4. Verification & Validation Summary

- **Unit Test Suite**: 12/12 unit tests passing across AES-256-GCM, key derivation, LSB steganography, payload packing, and end-to-end integration (`architecture/tests/`).
- **Server API Handler**: Direct verification of `/api/auth/status`, `/api/auth/setup_or_unlock`, `/api/notes/secure_save`, and `/api/notes/secure_read` passing seamlessly with automated steganographic packaging.
- **UI Non-Invasiveness**: Verified that all manual carrier selection grids and encryption prompts are removed from normal note editing. Standard action buttons ("Save", "Delete") and clean statuses ("Saving", "Saved", "Protected") are active.

