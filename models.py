import uuid
from datetime import datetime
from extensions import db
from flask_security import UserMixin, RoleMixin
from zoneinfo import ZoneInfo


# -----------------------------
# AUTH MODELS
# -----------------------------

roles_users = db.Table(
    "roles_users",
    db.Column("user_id", db.Integer, db.ForeignKey("user.id")),
    db.Column("role_id", db.Integer, db.ForeignKey("role.id")),
)


class Role(db.Model, RoleMixin):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), unique=True)
    description = db.Column(db.String(255))


class User(db.Model, UserMixin):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False)
    password = db.Column(db.String(255), nullable=False)
    active = db.Column(db.Boolean, default=True)
    fs_uniquifier = db.Column(
        db.String(64), unique=True, nullable=False,
        default=lambda: uuid.uuid4().hex
    )
    roles = db.relationship(
        "Role", secondary=roles_users,
        backref=db.backref("users", lazy="dynamic")
    )
    # Link back to customer profile (optional — set when customer is created)
    customer = db.relationship("Customer", back_populates="user", uselist=False)


# -----------------------------
# CUSTOMER SYSTEM
# -----------------------------

class Customer(db.Model):
    id = db.Column(db.Integer, primary_key=True)

    # Optional link to a User account (auto-created on customer creation)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True, unique=True)

    name = db.Column(db.String(200), nullable=False)
    phone = db.Column(db.String(20), unique=True)
    address = db.Column(db.Text)
    village = db.Column(db.String(100))

    referral_code = db.Column(
        db.String(20), unique=True, nullable=False,
        default=lambda: uuid.uuid4().hex[:8]
    )

    customer_type = db.Column(
        db.String(20), default="regular"
    )  # regular / premium / electrician

    referred_by_id = db.Column(db.Integer, db.ForeignKey("customer.id"))

    referrer = db.relationship(
        "Customer", remote_side=[id], backref="referrals"
    )

    user = db.relationship("User", back_populates="customer")

    wallet = db.relationship("Wallet", uselist=False, back_populates="customer")

    bills = db.relationship("Bill", back_populates="customer")

    payments = db.relationship("Payment", back_populates="customer")

    transactions = db.relationship(
        "Transaction", back_populates="customer",
        order_by="Transaction.timestamp.desc()"
    )


# -----------------------------
# WALLET
# -----------------------------

class Wallet(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    customer_id = db.Column(
        db.Integer, db.ForeignKey("customer.id"),
        unique=True, nullable=False
    )
    balance = db.Column(db.Float, default=0.0)
    customer = db.relationship("Customer", back_populates="wallet")


# -----------------------------
# TRANSACTION / LEDGER
# -----------------------------

class Transaction(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    customer_id = db.Column(
        db.Integer, db.ForeignKey("customer.id"), nullable=False
    )
    transaction_type = db.Column(db.String(30), nullable=False)
    # SALE amounts are positive (customer owes money)
    # PAYMENT / REFUND amounts are negative (reduces what customer owes)
    amount = db.Column(db.Float, nullable=False)
    reference_type = db.Column(db.String(30))   # bill / payment / return / settlement
    reference_id = db.Column(db.Integer)
    notes = db.Column(db.String(255))
    timestamp = db.Column(db.DateTime, default=datetime.now(ZoneInfo("Asia/Kolkata")))
    customer = db.relationship("Customer", back_populates="transactions")


# -----------------------------
# ITEM CATALOG
# -----------------------------

class Item(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), unique=True, nullable=False)
    category = db.Column(db.String(100))          # ← ADDED
    max_price = db.Column(db.Float)               # MRP / ceiling
    default_price = db.Column(db.Float, nullable=False)   # cost / base price
    final_price = db.Column(db.Float)             # selling price (overrides default)
    cost_price = db.Column(db.Numeric(10, 2), nullable=True, default=0.00)
    updated_at = db.Column(
        db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


# -----------------------------
# BILLING SYSTEM
# -----------------------------

class Bill(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    customer_id = db.Column(db.Integer, db.ForeignKey("customer.id"))
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    subtotal = db.Column(db.Float, nullable=False)
    bill_discount_type = db.Column(db.String(10))
    bill_discount_value = db.Column(db.Float)
    final_amount = db.Column(db.Float, nullable=False)
    customer = db.relationship("Customer", back_populates="bills")
    items = db.relationship(
        "BillItem", back_populates="bill", cascade="all, delete-orphan"
    )


class BillItem(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    bill_id = db.Column(db.Integer, db.ForeignKey("bill.id"), nullable=False)
    item_name = db.Column(db.String(200), nullable=False)
    qty = db.Column(db.Float, nullable=False)
    unit_price = db.Column(db.Float, nullable=False)
    item_discount_type = db.Column(db.String(10))
    item_discount_value = db.Column(db.Float)
    final_item_amount = db.Column(db.Float, nullable=False)
    bill = db.relationship("Bill", back_populates="items")


# -----------------------------
# RETURNS
# -----------------------------

class Return(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    customer_id = db.Column(db.Integer, db.ForeignKey("customer.id"))
    timestamp = db.Column(db.DateTime, default=datetime.now(ZoneInfo("Asia/Kolkata")))
    total_refund_amount = db.Column(db.Float, nullable=False)
    customer = db.relationship("Customer")
    items = db.relationship(
        "ReturnItem", back_populates="return_order", cascade="all, delete-orphan"
    )


class ReturnItem(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    return_id = db.Column(db.Integer, db.ForeignKey("return.id"), nullable=False)
    item_name = db.Column(db.String(200), nullable=False)
    qty = db.Column(db.Float, nullable=False)
    unit_price = db.Column(db.Float, nullable=False)
    refund_amount = db.Column(db.Float, nullable=False)
    return_order = db.relationship("Return", back_populates="items")


# -----------------------------
# PAYMENTS
# -----------------------------

class Payment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    customer_id = db.Column(db.Integer, db.ForeignKey("customer.id"))
    amount = db.Column(db.Float, nullable=False)
    method = db.Column(db.String(30), default="cash")   # cash / upi / cheque
    notes = db.Column(db.String(255))
    timestamp = db.Column(db.DateTime, default=datetime.now(ZoneInfo("Asia/Kolkata")))
    customer = db.relationship("Customer", back_populates="payments")
