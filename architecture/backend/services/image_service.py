# backend/services/image_service.py
import os
from werkzeug.utils import secure_filename

class ImageService:
    @staticmethod
    def save_carrier_image(file_stream, filename):
        """Saves an uploaded raw carrier image for later embedding"""
        secure_name = secure_filename(filename)
        # os.path.join logic...
        pass

    @staticmethod
    def get_image_path(image_id):
        """Retrieves absolute path of an image for serving"""
        pass
