# backend/models/secure_image.py
from ..extensions import db
from datetime import datetime

class SecureImage(db.Model):
    __tablename__ = 'secure_images'

    id = db.Column(db.Integer, primary_key=True)
    note_id = db.Column(db.Integer, db.ForeignKey('notes.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    
    carrier_path = db.Column(db.String(500), nullable=False)
    stego_path = db.Column(db.String(500), nullable=False)
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
