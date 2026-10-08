# backend/app.py
from flask import Flask
from .extensions import db
from .routes.auth_routes import auth_bp
from .routes.note_routes import note_bp
from .routes.image_routes import image_bp

def create_app(config_object="backend.config.Config"):
    """Application Factory for Flask"""
    app = Flask(__name__)
    app.config.from_object(config_object)

    # Initialize extensions
    db.init_app(app)

    # Register Blueprints
    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(note_bp, url_prefix='/api/notes')
    app.register_blueprint(image_bp, url_prefix='/api/images')

    @app.route('/health')
    def health_check():
        return {"status": "ok", "message": "StegaVault Backend Active"}

    return app

if __name__ == "__main__":
    app = create_app()
    app.run(debug=True)
