from flask import Blueprint, request, jsonify
from flask_security import auth_required
from extensions import db
from models import Payment, Customer, Wallet, Transaction
from datetime import datetime

payments_bp = Blueprint("payments", __name__)


# --------------------------------
# RECORD PAYMENT
# --------------------------------
@payments_bp.route("/api/payments", methods=["POST"])
@auth_required()
def record_payment():

    data = request.get_json(force=True)

    customer_id = data.get("customer_id")
    amount      = data.get("amount")
    method      = data.get("method", "cash")   # cash / upi / cheque
    notes       = data.get("notes")

    if not customer_id or not amount:
        return jsonify({"message": "customer_id and amount required"}), 400

    customer = Customer.query.get_or_404(customer_id)

    payment = Payment(
        customer_id=customer_id,
        amount=amount,
        method=method,
        notes=notes,
        timestamp=datetime.utcnow()
    )
    db.session.add(payment)
    db.session.flush()   # get payment.id

    # Unified wallet: payment adds to wallet balance
    if customer.wallet:
        customer.wallet.balance += amount
    else:
        wallet = Wallet(customer_id=customer_id, balance=amount)
        db.session.add(wallet)

    # Transaction: PAYMENT amount is NEGATIVE (reduces ledger balance = reduces what customer owes)
    txn = Transaction(
        customer_id=customer_id,
        transaction_type="PAYMENT",
        amount=-amount,          # negative = reduces outstanding debt
        reference_type="payment",
        reference_id=payment.id,
        notes=notes
    )
    db.session.add(txn)

    db.session.commit()

    return jsonify({
        "message": "Payment recorded successfully",
        "payment_id": payment.id
    }), 201


# --------------------------------
# LIST PAYMENTS FOR CUSTOMER
# --------------------------------
@payments_bp.route("/api/payments", methods=["GET"])
@auth_required()
def list_payments():

    customer_id = request.args.get("customer_id", type=int)

    query = Payment.query.order_by(Payment.timestamp.desc())

    if customer_id:
        query = query.filter_by(customer_id=customer_id)

    payments = query.limit(200).all()

    return jsonify([
        {
            "id": p.id,
            "customer_id": p.customer_id,
            "customer_name": p.customer.name if p.customer else None,
            "amount": p.amount,
            "method": p.method,
            "notes": p.notes,
            "timestamp": p.timestamp.isoformat()
        }
        for p in payments
    ])