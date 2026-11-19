"""
steganography_demo.py
---------------------
Demonstrates LSB (Least Significant Bit) Image Steganography for the StegaVault CA2 Presentation.
This is meant for jury explanation, NOT production integration.
"""

from PIL import Image

# Delimiter to signify the end of our secret message
DELIMITER = "#####"

def hide_data(image_path, secret_data, output_path):
    print(f"\n[*] Hiding data in {image_path}...")
    
    # 1. Open the carrier image and convert to RGB
    img = Image.open(image_path).convert("RGB")
    pixels = list(img.getdata())
    
    # 2. Append delimiter and convert secret data to a binary string
    secret_data += DELIMITER
    binary_secret = ''.join(format(ord(c), '08b') for c in secret_data)
    
    print(f"[*] Payload length: {len(secret_data)} characters ({len(binary_secret)} bits).")
    
    # Check if image has enough capacity
    if len(binary_secret) > len(pixels) * 3:
        raise ValueError("Error: Carrier image is too small to hold this payload.")
    
    new_pixels = []
    data_index = 0
    
    # 3. Modify the least significant bit (LSB) of each color channel
    for pixel in pixels:
        r, g, b = pixel
        
        if data_index < len(binary_secret):
            r = (r & ~1) | int(binary_secret[data_index])
            data_index += 1
            
        if data_index < len(binary_secret):
            g = (g & ~1) | int(binary_secret[data_index])
            data_index += 1
            
        if data_index < len(binary_secret):
            b = (b & ~1) | int(binary_secret[data_index])
            data_index += 1
            
        new_pixels.append((r, g, b))
        
    # 4. Create the new stego image and save it
    stego_img = Image.new("RGB", img.size)
    stego_img.putdata(new_pixels)
    stego_img.save(output_path)
    print(f"[+] Data successfully hidden. Saved stego image as {output_path}")

def extract_data(stego_image_path):
    print(f"\n[*] Extracting data from {stego_image_path}...")
    
    # 1. Open the stego image
    img = Image.open(stego_image_path)
    pixels = list(img.getdata())
    
    binary_data = ""
    
    # 2. Extract the LSB from each color channel
    for pixel in pixels:
        r, g, b = pixel
        binary_data += str(r & 1)
        binary_data += str(g & 1)
        binary_data += str(b & 1)
        
    # 3. Group bits into 8-bit bytes
    bytes_data = [binary_data[i:i+8] for i in range(0, len(binary_data), 8)]
    
    extracted_text = ""
    for byte in bytes_data:
        extracted_text += chr(int(byte, 2))
        
        # 4. Check if we reached our delimiter
        if extracted_text.endswith(DELIMITER):
            extracted_text = extracted_text[:-len(DELIMITER)]
            break
            
    print(f"[+] Data successfully extracted.")
    return extracted_text

if __name__ == "__main__":
    print("=== StegaVault LSB Steganography Demonstration ===")
    
    # Create a small dummy image for the demonstration
    dummy_img = Image.new('RGB', (100, 100), color = 'blue')
    dummy_img.save('dummy.png')
    
    # Define our secret payload (In real scenario, this is AES encrypted ciphertext)
    secret = "This is a secret note payload encrypted with AES-256-GCM."
    
    # Run the hide and extract process
    hide_data('dummy.png', secret, 'stego_dummy.png')
    
    recovered = extract_data('stego_dummy.png')
    print(f"\n[!] Recovered Payload: {recovered}")
