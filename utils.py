def apply_discount(amount, discount_type, discount_value):
    """
    Apply discount to amount.
    discount_type: '%' or '₹'
    discount_value: float
    """
    if not discount_type or discount_value is None:
        return round(amount, 2)

    try:
        discount_value = float(discount_value)
    except (TypeError, ValueError):
        return round(amount, 2)

    if discount_value <= 0:
        return round(amount, 2)

    if discount_type == "%":
        return round(amount * (1 - discount_value / 100), 2)

    if discount_type == "₹":
        return round(max(amount - discount_value, 0), 2)

    return round(amount, 2)
from datetime import datetime

def generate_bill_no():
    """
    Generates bill number like: BILL-20250124-001
    """
    now = datetime.now()
    return f"BILL-{now.strftime('%Y%m%d-%H%M%S')}"
