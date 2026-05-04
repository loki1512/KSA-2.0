from flask import Blueprint, request, jsonify
from auth_helpers import admin_required
from extensions import db
from models import Transaction, Customer, Bill, Return, Payment
from datetime import datetime

transactions_bp = Blueprint("transactions", __name__)


@transactions_bp.route("/api/transactions", methods=["GET"])
@admin_required
def all_transactions():
    page  = int(request.args.get("page", 1))
    limit = int(request.args.get("limit", 100))
    offset = (page - 1) * limit

    txns = (
        Transaction.query
        .order_by(Transaction.timestamp.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    total = Transaction.query.count()

    return jsonify({
        "total": total,
        "page": page,
        "limit": limit,
        "transactions": [
            {
                "id": t.id,
                "customer_id": t.customer_id,
                "customer_name": t.customer.name if t.customer else None,
                "customer_phone": t.customer.phone if t.customer else None,
                "type": t.transaction_type,
                "amount": t.amount,
                "reference_type": t.reference_type,
                "reference_id": t.reference_id,
                "notes": t.notes,
                "timestamp": t.timestamp.isoformat()
            }
            for t in txns
        ]
    })
