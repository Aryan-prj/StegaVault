# backend/models/note.py
from ..extensions import db
from datetime import datetime

class Note(db.Model):
    __tablename__ = 'notes'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    title = db.Column(db.String(255), nullable=False)
    
    # Security Material
    encrypted_content = db.Column(db.LargeBinary, nullable=False)
    nonce = db.Column(db.LargeBinary, nullable=False)
    salt = db.Column(db.LargeBinary, nullable=False)
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationship to the secure image containing this note
    secure_image = db.relationship('SecureImage', backref='note', uselist=False, cascade='all, delete-orphan')
