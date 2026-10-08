# security/steganography.py
from PIL import Image

def embed_payload(carrier_image_path: str, payload: bytes, output_stego_path: str):
    """
    Conceptual implementation of Least Significant Bit (LSB) steganography.
    Modifies the LSB of image pixels to embed the binary payload.
    """
    # 1. Open Image
    # img = Image.open(carrier_image_path)
    
    # 2. Check capacity (width * height * channels > payload length)
    
    # 3. Add payload length header to payload
    
    # 4. Modify LSBs of image pixels based on binary payload
    
    # 5. Save as PNG to avoid compression loss
    # img.save(output_stego_path, "PNG")
    pass

def extract_payload(stego_image_path: str) -> bytes:
    """
    Extracts the payload from a stego image using LSB reversal.
    """
    # 1. Open Image
    # img = Image.open(stego_image_path)
    
    # 2. Extract header to determine payload length
    
    # 3. Read LSBs to reconstruct binary payload
    
    return b""
