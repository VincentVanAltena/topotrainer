// ======================================================
//  KAART INITIALISEREN
// ======================================================

const map = L.map('map', {
  center: [34, 35],
  zoom: 5
});

// Basemaps
const basemaps = {
  "AWMC Imperium": L.tileLayer('https://tiles.awmc.unc.edu/imperium/{z}/{x}/{y}.png', {
    attribution: '&copy; AWMC'
  }),
  "OpenStreetMap": L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png')
};

// Standaard basemap
basemaps["AWMC Imperium"].addTo(map);


// ======================================================
//  UI MANAGER
// ======================================================

const UIManager = {
  titleEl: document.getElementById("modeTitle"),
  instrEl: document.getElementById("modeInstruction"),
  taskEl: document.getElementById("taskText"),
  feedbackEl: document.getElementById("feedback"),
  scoreEl: document.getElementById("score"),

  setTitle(t) { this.titleEl.textContent = t; },
  setInstruction(t) { this.instrEl.textContent = t; },
  setTask(t) { this.taskEl.textContent = t; },
  setFeedback(t, type = "") {
    this.feedbackEl.textContent = t;
    this.feedbackEl.className = type;
  },
  setScore(t) { this.scoreEl.textContent = t; }
};


// ======================================================
//  PROGRESS BAR
// ======================================================

function updateProgress(current, total) {
  const pct = Math.round((current / total) * 100);
  document.getElementById("progressBar").style.width = pct + "%";
}


// ======================================================
//  QUIZ VRAGEN (worden overschreven bij upload)
// ======================================================

let QUIZ_QUESTIONS = [];


// ======================================================
//  QUIZ PARSER (TXT → vragen)
// ======================================================

function parseQuizFile(text) {
  const lines = text.split("\n");
  const questions = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const parts = trimmed.split("|");
    if (parts.length !== 2) continue;

    questions.push({
      id: "q-" + Math.random().toString(36).slice(2),
      text: parts[0].trim(),
      targetName: parts[1].trim()
    });
  }
  return questions;
}


// ======================================================
//  FOUTSTATISTIEKEN OPSLAAN
// ======================================================

function registerWrongAnswer(name) {
  const stats = JSON.parse(localStorage.getItem("featureStats") || "{}");
  if (!stats[name]) stats[name] = { wrong: 0, correct: 0 };
  stats[name].wrong++;
  localStorage.setItem("featureStats", JSON.stringify(stats));
}

function registerCorrectAnswer(name) {
  const stats = JSON.parse(localStorage.getItem("featureStats") || "{}");
  if (!stats[name]) stats[name] = { wrong: 0, correct: 0 };
  stats[name].correct++;
  localStorage.setItem("featureStats", JSON.stringify(stats));
}


// ======================================================
//  QUIZ RESULTATEN OPSLAAN
// ======================================================

function saveQuizResult(correct, total) {
  const results = JSON.parse(localStorage.getItem("quizResults") || "[]");
  results.push({
    date: new Date().toISOString(),
    correct,
    total
  });
  localStorage.setItem("quizResults", JSON.stringify(results));
}


// ======================================================
//  ADAPTIEVE QUIZ (moeilijke vragen vaker)
// ======================================================

function weightedQuestions(questions) {
  const stats = JSON.parse(localStorage.getItem("featureStats") || "{}");
  const weighted = [];

  for (const q of questions) {
    const s = stats[q.targetName] || { wrong: 0 };
    const weight = 1 + s.wrong;
    for (let i = 0; i < weight; i++) weighted.push(q);
  }

  return shuffle(weighted);
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}


// ======================================================
//  QUIZ ENGINE (ENKEL QUIZ, GEEN MODES)
// ======================================================

const QuizMode = {
  index: 0,
  correct: 0,
  total: 0,
  weightedList: [],

  enable() {
    this.index = 0;
    this.correct = 0;
    this.total = 0;

    this.weightedList = weightedQuestions(QUIZ_QUESTIONS);

    UIManager.setTitle("Quiz");
    UIManager.setInstruction("Klik op de juiste locatie.");
    UIManager.setFeedback("");
    UIManager.setScore("");

    this._showCurrentQuestion();
    updateProgress(0, this.weightedList.length);
  },

  _showCurrentQuestion() {
    const q = this.weightedList[this.index];
    if (!q) {
      UIManager.setTask("Quiz voltooid!");
      saveQuizResult(this.correct, this.total);
      updateProgress(this.weightedList.length, this.weightedList.length);
      return;
    }
    UIManager.setTask(q.text);
  },

  _updateScore() {
    UIManager.setScore(`Score: ${this.correct} / ${this.total}`);
  },

  handleClick(feature) {
    const q = this.weightedList[this.index];
    if (!q) return;

    const name = feature.properties?.name || feature.properties?.label || "";
    if (!name) return;

    this.total++;

    if (normalize(name) === normalize(q.targetName)) {
      this.correct++;
      registerCorrectAnswer(q.targetName);
      UIManager.setFeedback("Goed!", "ok");
      this.nextQuestion();
    } else {
      registerWrongAnswer(q.targetName);
      UIManager.setFeedback(`Fout: ${name}`, "error");
    }

    this._updateScore();
  },

  nextQuestion() {
    this.index++;
    updateProgress(this.index, this.weightedList.length);
    this._showCurrentQuestion();
  }
};


// ======================================================
//  GEOJSON LADEN
// ======================================================

const layers = {};
const layerListEl = document.getElementById("layerList");

document.getElementById("geojsonInput").addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;

  const data = JSON.parse(await file.text());
  addGeoJSONLayer(file.name, data);
});

function addGeoJSONLayer(name, data) {
  const layer = L.geoJSON(data, {
    style: { color: "#2563eb", weight: 2, fillOpacity: 0.2 },
    onEachFeature: (feature, layer) => {
      layer.on("click", () => handleFeatureClick(feature));
    }
  }).addTo(map);

  layers[name] = layer;

  const div = document.createElement("div");
  div.innerHTML = `<label><input type="checkbox" checked data-layer="${name}"> ${name}</label>`;
  const checkbox = div.querySelector("input");

  checkbox.addEventListener("change", e => {
    const lname = e.target.dataset.layer;
    if (e.target.checked) map.addLayer(layers[lname]);
    else map.removeLayer(layers[lname]);
  });

  layerListEl.appendChild(div);

  try { map.fitBounds(layer.getBounds()); } catch {}
}


// ======================================================
//  QUIZ UPLOAD
// ======================================================

document.getElementById("quizInput").addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;

  const text = await file.text();
  const questions = parseQuizFile(text);

  QUIZ_QUESTIONS = questions;
  QuizMode.enable();
});

// ======================================================
//  KLIKAFHANDELING
// ======================================================

function handleFeatureClick(feature) {
  QuizMode.handleClick(feature);
}

function normalize(str) {
  return String(str).toLowerCase().trim();
}


// ======================================================
//  QUIZ STARTEN BIJ PAGINA-LAAD
// ======================================================

UIManager.setTitle("Quiz");
UIManager.setInstruction("Upload quizvragen en GeoJSON om te beginnen.");
