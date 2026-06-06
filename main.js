// ---------- Basiskaart en managers ----------

const map = L.map('map', {
  center: [34, 35], // Oostelijke Middellandse Zee
  zoom: 5
});

// Basemaps (incl. AWMC & DarmW)
const basemaps = {
  "OpenStreetMap": L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }),
  "Carto Light": L.tileLayer('https://cartodb-basemaps-{s}.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png', {
    attribution: '&copy; Carto / OSM'
  }),
  "Esri World Imagery": L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: '&copy; Esri'
  }),
  "AWMC Antiquity": L.tileLayer('https://cawm.lib.uiowa.edu/tiles/{z}/{x}/{y}.png',{
    attribution: '&copy; AWMC'
  }),
  "DARE": L.tileLayer('https://dh.gu.se/tiles/imperium/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://dh.gu.se/dare/">Digital Atlas of the Roman Empire</a>, University of Gothenburg'
  })
};

let currentBasemap = null;

// Basemap dropdown vullen
const basemapSelect = document.getElementById("basemapSelect");
Object.keys(basemaps).forEach(name => {
  const opt = document.createElement("option");
  opt.value = name;
  opt.textContent = name;
  basemapSelect.appendChild(opt);
});

// Standaard basemap
function setBasemap(name) {
  if (currentBasemap) {
    map.removeLayer(currentBasemap);
  }
  currentBasemap = basemaps[name];
  currentBasemap.addTo(map);
}
setBasemap("DARE");

basemapSelect.value = "DARE";
basemapSelect.addEventListener("change", e => setBasemap(e.target.value));

// ---------- UI Manager ----------

const UIManager = {
  titleEl: document.getElementById("modeTitle"),
  instrEl: document.getElementById("modeInstruction"),
  taskTextEl: document.getElementById("taskText"),
  feedbackEl: document.getElementById("feedback"),
  scoreEl: document.getElementById("score"),
  nextBtn: document.getElementById("nextTaskBtn"),

  setTitle(text) {
    this.titleEl.textContent = text;
  },
  setInstruction(text) {
    this.instrEl.textContent = text;
  },
  setTask(text) {
    this.taskTextEl.textContent = text || "";
  },
  setFeedback(text, type = "") {
    this.feedbackEl.textContent = text || "";
    this.feedbackEl.className = "";
    if (type) this.feedbackEl.classList.add(type);
  },
  setScore(text) {
    this.scoreEl.textContent = text || "";
  },
  showNextButton(show) {
    this.nextBtn.style.display = show ? "inline-block" : "none";
  }
};

// ---------- Layer Manager ----------

const layerListEl = document.getElementById("layerList");
const layers = {}; // naam -> Leaflet layer

const LayerManager = {
  addGeoJSONLayer(name, data) {
    const layer = L.geoJSON(data, {
      style: {
        color: "#2563eb",
        weight: 2,
        fillOpacity: 0.2
      },
      onEachFeature: (feature, layer) => {
        const props = feature.properties || {};
        const label = props.name || props.label || "Onbekend object";

        layer.bindPopup(label);

        layer.on("click", () => {
          handleFeatureClick(feature, layer);
        });
      }
    }).addTo(map);

    layers[name] = layer;
    this._addLayerToggle(name);
    try {
      map.fitBounds(layer.getBounds());
    } catch (e) {
      // punt zonder bounds: negeren
    }
  },

  _addLayerToggle(name) {
    const div = document.createElement("div");
    div.innerHTML = `
      <label>
        <input type="checkbox" checked data-layer="${name}">
        ${name}
      </label>
    `;
    const checkbox = div.querySelector("input");
    checkbox.addEventListener("change", e => {
      const lname = e.target.dataset.layer;
      const layer = layers[lname];
      if (!layer) return;
      if (e.target.checked) {
        map.addLayer(layer);
      } else {
        map.removeLayer(layer);
      }
    });
    layerListEl.appendChild(div);
  }
};

// ---------- Mode Manager ----------

const ModeManager = {
  current: "explore",
  set(mode) {
    this.current = mode;
    if (mode === "explore") {
      ExploreMode.enable();
    } else if (mode === "task") {
      TaskMode.enable();
    } else if (mode === "quiz") {
      QuizMode.enable();
    }
  }
};

// ---------- Explore Mode ----------

const ExploreMode = {
  enable() {
    UIManager.setTitle("Verkenmodus");
    UIManager.setInstruction("Verken de kaart en klik op objecten om informatie te zien.");
    UIManager.setTask("");
    UIManager.setFeedback("");
    UIManager.setScore("");
    UIManager.showNextButton(false);
  }
};

// ---------- Task Mode (Opdrachtgestuurd) ----------

// Voorbeeldopdrachten Nieuwe Testament + Vroege Kerkgeschiedenis
const TASKS = [
  // Nieuwe Testament
  {
    id: "nt-1",
    text: "Nieuwe Testament: klik op de regio Galilea.",
    targetName: "Galilee"
  },
  {
    id: "nt-2",
    text: "Nieuwe Testament: klik op de stad Korinthe.",
    targetName: "Corinth"
  },
  // Vroege Kerkgeschiedenis
  {
    id: "vk-1",
    text: "Vroege Kerkgeschiedenis: klik op Nicea (Concilie 325).",
    targetName: "Nicaea"
  },
  {
    id: "vk-2",
    text: "Vroege Kerkgeschiedenis: klik op Hippo Regius (Augustinus).",
    targetName: "Hippo Regius"
  }
];

const TaskMode = {
  index: 0,

  enable() {
    this.index = 0;
    UIManager.setTitle("Opdrachtmodus");
    UIManager.setInstruction("Volg de opdrachten en klik op de juiste gebieden.");
    UIManager.setScore("");
    UIManager.setFeedback("");
    UIManager.showNextButton(false);
    this._showCurrentTask();
  },

  _showCurrentTask() {
    const task = TASKS[this.index];
    if (!task) {
      UIManager.setTask("Alle opdrachten voltooid!");
      UIManager.showNextButton(false);
      return;
    }
    UIManager.setTask(task.text);
    UIManager.setFeedback("");
    UIManager.showNextButton(false);
  },

  handleClick(feature) {
    const task = TASKS[this.index];
    if (!task) return;

    const name = (feature.properties && (feature.properties.name || feature.properties.label)) || "";
    if (!name) return;

    if (normalize(name) === normalize(task.targetName)) {
      UIManager.setFeedback("Goed! Dat is correct.", "ok");
      UIManager.showNextButton(true);
    } else {
      UIManager.setFeedback(`Niet helemaal. Je klikte op: ${name}`, "error");
    }
  },

  nextTask() {
    this.index += 1;
    this._showCurrentTask();
  }
};

UIManager.nextBtn.addEventListener("click", () => {
  if (ModeManager.current === "task") {
    TaskMode.nextTask();
  } else if (ModeManager.current === "quiz") {
    QuizMode.nextQuestion();
  }
});

// ---------- Quiz Mode ----------

const QUIZ_QUESTIONS = [
  // Nieuwe Testament
  {
    id: "q-nt-1",
    text: "Klik op de zee van Galilea.",
    targetName: "Sea of Galilee"
  },
  {
    id: "q-nt-2",
    text: "Klik op de stad Efeze.",
    targetName: "Ephesus"
  },
  // Vroege Kerkgeschiedenis
  {
    id: "q-vk-1",
    text: "Klik op Alexandrië.",
    targetName: "Alexandria"
  },
  {
    id: "q-vk-2",
    text: "Klik op Chalcedon (Concilie 451).",
    targetName: "Chalcedon"
  }
];

const QuizMode = {
  index: 0,
  correct: 0,
  total: 0,

  enable() {
    //shuffle(QUIZ_QUESTIONS);
    //this.index = 0;
    this.weightedList = weightedQuestions(QUIZ_QUESTIONS);
    this.index = 0;
    updateProgress(0, this.weightedList.length);
    //updateProgress(0, QUIZ_QUESTIONS.length);
    this.correct = 0;
    this.total = 0;
    UIManager.setTitle("Quizmodus");
    UIManager.setInstruction("Beantwoord de vragen door op de juiste gebieden te klikken.");
    UIManager.setFeedback("");
    UIManager.showNextButton(false);
    this._showCurrentQuestion();
    this._updateScore();
  },

  _showCurrentQuestion() {
    const q = QUIZ_QUESTIONS[this.index];
    if (!q) {
      UIManager.setTask("Quiz voltooid!");
      UIManager.showNextButton(false);
      saveQuizResult(this.correct, this.total);
      return;
    }
    UIManager.setTask(q.text);
    UIManager.setFeedback("");
    UIManager.showNextButton(false);
  },

  _updateScore() {
    UIManager.setScore(`Score: ${this.correct} / ${this.total}`);
  },

  handleClick(feature) {
    const q = QUIZ_QUESTIONS[this.index];
    if (!q) return;

    const name = (feature.properties && (feature.properties.name || feature.properties.label)) || "";
    if (!name) return;

    this.total += 1;

    if (normalize(name) === normalize(q.targetName)) {
      this.correct += 1;
      UIManager.setFeedback("Goed! Dat is correct.", "ok");
      UIManager.showNextButton(true);
    } else {
      UIManager.setFeedback(`Onjuist. Je klikte op: ${name}`, "error");
    }
    this._updateScore();
  },

  nextQuestion() {
    this.index += 1;
    this._showCurrentQuestion();
    updateProgress(this.index, QUIZ_QUESTIONS.length);
  }
};

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}


// ---------- Modusselectie ----------

const modeSelect = document.getElementById("modeSelect");
modeSelect.addEventListener("change", e => {
  ModeManager.set(e.target.value);
});

// Start in verkenmodus
ModeManager.set("explore");

// ---------- Upload Questions----------
document.getElementById("quizInput").addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;

  const text = await file.text();
  const questions = parseQuizFile(text);

  if (questions.length === 0) {
    alert("No valid questions found.");
    return;
  }

  QUIZ_QUESTIONS.length = 0;
  shuffle(questions).forEach(q => QUIZ_QUESTIONS.push(q));

  alert(`${questions.length} questions loaded in random order.`);
});

// ---------- GeoJSON upload ----------

document.getElementById("geojsonInput").addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    LayerManager.addGeoJSONLayer(file.name, data);
  } catch (err) {
    alert("Kon GeoJSON niet laden: " + err.message);
  }
});

// Parse questions from file (simple format: "Question | Target Name")
function parseQuizFile(text) {
  const lines = text.split("\n");
  const questions = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // lege regels en comments overslaan
    if (!trimmed || trimmed.startsWith("#")) continue;

    const parts = trimmed.split("|");
    if (parts.length !== 2) continue;

    const question = parts[0].trim();
    const target = parts[1].trim();

    questions.push({
      id: "q-" + Math.random().toString(36).slice(2),
      text: question,
      targetName: target
    });
  }

  return questions;
}

function saveQuizResult(correct, total) {
  const results = JSON.parse(localStorage.getItem("quizResults") || "[]");

  results.push({
    date: new Date().toISOString(),
    correct,
    total
  });

  localStorage.setItem("quizResults", JSON.stringify(results));
}

function registerWrongAnswer(targetName) {
  const stats = JSON.parse(localStorage.getItem("featureStats") || "{}");

  if (!stats[targetName]) {
    stats[targetName] = { wrong: 0, correct: 0 };
  }

  stats[targetName].wrong += 1;

  localStorage.setItem("featureStats", JSON.stringify(stats));
}

function registerCorrectAnswer(targetName) {
  const stats = JSON.parse(localStorage.getItem("featureStats") || "{}");

  if (!stats[targetName]) {
    stats[targetName] = { wrong: 0, correct: 0 };
  }

  stats[targetName].correct += 1;

  localStorage.setItem("featureStats", JSON.stringify(stats));
}

function weightedQuestions(questions) {
  const stats = JSON.parse(localStorage.getItem("featureStats") || "{}");
  const weighted = [];

  for (const q of questions) {
    const s = stats[q.targetName] || { wrong: 0, correct: 0 };
    const weight = 1 + s.wrong; // elke fout = 1 extra kans

    for (let i = 0; i < weight; i++) {
      weighted.push(q);
    }
  }

  return shuffle(weighted);
}


// ---------- Klikafhandeling per modus ----------

function handleFeatureClick(feature, layer) {
  if (ModeManager.current === "explore") {
    // Leaflet popup doet hier het werk
    return;
  } else if (ModeManager.current === "task") {
    TaskMode.handleClick(feature);
  } else if (ModeManager.current === "quiz") {
    QuizMode.handleClick(feature);
        registerCorrectAnswer(q.targetName);
        registerWrongAnswer(q.targetName);
  }
}

// ---------- Helpers ----------

function normalize(str) {
  return String(str).toLowerCase().trim();

function updateProgress(current, total) {
  const pct = Math.round((current / total) * 100);
  document.getElementById("progressBar").style.width = pct + "%";
  }
  
}
