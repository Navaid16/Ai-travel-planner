
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


def positive_number(value, field_name, allow_zero=False):
    """Validate and round a numeric value returned by the AI."""
    if isinstance(value, bool) or value is None:
        raise ValueError(f"Invalid value for {field_name}.")

    number = float(value)

    if not math.isfinite(number):
        raise ValueError(f"Invalid value for {field_name}.")

    if allow_zero:
        if number < 0:
            raise ValueError(f"Negative value for {field_name}.")
    elif number <= 0:
        raise ValueError(f"Value must be positive for {field_name}.")

    return round(number, 2)


@app.route("/plan", methods=["POST"])
def create_plan():
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({"error": "Please submit valid trip details."}), 400

    destination = str(data.get("destination", "")).strip()
    interest = str(data.get("interest", "Nature")).strip()
    travel_with = str(data.get("travel_with", "Solo")).strip()
    travel_style = str(data.get("travel_style", "Balanced")).strip()

    try:
        days = int(data.get("days", 0))
        travelers = int(data.get("travelers", 0))
    except (ValueError, TypeError, OverflowError):
        return jsonify({
            "error": "Enter a valid trip duration and number of travellers."
        }), 400

    if not destination or len(destination) > 100:
        return jsonify({
            "error": "Enter a destination using 1 to 100 characters."
        }), 400

    if not 1 <= days <= 14:
        return jsonify({
            "error": "Trip duration must be between 1 and 14 days."
        }), 400

    if not 1 <= travelers <= 100:
        return jsonify({
            "error": "Number of travellers must be between 1 and 100."
        }), 400

    if interest not in VALID_INTERESTS:
        return jsonify({"error": "Please select a valid interest."}), 400

    if travel_with not in VALID_COMPANIONS:
        return jsonify({
            "error": "Please select a valid travel companion."
        }), 400

    if travel_style not in VALID_STYLES:
        return jsonify({"error": "Please select a valid travel style."}), 400

    if client is None:
        return jsonify({
            "error": "Gemini API key missing. Check GEMINI_API_KEY in your .env file."
        }), 500

    prompt = f"""
BUDGET ESTIMATION RULES:
- Estimate costs in Indian Rupees (INR) for the specified destination,
  trip duration, number of travellers, and travel style.
- Use realistic approximate local prices, not arbitrary numbers.
- Transport must account for the number of travellers and likely local
  transport. Clearly treat long-distance travel as an estimate if the
  starting city is unknown.
- Accommodation should account for the number of nights and room sharing.
- Food should be estimated per person per day multiplied by travellers
  and days.
- Activities and sightseeing should reflect the selected interests.
- Miscellaneous should usually be around 5–10% of the subtotal.
- All budget_breakdown values must be non-negative numbers in INR.
- estimated_budget must equal the sum of all budget_breakdown values.
- Each itinerary day's estimated_cost must be non-negative.
- The sum of all daily estimated_cost values must equal estimated_budget.
- estimated_per_person must equal estimated_budget divided by travellers.
- Do not claim that estimates are live prices or confirmed booking costs.
- If the starting city is unknown, mention that transport costs may vary.
You are WanderAI, a helpful travel planning assistant.

Create a practical, personalized trip plan using the CURRENT request below.

DESTINATION: {destination}
DURATION: {days} days
NUMBER OF TRAVELLERS: {travelers}
TRAVELLING WITH: {travel_with}
INTEREST: {interest}
TRAVEL STYLE: {travel_style}

The user has NOT provided a budget. You must estimate a reasonable
total group budget in Indian rupees from the trip details.

BUDGET GUIDELINES:
- Budget style: prioritize economical transport, accommodation and activities.
- Balanced style: suggest moderate comfort and reasonable value.
- Luxury style: suggest premium options and experiences.
- Adjust for destination, trip duration, group size and companion type.
- Account for the fact that accommodation and transport may not scale
  linearly with the number of travellers.
- Include transport, accommodation, food, activities and miscellaneous costs.
- The five category amounts must add up to estimated_budget.
- estimated_per_person must equal estimated_budget divided by {travelers}.
- Provide exactly {days} daily itinerary entries.
- Each daily estimated_cost is for the entire group.
- Daily estimated_cost values must add up to estimated_budget.
- Avoid zero or negative total budgets.
- Do not claim to know live prices, current availability or verified opening hours.
- Make sensible estimates; state assumptions and limitations in the note.
- Do not reuse a previous request's destination, budget or itinerary.
- Use the current inputs above, not defaults from an earlier trip.

Return ONLY valid JSON with this structure:
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
  "note": "Explain the main assumptions and remind the user that prices are approximate."
}}

The numbers above are illustrative examples, not fixed prices.
Generate the correct number of days and estimate costs for the actual trip.
"""

    try:
        response = client.models.generate_content(
            model="gemini-3.5-flash",
            contents=prompt,
            config={
                "response_mime_type": "application/json"
            }
        )

        if not response.text:
            raise ValueError("The AI returned an empty response.")

        ai_data = json.loads(response.text)

        # Validate category-wise budget values.
        raw_breakdown = ai_data.get("budget_breakdown")

        if not isinstance(raw_breakdown, dict):
            raise ValueError("The AI returned an invalid budget breakdown.")

        breakdown = {
            category: positive_number(
                raw_breakdown.get(category),
                category,
                allow_zero=True
            )
            for category in BUDGET_CATEGORIES
        }

        # Validate category-wise budget breakdown
        clean_breakdown = {}

        for category in BUDGET_CATEGORIES:
            amount = positive_number(
                raw_breakdown.get(category),
                category,
                allow_zero=True
            )

            if amount < 0:
                raise ValueError(
                    f"Invalid negative amount for {category}"
                )

            clean_breakdown[category] = round(amount, 2)

        # Calculate total only from validated categories
        estimated_budget = round(
            sum(clean_breakdown.values()), 2
        )

        if estimated_budget <= 0:
            raise ValueError(
                "The total estimated budget must be greater than zero."
            )

        # Calculate cost per person using validated traveller count
        estimated_per_person = round(
            estimated_budget / travelers, 2
        )

        # Use only the validated breakdown in the response
        breakdown = clean_breakdown

        # The total is calculated from the validated category breakdown above.

        # Validate itinerary.
        raw_itinerary = ai_data.get("itinerary")

        if not isinstance(raw_itinerary, list) or len(raw_itinerary) != days:
            raise ValueError("The AI returned the wrong number of itinerary days.")

        itinerary = []

        for index, item in enumerate(raw_itinerary, start=1):
            if not isinstance(item, dict):
                raise ValueError("An itinerary entry is invalid.")

            plan = item.get("plan")

            if not isinstance(plan, str) or not plan.strip():
                raise ValueError("A day is missing its itinerary plan.")

            daily_cost = positive_number(
                item.get("estimated_cost"),
                "daily estimated cost",
                allow_zero=True
            )

            itinerary.append({
                "day": index,
                "plan": plan.strip(),
                "estimated_cost": daily_cost
            })

        # Keep AI-generated daily costs realistic.
        # Do not scale every day just to match the total budget.
        daily_costs = [
            round(float(item["estimated_cost"]), 2)
            for item in itinerary
        ]

        # If AI did not provide usable daily costs, split the total evenly.
        if not daily_costs or sum(daily_costs) <= 0:
            daily_costs = [round(estimated_budget / days, 2)] * days

        # Correct only the rounding difference on the last day.
        if len(daily_costs) > 1:
            daily_costs[-1] = round(
                estimated_budget - sum(daily_costs[:-1]), 2
            )
        else:
            daily_costs[0] = estimated_budget

        for item, daily_cost in zip(itinerary, daily_costs):
            item["estimated_cost"] = daily_cost

        estimated_per_person = round(estimated_budget / travelers, 2)

        note = ai_data.get(
            "note",
            "These are approximate planning estimates. Check actual prices before booking."
        )

        if not isinstance(note, str):
            note = "Costs are approximate. Verify local prices before travelling."

            # Final budget validation
        category_total = round(sum(breakdown.values()), 2)

        daily_total = round(
            sum(item["estimated_cost"] for item in itinerary), 2
        )

        expected_per_person = round(
            estimated_budget / travelers, 2
        )

        if category_total != estimated_budget:
            raise ValueError("Category budget total does not match.")

        if daily_total != estimated_budget:
            raise ValueError("Daily itinerary total does not match.")

        if estimated_per_person != expected_per_person:
            raise ValueError("Per-person cost does not match.")
        
        return jsonify({
            "destination": destination,
            "days": days,
            "travelers": travelers,
            "interest": interest,
            "travel_with": travel_with,
            "travel_style": travel_style,
            "estimated_budget": estimated_budget,
            "estimated_per_person": estimated_per_person,
            "budget_breakdown": breakdown,
            "itinerary": itinerary,
            "note": note
        })

    except Exception:
        app.logger.exception("WanderAI trip generation failed")

        return jsonify({
            "error": (
                "AI could not generate the trip. Check your internet connection, "
                "Gemini API key, model access and API quota. "
                "See the VS Code terminal for the detailed error."
            )
        }), 502


if __name__ == "__main__":
    app.run(debug=True)
