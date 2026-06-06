// ======================================================
//  MAP
// ======================================================

const map = L.map('map', {
  center: [34, 35],
  zoom: 5
});

const basemaps = {
  "AWMC Antiquity": L.tileLayer('https://cawm.lib.uiowa.edu/tiles/{z}/{x}/{y}.png',{
    attribution: '&copy; AWMC'
  }),
  "DARE": L.tileLayer('https://dh.gu.se/tiles/imperium/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://dh.gu.se/dare/">Digital Atlas of the Roman Empire</a>, University of Gothenburg'
  }),
  "Esri World Imagery": L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: '&copy; Esri'
  }),
  "OpenStreetMap": L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }),
};

basemaps["AWMC Antiquity"].addTo(map);

const basemapSelect = document.getElementById("basemapSelect");
for (const name of Object.keys(basemaps)) {
  const opt = document.createElement("option");
  opt.value = name;
  opt.textContent = name;
  basemapSelect.appendChild(opt);
}
basemapSelect.addEventListener("change", e => {
  for (const layer of Object.values(basemaps)) map.removeLayer(layer);
  basemaps[e.target.value].addTo(map);
});


// ======================================================
//  UI
// ======================================================

const taskEl     = document.getElementById("taskText");
const feedbackEl = document.getElementById("feedback");
const scoreEl    = document.getElementById("score");
const nextBtn    = document.getElementById("nextTaskBtn");

function setTask(t)               { taskEl.textContent = t; }
function setFeedback(t, cls = "") { feedbackEl.textContent = t; feedbackEl.className = cls; }
function setScore(t)              { scoreEl.textContent = t; }

function updateProgress(current, total) {
  const pct = total ? Math.round((current / total) * 100) : 0;
  document.getElementById("progressBar").style.width = pct + "%";
}


// ======================================================
//  QUIZ PARSER
// ======================================================

let QUIZ_QUESTIONS = [];

function parseQuizFile(text) {
  return text.split("\n")
    .map(l => l.trim())
    .filter(l => l && !l.startsWith("#"))
    .map(l => {
      const parts = l.split("|");
      if (parts.length !== 2) return null;
      return { text: parts[0].trim(), targetName: parts[1].trim() };
    })
    .filter(Boolean);
}


// ======================================================
//  STATS & STORAGE
// ======================================================

function getStats() {
  return JSON.parse(localStorage.getItem("featureStats") || "{}");
}

function recordAnswer(name, correct) {
  const stats = getStats();
  if (!stats[name]) stats[name] = { wrong: 0, correct: 0 };
  if (correct) stats[name].correct++;
  else stats[name].wrong++;
  localStorage.setItem("featureStats", JSON.stringify(stats));
}

function saveQuizResult(correct, total) {
  const results = JSON.parse(localStorage.getItem("quizResults") || "[]");
  results.push({ date: new Date().toISOString(), correct, total });
  localStorage.setItem("quizResults", JSON.stringify(results));
}


// ======================================================
//  ADAPTIVE ORDERING
// ======================================================

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function weightedQuestions(questions) {
  // Questions answered incorrectly more often appear more frequently
  const stats = getStats();
  const weighted = [];
  for (const q of questions) {
    const weight = 1 + (stats[q.targetName]?.wrong || 0);
    for (let i = 0; i < weight; i++) weighted.push(q);
  }
  return shuffle(weighted);
}


// ======================================================
//  QUIZ ENGINE
// ======================================================

const Quiz = {
  index: 0,
  correct: 0,
  total: 0,
  list: [],
  active: false,

  start() {
    if (!QUIZ_QUESTIONS.length) return;
    this.index = 0;
    this.correct = 0;
    this.total = 0;
    this.active = true;
    this.list = weightedQuestions(QUIZ_QUESTIONS);

    setFeedback("");
    setScore("");
    nextBtn.style.display = "none";
    updateProgress(0, this.list.length);
    this._show();
  },

  _show() {
    const q = this.list[this.index];
    if (!q) {
      setTask("Quiz complete!");
      setScore(`Final score: ${this.correct} / ${this.total}`);
      saveQuizResult(this.correct, this.total);
      updateProgress(this.list.length, this.list.length);
      this.active = false;
      return;
    }
    setTask(q.text);
  },

  handleClick(feature) {
    if (!this.active) return;
    const q = this.list[this.index];
    if (!q) return;

    const name = feature.properties?.name || feature.properties?.label || "";
    if (!name) return;

    this.total++;

    if (normalize(name) === normalize(q.targetName)) {
      this.correct++;
      recordAnswer(q.targetName, true);
      setFeedback("Correct!", "ok");
      this.index++;
      updateProgress(this.index, this.list.length);
      this._show();
    } else {
      recordAnswer(q.targetName, false);
      setFeedback(`Wrong: ${name}`, "error");
    }

    setScore(`Score: ${this.correct} / ${this.total}`);
  }
};


// ======================================================
//  GEOJSON
// ======================================================

const layers = {};
const layerListEl = document.getElementById("layerList");

function addGeoJSONLayer(name, data) {
  const layer = L.geoJSON(data, {
    style: { color: "#2563eb", weight: 2, fillOpacity: 0.2 },
    onEachFeature: (feature, lyr) => {
      lyr.on("click", () => Quiz.handleClick(feature));
    }
  }).addTo(map);

  layers[name] = layer;

  // Add a toggle checkbox to the layer list
  const div = document.createElement("div");
  div.innerHTML = `<label><input type="checkbox" checked data-layer="${name}"> ${name}</label>`;
  div.querySelector("input").addEventListener("change", e => {
    if (e.target.checked) map.addLayer(layers[name]);
    else map.removeLayer(layers[name]);
  });
  layerListEl.appendChild(div);

  try { map.fitBounds(layer.getBounds()); } catch {}
}


// ======================================================
//  FILE UPLOADS
// ======================================================

async function handleQuizUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  QUIZ_QUESTIONS = parseQuizFile(await file.text());
  Quiz.start();
}

async function handleGeojsonUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const data = JSON.parse(await file.text());
  addGeoJSONLayer(file.name, data);
}

["quizInput", "quizInputMobile"].forEach(id =>
  document.getElementById(id).addEventListener("change", handleQuizUpload)
);

["geojsonInput", "geojsonInputMobile"].forEach(id =>
  document.getElementById(id).addEventListener("change", handleGeojsonUpload)
);


// ======================================================
//  MOBILE MENU TOGGLE
// ======================================================

document.getElementById("menuToggle").addEventListener("click", () => {
  document.getElementById("mobileMenu").classList.toggle("open");
});


// ======================================================
//  HELPERS
// ======================================================

function normalize(str) {
  return String(str).toLowerCase().trim();
}


// ======================================================
//  QUIZ CARD: move into sidebar on desktop, above map on mobile
// ======================================================

(function placeQuizCard() {
  const card = document.getElementById("quizCard");
  const sidebar = document.getElementById("sidebar");

  function reattach() {
    if (window.innerWidth >= 800) {
      // Desktop: place quiz card at the top of the sidebar
      sidebar.prepend(card);
      card.style.display = "block";
      card.style.borderBottom = "none";
      card.style.borderTop = "none";
    } else {
      // Mobile: place quiz card directly after the mobile menu
      const app = document.getElementById("app");
      const mobileMenu = document.getElementById("mobileMenu");
      app.insertBefore(card, mobileMenu.nextSibling);
      card.style.display = "block";
    }
  }

  reattach();
  window.addEventListener("resize", reattach);
})();


// ======================================================
//  SPLASH SCREEN
// ======================================================

document.getElementById("splashClose").addEventListener("click", () => {
  document.getElementById("splash").classList.add("hidden");
});