from flask import Flask, render_template, jsonify, request
from extensions import db
from models import Item
import pandas as pd
from utils import generate_bill_no


app = Flask(__name__)
@app.route("/ping")
def ping():
    return "pong"

@app.route("/")
def index():
    return render_template("index.html")
@app.route("/catalog")
def catalog():
    return render_template("catalog.html")

    
    
@app.route("/api/items/search")
def search_items():
    q = request.args.get("q", "").strip()

    if not q:
        return jsonify([])

    items = (
        Item.query
        .filter(Item.name.ilike(f"%{q}%"))
        .limit(5)
        .all()
    )

    return jsonify([
        {"id": i.id, "name": i.name, "price": i.default_price}
        for i in items
    ])




#Catalog routes
@app.route("/api/items", methods=["GET"])
def get_items():
    items = Item.query.order_by(Item.name).all()
    return [
        {
            "id": i.id,
            "name": i.name,
            "default_price": i.default_price
        }
        for i in items
    ]

@app.route("/api/items", methods=["POST"])
def add_item():
    data = request.json
    name = data.get("name", "").strip()
    price = data.get("price")

    if not name or not isinstance(price, (int, float)):
        return {"error": "Invalid input"}, 400

    if Item.query.filter_by(name=name).first():
        return {"error": "Item already exists"}, 400

    item = Item(name=name, default_price=price)
    db.session.add(item)
    db.session.commit()

    return {"id": item.id}

@app.route("/api/items/<int:item_id>", methods=["PUT"])
def update_item(item_id):
    item = Item.query.get_or_404(item_id)
    data = request.json

    name = data.get("name", "").strip()
    price = data.get("price")

    if not name or not isinstance(price, (int, float)):
        return {"error": "Invalid input"}, 400

    item.name = name
    item.default_price = price
    db.session.commit()

    return {"success": True}

@app.route("/api/items/<int:item_id>", methods=["DELETE"])
def delete_item(item_id):
    item = Item.query.get_or_404(item_id)
    db.session.delete(item)
    db.session.commit()
    return {"success": True}

import pandas as pd
from sqlalchemy import func

@app.route("/api/items/import", methods=["POST"])
def import_items():
    file = request.files.get("file")
    if not file:
        return {"error": "No file uploaded"}, 400

    df = pd.read_excel(file)

    added = updated = skipped = 0

    for _, row in df.iterrows():
        name = str(row.get("name", "")).strip()
        price = row.get("price")

        if not name or not isinstance(price, (int, float)):
            skipped += 1
            continue

        item = Item.query.filter(
            func.lower(Item.name) == name.lower()
        ).first()

        if item:
            item.default_price = price
            updated += 1
        else:
            db.session.add(Item(name=name, default_price=price))
            added += 1

    db.session.commit()

    return {
        "added": added,
        "updated": updated,
        "skipped": skipped
    }
    
# @app.route("/api/bills", methods=["POST"])
from flask import request, jsonify
from datetime import datetime
from extensions import db
from models import Bill, BillItem
@app.route("/api/bills", methods=["POST"])
def save_bill():
    data = request.get_json(force=True)

    # --------- Create Bill ----------
    bill_discount = data.get("billDiscount") or {}

    bill = Bill(
        subtotal=data["subtotal"],
        bill_discount_type=bill_discount.get("type"),
        bill_discount_value=bill_discount.get("value"),
        final_amount=data["finalTotal"],

        # optional customer fields (safe even if missing)
        customer_name=data.get("customer_name"),
        customer_phone=data.get("customer_phone"),
        customer_address=data.get("customer_address"),

        timestamp=datetime.utcnow()
    )

    db.session.add(bill)
    db.session.flush()  # bill.id available

    # --------- Create Bill Items ----------
    for it in data["items"]:
        discount = it.get("discount") or {}

        bill_item = BillItem(
            bill_id=bill.id,
            item_name=it["name"],
            qty=it["qty"],
            unit_price=it["rate"],
            item_discount_type=discount.get("type"),
            item_discount_value=discount.get("value"),
            final_item_amount=it["lineTotal"]
        )

        db.session.add(bill_item)

    db.session.commit()

    return jsonify({
        "bill_id": bill.id,
        "timestamp": bill.timestamp.isoformat()
    })




app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///db.sqlite3"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db.init_app(app)

from models import Item, Bill, BillItem  # safe now



if __name__ == "__main__":
    with app.app_context():
        db.create_all()
    app.run(host="0.0.0.0", port=5000, debug=True)
    
    




