import os
import json
import math
import sqlite3
from datetime import datetime

from flask import Flask, render_template, request, jsonify, session
from werkzeug.security import generate_password_hash, check_password_hash
from dotenv import load_dotenv
from google import genai

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "wanderai_super_secret_key_2026")

api_key = os.getenv("GEMINI_API_KEY")
client = genai.Client(api_key=api_key) if api_key else None

DB_PATH = "wanderai.db"

VALID_INTERESTS = {"Nature", "Adventure", "History", "Food", "Shopping", "Relaxation"}
VALID_COMPANIONS = {"Solo", "Friends", "Family", "Couple", "Group"}
VALID_STYLES = {"Budget", "Balanced", "Luxury"}
BUDGET_CATEGORIES = ["transport", "accommodation", "food", "activities", "miscellaneous"]


def init_db():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS trips (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            destination TEXT NOT NULL,
            start_city TEXT NOT NULL,
            start_date TEXT,
            end_date TEXT,
            days INTEGER NOT NULL,
            travelers INTEGER NOT NULL,
            travel_style TEXT NOT NULL,
            estimated_budget REAL NOT NULL,
            plan_json TEXT NOT NULL,
            booking_status TEXT DEFAULT 'Planned',
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS contacts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            subject TEXT NOT NULL,
            message TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    """)
    conn.commit()
    conn.close()


init_db()


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def safe_number(value, default=0.0):
    try:
        if isinstance(value, bool) or value is None:
            return default
        number = float(value)
        if not math.isfinite(number) or number < 0:
            return default
        return round(number, 2)
    except (ValueError, TypeError):
        return default


@app.route("/")
def home():
    return render_template("index.html")


# ---------------- AUTH ROUTES ----------------
@app.route("/api/me", methods=["GET"])
def current_user():
    if "user_id" in session:
        return jsonify({
            "logged_in": True,
            "user": {
                "id": session["user_id"],
                "name": session["user_name"],
                "email": session["user_email"]
            }
        })
    return jsonify({"logged_in": False})


@app.route("/api/signup", methods=["POST"])
def signup():
    data = request.get_json(silent=True) or {}
    name = str(data.get("name", "")).strip()
    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", "")).strip()

    if not name or not email or len(password) < 4:
        return jsonify({"error": "Enter name, valid email, and password (min 4 chars)."}), 400

    conn = get_db()
    try:
        existing = conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
        if existing:
            return jsonify({"error": "Email already registered. Please login."}), 400

        pwd_hash = generate_password_hash(password)
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        cur = conn.execute(
            "INSERT INTO users (name, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
            (name, email, pwd_hash, now)
        )
        conn.commit()
        user_id = cur.lastrowid

        session["user_id"] = user_id
        session["user_name"] = name
        session["user_email"] = email

        return jsonify({
            "message": "Account created successfully!",
            "user": {"id": user_id, "name": name, "email": email}
        })
    finally:
        conn.close()


@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", "")).strip()

    if not email or not password:
        return jsonify({"error": "Please enter both email and password."}), 400

    conn = get_db()
    try:
        user = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        if not user or not check_password_hash(user["password_hash"], password):
            return jsonify({"error": "Invalid email or password."}), 401

        session["user_id"] = user["id"]
        session["user_name"] = user["name"]
        session["user_email"] = user["email"]

        return jsonify({
            "message": "Logged in successfully!",
            "user": {"id": user["id"], "name": user["name"], "email": user["email"]}
        })
    finally:
        conn.close()


@app.route("/api/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"message": "Logged out successfully."})


# ---------------- TRAVEL HISTORY & BOOKING ROUTES ----------------
@app.route("/api/trips", methods=["GET"])
def get_trips():
    if "user_id" not in session:
        return jsonify({"error": "Please login to view your travel history."}), 401

    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT * FROM trips WHERE user_id = ? ORDER BY id DESC",
            (session["user_id"],)
        ).fetchall()
        trips = []
        for r in rows:
            trips.append({
                "id": r["id"],
                "destination": r["destination"],
                "start_city": r["start_city"],
                "start_date": r["start_date"],
                "end_date": r["end_date"],
                "days": r["days"],
                "travelers": r["travelers"],
                "travel_style": r["travel_style"],
                "estimated_budget": r["estimated_budget"],
                "booking_status": r["booking_status"],
                "created_at": r["created_at"],
                "plan_data": json.loads(r["plan_json"])
            })
        return jsonify({"trips": trips})
    finally:
        conn.close()


@app.route("/api/trips/<int:trip_id>", methods=["DELETE"])
def delete_trip(trip_id):
    if "user_id" not in session:
        return jsonify({"error": "Unauthorized"}), 401

    conn = get_db()
    try:
        conn.execute(
            "DELETE FROM trips WHERE id = ? AND user_id = ?",
            (trip_id, session["user_id"])
        )
        conn.commit()
        return jsonify({"message": "Trip deleted."})
    finally:
        conn.close()


@app.route("/api/book", methods=["POST"])
def confirm_booking():
    data = request.get_json(silent=True) or {}
    item_title = str(data.get("item_title", "Trip Package")).strip()
    amount = safe_number(data.get("amount"), 0)
    payment_method = str(data.get("payment_method", "UPI")).strip()
    trip_id = data.get("trip_id")

    booking_ref = f"WAI-{datetime.now().strftime('%y%m%d%H%M%S')}"

    if "user_id" in session and trip_id:
        conn = get_db()
        try:
            conn.execute(
                "UPDATE trips SET booking_status = ? WHERE id = ? AND user_id = ?",
                (f"Confirmed ({booking_ref})", trip_id, session["user_id"])
            )
            conn.commit()
        finally:
            conn.close()

    return jsonify({
        "status": "success",
        "booking_ref": booking_ref,
        "item_title": item_title,
        "amount": amount,
        "payment_method": payment_method,
        "message": f"Payment of INR {amount:,.0f} via {payment_method} successful! Booking ID: {booking_ref}"
    })


# ---------------- HELP AI CHATBOT ROUTE ----------------
@app.route("/api/help-ai", methods=["POST"])
def help_ai():
    data = request.get_json(silent=True) or {}
    question = str(data.get("question", "")).strip()

    if not question:
        return jsonify({"error": "Please ask a question."}), 400

    prompt = (
        "You are WanderAI Help Assistant, a friendly Indian travel advisor. "
        "Answer the user's travel question clearly, concisely (under 90 words), "
        "and practically in Indian context (use INR if mentioning money).\n"
        f"User Question: {question}"
    )

    try:
        current_key = os.getenv("GEMINI_API_KEY")
        if not current_key:
            raise ValueError("GEMINI_API_KEY is not set in environment.")
        ai_client = genai.Client(api_key=current_key)
        response = ai_client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt
        )
        answer = (response.text or "").strip()
        if not answer:
            raise ValueError("Empty response from Gemini.")
        return jsonify({"reply": answer})
    except Exception as e:
        app.logger.error("Help AI error: %s", e)
        q_lower = question.lower()
        if "manali" in q_lower:
            reply = "Best time to visit Manali is March–June for pleasant weather and sightseeing, or December–February for snowfall and winter sports. Budget around ₹6,000–₹10,000 per person for a 3-day trip."
        elif "goa" in q_lower:
            reply = "Best time to visit Goa is November–February for beach weather and nightlife. Book flights/trains 45 days early and budget ₹8,000–₹15,000 per person for 3–4 days."
        elif "jaipur" in q_lower:
            reply = "October–March is ideal for Jaipur due to cool weather. Cover Amer Fort, Hawa Mahal, and City Palace in 2–3 days with an estimated budget of ₹5,000–₹9,000 per person."
        else:
            reply = (
                "For Indian trips, October–March is best for plains/beaches and March–June for hill stations. "
                "Book IRCTC trains 30–60 days early and compare Budget vs Balanced stays in the planner above!"
            )
        return jsonify({"reply": reply})


# ---------------- CONTACT US ROUTE ----------------
@app.route("/api/contact", methods=["POST"])
def contact_submit():
    data = request.get_json(silent=True) or {}
    name = str(data.get("name", "")).strip()
    email = str(data.get("email", "")).strip()
    subject = str(data.get("subject", "General Inquiry")).strip()
    message = str(data.get("message", "")).strip()

    if not name or not email or not message:
        return jsonify({"error": "Please fill in your name, email, and message."}), 400

    conn = get_db()
    try:
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        conn.execute(
            "INSERT INTO contacts (name, email, subject, message, created_at) VALUES (?, ?, ?, ?, ?)",
            (name, email, subject, message, now)
        )
        conn.commit()
        return jsonify({"message": "Thank you! Your message has been received by the WanderAI support team."})
    finally:
        conn.close()


# ---------------- TRIP PLANNER ROUTE ----------------
@app.route("/plan", methods=["POST"])
def create_plan():
    try:
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            return jsonify({"error": "Please submit valid trip details."}), 400

        destination = str(data.get("destination", "")).strip()
        start_city = str(data.get("start_city", "")).strip()
        start_date = str(data.get("start_date", "")).strip()
        end_date = str(data.get("end_date", "")).strip()

        if not start_city or len(start_city) > 100:
            return jsonify({"error": "Please enter a valid starting city."}), 400

        interest = str(data.get("interest", "Nature")).strip()
        travel_with = str(data.get("travel_with", "Solo")).strip()
        travel_style = str(data.get("travel_style", "Balanced")).strip()

        try:
            days = int(data.get("days", 0))
            travelers = int(data.get("travelers", 0))
        except (ValueError, TypeError, OverflowError):
            return jsonify({"error": "Enter a valid trip duration and number of travellers."}), 400

        if not destination or len(destination) > 100:
            return jsonify({"error": "Enter a destination using 1 to 100 characters."}), 400
        if not 1 <= days <= 14:
            return jsonify({"error": "Trip duration must be between 1 and 14 days."}), 400
        if not 1 <= travelers <= 100:
            return jsonify({"error": "Number of travellers must be between 1 and 100."}), 400
        if interest not in VALID_INTERESTS:
            return jsonify({"error": "Please select a valid interest."}), 400
        if travel_with not in VALID_COMPANIONS:
            return jsonify({"error": "Please select a valid travel companion."}), 400
        if travel_style not in VALID_STYLES:
            return jsonify({"error": "Please select a valid travel style."}), 400

        prompt = f"""
You are WanderAI, a helpful travel planning assistant.
Create a practical, personalized trip plan in valid JSON format using the CURRENT request below.

DESTINATION: {destination}
STARTING CITY: {start_city}
DURATION: {days} days
NUMBER OF TRAVELLERS: {travelers}
TRAVELLING WITH: {travel_with}
INTEREST: {interest}
TRAVEL STYLE: {travel_style}

BUDGET & ITINERARY RULES:
- Estimate realistic costs in Indian Rupees (INR) for the destination, duration, group size, and travel style.
- All budget_breakdown values must be non-negative numbers in INR and sum up to estimated_budget.
- estimated_per_person must equal estimated_budget divided by {travelers}.
- Provide exactly {days} distinct, realistic daily itinerary entries tailored to {destination} and {interest}. Each daily estimated_cost is for the entire group and must sum up to estimated_budget.

HOTEL RECOMMENDATIONS:
- Suggest 3 accommodation options in {destination}: one Budget, one Balanced, and one Luxury.
- Include name, type, location, approximate price_per_night (number in INR), and a short description.

TRANSPORT RECOMMENDATIONS:
- Suggest 3 suitable ways to travel from {start_city} to {destination} (e.g., Train, Flight, Bus/Cab) and/or local transport.
- Include mode, route, estimated_fare_per_person (number in INR), travel_time, and description.

PACKING LIST:
- Suggest 6 to 8 practical packing items tailored to {destination}, {days} days, and {interest}.

Return ONLY a JSON object matching this exact structure:
{{
  "estimated_budget": 12000,
  "estimated_per_person": 6000,
  "budget_breakdown": {{
    "transport": 2500,
    "accommodation": 3500,
    "food": 2000,
    "activities": 2500,
    "miscellaneous": 1500
  }},
  "itinerary": [
    {{
      "day": 1,
      "plan": "Morning activity. Afternoon activity. Evening activity.",
      "estimated_cost": 4000
    }}
  ],
  "note": "Explain main assumptions and remind the user that prices are approximate.",
  "hotels": [
    {{
      "name": "Hotel Name",
      "type": "Budget",
      "location": "Area near center",
      "price_per_night": 1500,
      "description": "Clean and affordable stay."
    }},
    {{
      "name": "Comfort Resort",
      "type": "Balanced",
      "location": "Main tourist hub",
      "price_per_night": 3000,
      "description": "Comfortable rooms with modern amenities."
    }},
    {{
      "name": "Grand Luxury Hotel",
      "type": "Luxury",
      "location": "Scenic prime area",
      "price_per_night": 6500,
      "description": "Premium experience with top facilities."
    }}
  ],
  "transport_options": [
    {{
      "mode": "Train",
      "route": "{start_city} to {destination}",
      "estimated_fare_per_person": 800,
      "travel_time": "6 hours",
      "description": "Convenient and economical rail connection."
    }},
    {{
      "mode": "Flight",
      "route": "{start_city} to {destination}",
      "estimated_fare_per_person": 4200,
      "travel_time": "1.5 hours",
      "description": "Fastest travel option for saving time."
    }},
    {{
      "mode": "Bus / Cab",
      "route": "{start_city} to {destination}",
      "estimated_fare_per_person": 1200,
      "travel_time": "7 hours",
      "description": "Flexible road connectivity."
    }}
  ],
  "packing_list": [
    "Comfortable walking shoes",
    "Power bank and charger",
    "Government ID proof",
    "Basic first-aid and personal medicines",
    "Weather-appropriate clothing",
    "Reusable water bottle"
  ]
}}
"""

        ai_data = {}
        try:
            if client is None:
                raise ValueError("Gemini API key is missing. Using smart fallback.")

            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
                config={"response_mime_type": "application/json"}
            )
            if not response.text:
                raise ValueError("The AI returned an empty response.")
            ai_data = json.loads(response.text)

        except Exception as api_error:
            app.logger.warning("Gemini API fallback triggered: %s", api_error)
            estimated_budget = 12000 * travelers
            estimated_per_person = round(estimated_budget / travelers, 2)
            breakdown = {
                "transport": round(estimated_budget * 0.20, 2),
                "accommodation": round(estimated_budget * 0.30, 2),
                "food": round(estimated_budget * 0.20, 2),
                "activities": round(estimated_budget * 0.20, 2),
                "miscellaneous": round(estimated_budget * 0.10, 2)
            }
            daily_base = round(estimated_budget / days, 2)
            day_templates = [
                f"Morning: Arrive in {destination} and check in to your stay. Afternoon: Explore the central area and taste local delicacies. Evening: Relax at a scenic viewpoint or promenade.",
                f"Morning: Visit top {interest.lower()} landmarks and cultural attractions in {destination}. Afternoon: Enjoy guided sightseeing. Evening: Stroll through the bustling local market.",
                f"Morning: Excursion to nearby scenic spots around {destination}. Afternoon: Experience {interest.lower()} activities and photography. Evening: Unwind at a popular local cafe.",
                f"Morning: Leisurely breakfast and visit famous heritage or nature spots in {destination}. Afternoon: Souvenir shopping. Evening: Prepare for departure back to {start_city}."
            ]
            itinerary = []
            for day in range(1, days + 1):
                itinerary.append({
                    "day": day,
                    "plan": day_templates[(day - 1) % len(day_templates)],
                    "estimated_cost": daily_base
                })
            itinerary[-1]["estimated_cost"] = round(
                estimated_budget - sum(item["estimated_cost"] for item in itinerary[:-1]), 2
            )

            ai_data = {
                "estimated_budget": estimated_budget,
                "estimated_per_person": estimated_per_person,
                "budget_breakdown": breakdown,
                "itinerary": itinerary,
                "note": "Planning estimate: verify live fares, accommodation, and weather before travelling.",
                "hotels": [
                    {
                        "name": f"{destination} Budget Inn",
                        "type": "Budget",
                        "location": "Near city center",
                        "price_per_night": 1200,
                        "description": "Clean and affordable stay with essential facilities."
                    },
                    {
                        "name": f"{destination} Comfort Residency",
                        "type": "Balanced",
                        "location": "Near major attractions",
                        "price_per_night": 2800,
                        "description": "Comfortable rooms with breakfast and Wi-Fi."
                    },
                    {
                        "name": f"The {destination} Grand Resort",
                        "type": "Luxury",
                        "location": "Prime scenic location",
                        "price_per_night": 6000,
                        "description": "Premium resort with luxury amenities and views."
                    }
                ],
                "transport_options": [
                    {
                        "mode": "Train",
                        "route": f"{start_city} to {destination}",
                        "estimated_fare_per_person": 950,
                        "travel_time": "Depends on train route",
                        "description": "Economical and comfortable rail travel via IRCTC."
                    },
                    {
                        "mode": "Flight",
                        "route": f"{start_city} to {destination}",
                        "estimated_fare_per_person": 4500,
                        "travel_time": "1.5 – 3 hours",
                        "description": "Fastest air connection to nearest airport."
                    },
                    {
                        "mode": "Volvo Bus / Cab",
                        "route": f"{start_city} to {destination}",
                        "estimated_fare_per_person": 1400,
                        "travel_time": "Depends on road distance",
                        "description": "Overnight AC sleeper bus or private cab."
                    }
                ],
                "packing_list": [
                    "Valid Government ID proof",
                    "Phone charger & power bank",
                    "Comfortable walking shoes",
                    f"Weather-appropriate clothing for {destination}",
                    "Personal medicines & basic first-aid",
                    "Sunglasses, sunscreen & water bottle"
                ]
            }

        raw_breakdown = ai_data.get("budget_breakdown")
        if not isinstance(raw_breakdown, dict):
            raw_breakdown = {}

        budget_weights = {
            "transport": 0.20,
            "accommodation": 0.30,
            "food": 0.20,
            "activities": 0.20,
            "miscellaneous": 0.10
        }

        clean_breakdown = {cat: safe_number(raw_breakdown.get(cat), 0.0) for cat in BUDGET_CATEGORIES}
        if sum(clean_breakdown.values()) <= 0:
            total_budget = safe_number(ai_data.get("estimated_budget"), 10000.0 * travelers)
            if total_budget <= 0:
                total_budget = 10000.0 * travelers
            clean_breakdown = {
                cat: round(total_budget * budget_weights[cat], 2)
                for cat in BUDGET_CATEGORIES
            }

        estimated_budget = round(sum(clean_breakdown.values()), 2)
        estimated_per_person = round(estimated_budget / travelers, 2)

        raw_itinerary = ai_data.get("itinerary")
        if not isinstance(raw_itinerary, list) or not raw_itinerary:
            raw_itinerary = [{"plan": f"Explore {destination} attractions and {interest} spots."}]

        while len(raw_itinerary) < days:
            raw_itinerary.append({
                "plan": f"Explore more places in {destination}. Day {len(raw_itinerary) + 1} local sightseeing."
            })
        raw_itinerary = raw_itinerary[:days]

        daily_costs = [round(estimated_budget / days, 2) for _ in range(days)]
        daily_costs[-1] = round(estimated_budget - sum(daily_costs[:-1]), 2)

        itinerary = []
        for index, (item, daily_cost) in enumerate(zip(raw_itinerary, daily_costs), start=1):
            plan_text = item.get("plan") if isinstance(item, dict) else str(item)
            if not isinstance(plan_text, str) or not plan_text.strip():
                plan_text = f"Day {index}: Sightseeing and local exploration in {destination}."
            itinerary.append({
                "day": index,
                "plan": plan_text.strip(),
                "estimated_cost": daily_cost
            })

        note = ai_data.get("note")
        if not isinstance(note, str) or not note.strip():
            note = "These are approximate planning estimates. Check actual prices before booking."

        hotels = ai_data.get("hotels") if isinstance(ai_data.get("hotels"), list) else []
        transport_options = ai_data.get("transport_options") if isinstance(ai_data.get("transport_options"), list) else []
        packing_list = ai_data.get("packing_list") if isinstance(ai_data.get("packing_list"), list) else []

        response_payload = {
            "destination": destination,
            "start_city": start_city,
            "start_date": start_date,
            "end_date": end_date,
            "days": days,
            "travelers": travelers,
            "interest": interest,
            "travel_with": travel_with,
            "travel_style": travel_style,
            "estimated_budget": estimated_budget,
            "estimated_per_person": estimated_per_person,
            "budget_breakdown": clean_breakdown,
            "itinerary": itinerary,
            "hotels": hotels,
            "transport_options": transport_options,
            "packing_list": packing_list,
            "note": note
        }

        saved_trip_id = None
        if "user_id" in session:
            conn = get_db()
            try:
                now = datetime.now().strftime("%Y-%m-%d %H:%M")
                cur = conn.execute(
                    """INSERT INTO trips
                       (user_id, destination, start_city, start_date, end_date, days, travelers, travel_style, estimated_budget, plan_json, created_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        session["user_id"], destination, start_city, start_date, end_date,
                        days, travelers, travel_style, estimated_budget,
                        json.dumps(response_payload), now
                    )
                )
                conn.commit()
                saved_trip_id = cur.lastrowid
            finally:
                conn.close()

        response_payload["trip_id"] = saved_trip_id
        return jsonify(response_payload)

    except Exception as e:
        app.logger.exception("Unexpected error in /plan")
        return jsonify({"error": f"Server error: {str(e)}"}), 500


if __name__ == "__main__":
    app.run(debug=True)