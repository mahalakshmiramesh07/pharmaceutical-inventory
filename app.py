"""
PharmaCare — app.py
Hospital Pharmacy Inventory Management System
Flask Backend with MySQL
"""

from flask import Flask, request, jsonify, session
from flask_cors import CORS
import mysql.connector
from mysql.connector import Error
import hashlib
import os
from datetime import date, datetime

app = Flask(__name__)
app.secret_key = "pharmacare_secret_key_2025"

# ── CORS: allow frontend at Live Server port 5500 ──────────────────────────
CORS(app, supports_credentials=True, origins=[
    "http://127.0.0.1:5500",
    "http://localhost:5500"
])

# ══════════════════════════════════════════════════════════════════════════
#  DATABASE CONNECTION
# ══════════════════════════════════════════════════════════════════════════

def get_db():
    return mysql.connector.connect(
        host="localhost",
        user="root",
        password="root123",
        database="pharmacare"
    )

# ══════════════════════════════════════════════════════════════════════════
#  DATABASE SETUP — runs once on startup, creates all tables
# ══════════════════════════════════════════════════════════════════════════

def setup_database():
    try:
        # Connect without selecting a database first
        con = mysql.connector.connect(
            host="localhost",
            user="root",
            password="root123",
        )
        cur = con.cursor()

        # Create database if it doesn't exist
        cur.execute("CREATE DATABASE IF NOT EXISTS pharmacare")
        cur.execute("USE pharmacare")

        # ── Users table ──────────────────────────────────────────────────
        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id       INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(100) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL
            )
        """)

        # ── Medicines table ──────────────────────────────────────────────
        cur.execute("""
            CREATE TABLE IF NOT EXISTS medicines (
                id        INT AUTO_INCREMENT PRIMARY KEY,
                name      VARCHAR(200) NOT NULL,
                category  VARCHAR(100),
                price     DECIMAL(10,2) DEFAULT 0,
                stock     INT DEFAULT 0,
                min_stock INT DEFAULT 10
            )
        """)

        # Add min_stock column if it doesn't exist yet (for existing databases)
        try:
            cur.execute("ALTER TABLE medicines ADD COLUMN min_stock INT DEFAULT 10")
            con.commit()
        except Error:
            pass  # Column already exists — that's fine

        # ── Batches table ────────────────────────────────────────────────
        cur.execute("""
            CREATE TABLE IF NOT EXISTS batches (
                id           INT AUTO_INCREMENT PRIMARY KEY,
                medicine_id  INT NOT NULL,
                batch_number VARCHAR(100),
                quantity     INT DEFAULT 0,
                expiry_date  DATE,
                FOREIGN KEY (medicine_id) REFERENCES medicines(id) ON DELETE CASCADE
            )
        """)

        # ── Suppliers table ──────────────────────────────────────────────
        cur.execute("""
            CREATE TABLE IF NOT EXISTS suppliers (
                id             INT AUTO_INCREMENT PRIMARY KEY,
                name           VARCHAR(200) NOT NULL,
                contact_person VARCHAR(200),
                phone          VARCHAR(20),
                email          VARCHAR(200)
            )
        """)

        # ── Sales table ──────────────────────────────────────────────────
        cur.execute("""
            CREATE TABLE IF NOT EXISTS sales (
                id             INT AUTO_INCREMENT PRIMARY KEY,
                medicine_id    INT,
                quantity       INT,
                price_per_unit DECIMAL(10,2),
                total_price    DECIMAL(10,2),
                sale_date      DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (medicine_id) REFERENCES medicines(id) ON DELETE SET NULL
            )
        """)

        # ── Purchases table (NEW) ────────────────────────────────────────
        cur.execute("""
            CREATE TABLE IF NOT EXISTS purchases (
                id            INT AUTO_INCREMENT PRIMARY KEY,
                medicine_id   INT,
                supplier_id   INT,
                quantity      INT,
                cost_per_unit DECIMAL(10,2),
                total_cost    DECIMAL(10,2),
                purchase_date DATE,
                FOREIGN KEY (medicine_id) REFERENCES medicines(id) ON DELETE SET NULL,
                FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL
            )
        """)

        con.commit()
        con.close()
        print("✅ Database and tables ready.")

    except Error as e:
        print(f"❌ Database setup error: {e}")

# ══════════════════════════════════════════════════════════════════════════
#  HELPERS
# ══════════════════════════════════════════════════════════════════════════

def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()

def login_required(f):
    from functools import wraps
    @wraps(f)
    def decorated(*args, **kwargs):
        if "user_id" not in session:
            return jsonify({"error": "Not logged in"}), 401
        return f(*args, **kwargs)
    return decorated

# Convert non-serialisable types (Decimal, date, datetime) for JSON
def row_to_dict(cursor, row):
    if row is None:
        return None
    cols = [d[0] for d in cursor.description]
    result = {}
    for col, val in zip(cols, row):
        if isinstance(val, (date, datetime)):
            result[col] = str(val)
        else:
            result[col] = val
    return result

def rows_to_list(cursor, rows):
    return [row_to_dict(cursor, r) for r in rows]

# ══════════════════════════════════════════════════════════════════════════
#  AUTH ROUTES
# ══════════════════════════════════════════════════════════════════════════

@app.route("/register", methods=["POST"])
def register():
    data = request.json
    username = data.get("username", "").strip()
    password = data.get("password", "")
    if not username or not password:
        return jsonify({"error": "Username and password required"}), 400
    try:
        con = get_db(); cur = con.cursor()
        cur.execute("INSERT INTO users (username, password) VALUES (%s, %s)",
                    (username, hash_password(password)))
        con.commit()
        con.close()
        return jsonify({"message": "User registered successfully"})
    except Error as e:
        return jsonify({"error": "Username already exists"}), 400

@app.route("/login", methods=["POST"])
def login():
    data = request.json
    username = data.get("username", "").strip()
    password = data.get("password", "")
    try:
        con = get_db(); cur = con.cursor()
        cur.execute("SELECT id FROM users WHERE username=%s AND password=%s",
                    (username, hash_password(password)))
        user = cur.fetchone()
        con.close()
        if user:
            session["user_id"]  = user[0]
            session["username"] = username
            return jsonify({"message": "Login successful"})
        return jsonify({"error": "Invalid username or password"}), 401
    except Error as e:
        return jsonify({"error": str(e)}), 500

@app.route("/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"message": "Logged out"})

@app.route("/auth-status", methods=["GET"])
def auth_status():
    if "user_id" in session:
        return jsonify({"logged_in": True, "username": session.get("username")})
    return jsonify({"logged_in": False})

# ══════════════════════════════════════════════════════════════════════════
#  DASHBOARD
# ══════════════════════════════════════════════════════════════════════════

@app.route("/dashboard", methods=["GET"])
@login_required
def dashboard():
    try:
        con = get_db(); cur = con.cursor()

        cur.execute("SELECT COUNT(*) FROM medicines")
        total_medicines = cur.fetchone()[0]

        cur.execute("SELECT COALESCE(SUM(stock), 0) FROM medicines")
        total_stock = cur.fetchone()[0]

        cur.execute("SELECT COUNT(*) FROM sales")
        total_sales = cur.fetchone()[0]

        # Expiry alerts — within 60 days
        cur.execute("""
            SELECT COUNT(*) FROM batches
            WHERE expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 60 DAY)
        """)
        expiry_alerts = cur.fetchone()[0]

        # Low stock — compare against each medicine's min_stock
        cur.execute("""
            SELECT COUNT(*) FROM medicines
            WHERE stock < min_stock
        """)
        low_stock = cur.fetchone()[0]

        con.close()
        return jsonify({
            "total_medicines": total_medicines,
            "total_stock":     int(total_stock),
            "total_sales":     total_sales,
            "expiry_alerts":   expiry_alerts,
            "low_stock":       low_stock
        })
    except Error as e:
        return jsonify({"error": str(e)}), 500

# ══════════════════════════════════════════════════════════════════════════
#  MEDICINES
# ══════════════════════════════════════════════════════════════════════════

@app.route("/medicines", methods=["GET"])
@login_required
def get_medicines():
    try:
        con = get_db(); cur = con.cursor()
        cur.execute("""
            SELECT m.id, m.name, m.category, m.price, m.stock, m.min_stock,
                   COALESCE(SUM(b.quantity), m.stock) AS total_stock
            FROM medicines m
            LEFT JOIN batches b ON b.medicine_id = m.id
            GROUP BY m.id, m.name, m.category, m.price, m.stock, m.min_stock
            ORDER BY m.name
        """)
        result = rows_to_list(cur, cur.fetchall())
        con.close()
        return jsonify(result)
    except Error as e:
        return jsonify({"error": str(e)}), 500

@app.route("/medicines", methods=["POST"])
@login_required
def add_medicine():
    data = request.json
    try:
        con = get_db(); cur = con.cursor()
        cur.execute("""
            INSERT INTO medicines (name, category, price, stock, min_stock)
            VALUES (%s, %s, %s, %s, %s)
        """, (
            data.get("name"),
            data.get("category", ""),
            float(data.get("price", 0)),
            int(data.get("stock", 0)),
            int(data.get("min_stock", 10))
        ))
        con.commit()
        new_id = cur.lastrowid
        con.close()
        return jsonify({"id": new_id, "message": "Medicine added"})
    except Error as e:
        return jsonify({"error": str(e)}), 500

@app.route("/medicines/<int:med_id>", methods=["PUT"])
@login_required
def update_medicine(med_id):
    data = request.json
    try:
        con = get_db(); cur = con.cursor()
        cur.execute("""
            UPDATE medicines
            SET name=%s, category=%s, price=%s, stock=%s, min_stock=%s
            WHERE id=%s
        """, (
            data.get("name"),
            data.get("category", ""),
            float(data.get("price", 0)),
            int(data.get("stock", 0)),
            int(data.get("min_stock", 10)),
            med_id
        ))
        con.commit()
        con.close()
        return jsonify({"message": "Medicine updated"})
    except Error as e:
        return jsonify({"error": str(e)}), 500

@app.route("/medicines/<int:med_id>", methods=["DELETE"])
@login_required
def delete_medicine(med_id):
    try:
        con = get_db(); cur = con.cursor()
        cur.execute("DELETE FROM medicines WHERE id=%s", (med_id,))
        con.commit()
        con.close()
        return jsonify({"message": "Medicine deleted"})
    except Error as e:
        return jsonify({"error": str(e)}), 500

# ══════════════════════════════════════════════════════════════════════════
#  BATCHES
# ══════════════════════════════════════════════════════════════════════════

@app.route("/batches", methods=["GET"])
@login_required
def get_batches():
    try:
        con = get_db(); cur = con.cursor()
        cur.execute("""
            SELECT b.id, b.batch_number, b.quantity, b.expiry_date,
                   m.name AS medicine_name
            FROM batches b
            JOIN medicines m ON b.medicine_id = m.id
            ORDER BY b.expiry_date ASC
        """)
        result = rows_to_list(cur, cur.fetchall())
        con.close()
        return jsonify(result)
    except Error as e:
        return jsonify({"error": str(e)}), 500

@app.route("/batches", methods=["POST"])
@login_required
def add_batch():
    data = request.json
    try:
        con = get_db(); cur = con.cursor()
        cur.execute("""
            INSERT INTO batches (medicine_id, batch_number, quantity, expiry_date)
            VALUES (%s, %s, %s, %s)
        """, (
            int(data.get("medicine_id")),
            data.get("batch_number"),
            int(data.get("quantity", 0)),
            data.get("expiry_date")
        ))
        # Also update the medicine stock total
        cur.execute("""
            UPDATE medicines
            SET stock = (SELECT COALESCE(SUM(quantity),0) FROM batches WHERE medicine_id=%s)
            WHERE id=%s
        """, (int(data.get("medicine_id")), int(data.get("medicine_id"))))
        con.commit()
        new_id = cur.lastrowid
        con.close()
        return jsonify({"id": new_id, "message": "Batch added"})
    except Error as e:
        return jsonify({"error": str(e)}), 500

# ══════════════════════════════════════════════════════════════════════════
#  SELL MEDICINE (FIFO — oldest expiry batch first)
# ══════════════════════════════════════════════════════════════════════════

@app.route("/sell", methods=["POST"])
@login_required
def sell():
    data = request.json
    medicine_id    = int(data.get("medicine_id"))
    qty_to_sell    = int(data.get("quantity"))
    price_per_unit = float(data.get("price_per_unit", 0))

    try:
        con = get_db(); cur = con.cursor()

        # Check total available stock
        cur.execute("SELECT stock FROM medicines WHERE id=%s", (medicine_id,))
        row = cur.fetchone()
        if not row:
            return jsonify({"error": "Medicine not found"}), 404
        if row[0] < qty_to_sell:
            return jsonify({"error": f"Not enough stock. Available: {row[0]}"}), 400

        # FIFO: deplete batches oldest expiry first
        cur.execute("""
            SELECT id, quantity FROM batches
            WHERE medicine_id=%s AND quantity > 0
            ORDER BY expiry_date ASC
        """, (medicine_id,))
        batches = cur.fetchall()

        remaining = qty_to_sell
        for batch_id, batch_qty in batches:
            if remaining <= 0:
                break
            take = min(remaining, batch_qty)
            cur.execute("UPDATE batches SET quantity = quantity - %s WHERE id=%s",
                        (take, batch_id))
            remaining -= take

        # Update medicine stock
        cur.execute("UPDATE medicines SET stock = stock - %s WHERE id=%s",
                    (qty_to_sell, medicine_id))

        # Record the sale
        total_price = qty_to_sell * price_per_unit
        cur.execute("""
            INSERT INTO sales (medicine_id, quantity, price_per_unit, total_price)
            VALUES (%s, %s, %s, %s)
        """, (medicine_id, qty_to_sell, price_per_unit, total_price))

        con.commit()
        con.close()
        return jsonify({"message": "Sale recorded", "total_price": total_price})
    except Error as e:
        return jsonify({"error": str(e)}), 500

# ══════════════════════════════════════════════════════════════════════════
#  SALES HISTORY
# ══════════════════════════════════════════════════════════════════════════

@app.route("/sales", methods=["GET"])
@login_required
def get_sales():
    try:
        con = get_db(); cur = con.cursor()
        cur.execute("""
            SELECT s.id, m.name AS medicine_name,
                   s.quantity, s.price_per_unit, s.total_price, s.sale_date
            FROM sales s
            LEFT JOIN medicines m ON s.medicine_id = m.id
            ORDER BY s.sale_date DESC
        """)
        result = rows_to_list(cur, cur.fetchall())
        con.close()
        return jsonify(result)
    except Error as e:
        return jsonify({"error": str(e)}), 500

# ══════════════════════════════════════════════════════════════════════════
#  ANALYTICS  (NEW)
# ══════════════════════════════════════════════════════════════════════════

@app.route("/analytics", methods=["GET"])
@login_required
def analytics():
    try:
        con = get_db(); cur = con.cursor()

        # Daily revenue — last 7 days
        cur.execute("""
            SELECT DATE(sale_date) AS sale_day,
                   COALESCE(SUM(total_price), 0) AS revenue
            FROM sales
            WHERE sale_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
            GROUP BY sale_day
            ORDER BY sale_day ASC
        """)
        daily_rows = cur.fetchall()
        daily = [{"date": str(r[0]), "revenue": float(r[1])} for r in daily_rows]

        # Monthly revenue — this year
        cur.execute("""
            SELECT MONTH(sale_date) AS mnth,
                   COALESCE(SUM(total_price), 0) AS revenue
            FROM sales
            WHERE YEAR(sale_date) = YEAR(CURDATE())
            GROUP BY mnth
            ORDER BY mnth ASC
        """)
        monthly_rows = cur.fetchall()
        monthly = [{"month": r[0], "revenue": float(r[1])} for r in monthly_rows]

        # Top 5 medicines by quantity sold
        cur.execute("""
            SELECT m.name, COALESCE(SUM(s.quantity), 0) AS total_qty
            FROM sales s
            JOIN medicines m ON s.medicine_id = m.id
            GROUP BY m.id, m.name
            ORDER BY total_qty DESC
            LIMIT 5
        """)
        top_rows = cur.fetchall()
        top_medicines = [{"name": r[0], "total_qty": int(r[1])} for r in top_rows]

        # Total transactions count
        cur.execute("SELECT COUNT(*) FROM sales")
        total_transactions = cur.fetchone()[0]

        con.close()
        return jsonify({
            "daily":              daily,
            "monthly":            monthly,
            "top_medicines":      top_medicines,
            "total_transactions": total_transactions
        })
    except Error as e:
        return jsonify({"error": str(e)}), 500

# ══════════════════════════════════════════════════════════════════════════
#  PURCHASES  (NEW)
# ══════════════════════════════════════════════════════════════════════════

@app.route("/purchases", methods=["GET"])
@login_required
def get_purchases():
    try:
        con = get_db(); cur = con.cursor()
        cur.execute("""
            SELECT p.id, m.name AS medicine_name, s.name AS supplier_name,
                   p.quantity, p.cost_per_unit, p.total_cost, p.purchase_date
            FROM purchases p
            LEFT JOIN medicines m ON p.medicine_id = m.id
            LEFT JOIN suppliers s ON p.supplier_id = s.id
            ORDER BY p.purchase_date DESC
        """)
        result = rows_to_list(cur, cur.fetchall())
        con.close()
        return jsonify(result)
    except Error as e:
        return jsonify({"error": str(e)}), 500

@app.route("/purchases", methods=["POST"])
@login_required
def add_purchase():
    data = request.json
    medicine_id   = int(data.get("medicine_id"))
    supplier_id   = int(data.get("supplier_id"))
    quantity      = int(data.get("quantity"))
    cost_per_unit = float(data.get("cost_per_unit"))
    total_cost    = quantity * cost_per_unit
    purchase_date = data.get("purchase_date") or str(date.today())

    try:
        con = get_db(); cur = con.cursor()
        cur.execute("""
            INSERT INTO purchases (medicine_id, supplier_id, quantity, cost_per_unit, total_cost, purchase_date)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (medicine_id, supplier_id, quantity, cost_per_unit, total_cost, purchase_date))

        # Also increase the medicine stock when a purchase is recorded
        cur.execute("UPDATE medicines SET stock = stock + %s WHERE id=%s",
                    (quantity, medicine_id))

        con.commit()
        new_id = cur.lastrowid
        con.close()
        return jsonify({"id": new_id, "message": "Purchase recorded"})
    except Error as e:
        return jsonify({"error": str(e)}), 500

# ══════════════════════════════════════════════════════════════════════════
#  SUPPLIERS
# ══════════════════════════════════════════════════════════════════════════

@app.route("/suppliers", methods=["GET"])
@login_required
def get_suppliers():
    try:
        con = get_db(); cur = con.cursor()
        cur.execute("SELECT * FROM suppliers ORDER BY name")
        result = rows_to_list(cur, cur.fetchall())
        con.close()
        return jsonify(result)
    except Error as e:
        return jsonify({"error": str(e)}), 500

@app.route("/suppliers", methods=["POST"])
@login_required
def add_supplier():
    data = request.json
    try:
        con = get_db(); cur = con.cursor()
        cur.execute("""
            INSERT INTO suppliers (name, contact_person, phone, email)
            VALUES (%s, %s, %s, %s)
        """, (
            data.get("name"),
            data.get("contact_person", ""),
            data.get("phone", ""),
            data.get("email", "")
        ))
        con.commit()
        new_id = cur.lastrowid
        con.close()
        return jsonify({"id": new_id, "message": "Supplier added"})
    except Error as e:
        return jsonify({"error": str(e)}), 500

@app.route("/suppliers/<int:sup_id>", methods=["DELETE"])
@login_required
def delete_supplier(sup_id):
    try:
        con = get_db(); cur = con.cursor()
        cur.execute("DELETE FROM suppliers WHERE id=%s", (sup_id,))
        con.commit()
        con.close()
        return jsonify({"message": "Supplier deleted"})
    except Error as e:
        return jsonify({"error": str(e)}), 500

# ══════════════════════════════════════════════════════════════════════════
#  EXPIRY ALERTS  (updated — accepts ?days= parameter, default 60)
# ══════════════════════════════════════════════════════════════════════════

@app.route("/expiry-alerts", methods=["GET"])
@login_required
def expiry_alerts():
    try:
        days = int(request.args.get("days", 60))
    except ValueError:
        days = 60

    try:
        con = get_db(); cur = con.cursor()
        cur.execute("""
            SELECT b.id, m.name AS medicine_name, b.batch_number,
                   b.quantity, b.expiry_date
            FROM batches b
            JOIN medicines m ON b.medicine_id = m.id
            WHERE b.expiry_date <= DATE_ADD(CURDATE(), INTERVAL %s DAY)
            ORDER BY b.expiry_date ASC
        """, (days,))
        result = rows_to_list(cur, cur.fetchall())
        con.close()
        return jsonify(result)
    except Error as e:
        return jsonify({"error": str(e)}), 500

# ══════════════════════════════════════════════════════════════════════════
#  LOW STOCK ALERTS  (updated — uses per-medicine min_stock)
# ══════════════════════════════════════════════════════════════════════════

@app.route("/low-stock", methods=["GET"])
@login_required
def low_stock():
    try:
        con = get_db(); cur = con.cursor()
        cur.execute("""
            SELECT id, name, category, stock, min_stock,
                   stock AS total_stock
            FROM medicines
            WHERE stock < min_stock
            ORDER BY stock ASC
        """)
        result = rows_to_list(cur, cur.fetchall())
        con.close()
        return jsonify(result)
    except Error as e:
        return jsonify({"error": str(e)}), 500

# ══════════════════════════════════════════════════════════════════════════
#  START SERVER
# ══════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    setup_database()   # Create tables automatically on first run
    app.run(debug=True, port=5000)