# backend/models/user.py
from ..extensions import db
from datetime import datetime

class User(db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationships
    notes = db.relationship('Note', backref='owner', lazy=True, cascade='all, delete-orphan')
    images = db.relationship('SecureImage', backref='owner', lazy=True, cascade='all, delete-orphan')
