
const form = document.getElementById("travelForm");
const result = document.getElementById("result");
const destinationInput = document.getElementById("destination");
const destinationGrid = document.getElementById("destinationGrid");
const travelersInput = document.getElementById("travelers");
const travelWithInput = document.getElementById("travelWith");

// Convert Open-Meteo weather codes into readable conditions.
function getWeatherDescription(code) {
    const conditions = {
        0: ["☀️", "Clear Sky"],
        1: ["🌤️", "Mainly Clear"],
        2: ["⛅", "Partly Cloudy"],
        3: ["☁️", "Overcast"],
        45: ["🌫️", "Fog"],
        48: ["🌫️", "Depositing Rime Fog"],
        51: ["🌦️", "Light Drizzle"],
        53: ["🌦️", "Moderate Drizzle"],
        55: ["🌧️", "Heavy Drizzle"],
        61: ["🌧️", "Light Rain"],
        63: ["🌧️", "Moderate Rain"],
        65: ["🌧️", "Heavy Rain"],
        71: ["🌨️", "Light Snow"],
        73: ["🌨️", "Moderate Snow"],
        75: ["❄️", "Heavy Snow"],
        80: ["🌦️", "Rain Showers"],
        81: ["🌧️", "Moderate Showers"],
        82: ["⛈️", "Heavy Showers"],
        95: ["⛈️", "Thunderstorm"],
        96: ["⛈️", "Thunderstorm with Hail"],
        99: ["⛈️", "Severe Thunderstorm"]
    };

    return conditions[code] || ["🌡️", "Weather Unavailable"];
}



// Fetch weather for the selected destination and trip dates.
async function loadDestinationWeather(city, startDate, endDate) {
    const section = document.getElementById("weatherSection");
    const currentBox = document.getElementById("weatherCurrent");
    const forecastBox = document.getElementById("weatherForecast");
    const locationText = document.getElementById("weatherLocation");
    const alertBox = document.getElementById("weatherAlert");

    section.hidden = false;
    currentBox.replaceChildren();
    forecastBox.replaceChildren();
    alertBox.hidden = true;

    locationText.textContent = "Checking weather for " + city + "...";

    try {
        // Step 1: Find destination coordinates.
        const geoUrl = new URL(
            "https://geocoding-api.open-meteo.com/v1/search"
        );

        geoUrl.search = new URLSearchParams({
            name: city,
            count: "1",
            language: "en",
            format: "json",
            countryCode: "IN"
        });

        const geoResponse = await fetch(geoUrl);

        if (!geoResponse.ok) {
            throw new Error("Unable to find destination.");
        }

        const geoData = await geoResponse.json();

        if (!geoData.results || geoData.results.length === 0) {
            throw new Error("Destination not found. Try a city name.");
        }

        const place = geoData.results[0];

        // Step 2: Check whether selected dates are within forecast range.
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const lastForecastDate = new Date(today);
        lastForecastDate.setDate(lastForecastDate.getDate() + 15);

        const selectedStart = new Date(startDate + "T00:00:00");
        const selectedEnd = new Date(endDate + "T00:00:00");

        locationText.textContent =
            place.name + ", " + (place.admin1 || place.country);

        // Step 3: Get current weather.
        const weatherUrl = new URL(
            "https://api.open-meteo.com/v1/forecast"
        );

        weatherUrl.search = new URLSearchParams({
            latitude: place.latitude,
            longitude: place.longitude,
            current: "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m",
            timezone: "auto"
        });

        const weatherResponse = await fetch(weatherUrl);

        if (!weatherResponse.ok) {
            throw new Error("Weather service is temporarily unavailable.");
        }

        const weather = await weatherResponse.json();
        const current = weather.current;

        if (!current) {
            throw new Error("Current weather data is unavailable.");
        }

        // Current weather card.
        const condition = getWeatherDescription(current.weather_code);

        const currentCard = document.createElement("div");
        currentCard.className = "weather-main-card";

        const icon = document.createElement("div");
        icon.className = "weather-icon";
        icon.textContent = condition[0];

        const temperature = document.createElement("h2");
        temperature.textContent =
            Math.round(current.temperature_2m) + "°C";

        const description = document.createElement("p");
        description.textContent = condition[1];

        const details = document.createElement("div");
        details.className = "weather-details";

        [
            "Feels like: " + Math.round(current.apparent_temperature) + "°C",
            "Humidity: " + current.relative_humidity_2m + "%",
            "Wind: " + current.wind_speed_10m + " km/h"
        ].forEach(function (value) {
            const item = document.createElement("span");
            item.textContent = value;
            details.appendChild(item);
        });

        currentCard.append(icon, temperature, description, details);
        currentBox.appendChild(currentCard);

        // Step 4: Check forecast availability for selected trip dates.
        if (
            selectedStart < today ||
            selectedEnd > lastForecastDate
        ) {
            const message = document.createElement("p");
            message.textContent =
                "Trip-date forecast is currently available only within the next 16 days. Your itinerary is still generated successfully.";

            forecastBox.appendChild(message);
            return;
        }

        // Step 5: Get forecast for the exact selected dates.
        const forecastUrl = new URL(
            "https://api.open-meteo.com/v1/forecast"
        );

        forecastUrl.search = new URLSearchParams({
            latitude: place.latitude,
            longitude: place.longitude,
            daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
            start_date: startDate,
            end_date: endDate,
            timezone: "auto"
        });

        const forecastResponse = await fetch(forecastUrl);

        if (!forecastResponse.ok) {
            throw new Error("Trip-date forecast is temporarily unavailable.");
        }

        const forecast = await forecastResponse.json();
        const daily = forecast.daily;

        if (!daily || !daily.time) {
            throw new Error("Forecast data is incomplete.");
        }

        // Display selected trip dates.
        let rainyDays = 0;

        daily.time.forEach(function (date, index) {
            const code = daily.weather_code[index];
            const forecastCondition = getWeatherDescription(code);
            const rainChance =
                daily.precipitation_probability_max[index] ?? 0;

            if (rainChance >= 60 || [95, 96, 99].includes(code)) {
                rainyDays++;
            }

            const card = document.createElement("div");
            card.className = "forecast-card";

            const dateElement = document.createElement("strong");
            dateElement.textContent = new Date(
                date + "T12:00:00"
            ).toLocaleDateString("en-IN", {
                weekday: "short",
                day: "numeric",
                month: "short"
            });

            const weatherIcon = document.createElement("div");
            weatherIcon.className = "forecast-icon";
            weatherIcon.textContent = forecastCondition[0];

            const conditionText = document.createElement("p");
            conditionText.textContent = forecastCondition[1];

            const temperatures = document.createElement("strong");
            temperatures.textContent =
                Math.round(daily.temperature_2m_max[index]) + "° / " +
                Math.round(daily.temperature_2m_min[index]) + "°";

            const rain = document.createElement("small");
            rain.textContent = "Rain chance: " + rainChance + "%";

            card.append(
                dateElement,
                weatherIcon,
                conditionText,
                temperatures,
                rain
            );

            forecastBox.appendChild(card);
        });

        // Forecast-based travel advisory.
        if (rainyDays > 0) {
            alertBox.hidden = false;
            alertBox.textContent =
                "☔ Travel tip: Rain or thunderstorm conditions may occur on " +
                rainyDays +
                " selected trip day(s). Carry suitable clothing and check the forecast before outdoor activities.";
        }

    } catch (error) {
        console.error("Weather error:", error);

        locationText.textContent = "Weather information unavailable.";

        const message = document.createElement("p");
        message.textContent =
            error.message || "Please try again later.";

        currentBox.appendChild(message);
    }
}


function formatRupees(value) {
    const amount = Number(value);

    if (!Number.isFinite(amount)) {
        return "Not available";
    }

    return "₹" + amount.toLocaleString("en-IN", {
        maximumFractionDigits: 0
    });
}

// Selecting a destination card fills the destination input.
destinationGrid.addEventListener("click", function (event) {
    const card = event.target.closest(".destination-card");

    if (!card) return;

    destinationInput.value = card.dataset.destination;

    destinationGrid.querySelectorAll(".destination-card").forEach(function (item) {
        item.classList.remove("selected");
    });

    card.classList.add("selected");

    document.getElementById("planner").scrollIntoView({
        behavior: "smooth",
        block: "start"
    });

    destinationInput.focus({ preventScroll: true });
});

// Set a sensible initial number of travellers when companions change.
travelWithInput.addEventListener("change", function () {
    if (travelWithInput.value === "Couple") {
        travelersInput.value = 2;
    } else if (
        travelWithInput.value === "Friends" ||
        travelWithInput.value === "Family" ||
        travelWithInput.value === "Group"
    ) {
        if (Number(travelersInput.value) < 2) {
            travelersInput.value = 2;
        }
    } else if (travelWithInput.value === "Solo") {
        travelersInput.value = 1;
    }
});

function addText(tag, text, parent = result, className = "") {
    const element = document.createElement(tag);
    element.textContent = String(text ?? "");

    if (className) {
        element.className = className;
    }

    parent.appendChild(element);
    return element;
}

function addBudgetCard(parent, label, amount) {
    const card = document.createElement("div");
    card.className = "budget-card";

    addText("small", label, card);
    addText("strong", formatRupees(amount), card);

    parent.appendChild(card);
}

function showError(message) {
    result.replaceChildren();
    addText("h3", "⚠️ Unable to create your trip");
    addText("p", message);
}

// Set today's date as the minimum selectable date.
const startDateInput = document.getElementById("startDate");
const endDateInput = document.getElementById("endDate");
const dateError = document.getElementById("dateError");

const today = new Date();
const todayString = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0")
].join("-");

startDateInput.min = todayString;
endDateInput.min = todayString;

// Return date cannot be before departure date.
startDateInput.addEventListener("change", function () {
    endDateInput.min = startDateInput.value || todayString;

    if (endDateInput.value && endDateInput.value < startDateInput.value) {
        endDateInput.value = "";
    }

    updateTripDuration();
});

endDateInput.addEventListener("change", updateTripDuration);

function updateTripDuration() {
    if (!startDateInput.value || !endDateInput.value) return;

    const start = new Date(startDateInput.value + "T00:00:00");
    const end = new Date(endDateInput.value + "T00:00:00");

    const difference = Math.round((end - start) / 86400000);

    if (difference < 0) {
        dateError.textContent = "Return date cannot be before departure date.";
        return;
    }

    if (difference === 0) {
        dateError.textContent = "Your trip duration is 1 day.";
    } else {
        dateError.textContent = `Your trip duration is ${difference + 1} days.`;
    }
}

form.addEventListener("submit", async function (event) {
    event.preventDefault();

    // Read all values fresh from the form for each request.
    const startDate = startDateInput.value;
const endDate = endDateInput.value;

if (!startDate || !endDate) {
    dateError.textContent = "Please select both departure and return dates.";
    return;
}

if (endDate < startDate) {
    dateError.textContent = "Return date cannot be before departure date.";
    return;
}

const start = new Date(startDate + "T00:00:00");
const end = new Date(endDate + "T00:00:00");
const calculatedDays = Math.round((end - start) / 86400000) + 1;

if (calculatedDays > 14) {
    dateError.textContent = "Currently, trip duration can be maximum 14 days.";
    return;
}

dateError.textContent = "";

const trip = {
    destination: destinationInput.value.trim(),
    start_city: document.getElementById("startCity").value.trim(),
    start_date: startDate,
    end_date: endDate,
    days: calculatedDays,
        travelers: Number(travelersInput.value),
        interest: document.getElementById("interest").value,
        travel_with: travelWithInput.value,
        travel_style: document.getElementById("travelStyle").value
    };

    if (!trip.destination) {
        showError("Please select or type a destination.");
        destinationInput.focus();
        return;
    }

    if (!Number.isInteger(trip.days) || trip.days < 1 || trip.days > 14) {
        showError("Trip duration must be between 1 and 14 days.");
        return;
    }

    if (
        !Number.isInteger(trip.travelers) ||
        trip.travelers < 1 ||
        trip.travelers > 100
    ) {
        showError("Enter between 1 and 100 travellers.");
        return;
    }

    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = "Planning your trip...";
    result.setAttribute("aria-busy", "true");
    result.replaceChildren();

    addText("h3", "✈️ Your adventure is being planned...");
    addText("p", "AI is preparing your itinerary and estimating your trip budget.");

    try {
        const response = await fetch("/plan", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        cache: "no-store",
        body: JSON.stringify(trip)
    });

    const responseText = await response.text();

    let data;

try {
    data = JSON.parse(responseText);
} catch (error) {
    console.error("Server response is not JSON:", responseText);

    throw new Error(
        "Server returned an HTML error instead of JSON. Please check the VS Code terminal."
    );
}

if (!response.ok) {
    throw new Error(
        data.error || "The server could not generate your travel plan."
    );
}

       const expectedDays = Number(trip.days);
       const actualDays = Array.isArray(data.itinerary)
           ? data.itinerary.length
           : 0;

       console.log("Trip validation:", {
            expectedDays,
            actualDays,
            response: data
        });

        if (actualDays !== expectedDays) {
            throw new Error(
                `Itinerary mismatch: Expected ${expectedDays} days but received ${actualDays} days.`
            );
        }

        result.replaceChildren();   

        addText("h2", `✈️ ${data.days}-Day Trip to ${data.destination}`);
        addText(
    "p",
    `📅 ${new Date(startDate + "T00:00:00").toLocaleDateString("en-IN")} – ${new Date(endDate + "T00:00:00").toLocaleDateString("en-IN")}`
);
        addText(
            "p",
            `${data.travelers > 1 ? data.travel_with === "Solo" ? "Group" : data.travel_with : data.travel_with} trip · ${data.travelers} traveller(s) · ${data.interest}`
        );
        addText("p", `Preferred style: ${data.travel_style}`);

        // Budget summary
        addText("h3", "💰 Your Estimated Trip Budget");

        const summary = document.createElement("div");
        summary.className = "budget-summary";

        addBudgetCard(summary, "Total estimated group cost", data.estimated_budget);
        addBudgetCard(summary, "Estimated cost per person", data.estimated_per_person);

        result.appendChild(summary);

        addText(
            "p",
            "These are AI-generated estimates for planning, not live booking prices."
        );

        // Category-wise budget breakdown
        addText("h3", "Where your money may go");

        const breakdownBox = document.createElement("div");
        breakdownBox.className = "budget-breakdown";

        const categories = [
            ["Transport", "transport"],
            ["Accommodation", "accommodation"],
            ["Food", "food"],
            ["Activities & sightseeing", "activities"],
            ["Miscellaneous", "miscellaneous"]
        ];

        categories.forEach(function ([label, key]) {
            const line = document.createElement("div");
            line.className = "budget-line";

            addText("span", label, line);
            addText(
                "span",
                formatRupees(data.budget_breakdown?.[key]),
                line
            );

            breakdownBox.appendChild(line);
        });

        result.appendChild(breakdownBox);

        // Budget Doughnut Chart
        if (window.Chart && data.budget_breakdown) {
            const chartWrapper = document.createElement("div");
            chartWrapper.className = "budget-chart-box";

            const canvas = document.createElement("canvas");
            chartWrapper.appendChild(canvas);
            result.appendChild(chartWrapper);

            new Chart(canvas, {
                type: "doughnut",
                data: {
                    labels: ["Transport", "Accommodation", "Food", "Activities", "Misc"],
                    datasets: [{
                        data: [
                            data.budget_breakdown.transport || 0,
                            data.budget_breakdown.accommodation || 0,
                            data.budget_breakdown.food || 0,
                            data.budget_breakdown.activities || 0,
                            data.budget_breakdown.miscellaneous || 0
                        ],
                        backgroundColor: [
                            "#123b67",
                            "#0d9488",
                            "#2563eb",
                            "#f59e0b",
                            "#64748b"
                        ],
                        borderWidth: 2,
                        borderColor: "#ffffff"
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: "bottom"
                        }
                    }
                }
            });
        }

        // Day-by-day plan and estimated daily cost
        addText("h3", "🗓️ Your Day-by-Day Itinerary");

        data.itinerary.forEach(function (day) {
            const section = document.createElement("section");
            section.className = "itinerary-day";

            addText("h3", `Day ${day.day}`, section);
            addText("p", day.plan, section);
            addText(
                "p",
                `Estimated cost for this day: ${formatRupees(day.estimated_cost)}`,
                section,
                "day-cost"
            );

            result.appendChild(section);
        });

        addText("h3", "📌 Helpful travel note");
        addText(
            "p",
            data.note ||
            "Verify transport, accommodation and attraction costs before departure."
        );

        addText(
            "p",
            "Final costs may change with season, availability, transport choices and actual bookings."
        );

        // Load weather after the itinerary is generated.
            loadDestinationWeather(data.destination, startDate, endDate);

        result.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });


// Hotel recommendations
addText("h3", "🏨 Recommended Hotels");

const hotelsBox = document.createElement("div");
hotelsBox.className = "recommendation-grid";

(data.hotels || []).forEach(function (hotel) {
    const card = document.createElement("div");
    card.className = "recommendation-card";

    addText("h3", hotel.name || "Accommodation option", card);
    addText("p", hotel.type || "Stay option", card);
    addText("p", "📍 " + (hotel.location || "Location not specified"), card);
    addText(
        "strong",
        "Approx. ₹" + Number(hotel.price_per_night || 0).toLocaleString("en-IN") + " / night",
        card
    );
    addText("p", hotel.description || "", card);

    const mapLink = document.createElement("a");
    mapLink.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((hotel.name || "") + " " + data.destination)}`;
    mapLink.target = "_blank";
    mapLink.rel = "noopener noreferrer";
    mapLink.className = "map-link-btn";
    mapLink.textContent = "🗺️ View on Google Maps ↗";
    card.appendChild(mapLink);
    hotelsBox.appendChild(card);
});

result.appendChild(hotelsBox);

// Transport recommendations
addText("h3", "🚆 Transport Recommendations");

const transportBox = document.createElement("div");
transportBox.className = "recommendation-grid";

(data.transport_options || []).forEach(function (option) {
    const card = document.createElement("div");
    card.className = "recommendation-card";

    addText("h3", option.mode || "Transport option", card);
    addText("p", "Route: " + (option.route || "Not specified"), card);
    addText(
        "strong",
        "Approx. ₹" +
        Number(option.estimated_fare_per_person || 0).toLocaleString("en-IN") +
        " / person",
        card
    );
    addText("p", "Travel time: " + (option.travel_time || "Not specified"), card);
    addText("p", option.description || "", card);

    transportBox.appendChild(card);
});

result.appendChild(transportBox);

addText(
    "p",
    "Hotel and transport prices are approximate AI-generated estimates. Verify actual prices, schedules and availability before booking."
);
 
// Smart Packing Checklist
if (Array.isArray(data.packing_list) && data.packing_list.length > 0) {
    addText("h3", "🎒 Smart Packing Checklist");
    addText("p", "Tap items to check them off as you pack:");

    const packingBox = document.createElement("div");
    packingBox.className = "packing-grid";

    data.packing_list.forEach(function (itemText) {
        const label = document.createElement("label");
        label.className = "packing-item";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";

        const span = document.createElement("span");
        span.textContent = itemText;

        checkbox.addEventListener("change", function () {
            label.classList.toggle("checked", checkbox.checked);
        });

        label.append(checkbox, span);
        packingBox.appendChild(label);
    });

    result.appendChild(packingBox);
}        
      // Add PDF download button
      const pdfButton = document.createElement("button");
      pdfButton.textContent = "📄 Download Trip Plan as PDF";
      pdfButton.className = "pdf-download-btn";

     
pdfButton.addEventListener("click", function () {
    if (!window.jspdf) {
        showError("PDF library is not loaded. Please refresh the page.");
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF("p", "mm", "a4");

    const pageWidth = 210;
    const pageHeight = 297;
    const margin = 18;
    const contentWidth = pageWidth - margin * 2;
    let y = 20;

    // Clean text: remove emojis and unwanted characters
    function cleanText(value) {
        return String(value ?? "")
            .replace(/[^\x20-\x7E\xA0-\xFF]/g, "")
            .replace(/\s+/g, " ")
            .trim();
    }

    function money(value) {
        const number = Number(value);
        return Number.isFinite(number)
            ? "INR " + number.toLocaleString("en-IN")
            : "Not available";
    }

    function checkPageSpace(height) {
        if (y + height > pageHeight - 20) {
            doc.addPage();
            y = 22;
        }
    }

    function heading(title) {
        checkPageSpace(18);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.setTextColor(25, 65, 115);
        doc.text(title, margin, y);
        y += 9;

        doc.setDrawColor(210, 220, 235);
        doc.line(margin, y, pageWidth - margin, y);
        y += 7;
    }

    function paragraph(text, fontSize = 10) {
        const lines = doc.splitTextToSize(
            cleanText(text),
            contentWidth
        );

        doc.setFont("helvetica", "normal");
        doc.setFontSize(fontSize);
        doc.setTextColor(65, 65, 65);

        lines.forEach(line => {
            checkPageSpace(6);
            doc.text(line, margin, y);
            y += 5.5;
        });

        y += 3;
    }

    function budgetCard(label, value, x, cardY, width) {
        doc.setFillColor(239, 245, 253);
        doc.roundedRect(x, cardY, width, 25, 3, 3, "F");

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(80, 90, 105);
        doc.text(label, x + 5, cardY + 8);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.setTextColor(25, 65, 115);
        doc.text(money(value), x + 5, cardY + 18);
    }

    // ---------- HEADER ----------
    doc.setFillColor(24, 67, 125);
    doc.rect(0, 0, pageWidth, 43, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(23);
    doc.text("WanderAI", margin, 19);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("YOUR PERSONAL TRAVEL PLAN", margin, 28);

    doc.setFontSize(9);
    doc.text("AI Travel Planner", pageWidth - margin, 28, {
        align: "right"
    });

    y = 55;

    // ---------- TRIP DETAILS ----------
    heading("TRIP OVERVIEW");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.setTextColor(30, 45, 65);

    const destination = cleanText(data.destination);
    doc.text(
        `${cleanText(data.days)}-Day Trip to ${destination}`,
        margin,
        y
    );
    y += 9;

    paragraph(
        `${data.travel_with} trip | ${data.travelers} traveller(s) | ${data.interest}`
    );

    paragraph(`Preferred travel style: ${data.travel_style}`);

    // ---------- BUDGET SUMMARY ----------
    heading("ESTIMATED TRIP BUDGET");

    const gap = 5;
    const cardWidth = (contentWidth - gap) / 2;

    budgetCard(
        "TOTAL GROUP COST",
        data.estimated_budget,
        margin,
        y,
        cardWidth
    );

    budgetCard(
        "COST PER PERSON",
        data.estimated_per_person,
        margin + cardWidth + gap,
        y,
        cardWidth
    );

    y += 34;

    paragraph(
        "These are AI-generated planning estimates, not live booking prices.",
        9
    );

    // ---------- BUDGET BREAKDOWN ----------
    heading("BUDGET BREAKDOWN");

    const categories = [
        ["Transport", "transport"],
        ["Accommodation", "accommodation"],
        ["Food", "food"],
        ["Activities and sightseeing", "activities"],
        ["Miscellaneous", "miscellaneous"]
    ];

    categories.forEach(([label, key]) => {
        const value = data.budget_breakdown?.[key];

        checkPageSpace(10);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(65, 65, 65);
        doc.text(label, margin, y);

        doc.setFont("helvetica", "bold");
        doc.setTextColor(25, 65, 115);

        const amount = value == null ? "Not available" : money(value);

        doc.text(
            amount,
            pageWidth - margin,
            y,
            { align: "right" }
        );

        doc.setDrawColor(230, 230, 230);
        doc.line(margin, y + 3, pageWidth - margin, y + 3);

        y += 10;
    });

    // ---------- DAILY ITINERARY ----------
    heading("YOUR DAY-BY-DAY ITINERARY");

    (data.itinerary || []).forEach(day => {
        checkPageSpace(28);

        // Day heading background
        doc.setFillColor(232, 241, 252);
        doc.roundedRect(
            margin,
            y - 5,
            contentWidth,
            11,
            2,
            2,
            "F"
        );

        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(25, 65, 115);

        doc.text(`DAY ${day.day}`, margin + 4, y + 2);
        y += 14;

        paragraph(day.plan || "Explore the destination and nearby attractions.");

        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(50, 100, 70);

        const dailyCost = money(day.estimated_cost);
        checkPageSpace(8);

        doc.text(
            `Estimated daily cost: ${dailyCost}`,
            margin,
            y
        );

        y += 11;
    });

    // ---------- RECOMMENDED HOTELS ----------
    if (Array.isArray(data.hotels) && data.hotels.length > 0) {
        heading("RECOMMENDED HOTELS");
        data.hotels.forEach(hotel => {
            checkPageSpace(22);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(11);
            doc.setTextColor(25, 65, 115);
            doc.text(`${cleanText(hotel.name)} (${cleanText(hotel.type)})`, margin, y);
            y += 6;
            paragraph(`Location: ${hotel.location} | Approx: ${money(hotel.price_per_night)} / night\n${hotel.description}`);
        });
    }

    // ---------- TRANSPORT OPTIONS ----------
    if (Array.isArray(data.transport_options) && data.transport_options.length > 0) {
        heading("TRANSPORT RECOMMENDATIONS");
        data.transport_options.forEach(opt => {
            checkPageSpace(22);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(11);
            doc.setTextColor(25, 65, 115);
            doc.text(`${cleanText(opt.mode)} (${cleanText(opt.route)})`, margin, y);
            y += 6;
            paragraph(`Fare: ${money(opt.estimated_fare_per_person)} / person | Time: ${opt.travel_time}\n${opt.description}`);
        });
    }

    // ---------- TRAVEL NOTE ----------
    heading("HELPFUL TRAVEL NOTE");

    paragraph(
        data.note ||
        "Verify transport, accommodation and attraction costs before departure."
    );

    paragraph(
        "Final costs may change depending on season, availability, transport choices and actual bookings.",
        9
    );

    // ---------- FOOTER ON EVERY PAGE ----------
    const totalPages = doc.getNumberOfPages();

    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);

        doc.setDrawColor(210, 220, 230);
        doc.line(
            margin,
            pageHeight - 15,
            pageWidth - margin,
            pageHeight - 15
        );

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(120, 120, 120);

        doc.text(
            "Generated by WanderAI | Travel smart, travel better",
            margin,
            pageHeight - 9
        );

        doc.text(
            `Page ${i} of ${totalPages}`,
            pageWidth - margin,
            pageHeight - 9,
            { align: "right" }
        );
    }

    doc.save("WanderAI-Trip-Plan.pdf");
});

/*
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 18;
    const maxWidth = pageWidth - margin * 2;
    let y = 20;

    // Clean and readable text
    const cleanText = (text) => text
        .replace(/\r/g, "")
        .replace(/₹/g, "Rs. ")
        .replace(/[✈️💰🗺️📌📄🌿🏨🍽️🚕🎯⭐]/gu, "")
        .replace(/[^\x00-\x7F]/g, "")
        .trim();

    // Add text with automatic page breaks
    function addText(text, options = {}) {
        const {
            size = 10,
            bold = false,
            color = [55, 65, 81],
            gap = 5,
            indent = 0
        } = options;

        const cleaned = cleanText(text);
        if (!cleaned) return;

        doc.setFont("helvetica", bold ? "bold" : "normal");
        doc.setFontSize(size);
        doc.setTextColor(...color);

        const lines = doc.splitTextToSize(
            cleaned,
            maxWidth - indent
        );

        const lineHeight = size * 0.48;

        lines.forEach((line) => {
            if (y + lineHeight > pageHeight - 18) {
                doc.addPage();
                y = 20;
            }

            doc.text(line, margin + indent, y);
            y += lineHeight;
        });

        y += gap;
    }

    // Header banner
    doc.setFillColor(20, 55, 95);
    doc.rect(0, 0, pageWidth, 39, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(23);
    doc.text("WanderAI", margin, 17);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("YOUR PERSONAL TRAVEL PLAN", margin, 26);

    y = 49;

    // Read trip details from the result section
    const pdfContent = result.cloneNode(true);

    pdfContent.querySelectorAll(".pdf-download-btn").forEach(
        button => button.remove()
    );

    // Remove emojis to avoid unsupported font characters
    const content = cleanText(pdfContent.innerText)
        .replace(/Your Personal Travel Plan/g, "")
        .replace(/\n{3,}/g, "\n\n");

    const lines = content
        .split("\n")
        .map(line => line.trim())
        .filter(Boolean);

    const headingPattern =
        /Trip to|Estimated Trip Budget|Where your money|Day-by-Day Itinerary|Helpful travel note|Day \d+/i;

    lines.forEach((line) => {
        const isHeading = headingPattern.test(line);

        if (isHeading) {
            y += 2;

            if (y > pageHeight - 25) {
                doc.addPage();
                y = 20;
            }

            addText(line, {
                size: 13,
                bold: true,
                color: [20, 55, 95],
                gap: 4
            });

            // Divider under section headings
            doc.setDrawColor(220, 228, 238);
            doc.setLineWidth(0.35);
            doc.line(margin, y - 2, pageWidth - margin, y - 2);
        } else {
            addText(line, {
                size: 10,
                color: [55, 65, 81],
                gap: 3,
                indent: 2
            });
        }
    });

    // Footer with page numbers
    const totalPages = doc.internal.getNumberOfPages();

    for (let page = 1; page <= totalPages; page++) {
        doc.setPage(page);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(120, 130, 145);

        doc.text(
            "WanderAI | Estimated prices - verify before booking",
            margin,
            pageHeight - 8
        );

        doc.text(
            "Page " + page + " of " + totalPages,
            pageWidth - margin,
            pageHeight - 8,
            { align: "right" }
        );
    }

    doc.save("WanderAI-Trip-Plan.pdf");
    });
*/

result.appendChild(pdfButton);

    } catch (error) {
        console.error("Travel planner error:", error);
        showError(error.message || "Something went wrong. Please try again.");
    } finally {
        button.disabled = false;
        button.innerHTML = 'Generate my AI travel plan <span>✦</span>';
        result.setAttribute("aria-busy", "false");
    }
});
