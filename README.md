# StegaVault

StegaVault is a secure note management system combining authenticated symmetric encryption (**AES-256-GCM**), memory-hard passphrase key derivation (**Argon2id**), adaptive texture and edge image analysis, and Least Significant Bit (**LSB**) steganography inside lossless PNG carrier images.

From the user's perspective, StegaVault is a fast, responsive note-taking tool. All cryptographic derivations, binary envelope packaging, image texture analysis, pixel ranking, embedding, and authentication operate automatically behind the scenes.

---

## 1. Complete Architecture & Modular Structure

StegaVault follows a strictly decoupled, modular architecture without heavy frameworks:

```text
StegaVault/
├── frontend/                     # Modern note-taking web interface
│   ├── index.html                # App UI with dual User/Attacker demonstration views
│   ├── style.css                 # Clean aesthetic (Light and Dark mode support)
│   └── app.js                    # UI state, folder management, and JSON API client
├── core/                         # Functional security & steganography engine
│   ├── __init__.py               # Public API exports
│   ├── encryption.py             # AES-256-GCM encryption & authenticated decryption
│   ├── key_derivation.py         # Argon2id RFC 9106 passphrase key derivation
│   ├── payload_format.py         # SVLT v1 versioned binary envelope packaging
│   ├── image_analysis.py         # Texture variance & Sobel edge analysis (2-bit masked)
│   ├── steganography.py          # Lossless PNG adaptive LSB embedding & extraction
│   └── pipeline.py               # High-level pipeline coordination (secure & recover)
├── storage/                      # Secure file repositories
│   ├── notes/                    # Encrypted local note references
│   └── stego_images/             # Generated stego PNG image files
├── assets/
│   └── carrier_images/           # Stock carrier images (sunset, mountain, forest, etc.)
├── tests/                        # Comprehensive test suite (25/25 pytest tests passing)
│   ├── test_encryption.py        # AES-GCM roundtrip & tamper-resistance tests
│   ├── test_image_analysis.py    # Variance, Sobel edges, and MSB-invariance tests
│   ├── test_steganography.py     # Lossless PNG LSB capacity and extraction tests
│   ├── test_end_to_end.py        # Complete pipeline integration tests
│   └── test_phase3_scenarios.py  # Six end-to-end user validation scenarios
├── start_demo.py                 # Application launcher
├── server.py                     # Lightweight Python standard library HTTP/JSON server
├── demo_phase2.py                # Standalone CLI security engine demo
├── requirements.txt              # Standard Python dependencies
└── README.md
```

---

## 2. Cryptographic & Steganographic Workflow

### Encryption Workflow
```
[Plaintext Note] ──┐
[Passphrase]     ──┼─► [Argon2id (fresh 16B salt)] ──► 256-bit Key
                   │
                   └─► [AES-256-GCM (fresh 12B nonce)] ──► [Ciphertext + 16B Auth Tag]
                                                                  │
                                                                  ▼
                                                      [SVLT v1 Binary Envelope]
                                                                  │
[Carrier PNG/JPG] ──► [2-Bit Masked Sobel/Variance Analysis] ───► [Adaptive LSB Embedding]
                                                                  │
                                                                  ▼
                                                      [Lossless Stego PNG Image]
```

1. **Input Validation**: Verifies that note text and passphrase are valid UTF-8 strings.
2. **Argon2id Key Derivation**:
   - Generates a fresh 16-byte cryptographically secure random salt (`os.urandom`).
   - Derives a 32-byte (256-bit) encryption key using Argon2id (`argon2-cffi`, RFC 9106 standard profile: `time_cost=2`, `memory_cost=64MiB`, `parallelism=1`).
3. **AES-256-GCM Encryption**:
   - Generates a fresh 12-byte nonce (`os.urandom`). Nonce reuse with the same key is strictly avoided.
   - Encrypts note text, generating ciphertext with a 16-byte authentication tag.
4. **Binary Envelope Assembly (`SVLT` v1)**:
   - Packs Header (`MAGIC=b'SVLT'`, version 1, KDF profile, salt length, nonce length, metadata length, ciphertext length), Salt, Nonce, JSON metadata, and Ciphertext.
5. **Adaptive Image Analysis & LSB Embedding**:
   - Masks off the lowest two bits (`& 0xFC`) of the carrier image.
   - Calculates local texture variance and 3x3 Sobel edge energy.
   - Generates a normalized suitability map and orders eligible coordinates in descending order of texture complexity.
   - Embeds an 8-byte bootstrap header (`b'SVEM'`) in fixed top-left pixels, followed by the payload bits in the eligible adaptive positions.
   - Saves the result as a lossless PNG in `storage/stego_images/`.

### Decryption Workflow
```
[Stego PNG Image] ──► [Extract 8B Bootstrap Header] ──► Validate Magic 'SVEM' & Payload Length
         │
         ▼
[2-Bit Masked Image Analysis] ──► Reproduce Exact Same Adaptive Coordinate Ranking
         │
         ▼
[Extract Payload Bits] ──► [Unpack SVLT v1 Envelope] ──► Extract Salt, Nonce, Metadata, Ciphertext
         │
         ▼
[Passphrase + Stored Salt] ──► [Argon2id Key Derivation] ──► 256-bit Key
         │
         ▼
[AES-256-GCM Decryption] ──► Authenticate 16B Tag ──► [Original Plaintext Note]
```

1. **Bootstrap Extraction**: Reads the first 22 pixels to recover the 8-byte container header. Verifies the `b'SVEM'` magic identifier and payload length.
2. **Deterministic Coordinate Reconstruction**: Because image analysis masks the lowest 2 bits (`0xFC`), the calculated suitability map and ranked coordinate order are **100% identical** to those computed during embedding.
3. **Payload Extraction & Envelope Parsing**: Reads payload bits from the eligible adaptive coordinates and parses the `SVLT` v1 binary envelope.
4. **Key Re-Derivation**: Re-derives the 256-bit key from the user's passphrase using the stored salt and Argon2id profile ID.
5. **Authenticated Decryption**: AES-256-GCM authenticates the 16-byte tag. If the passphrase is incorrect or ciphertext has been altered, it **fails closed** immediately and never returns plaintext.

---

## 3. Binary Payload Envelope Format (`SVLT` v1)

| Field | Length | Description |
| :--- | :--- | :--- |
| **Magic Identifier** | 4 Bytes | Fixed signature: `b'SVLT'` |
| **Format Version** | 1 Byte | Current version: `1` |
| **KDF Algorithm ID** | 1 Byte | `1` = Argon2id |
| **KDF Profile ID** | 1 Byte | `1` = Mobile-conscious standard, `2` = Fast test, `3` = High-security |
| **Reserved Flags** | 1 Byte | Reserved for future compression / header options (`0x00`) |
| **Salt Length** | 1 Byte | Salt byte length (e.g. `16`) |
| **Nonce Length** | 1 Byte | Nonce byte length (e.g. `12`) |
| **Metadata JSON Length** | 2 Bytes | Big-endian unsigned 16-bit integer ($N_{\text{meta}} \le 65535$) |
| **Ciphertext Length** | 4 Bytes | Big-endian unsigned 32-bit integer ($N_{\text{cipher}} \le 32\text{ MB}$) |
| **Salt Bytes** | $N_{\text{salt}}$ Bytes | Cryptographic salt used for Argon2id key derivation |
| **Nonce Bytes** | $N_{\text{nonce}}$ Bytes | AES-256-GCM initialization nonce |
| **Metadata JSON** | $N_{\text{meta}}$ Bytes | UTF-8 JSON containing note title, folder, and timestamps |
| **Ciphertext + Auth Tag** | $N_{\text{cipher}}$ Bytes | AES-GCM ciphertext terminating with the 16-byte authentication tag |

Total Header Size: 16 bytes. Plaintext notes and encryption keys are **never** stored in the payload.

---

## 4. Adaptive Image Analysis & 2-Bit Masking Invariance

Sequential LSB embedding places payload bits uniformly across all pixels, which can cause noticeable noise in flat, smooth regions (like clear skies or solid backgrounds). StegaVault uses adaptive region analysis:

1. **2-Bit Masking Invariance (`& 0xFC`)**:
   - Both the local texture variance and the Sobel gradient operators operate strictly on pixel channel values with their lowest two bits zeroed out (`rgb & 0xFC`).
   - Consequently, modifying the least significant bit (LSB) during steganographic embedding **cannot** shift pixel values across the mask boundary, ensuring that the suitability score of every pixel remains identical before and after embedding.
2. **Local Texture Variance**:
   - Evaluates a $5 \times 5$ sliding window to measure local variance ($\sigma^2$). Textured regions (foliage, terrain, stones) exhibit high variance and strong visual masking properties.
3. **Sobel Edge Magnitude**:
   - Convolves the 6-MSB grayscale representation with $3 \times 3$ horizontal ($G_x$) and vertical ($G_y$) Sobel kernels to calculate gradient magnitude $\sqrt{G_x^2 + G_y^2}$.
4. **Scoring Function**:
   $$\text{Suitability} = \tanh\left(0.55 \cdot \text{Norm}(\sigma^2) + 0.45 \cdot \text{Norm}(\text{Sobel})\right)$$
   Normalized to $[0.0, 1.0]$. Smooth regions receive lower priority, textured regions receive higher priority, and extreme high-contrast spikes are moderated to avoid visual distortion.
5. **Fixed Bootstrap Header**:
   - The first 22 pixels (along the top row) are reserved exclusively for the 8-byte bootstrap header (`b'SVEM'` + payload length).
   - Remaining pixels are sorted by suitability score (descending), with ties broken by 1D raster index for strict determinism.
   - Only positions meeting the minimum suitability threshold (`0.02`) are eligible for payload embedding.

> **Note on Security Claims**: The suitability map is an engineering heuristic designed to minimize perceptual visual distortion. It does not claim to guarantee mathematical undetectability or immunity against statistical steganalysis tools.

---

## 5. Attacker / Trusted-Device Demonstration

StegaVault includes a top-right perspective toggle for demonstration purposes:
- **Trusted User View**: When authenticated with the correct passphrase in an active session, notes render cleanly in plain text with full folder navigation, rich previews, and editing capabilities.
- **Untrusted Device / Attacker Storage View**: Simulates what an adversary sees when directly inspecting physical disk storage (`storage/stego_images/`). Only ordinary, harmless photographs are visible. Without the correct master passphrase, the encrypted binary payload cannot be decrypted or extracted.

> **Security Clarification**: The User/Attacker toggle is a simulation of authorized vs. unauthorized disk inspection. StegaVault does not claim device authorization alone can protect data if an attacker gains unrestricted administrative/kernel access to an unlocked physical machine.

---

## 6. Installation & Launching

### Prerequisites
- Python 3.10+
- Modern Web Browser (Chrome, Firefox, Safari, Edge)

### Install Dependencies
```bash
pip install -r requirements.txt
```

### Launch the Application
Start the local server and launch the web client:
```bash
python start_demo.py
```
This runs the lightweight Python server on `http://localhost:8000` and automatically opens the user interface in your default browser.

### Run Automated Tests
```bash
python -m pytest tests -v
```
Runs the full automated test suite (25 tests covering encryption, Argon2id KDF, payload envelope parsing, Sobel/variance analysis, MSB invariance, capacity limits, and end-to-end scenarios).

---

## 7. Current Limitations & Future Scope

### Current Limitations
- **Lossless PNG Requirement**: LSB steganography requires lossless compression. If a third-party platform re-encodes a stego PNG into a lossy format (such as JPEG or WebP), the least significant bits are altered, causing AES-GCM tag verification to fail and fail-closed.
- **Capacity Limits**: Payload capacity is constrained by the number of eligible textured pixels ($3 \text{ bits/pixel}$). Oversized notes or large attachments must use larger carrier images.
- **Hardware Enclave Binding**: In the Python prototype, keys are derived in process memory using Argon2id. A production native desktop distribution would bind credentials to the OS TPM 2.0 / Apple Secure Enclave.

### Future U²-Net Saliency Map Extension
- The `core/image_analysis.py` module includes an integration hook (`u2net_saliency_mask`) for a lightweight deep-learning saliency model (such as U²-Net or MobileNet-UNet).
- When available, salient focal objects (e.g., human faces, brand logos) can be automatically identified and dampened, steering embedding away from high-attention focal areas into background textures.
- To keep the prototype lightweight, stable, and offline-compatible, U²-Net is treated as an optional future enhancement rather than a hard dependency.
