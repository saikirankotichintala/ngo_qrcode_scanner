import os
from flask import Flask, jsonify
from flask_cors import CORS
from pymongo.errors import PyMongoError
from bag import bag_bp
from employee import employee_bp
from gemini import gemini_bp
from helpers import clean_text, parse_bool
from product import product_bp


def create_app():
    app = Flask(__name__)
    CORS(app)

    @app.route("/", methods=["GET"])
    def home():
        return jsonify({"message": "NGO QR backend is running"})

    @app.route("/health", methods=["GET"])
    def health():
        return jsonify({"status": "ok"})

    @app.errorhandler(PyMongoError)
    def handle_mongo_error(error):
        return (
            jsonify(
                {
                    "error": (
                        "Database connection failed. Check MONGO_URI, Atlas network "
                        "access, and DNS resolution."
                    ),
                    "details": clean_text(error),
                }
            ),
            503,
        )

    app.register_blueprint(employee_bp)
    app.register_blueprint(gemini_bp)
    app.register_blueprint(product_bp)
    app.register_blueprint(bag_bp)
    return app


app = create_app()


if __name__ == "__main__":
    debug_mode = parse_bool(os.getenv("FLASK_DEBUG"), True)
    default_reloader = debug_mode and os.name != "nt"
    use_reloader = parse_bool(os.getenv("FLASK_USE_RELOADER"), default_reloader)
    port = int(clean_text(os.getenv("PORT")) or "5000")

    app.run(
        debug=debug_mode,
        host="0.0.0.0",
        port=port,
        use_reloader=use_reloader,
        reloader_type="stat",
    )
