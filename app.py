import os
from flask import Flask, request, jsonify, redirect, url_for
from extensions import db
from flask_security import Security, SQLAlchemyUserDatastore, hash_password
from sqlalchemy import inspect


def create_app():
    app = Flask(__name__)

    # --------------------------------
    # App Config
    # --------------------------------
    app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "dev-secret-change-me")

    db_url = os.environ.get("SUPABASE_DB_URL", "sqlite:///db.sqlite3")

    if db_url.startswith("postgres://"):
        db_url = db_url.replace("postgres://", "postgresql://", 1)

    app.config["SQLALCHEMY_DATABASE_URI"] = db_url
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
        "pool_pre_ping": True,
        "pool_recycle": 300,
        "pool_size": 3,
        "max_overflow": 2,
        "isolation_level": "AUTOCOMMIT"
    }

    # --------------------------------
    # Flask-Security Config
    # --------------------------------
    app.config["SECURITY_PASSWORD_HASH"] = "bcrypt"
    app.config["SECURITY_PASSWORD_SALT"] = os.environ.get(
        "SECURITY_PASSWORD_SALT", "dev-salt-change-me"
    )

    app.config["SECURITY_LOGIN_URL"] = "/login"
    app.config["SECURITY_LOGOUT_URL"] = "/logout"

    app.config["SECURITY_POST_LOGIN_VIEW"] = "/"
    app.config["SECURITY_POST_LOGOUT_VIEW"] = "/login"

    app.config["SECURITY_REGISTERABLE"] = False
    app.config["SECURITY_SEND_REGISTER_EMAIL"] = False
    app.config["SECURITY_SEND_PASSWORD_CHANGE_EMAIL"] = False
    app.config["SECURITY_SEND_PASSWORD_RESET_EMAIL"] = False

    app.config["SECURITY_TOKEN_AUTHENTICATION_HEADER"] = ""

    app.config["SECURITY_CSRF_IGNORE_UNAUTH_ENDPOINTS"] = True
    app.config["WTF_CSRF_ENABLED"] = False
    app.config["SECURITY_CSRF_PROTECT_MECHANISMS"] = []

    db.init_app(app)

    # --------------------------------
    # Flask-Security Setup
    # --------------------------------
    from models import User, Role

    user_datastore = SQLAlchemyUserDatastore(db, User, Role)
    security = Security(app, user_datastore)

    # API unauthorized handler
    @security.unauthn_handler
    def unauthorized(mechanisms, headers=None):
        if request.path.startswith("/api/"):
            return jsonify({"error": "Authentication required"}), 401
        return redirect(url_for("security.login"))

    # --------------------------------
    # Register Blueprints
    # --------------------------------
    from routes.pages import pages_bp
    from routes.items import items_bp
    from routes.bills import bills_bp
    from routes.invoice import invoice_bp
    from routes.customers import customers_bp
    from routes.ledger import ledger_bp
    from dashboard import dashboard_bp
    from routes.returns import returns_bp
    from routes.payments import payments_bp
    from routes.transactions import transactions_bp

    app.register_blueprint(dashboard_bp)
    app.register_blueprint(pages_bp)
    app.register_blueprint(items_bp)
    app.register_blueprint(bills_bp)
    app.register_blueprint(invoice_bp)
    app.register_blueprint(customers_bp)
    app.register_blueprint(ledger_bp)
    app.register_blueprint(returns_bp)
    app.register_blueprint(payments_bp)
    app.register_blueprint(transactions_bp)

    # --------------------------------
    # Health Endpoint (for Render)
    # --------------------------------
    @app.route("/api/health")
    def health():
        return {"status": "ok"}

    # --------------------------------
    # Create tables & seed admin
    # --------------------------------
    with app.app_context():

        inspector = inspect(db.engine)

        if not inspector.get_table_names():
            print("No tables found — initializing database...")
            db.create_all()
        else:
            print("Database already initialized — skipping create_all()")

        # First admin user
        if not user_datastore.find_user(email="admin@ksa.com"):

            admin_role = user_datastore.find_or_create_role(
                name="admin",
                description="Administrator"
            )

            user_datastore.create_user(
                email="admin@ksa.com",
                password=hash_password("admin@123"),
                roles=[admin_role]
            )

            db.session.commit()

    return app


# --------------------------------
# Create App
# --------------------------------
app = create_app()


# --------------------------------
# Run Local Dev Server
# --------------------------------
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)