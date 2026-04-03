from __future__ import annotations

from flask import Flask, jsonify
from flask_cors import CORS

from backend.config import get_config
from backend.document_api import document_blueprint
from backend.query_api import query_blueprint
from backend.upload_api import upload_blueprint


def create_app() -> Flask:
    app = Flask(__name__)
    config = get_config()
    app.json.sort_keys = False

    CORS(
        app,
        resources={
            r"/query": {"origins": list(config.backend_cors_origins)},
            r"/upload": {"origins": list(config.backend_cors_origins)},
            r"/get.*": {"origins": list(config.backend_cors_origins)},
            r"/health": {"origins": list(config.backend_cors_origins)},
        },
        allow_headers=["Authorization", "Content-Type"],
        methods=["GET", "POST", "OPTIONS"],
    )

    @app.get("/health")
    def healthcheck():
        return jsonify({"ok": True})

    app.register_blueprint(query_blueprint)
    app.register_blueprint(upload_blueprint)
    app.register_blueprint(document_blueprint)
    return app


app = create_app()


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=get_config().backend_port, debug=True)
