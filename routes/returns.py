from flask import Blueprint, request, jsonify
from auth_helpers import admin_required
from extensions import db
from models import Return, ReturnItem, Customer, Wallet, Transaction, Item
from datetime import datetime

returns_bp = Blueprint("returns", __name__)


# --------------------------------
# CREATE RETURN
# --------------------------------
@returns_bp.route("/api/returns/<int:customer_id>", methods=["POST"])
@admin_required
def create_return(customer_id):

    data = request.get_json(force=True)
    customer = db.session.get(Customer, customer_id)

    ret = Return(
        total_refund_amount=data["totalRefundAmount"],
        timestamp=datetime.utcnow(),
        customer=customer
    )

    for it in data["items"]:
        # Look up item to get cost_price
        item_obj = Item.query.filter_by(name=it["name"]).first()
        cost_price = item_obj.cost_price if item_obj and item_obj.cost_price else None

        item = ReturnItem(
            item_name=it["name"],
            qty=it["qty"],
            cost_price=cost_price,
            unit_price=it["rate"],
            refund_amount=it["lineTotal"]
        )
        ret.items.append(item)

    db.session.add(ret)
    db.session.flush()

    if customer:
        # Unified wallet: refund adds to wallet balance
        if customer.wallet:
            customer.wallet.balance += ret.total_refund_amount
        else:
            wallet = Wallet(
                customer_id=customer.id,
                balance=ret.total_refund_amount
            )
            db.session.add(wallet)

        # Transaction: REFUND amount is NEGATIVE (reduces ledger balance)
        txn = Transaction(
            customer_id=customer.id,
            transaction_type="REFUND",
            amount=-ret.total_refund_amount,    # negative = reduces outstanding debt
            reference_type="return",
            reference_id=ret.id
        )
        db.session.add(txn)

    db.session.commit()

    return jsonify({
        "message": "Return created successfully",
        "return_id": ret.id
    }), 201


# --------------------------------
# GET RETURN
# --------------------------------
@returns_bp.route("/api/returns/<int:return_id>", methods=["GET"])
@admin_required
def get_return(return_id):

    ret = Return.query.get_or_404(return_id)

    return jsonify({
        "id": ret.id,
        "customer_id": ret.customer_id,
        "customer_name": ret.customer.name if ret.customer else None,
        "timestamp": ret.timestamp.isoformat(),
        "total_refund_amount": ret.total_refund_amount,
        "items": [
            {
                "id": it.id,
                "item_name": it.item_name,
                "qty": it.qty,
                "unit_price": it.unit_price,
                "refund_amount": it.refund_amount
            }
            for it in ret.items
        ]
    })


# --------------------------------
# LIST RETURNS FOR CUSTOMER
# --------------------------------
@returns_bp.route("/api/returns", methods=["GET"])
@admin_required
def list_returns():

    customer_id = request.args.get("customer_id", type=int)

    query = Return.query.order_by(Return.timestamp.desc())

    if customer_id:
        query = query.filter_by(customer_id=customer_id)

    returns = query.limit(200).all()

    return jsonify([
        {
            "id": r.id,
            "customer_id": r.customer_id,
            "customer_name": r.customer.name if r.customer else None,
            "timestamp": r.timestamp.isoformat(),
            "total_refund_amount": r.total_refund_amount
        }
        for r in returns
    ])


# --------------------------------
# DELETE RETURN
# --------------------------------
@returns_bp.route("/api/returns/<int:return_id>", methods=["DELETE"])
@admin_required
def delete_return(return_id):

    ret = Return.query.get_or_404(return_id)

    # Reverse wallet credit if customer exists
    if ret.customer and ret.customer.wallet:
        ret.customer.wallet.balance -= ret.total_refund_amount

    # Remove linked transaction
    Transaction.query.filter_by(
        reference_type="return",
        reference_id=ret.id
    ).delete()

    db.session.delete(ret)
    db.session.commit()

    return jsonify({"message": "Return deleted successfully"})
