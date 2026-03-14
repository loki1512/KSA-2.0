from flask import Blueprint, jsonify
from extensions import db
from models import Transaction, Customer, Wallet, Bill, Return, Payment

ledger_bp = Blueprint("ledger", __name__)


# --------------------------------
# GET CUSTOMER LEDGER
# --------------------------------
@ledger_bp.route("/api/ledgers/<int:customer_id>", methods=["GET"])
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


# --------------------------------
# CLEAR CUSTOMER LEDGER
# --------------------------------
@ledger_bp.route("/api/ledgers/<int:customer_id>/transactions", methods=["DELETE"])
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
def ledger_status(customer_id):

    customer = Customer.query.get_or_404(customer_id)

    transactions = Transaction.query.filter_by(customer_id=customer_id).all()

    balance = sum(txn.amount for txn in transactions)

    return jsonify({
        "customer_id": customer_id,
        "customer_name": customer.name,
        "balance": balance
    })