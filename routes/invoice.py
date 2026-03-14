from flask import Blueprint, render_template
from models import Bill

invoice_bp = Blueprint("invoice", __name__)

@invoice_bp.route("/invoice/<int:bill_id>")
def public_invoice(bill_id):

    bill = Bill.query.get_or_404(bill_id)

    return render_template(
        "invoice.html",
        bill=bill,
        items=bill.items,
        customer=bill.customer
    )