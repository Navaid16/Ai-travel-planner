const form = document.getElementById("travelForm");
const result = document.getElementById("result");
const destinationInput = document.getElementById("destination");
const destinationGrid = document.getElementById("destinationGrid");
const travelersInput = document.getElementById("travelers");
const travelWithInput = document.getElementById("travelWith");

let currentUser = null;
let activeTripData = null;

// ---------------- MODAL HELPERS ----------------
function openModal(id) {
    document.getElementById(id).hidden = false;
}
function closeModal(id) {
    document.getElementById(id).hidden = true;
}
document.querySelectorAll("[data-close]").forEach(btn => {
    btn.addEventListener("click", () => closeModal(btn.dataset.close));
});

// ---------------- AUTH STATE & LOGIN/SIGNUP ----------------
let isSignupMode = false;
const navAuthBtn = document.getElementById("navAuthBtn");
const authForm = document.getElementById("authForm");
const authNameGroup = document.getElementById("authNameGroup");
const authModalTitle = document.getElementById("authModalTitle");
const authSubmitBtn = document.getElementById("authSubmitBtn");
const authToggleModeBtn = document.getElementById("authToggleModeBtn");
const authSwitchText = document.getElementById("authSwitchText");
const authMsg = document.getElementById("authMsg");
const loggedInPanel = document.getElementById("loggedInPanel");
const loggedInUserInfo = document.getElementById("loggedInUserInfo");

async function refreshAuthStatus() {
    try {
        const res = await fetch("/api/me");
        const data = await res.json();
        if (data.logged_in) {
            currentUser = data.user;
            navAuthBtn.textContent = "👤 " + data.user.name;
            loggedInPanel.hidden = false;
            authForm.hidden = true;
            authModalTitle.textContent = "Your Account";
            loggedInUserInfo.textContent = `Signed in as ${data.user.name} (${data.user.email})`;
        } else {
            currentUser = null;
            navAuthBtn.textContent = "Login / Sign Up";
            loggedInPanel.hidden = true;
            authForm.hidden = false;
            authModalTitle.textContent = isSignupMode ? "Create WanderAI Account" : "Welcome to WanderAI";
        }
    } catch (e) {
        console.error("Auth check failed:", e);
    }
}

navAuthBtn.addEventListener("click", () => {
    authMsg.textContent = "";
    refreshAuthStatus();
    openModal("authModal");
});

authToggleModeBtn.addEventListener("click", () => {
    isSignupMode = !isSignupMode;
    authNameGroup.hidden = !isSignupMode;
    authModalTitle.textContent = isSignupMode ? "Create WanderAI Account" : "Welcome to WanderAI";
    authSubmitBtn.textContent = isSignupMode ? "Sign Up" : "Login";
    authSwitchText.textContent = isSignupMode ? "Already have an account?" : "Don't have an account?";
    authToggleModeBtn.textContent = isSignupMode ? "Login" : "Sign Up";
    authMsg.textContent = "";
});

authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    authMsg.textContent = "Please wait...";
    const endpoint = isSignupMode ? "/api/signup" : "/api/login";
    const payload = {
        name: document.getElementById("authName").value.trim(),
        email: document.getElementById("authEmail").value.trim(),
        password: document.getElementById("authPassword").value
    };

    const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
        authMsg.style.color = "#dc2626";
        authMsg.textContent = data.error || "Authentication failed.";
        return;
    }
    authMsg.style.color = "#0f766e";
    authMsg.textContent = data.message;
    await refreshAuthStatus();
    setTimeout(() => closeModal("authModal"), 700);
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
    await fetch("/api/logout", { method: "POST" });
    await refreshAuthStatus();
    closeModal("authModal");
});

// ---------------- TRAVEL HISTORY ----------------
async function loadTravelHistory() {
    const historyList = document.getElementById("historyList");
    historyList.innerHTML = "<p>Loading your saved trips...</p>";
    openModal("historyModal");

    const res = await fetch("/api/trips");
    const data = await res.json();

    if (!res.ok) {
        historyList.innerHTML = `<p style="color:#dc2626;">${data.error || "Please login first to see your saved trips."}</p>`;
        return;
    }

    if (!data.trips || data.trips.length === 0) {
        historyList.innerHTML = "<p>No saved trips yet. Generate a trip while logged in to save it automatically!</p>";
        return;
    }

    historyList.replaceChildren();
    data.trips.forEach(trip => {
        const item = document.createElement("div");
        item.className = "history-card";
        item.innerHTML = `
            <div>
                <strong>${trip.start_city} ➔ ${trip.destination} (${trip.days} Days)</strong>
                <p style="margin:4px 0;font-size:13px;color:#475569;">
                    ${trip.travelers} Traveller(s) · ${trip.travel_style} · Est. ₹${Number(trip.estimated_budget).toLocaleString("en-IN")}
                </p>
                <span class="status-badge">${trip.booking_status}</span>
            </div>
            <div class="history-actions">
                <button type="button" class="qb-btn hotel-btn load-trip-btn">Open Plan</button>
                <button type="button" class="secondary-danger-btn del-trip-btn">Delete</button>
            </div>
        `;

        item.querySelector(".load-trip-btn").addEventListener("click", () => {
            closeModal("historyModal");
            renderTripResult(trip.plan_data, trip.start_date || todayString, trip.end_date || todayString);
        });

        item.querySelector(".del-trip-btn").addEventListener("click", async () => {
            await fetch(`/api/trips/${trip.id}`, { method: "DELETE" });
            loadTravelHistory();
        });

        historyList.appendChild(item);
    });
}

document.getElementById("navHistoryBtn").addEventListener("click", loadTravelHistory);
document.getElementById("heroHistoryBtn").addEventListener("click", loadTravelHistory);

// ---------------- QUICK SEARCH BAR (TRAINS / FLIGHTS / HOTELS) ----------------
const qbDate = document.getElementById("qbDate");
const today = new Date();
const todayString = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0")
].join("-");
if (qbDate) qbDate.value = todayString;

document.getElementById("searchTrainsBtn").addEventListener("click", () => {
    const from = document.getElementById("qbFrom").value.trim() || "New Delhi";
    const to = document.getElementById("qbTo").value.trim() || "Manali";
    const query = encodeURIComponent(`IRCTC trains from ${from} to ${to}`);
    window.open(`https://www.google.com/search?q=${query}`, "_blank", "noopener,noreferrer");
});

document.getElementById("searchFlightsBtn").addEventListener("click", () => {
    const from = document.getElementById("qbFrom").value.trim() || "Delhi";
    const to = document.getElementById("qbTo").value.trim() || "Goa";
    const dateVal = qbDate.value || todayString;
    const query = encodeURIComponent(`flights from ${from} to ${to} on ${dateVal}`);
    window.open(`https://www.google.com/flights?q=${query}`, "_blank", "noopener,noreferrer");
});

document.getElementById("searchHotelsBtn").addEventListener("click", () => {
    const to = document.getElementById("qbTo").value.trim() || "Jaipur";
    const query = encodeURIComponent(`hotels in ${to}`);
    window.open(`https://www.google.com/travel/hotels?q=${query}`, "_blank", "noopener,noreferrer");
});

// ---------------- PAYMENT CHECKOUT MODAL ----------------
const paymentForm = document.getElementById("paymentForm");
const paymentMsg = document.getElementById("paymentMsg");
let pendingPayment = { title: "", amount: 0, tripId: null };

function openPaymentModal(title, amount, tripId = null) {
    pendingPayment = { title, amount: Number(amount) || 0, tripId };
    document.getElementById("payItemTitle").textContent = title;
    document.getElementById("payItemAmount").textContent = formatRupees(pendingPayment.amount);
    paymentMsg.textContent = "";
    openModal("paymentModal");
}

paymentForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const method = document.querySelector('input[name="payMethod"]:checked').value;
    paymentMsg.style.color = "#123b67";
    paymentMsg.textContent = "Processing secure payment...";

    const res = await fetch("/api/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            item_title: pendingPayment.title,
            amount: pendingPayment.amount,
            payment_method: method,
            trip_id: pendingPayment.tripId
        })
    });
    const data = await res.json();
    if (res.ok) {
        paymentMsg.style.color = "#0f766e";
        paymentMsg.textContent = "✅ " + data.message;
    } else {
        paymentMsg.style.color = "#dc2626";
        paymentMsg.textContent = data.error || "Payment failed.";
    }
});

// ---------------- CONTACT US MODAL ----------------
document.getElementById("navContactBtn").addEventListener("click", () => {
    document.getElementById("contactMsg").textContent = "";
    if (currentUser) {
        document.getElementById("contactName").value = currentUser.name;
        document.getElementById("contactEmail").value = currentUser.email;
    }
    openModal("contactModal");
});

document.getElementById("contactForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const contactMsg = document.getElementById("contactMsg");
    contactMsg.textContent = "Sending...";

    const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            name: document.getElementById("contactName").value.trim(),
            email: document.getElementById("contactEmail").value.trim(),
            subject: document.getElementById("contactSubject").value,
            message: document.getElementById("contactMessage").value.trim()
        })
    });
    const data = await res.json();
    if (res.ok) {
        contactMsg.style.color = "#0f766e";
        contactMsg.textContent = data.message;
        document.getElementById("contactMessage").value = "";
    } else {
        contactMsg.style.color = "#dc2626";
        contactMsg.textContent = data.error || "Could not send message.";
    }
});

// ---------------- FLOATING HELP AI CHATBOT ----------------
const helpAiToggle = document.getElementById("helpAiToggle");
const helpAiBox = document.getElementById("helpAiBox");
const helpAiClose = document.getElementById("helpAiClose");
const helpAiForm = document.getElementById("helpAiForm");
const helpAiMessages = document.getElementById("helpAiMessages");

helpAiToggle.addEventListener("click", () => {
    helpAiBox.hidden = !helpAiBox.hidden;
});
helpAiClose.addEventListener("click", () => {
    helpAiBox.hidden = true;
});

helpAiForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("helpAiInput");
    const question = input.value.trim();
    if (!question) return;

    const userDiv = document.createElement("div");
    userDiv.className = "user-msg";
    userDiv.textContent = question;
    helpAiMessages.appendChild(userDiv);
    input.value = "";
    helpAiMessages.scrollTop = helpAiMessages.scrollHeight;

    const botDiv = document.createElement("div");
    botDiv.className = "ai-msg";
    botDiv.textContent = "Thinking...";
    helpAiMessages.appendChild(botDiv);
    helpAiMessages.scrollTop = helpAiMessages.scrollHeight;

    try {
        const res = await fetch("/api/help-ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ question })
        });
        const data = await res.json();
        botDiv.textContent = data.reply || data.error || "Sorry, try again.";
    } catch {
        botDiv.textContent = "Network error. Please try again.";
    }
    helpAiMessages.scrollTop = helpAiMessages.scrollHeight;
});

// ---------------- WEATHER FUNCTIONS ----------------
function getWeatherDescription(code) {
    const conditions = {
        0: ["☀️", "Clear Sky"], 1: ["🌤️", "Mainly Clear"], 2: ["⛅", "Partly Cloudy"],
        3: ["☁️", "Overcast"], 45: ["🌫️", "Fog"], 48: ["🌫️", "Depositing Rime Fog"],
        51: ["🌦️", "Light Drizzle"], 53: ["🌦️", "Moderate Drizzle"], 55: ["🌧️", "Heavy Drizzle"],
        61: ["🌧️", "Light Rain"], 63: ["🌧️", "Moderate Rain"], 65: ["🌧️", "Heavy Rain"],
        71: ["🌨️", "Light Snow"], 73: ["🌨️", "Moderate Snow"], 75: ["❄️", "Heavy Snow"],
        80: ["🌦️", "Rain Showers"], 81: ["🌧️", "Moderate Showers"], 82: ["⛈️", "Heavy Showers"],
        95: ["⛈️", "Thunderstorm"], 96: ["⛈️", "Thunderstorm with Hail"], 99: ["⛈️", "Severe Thunderstorm"]
    };
    return conditions[code] || ["🌡️", "Weather Unavailable"];
}

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
        const knownDestinations = {
            "goa": { name: "Goa", admin1: "India", latitude: 15.2993, longitude: 74.1240 },
            "manali": { name: "Manali", admin1: "Himachal Pradesh", latitude: 32.2432, longitude: 77.1892 },
            "jaipur": { name: "Jaipur", admin1: "Rajasthan", latitude: 26.9124, longitude: 75.7873 },
            "rishikesh": { name: "Rishikesh", admin1: "Uttarakhand", latitude: 30.0869, longitude: 78.2676 },
            "agra": { name: "Agra", admin1: "Uttar Pradesh", latitude: 27.1767, longitude: 78.0081 },
            "srinagar": { name: "Srinagar", admin1: "Jammu & Kashmir", latitude: 34.0837, longitude: 74.7973 },
            "shimla": { name: "Shimla", admin1: "Himachal Pradesh", latitude: 31.1048, longitude: 77.1734 },
            "udaipur": { name: "Udaipur", admin1: "Rajasthan", latitude: 24.5854, longitude: 73.7125 },
            "munnar": { name: "Munnar", admin1: "Kerala", latitude: 10.0889, longitude: 77.0595 },
            "ooty": { name: "Ooty", admin1: "Tamil Nadu", latitude: 11.4102, longitude: 76.6950 }
        };

        const normalizedCity = city.trim().toLowerCase();
        let place = knownDestinations[normalizedCity];

        if (!place) {
            const geoUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
            geoUrl.search = new URLSearchParams({
                name: city, count: "5", language: "en", format: "json", countryCode: "IN"
            });
            const geoResponse = await fetch(geoUrl);
            if (!geoResponse.ok) throw new Error("Unable to find destination.");
            const geoData = await geoResponse.json();
            if (!geoData.results || geoData.results.length === 0) {
                throw new Error("Destination not found.");
            }
            place = geoData.results.sort((a, b) => (b.population || 0) - (a.population || 0))[0];
        }

        const nowZero = new Date();
        nowZero.setHours(0, 0, 0, 0);
        const lastForecastDate = new Date(nowZero);
        lastForecastDate.setDate(lastForecastDate.getDate() + 15);

        const selectedStart = new Date(startDate + "T00:00:00");
        const selectedEnd = new Date(endDate + "T00:00:00");

        locationText.textContent = place.name + ", " + (place.admin1 || place.country || "India");

        const weatherUrl = new URL("https://api.open-meteo.com/v1/forecast");
        weatherUrl.search = new URLSearchParams({
            latitude: place.latitude,
            longitude: place.longitude,
            current: "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m",
            timezone: "auto"
        });

        const weatherResponse = await fetch(weatherUrl);
        if (!weatherResponse.ok) throw new Error("Weather service unavailable.");
        const weather = await weatherResponse.json();
        const current = weather.current;

        const condition = getWeatherDescription(current.weather_code);
        const currentCard = document.createElement("div");
        currentCard.className = "weather-main-card";
        currentCard.innerHTML = `
            <div class="weather-icon">${condition[0]}</div>
            <h2>${Math.round(current.temperature_2m)}°C</h2>
            <p>${condition[1]}</p>
            <div class="weather-details">
                <span>Feels like: ${Math.round(current.apparent_temperature)}°C</span>
                <span>Humidity: ${current.relative_humidity_2m}%</span>
                <span>Wind: ${current.wind_speed_10m} km/h</span>
            </div>
        `;
        currentBox.appendChild(currentCard);

        if (selectedStart < nowZero || selectedEnd > lastForecastDate) {
            const msg = document.createElement("p");
            msg.textContent = "Multi-day forecast is available for dates within the next 16 days.";
            forecastBox.appendChild(msg);
            return;
        }

        const minEndDate = new Date(selectedStart);
        minEndDate.setDate(minEndDate.getDate() + 4);
        const actualForecastEnd = selectedEnd > minEndDate ? selectedEnd : minEndDate;
        const forecastEndString = [
            actualForecastEnd.getFullYear(),
            String(actualForecastEnd.getMonth() + 1).padStart(2, "0"),
            String(actualForecastEnd.getDate()).padStart(2, "0")
        ].join("-");

        const forecastUrl = new URL("https://api.open-meteo.com/v1/forecast");
        forecastUrl.search = new URLSearchParams({
            latitude: place.latitude,
            longitude: place.longitude,
            daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
            start_date: startDate,
            end_date: forecastEndString,
            timezone: "auto"
        });

        const forecastResponse = await fetch(forecastUrl);
        const forecast = await forecastResponse.json();
        const daily = forecast.daily;

        let rainyDays = 0;
        daily.time.forEach((date, index) => {
            const code = daily.weather_code[index];
            const forecastCondition = getWeatherDescription(code);
            const rainChance = daily.precipitation_probability_max[index] ?? 0;
            if (rainChance >= 60 || [95, 96, 99].includes(code)) rainyDays++;

            const card = document.createElement("div");
            card.className = "forecast-card";
            card.innerHTML = `
                <strong>${new Date(date + "T12:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}</strong>
                <div class="forecast-icon">${forecastCondition[0]}</div>
                <p>${forecastCondition[1]}</p>
                <strong>${Math.round(daily.temperature_2m_max[index])}° / ${Math.round(daily.temperature_2m_min[index])}°</strong>
                <small>Rain chance: ${rainChance}%</small>
            `;
            forecastBox.appendChild(card);
        });

        if (rainyDays > 0) {
            alertBox.hidden = false;
            alertBox.textContent = `☔ Travel tip: Rain or thunderstorm conditions may occur on ${rainyDays} trip day(s). Pack rain gear!`;
        }
    } catch (error) {
        locationText.textContent = "Weather information unavailable.";
    }
}

// ---------------- PLANNER FORM & RENDERING ----------------
function formatRupees(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return "Not available";
    return "₹" + amount.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

destinationGrid.addEventListener("click", (event) => {
    const card = event.target.closest(".destination-card");
    if (!card) return;
    destinationInput.value = card.dataset.destination;
    document.getElementById("planner").scrollIntoView({ behavior: "smooth", block: "start" });
    destinationInput.focus({ preventScroll: true });
});

travelWithInput.addEventListener("change", () => {
    if (travelWithInput.value === "Couple") travelersInput.value = 2;
    else if (["Friends", "Family", "Group"].includes(travelWithInput.value) && Number(travelersInput.value) < 2) {
        travelersInput.value = 2;
    } else if (travelWithInput.value === "Solo") travelersInput.value = 1;
});

function addText(tag, text, parent = result, className = "") {
    const el = document.createElement(tag);
    el.textContent = String(text ?? "");
    if (className) el.className = className;
    parent.appendChild(el);
    return el;
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

const startDateInput = document.getElementById("startDate");
const endDateInput = document.getElementById("endDate");
const dateError = document.getElementById("dateError");

startDateInput.min = todayString;
endDateInput.min = todayString;

startDateInput.addEventListener("change", () => {
    endDateInput.min = startDateInput.value || todayString;
    if (endDateInput.value && endDateInput.value < startDateInput.value) endDateInput.value = "";
    updateTripDuration();
});
endDateInput.addEventListener("change", updateTripDuration);

function updateTripDuration() {
    if (!startDateInput.value || !endDateInput.value) return;
    const start = new Date(startDateInput.value + "T00:00:00");
    const end = new Date(endDateInput.value + "T00:00:00");
    const diff = Math.round((end - start) / 86400000);
    if (diff < 0) dateError.textContent = "Return date cannot be before departure date.";
    else dateError.textContent = `Your trip duration is ${diff + 1} day(s).`;
}

function renderTripResult(data, startDate, endDate) {
    activeTripData = data;
    result.replaceChildren();

    addText("h2", `✈️ ${data.days}-Day Trip to ${data.destination}`);
    addText("p", `📅 ${new Date(startDate + "T00:00:00").toLocaleDateString("en-IN")} – ${new Date(endDate + "T00:00:00").toLocaleDateString("en-IN")}`);
    addText("p", `${data.travel_with} trip · ${data.travelers} traveller(s) · ${data.interest} · Style: ${data.travel_style}`);

    if (data.trip_id) {
        addText("p", "✅ Saved automatically to your Travel History!", result, "saved-banner");
    }

    // Budget Summary + Book Full Package Button
    addText("h3", "💰 Your Estimated Trip Budget");
    const summary = document.createElement("div");
    summary.className = "budget-summary";
    addBudgetCard(summary, "Total estimated group cost", data.estimated_budget);
    addBudgetCard(summary, "Estimated cost per person", data.estimated_per_person);
    result.appendChild(summary);

    const bookAllBtn = document.createElement("button");
    bookAllBtn.type = "button";
    bookAllBtn.className = "book-package-btn";
    bookAllBtn.textContent = `💳 Book Complete Trip Package (${formatRupees(data.estimated_budget)})`;
    bookAllBtn.addEventListener("click", () => {
        openPaymentModal(`${data.days}-Day ${data.destination} Complete Package`, data.estimated_budget, data.trip_id);
    });
    result.appendChild(bookAllBtn);

    // Breakdown + Chart
    addText("h3", "Where your money may go");
    const breakdownBox = document.createElement("div");
    breakdownBox.className = "budget-breakdown";
    [
        ["Transport", "transport"],
        ["Accommodation", "accommodation"],
        ["Food", "food"],
        ["Activities & sightseeing", "activities"],
        ["Miscellaneous", "miscellaneous"]
    ].forEach(([label, key]) => {
        const line = document.createElement("div");
        line.className = "budget-line";
        addText("span", label, line);
        addText("span", formatRupees(data.budget_breakdown?.[key]), line);
        breakdownBox.appendChild(line);
    });
    result.appendChild(breakdownBox);

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
                    backgroundColor: ["#123b67", "#0d9488", "#2563eb", "#f59e0b", "#64748b"],
                    borderWidth: 2,
                    borderColor: "#ffffff"
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: "bottom" } }
            }
        });
    }

    // Itinerary
    addText("h3", "🗓️ Your Day-by-Day Itinerary");
    (data.itinerary || []).forEach(day => {
        const section = document.createElement("section");
        section.className = "itinerary-day";
        addText("h3", `Day ${day.day}`, section);
        addText("p", day.plan, section);
        addText("p", `Estimated cost for this day: ${formatRupees(day.estimated_cost)}`, section, "day-cost");
        result.appendChild(section);
    });

    // Hotels + Maps + Book Hotel
    addText("h3", "🏨 Recommended Hotels & Stay Booking");
    const hotelsBox = document.createElement("div");
    hotelsBox.className = "recommendation-grid";
    (data.hotels || []).forEach(hotel => {
        const card = document.createElement("div");
        card.className = "recommendation-card";
        addText("h3", hotel.name || "Hotel Option", card);
        addText("p", hotel.type || "Stay", card);
        addText("p", "📍 " + (hotel.location || data.destination), card);
        addText("strong", "Approx. ₹" + Number(hotel.price_per_night || 0).toLocaleString("en-IN") + " / night", card);
        addText("p", hotel.description || "", card);

        const actionsDiv = document.createElement("div");
        actionsDiv.className = "card-btn-row";

        const mapLink = document.createElement("a");
        mapLink.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((hotel.name || "") + " " + data.destination)}`;
        mapLink.target = "_blank";
        mapLink.rel = "noopener noreferrer";
        mapLink.className = "map-link-btn";
        mapLink.textContent = "🗺️ Map ↗";

        const bookHotelBtn = document.createElement("button");
        bookHotelBtn.type = "button";
        bookHotelBtn.className = "book-mini-btn";
        bookHotelBtn.textContent = "🏨 Book Hotel";
        bookHotelBtn.addEventListener("click", () => {
            const totalStay = (Number(hotel.price_per_night) || 2000) * Math.max(1, data.days - 1);
            openPaymentModal(`Hotel: ${hotel.name} (${data.destination})`, totalStay, data.trip_id);
        });

        actionsDiv.append(mapLink, bookHotelBtn);
        card.appendChild(actionsDiv);
        hotelsBox.appendChild(card);
    });
    result.appendChild(hotelsBox);

    // Transport + Search Trains/Flights + Book Ticket
    addText("h3", "🚆 Transport Recommendations & Ticket Booking");
    const transportBox = document.createElement("div");
    transportBox.className = "recommendation-grid";
    (data.transport_options || []).forEach(option => {
        const card = document.createElement("div");
        card.className = "recommendation-card";
        addText("h3", option.mode || "Transport", card);
        addText("p", "Route: " + (option.route || `${data.start_city} to ${data.destination}`), card);
        addText("strong", "Approx. ₹" + Number(option.estimated_fare_per_person || 0).toLocaleString("en-IN") + " / person", card);
        addText("p", "Travel time: " + (option.travel_time || "Varies"), card);
        addText("p", option.description || "", card);

        const actionsDiv = document.createElement("div");
        actionsDiv.className = "card-btn-row";

        const searchBtn = document.createElement("a");
        const modeLower = (option.mode || "").toLowerCase();
        if (modeLower.includes("flight")) {
            searchBtn.href = `https://www.google.com/flights?q=${encodeURIComponent(`flights from ${data.start_city} to ${data.destination}`)}`;
            searchBtn.textContent = "✈️ Search Flights ↗";
        } else if (modeLower.includes("train")) {
            searchBtn.href = `https://www.google.com/search?q=${encodeURIComponent(`IRCTC trains from ${data.start_city} to ${data.destination}`)}`;
            searchBtn.textContent = "🚆 Search Trains ↗";
        } else {
            searchBtn.href = `https://www.google.com/search?q=${encodeURIComponent(`bus cab from ${data.start_city} to ${data.destination}`)}`;
            searchBtn.textContent = "🚌 Search Bus/Cab ↗";
        }
        searchBtn.target = "_blank";
        searchBtn.rel = "noopener noreferrer";
        searchBtn.className = "map-link-btn";

        const bookTransitBtn = document.createElement("button");
        bookTransitBtn.type = "button";
        bookTransitBtn.className = "book-mini-btn";
        bookTransitBtn.textContent = "🎟️ Book Ticket";
        bookTransitBtn.addEventListener("click", () => {
            const totalFare = (Number(option.estimated_fare_per_person) || 1000) * (Number(data.travelers) || 1);
            openPaymentModal(`${option.mode}: ${data.start_city} to ${data.destination}`, totalFare, data.trip_id);
        });

        actionsDiv.append(searchBtn, bookTransitBtn);
        card.appendChild(actionsDiv);
        transportBox.appendChild(card);
    });
    result.appendChild(transportBox);

    // Packing Checklist
    if (Array.isArray(data.packing_list) && data.packing_list.length > 0) {
        addText("h3", "🎒 Smart Packing Checklist");
        const packingBox = document.createElement("div");
        packingBox.className = "packing-grid";
        data.packing_list.forEach(itemText => {
            const label = document.createElement("label");
            label.className = "packing-item";
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            const span = document.createElement("span");
            span.textContent = itemText;
            checkbox.addEventListener("change", () => label.classList.toggle("checked", checkbox.checked));
            label.append(checkbox, span);
            packingBox.appendChild(label);
        });
        result.appendChild(packingBox);
    }

    addText("h3", "📌 Helpful travel note");
    addText("p", data.note || "Verify transport, accommodation and attraction costs before departure.");

    // PDF Download Button
    const pdfButton = document.createElement("button");
    pdfButton.textContent = "📄 Download Trip Plan as PDF";
    pdfButton.className = "pdf-download-btn";
    pdfButton.addEventListener("click", () => downloadTripPdf(data));
    result.appendChild(pdfButton);

    loadDestinationWeather(data.destination, startDate, endDate);
    result.scrollIntoView({ behavior: "smooth", block: "start" });
}

function downloadTripPdf(data) {
    if (!window.jspdf) {
        showError("PDF library is not loaded. Please refresh the page.");
        return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF("p", "mm", "a4");
    const pageWidth = 210, pageHeight = 297, margin = 18;
    const contentWidth = pageWidth - margin * 2;
    let y = 20;

    const cleanText = (val) => String(val ?? "").replace(/[^\x20-\x7E\xA0-\xFF]/g, "").replace(/\s+/g, " ").trim();
    const money = (val) => Number.isFinite(Number(val)) ? "INR " + Number(val).toLocaleString("en-IN") : "N/A";
    const checkSpace = (h) => { if (y + h > pageHeight - 20) { doc.addPage(); y = 22; } };

    function heading(title) {
        checkSpace(18);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        doc.setTextColor(25, 65, 115);
        doc.text(title, margin, y);
        y += 6;
        doc.setDrawColor(210, 220, 235);
        doc.line(margin, y, pageWidth - margin, y);
        y += 6;
    }

    function paragraph(text, size = 10) {
        const lines = doc.splitTextToSize(cleanText(text), contentWidth);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(size);
        doc.setTextColor(60, 60, 60);
        lines.forEach(line => { checkSpace(6); doc.text(line, margin, y); y += 5.5; });
        y += 2;
    }

    doc.setFillColor(24, 67, 125);
    doc.rect(0, 0, pageWidth, 38, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text("WanderAI", margin, 18);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("YOUR PERSONAL TRAVEL PLAN", margin, 27);
    y = 48;

    heading("TRIP OVERVIEW");
    paragraph(`${data.days}-Day Trip from ${data.start_city} to ${data.destination} | ${data.travel_with} (${data.travelers} travellers) | Style: ${data.travel_style}`, 11);
    paragraph(`Total Estimated Budget: ${money(data.estimated_budget)} | Per Person: ${money(data.estimated_per_person)}`, 11);

    heading("DAY-BY-DAY ITINERARY");
    (data.itinerary || []).forEach(day => {
        checkSpace(20);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10.5);
        doc.setTextColor(25, 65, 115);
        doc.text(`Day ${day.day} (${money(day.estimated_cost)})`, margin, y);
        y += 5.5;
        paragraph(day.plan);
    });

    heading("RECOMMENDED HOTELS");
    (data.hotels || []).forEach(h => {
        paragraph(`${h.name} (${h.type}) - ${h.location} | ${money(h.price_per_night)}/night: ${h.description}`);
    });

    heading("TRANSPORT RECOMMENDATIONS");
    (data.transport_options || []).forEach(t => {
        paragraph(`${t.mode} (${t.route}) | ${money(t.estimated_fare_per_person)}/person | ${t.travel_time}: ${t.description}`);
    });

    heading("TRAVEL NOTE");
    paragraph(data.note);
    doc.save("WanderAI-Trip-Plan.pdf");
}

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const startDate = startDateInput.value;
    const endDate = endDateInput.value;
    if (!startDate || !endDate || endDate < startDate) {
        dateError.textContent = "Please select valid departure and return dates.";
        return;
    }
    const calculatedDays = Math.round((new Date(endDate + "T00:00:00") - new Date(startDate + "T00:00:00")) / 86400000) + 1;
    if (calculatedDays > 14) {
        dateError.textContent = "Trip duration can be maximum 14 days.";
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

    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = "Planning your trip...";
    result.replaceChildren();
    addText("h3", "✈️ Your adventure is being planned...");
    addText("p", "AI is preparing your itinerary, budgets, and booking options.");

    try {
        const response = await fetch("/plan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(trip)
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not generate travel plan.");
        renderTripResult(data, startDate, endDate);
    } catch (error) {
        showError(error.message || "Something went wrong.");
    } finally {
        button.disabled = false;
        button.innerHTML = 'Generate my AI travel plan <span>✦</span>';
    }
});

// Initialize login check on page load
refreshAuthStatus();