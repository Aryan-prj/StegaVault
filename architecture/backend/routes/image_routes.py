# backend/routes/image_routes.py
from flask import Blueprint, request, jsonify, send_file
from ..services.image_service import ImageService

image_bp = Blueprint('images', __name__)

@image_bp.route('/', methods=['GET'])
def list_images():
    """List carrier/stego images (Attacker view simulates seeing these without payload)"""
    return jsonify({"message": "List images logic goes here"})

@image_bp.route('/<int:image_id>', methods=['GET'])
def get_image(image_id):
    """Serve the raw PNG image file"""
    # return send_file(image_path)
    return jsonify({"message": f"Serve image {image_id} logic goes here"})
