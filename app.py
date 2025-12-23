from flask import Flask, render_template, jsonify, request
from extensions import db
from models import Item
import pandas as pd

app = Flask(__name__)
@app.route("/ping")
def ping():
    return "pong"


@app.route("/api/items/import", methods=["POST"])
def import_items():
    file = request.files.get("file")
    if not file:
        return jsonify({"error": "No file uploaded"}), 400

    df = pd.read_excel(file)

    if "name" not in df.columns or "price" not in df.columns:
        return jsonify({"error": "Excel must have name and price columns"}), 400

    added = 0
    updated = 0

    for _, row in df.iterrows():
        name = str(row["name"]).strip()
        try:
            price = float(row["price"])
        except Exception:
            continue

        if not name or price <= 0:
            continue

        item = Item.query.filter_by(name=name).first()
        if item:
            item.default_price = price
            updated += 1
        else:
            db.session.add(Item(name=name, default_price=price))
            added += 1

    db.session.commit()

    return jsonify({
        "added": added,
        "updated": updated
    })
    
    
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

app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///db.sqlite3"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db.init_app(app)

from models import Item, Bill, BillItem  # safe now

@app.route("/")
def index():
    return render_template("index.html")

if __name__ == "__main__":
    with app.app_context():
        db.create_all()
    app.run(host="0.0.0.0", port=5000, debug=True)
    
    




