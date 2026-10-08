-- database/seed.sql
-- Dummy data for conceptual demonstration

INSERT INTO users (email, password_hash) 
VALUES ('demo@stegavault.com', 'pbkdf2:sha256:600000$dummyhash$dummy');

INSERT INTO notes (user_id, title, encrypted_content, nonce, salt) 
VALUES (1, 'Secret Concept', X'00112233', X'AABBCC', X'112233');

INSERT INTO secure_images (note_id, user_id, carrier_path, stego_path)
VALUES (1, 1, 'images/original_sunset.jpg', 'images/stego_sunset.png');
