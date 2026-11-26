import os
import json
import math

from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv
from google import genai

load_dotenv()

app = Flask(__name__)

api_key = os.getenv("GEMINI_API_KEY")
client = genai.Client(api_key=api_key) if api_key else None

VALID_INTERESTS = {
    "Nature", "Adventure", "History", "Food", "Shopping", "Relaxation"
}

VALID_COMPANIONS = {
    "Solo", "Friends", "Family", "Couple", "Group"
}

VALID_STYLES = {
    "Budget", "Balanced", "Luxury"
}

BUDGET_CATEGORIES = [
    "transport",
    "accommodation",
    "food",
    "activities",
    "miscellaneous"
]


@app.route("/")
def home():
    return render_template("index.html")


def safe_number(value, default=0.0):
    """Safely convert any AI numeric output into a non-negative float."""
    try:
        if isinstance(value, bool) or value is None:
            return default
        number = float(value)
        if not math.isfinite(number) or number < 0:
            return default
        return round(number, 2)
    except (ValueError, TypeError):
        return default


@app.route("/plan", methods=["POST"])
def create_plan():
    try:
        data = request.get_json(silent=True)

        if not isinstance(data, dict):
            return jsonify({"error": "Please submit valid trip details."}), 400

        destination = str(data.get("destination", "")).strip()
        start_city = str(data.get("start_city", "")).strip()

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
- Provide exactly {days} daily itinerary entries. Each daily estimated_cost is for the entire group and must sum up to estimated_budget.
- Do not claim live prices, real-time availability, or confirmed booking links.

HOTEL RECOMMENDATIONS:
- Suggest 3 accommodation options in {destination}: one Budget, one Balanced, and one Luxury.
- Include name, type, location, approximate price_per_night (number in INR), and a short description.

TRANSPORT RECOMMENDATIONS:
- Suggest 2 to 3 suitable ways to travel from {start_city} to {destination} (e.g., Train, Bus, Flight, Cab) and/or local transport.
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
      "mode": "Local Cab / Auto",
      "route": "Within {destination}",
      "estimated_fare_per_person": 400,
      "travel_time": "Flexible",
      "description": "Best for local sightseeing."
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
                raise ValueError("Gemini API key is missing. Using demo fallback.")

            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
                config={
                    "response_mime_type": "application/json"
                }
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
            itinerary = []

            day_templates = [
                f"Morning: Arrive in {destination} and check in to your stay. Afternoon: Explore the main town center and try local food. Evening: Relax at a scenic viewpoint or popular promenade.",
                f"Morning: Visit top {interest.lower()} landmarks and heritage spots in {destination}. Afternoon: Enjoy guided sightseeing and local cuisine. Evening: Stroll through the bustling local market for souvenirs.",
                f"Morning: Take a short excursion to nearby scenic valleys or hidden gems around {destination}. Afternoon: Participate in {interest.lower()} experiences and photography. Evening: Unwind at a cozy local cafe.",
                f"Morning: Leisurely breakfast and visit a famous temple, museum, or park in {destination}. Afternoon: Last-minute shopping and local delicacies. Evening: Pack up and prepare for departure back to {start_city}."
            ]

            for day in range(1, days + 1):
                plan_text = day_templates[(day - 1) % len(day_templates)]
                itinerary.append({
                    "day": day,
                    "plan": plan_text,
                    "estimated_cost": daily_base
                })

            itinerary[-1]["estimated_cost"] = round(
                estimated_budget - sum(item["estimated_cost"] for item in itinerary[:-1]),
                2
            )

            ai_data = {
                "estimated_budget": estimated_budget,
                "estimated_per_person": estimated_per_person,
                "budget_breakdown": breakdown,
                "itinerary": itinerary,
                "note": (
                    "Fallback estimate: verify live transport, accommodation, "
                    "weather and opening hours before travelling."
                ),
                "hotels": [
                    {
                        "name": f"{destination} Budget Inn",
                        "type": "Budget",
                        "location": "Near main market",
                        "price_per_night": 1200,
                        "description": "Basic and economical accommodation."
                    },
                    {
                        "name": f"{destination} Comfort Residency",
                        "type": "Balanced",
                        "location": "Near popular attractions",
                        "price_per_night": 2500,
                        "description": "Comfortable stay with useful facilities."
                    },
                    {
                        "name": f"The {destination} Grand Palace",
                        "type": "Luxury",
                        "location": "Prime scenic area",
                        "price_per_night": 5500,
                        "description": "Premium accommodation option."
                    }
                ],
                "transport_options": [
                    {
                        "mode": "Train / Bus",
                        "route": f"{start_city} to {destination}",
                        "estimated_fare_per_person": 1000,
                        "travel_time": "Depends on route",
                        "description": "Compare available train and bus services."
                    },
                    {
                        "mode": "Private Cab",
                        "route": f"{start_city} to {destination}",
                        "estimated_fare_per_person": 2500,
                        "travel_time": "Depends on traffic and distance",
                        "description": "Convenient door-to-door travel option."
                    }
                ],
                "packing_list": [
                    "Valid Government ID proof",
                    "Phone charger & power bank",
                    "Comfortable walking shoes",
                    f"Clothing suitable for {destination} weather",
                    "Basic personal medicines & first-aid",
                    "Sunglasses & sunscreen"
                ]
            }

        # Validate & sanitize budget breakdown safely
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

        clean_breakdown = {
            cat: safe_number(raw_breakdown.get(cat), 0.0)
            for cat in BUDGET_CATEGORIES
        }

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

        # Validate itinerary safely
        raw_itinerary = ai_data.get("itinerary")
        if not isinstance(raw_itinerary, list) or not raw_itinerary:
            raw_itinerary = [{
                "plan": f"Explore {destination} attractions, local food, and {interest} spots."
            }]

        while len(raw_itinerary) < days:
            raw_itinerary.append({
                "plan": f"Explore more places in {destination}. Day {len(raw_itinerary) + 1} local sightseeing and food."
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

        return jsonify({
            "destination": destination,
            "start_city": start_city,
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
        })

    except Exception as e:
        app.logger.exception("Unexpected error in /plan")
        return jsonify({"error": f"Server error: {str(e)}"}), 500


if __name__ == "__main__":
    app.run(debug=True)