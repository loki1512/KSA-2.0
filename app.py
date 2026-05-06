import os
import uuid
from flask import Flask, request, jsonify, redirect, render_template, flash
from extensions import db
from flask_security import Security, SQLAlchemyUserDatastore, hash_password
from flask_security import current_user
from flask_security.utils import login_user, verify_and_update_password
from sqlalchemy import inspect
from sqlalchemy import func
from auth_helpers import customer_placeholder_email, is_admin


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

    app.config["SECURITY_LOGIN_URL"] = "/_security/login"
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

    app.config["SUPABASE_URL"] = os.environ.get("SUPABASE_URL", "").rstrip("/")
    app.config["SUPABASE_SERVICE_ROLE_KEY"] = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    app.config["SUPABASE_STORAGE_BUCKET"] = os.environ.get("SUPABASE_STORAGE_BUCKET", "offer-images")

    db.init_app(app)

    # --------------------------------
    # Flask-Security Setup
    # --------------------------------
    from models import User, Role, Customer

    user_datastore = SQLAlchemyUserDatastore(db, User, Role)
    security = Security(app, user_datastore)

    # API unauthorized handler
    @security.unauthn_handler
    def unauthorized(mechanisms, headers=None):
        if request.path.startswith("/api/"):
            return jsonify({"error": "Authentication required"}), 401
        return redirect("/login")

    def _safe_next(value):
        if value and value.startswith("/") and not value.startswith("//"):
            return value
        return None

    def _find_login_user(identifier):
        identifier = (identifier or "").strip()
        if not identifier:
            return None

        email_user = User.query.filter(
            func.lower(User.email) == identifier.lower()
        ).first()
        if email_user:
            return email_user

        customer = Customer.query.filter_by(phone=identifier).first()
        return customer.user if customer and customer.user else None

    @app.route("/login", methods=["GET", "POST"])
    def login():
        if current_user.is_authenticated:
            return redirect("/" if is_admin() else "/my-account")

        if request.method == "POST":
            identifier = request.form.get("email") or request.form.get("identity")
            password = request.form.get("password") or ""
            user = _find_login_user(identifier)

            if user and user.active and verify_and_update_password(password, user):
                db.session.commit()
                login_user(user, authn_via=["password"])
                next_url = _safe_next(request.form.get("next") or request.args.get("next"))
                if next_url:
                    return redirect(next_url)
                return redirect("/" if is_admin(user) else "/my-account")

            flash("Invalid phone/email or password", "error")

        return render_template("security/login_user.html")

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
    from routes.account import account_bp
    from routes.offers import offers_bp

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
    app.register_blueprint(account_bp)
    app.register_blueprint(offers_bp)

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
            print("Database already initialized — ensuring missing tables exist...")
            db.create_all()

        admin_role = user_datastore.find_or_create_role(
            name="admin",
            description="Administrator"
        )
        customer_role = user_datastore.find_or_create_role(
            name="customer",
            description="Customer"
        )

        admin = user_datastore.find_user(email="admin@ksa.com")
        admin_count = User.query.filter(User.roles.any(name="admin")).count()

        # First admin user
        if not admin and admin_count == 0:
            user_datastore.create_user(
                email="admin@ksa.com",
                password=hash_password("admin@123"),
                roles=[admin_role]
            )

            db.session.commit()
            admin = user_datastore.find_user(email="admin@ksa.com")

        if admin and admin_role not in admin.roles:
            admin.roles.append(admin_role)

        for customer in Customer.query.all():
            user = customer.user
            if not user:
                user = User(
                    email=customer_placeholder_email(customer.phone, customer.id),
                    password=hash_password(uuid.uuid4().hex),
                    active=True
                )
                db.session.add(user)
                db.session.flush()
                customer.user_id = user.id

            if customer_role not in user.roles:
                user.roles.append(customer_role)

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
