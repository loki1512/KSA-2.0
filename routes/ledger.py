from flask import Blueprint, jsonify
from flask_security import auth_required, current_user
from auth_helpers import admin_required, forbidden_response, is_admin
from extensions import db
from models import Transaction, Customer, Wallet, Bill, Return, Payment

ledger_bp = Blueprint("ledger", __name__)


# --------------------------------
# GET CUSTOMER LEDGER
# --------------------------------
@ledger_bp.route("/api/ledgers/<int:customer_id>", methods=["GET"])
@admin_required
def get_ledger(customer_id):

    customer = Customer.query.get_or_404(customer_id)

    transactions = (
        Transaction.query
        .filter_by(customer_id=customer_id)
        .order_by(Transaction.timestamp.desc())
        .all()
    )
    wallet_balance = customer.wallet.balance if customer.wallet else 0.0

    return jsonify({
        "customer_id": customer_id,
        "customer_name": customer.name,
        "wallet_balance": wallet_balance,
        "transactions": [
            {
                "id": txn.id,
                "type": txn.transaction_type,
                "amount": txn.amount,
                "reference_type": txn.reference_type,
                "reference_id": txn.reference_id,
                "timestamp": txn.timestamp.isoformat()
            }
            for txn in transactions
        ]
    })

#-----------------customer copy of ledger-----------------
@ledger_bp.route("/api/customers/<int:customer_id>/ledger", methods=["GET"])
@auth_required()
def get_customer_ledger(customer_id):
    customer = Customer.query.get_or_404(customer_id)
    if not is_admin() and (not current_user.customer or current_user.customer.id != customer.id):
        return forbidden_response()

    transactions = (
        Transaction.query
        .filter_by(customer_id=customer_id)
        .order_by(Transaction.timestamp.desc())
        .all()
    )
    wallet_balance = customer.wallet.balance if customer.wallet else 0.0

    return jsonify({
        "customer_id": customer_id,
        "customer_name": customer.name,
        "wallet_balance": wallet_balance,
        "referral_code": customer.referral_code,
        "transactions": [
            {
                "id": txn.id,
                "type": txn.transaction_type,
                "amount": txn.amount,
                "reference_type": txn.reference_type,
                "reference_id": txn.reference_id,
                "timestamp": txn.timestamp.isoformat()
            }
            for txn in transactions
        ]
    })
# --------------------------------
# CLEAR CUSTOMER LEDGER
# --------------------------------
@ledger_bp.route("/api/ledgers/<int:customer_id>/transactions", methods=["DELETE"])
@admin_required
def clear_ledger(customer_id):

    Customer.query.get_or_404(customer_id)

    # Delete transactions
    Transaction.query.filter_by(customer_id=customer_id).delete()

    # Delete bills, returns and payments
    Bill.query.filter_by(customer_id=customer_id).delete()
    Return.query.filter_by(customer_id=customer_id).delete()
    Payment.query.filter_by(customer_id=customer_id).delete()

    # Reset wallet
    wallet = Wallet.query.filter_by(customer_id=customer_id).first()
    if wallet:
        wallet.balance = 0.0

    db.session.commit()

    return jsonify({
        "message": f"Ledger cleared and wallet reset for customer_id {customer_id}"
    }), 200


# --------------------------------
# SETTLE LEDGER
# --------------------------------
@ledger_bp.route("/api/ledgers/<int:customer_id>/settle", methods=["POST"])
@admin_required
def settle_ledger(customer_id):

    Customer.query.get_or_404(customer_id)

    wallet = Wallet.query.filter_by(customer_id=customer_id).first()

    transactions = Transaction.query.filter_by(customer_id=customer_id).all()

    balance = sum(txn.amount for txn in transactions)

    if balance == 0:
        return jsonify({
            "message": "Ledger already settled",
            "balance": 0
        })

    # Create settlement transaction
    settlement = Transaction(
        customer_id=customer_id,
        transaction_type="SETTLEMENT",
        amount=-balance,
        reference_type="settlement",
        reference_id=None
    )

    db.session.add(settlement)

    # Update wallet balance    wallet = Wallet.query.filter_by(customer_id=customer_id).first()
    if wallet:
        wallet.balance = 0
        db.session.add(wallet)  # mark wallet as dirty for update

    db.session.commit()

    return jsonify({
        "message": "Ledger settled",
        "previous_balance": balance,
        "settlement_amount": -balance
    })


# --------------------------------
# LEDGER STATUS
# --------------------------------
@ledger_bp.route("/api/ledgers/<int:customer_id>/status", methods=["GET"])
@admin_required
def ledger_status(customer_id):

    customer = Customer.query.get_or_404(customer_id)

    transactions = Transaction.query.filter_by(customer_id=customer_id).all()

    balance = sum(txn.amount for txn in transactions)

    return jsonify({
        "customer_id": customer_id,
        "customer_name": customer.name,
        "balance": balance
    })


# --------------------------------
# DELETE CUSTOMER VIA LEDGER
# --------------------------------
@ledger_bp.route("/api/ledgers/<int:customer_id>/customer", methods=["DELETE"])
@admin_required
def delete_customer_from_ledger(customer_id):

    customer = Customer.query.get_or_404(customer_id)
    user = customer.user

    # Clear self-referential links first so the customer row can be removed safely.
    for referred_customer in Customer.query.filter_by(referred_by_id=customer_id).all():
        referred_customer.referred_by_id = None

    for txn in Transaction.query.filter_by(customer_id=customer_id).all():
        db.session.delete(txn)

    for bill in Bill.query.filter_by(customer_id=customer_id).all():
        db.session.delete(bill)

    for ret in Return.query.filter_by(customer_id=customer_id).all():
        db.session.delete(ret)

    for payment in Payment.query.filter_by(customer_id=customer_id).all():
        db.session.delete(payment)

    wallet = Wallet.query.filter_by(customer_id=customer_id).first()
    if wallet:
        db.session.delete(wallet)

    db.session.delete(customer)

    if user:
        db.session.delete(user)

    db.session.commit()

    return jsonify({
        "message": "Customer deleted successfully"
    }), 200
