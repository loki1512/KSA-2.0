from flask import Blueprint, render_template
from flask_security import auth_required, current_user
from auth_helpers import forbidden_response, is_admin
from models import Bill

invoice_bp = Blueprint("invoice", __name__)

@invoice_bp.route("/invoice/<int:bill_id>")
@auth_required()
def public_invoice(bill_id):

    bill = Bill.query.get_or_404(bill_id)
    if not is_admin() and (
        not bill.customer
        or not current_user.customer
        or bill.customer.id != current_user.customer.id
    ):
        return forbidden_response()

    return render_template(
        "invoice.html",
        bill=bill,
        items=bill.items,
        customer=bill.customer
    )
