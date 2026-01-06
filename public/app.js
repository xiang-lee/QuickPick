const state = {
  category: "",
  candidates: [],
  answers: [],
  questionCount: 0,
  minQuestions: 3,
  maxQuestions: 10,
  currentQuestion: null,
  questions: [],
  totalQuestions: 0,
  scores: {},
  plan: null,
  ranking: [],
  confidence: 0,
};

const elements = {
  inputPanel: document.getElementById("inputPanel"),
  questionPanel: document.getElementById("questionPanel"),
  resultPanel: document.getElementById("resultPanel"),
  category: document.getElementById("category"),
  candidateList: document.getElementById("candidateList"),
  addCandidate: document.getElementById("addCandidate"),
  startFlow: document.getElementById("startFlow"),
  formError: document.getElementById("formError"),
  questionIndex: document.getElementById("questionIndex"),
  confidence: document.getElementById("confidence"),
  questionText: document.getElementById("questionText"),
  infoGain: document.getElementById("infoGain"),
  options: document.getElementById("options"),
  progress: document.getElementById("progress"),
  rankingList: document.getElementById("rankingList"),
  topPick: document.getElementById("topPick"),
  finalRanking: document.getElementById("finalRanking"),
  keyReasons: document.getElementById("keyReasons"),
  tradeoffMap: document.getElementById("tradeoffMap"),
  counterfactuals: document.getElementById("counterfactuals"),
  counterfactualRanking: document.getElementById("counterfactualRanking"),
  actions: document.getElementById("actions"),
  startOver: document.getElementById("startOver"),
  thirdOptionCard: document.getElementById("thirdOptionCard"),
  thirdOption: document.getElementById("thirdOption"),
};

function initCandidates() {
  elements.candidateList.innerHTML = "";
  for (let i = 0; i < 3; i += 1) {
    addCandidateInput("");
  }
}

function addCandidateInput(value) {
  const wrapper = document.createElement("div");
  wrapper.className = "candidate-item";

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Candidate model name";
  input.value = value;

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "secondary small";
  remove.textContent = "Remove";

  remove.addEventListener("click", () => {
    wrapper.remove();
  });

  wrapper.appendChild(input);
  wrapper.appendChild(remove);
  elements.candidateList.appendChild(wrapper);
}

function collectCandidates() {
  const inputs = elements.candidateList.querySelectorAll("input");
  const list = Array.from(inputs)
    .map((input) => input.value.trim())
    .filter(Boolean);
  return list;
}

function showPanel(panel) {
  elements.inputPanel.classList.add("hidden");
  elements.questionPanel.classList.add("hidden");
  elements.resultPanel.classList.add("hidden");
  panel.classList.remove("hidden");
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function startSession() {
  setQuestionLoading("Building your question set...");

  const payload = {
    category: state.category,
    candidates: state.candidates,
    minQuestions: state.minQuestions,
    maxQuestions: state.maxQuestions,
  };

  const response = await fetch("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Failed to build questions.");
  }

  const data = await response.json();
  if (!data.plan || !Array.isArray(data.plan.questions)) {
    throw new Error("Question plan unavailable.");
  }

  state.plan = data.plan;
  state.questions = data.plan.questions;
  state.totalQuestions = state.questions.length;
  state.questionCount = 0;
  state.currentQuestion = state.questions[0] || null;
  state.scores = initScores(data.plan.base_scores || [], state.candidates);
  state.ranking = buildRanking(state.scores);
  state.confidence = computeConfidence(state.ranking);

  renderRanking(elements.rankingList, state.ranking);
  updateConfidence();
  renderQuestion(state.currentQuestion);
}

function setQuestionLoading(message) {
  elements.questionText.textContent = message;
  elements.infoGain.textContent = "";
  elements.options.innerHTML = "";
  elements.options.appendChild(createLoading());
  elements.progress.textContent = "Preparing...";
}

function initScores(baseScores, candidates) {
  const scores = {};
  candidates.forEach((name) => {
    scores[name] = 50;
  });
  baseScores.forEach((item) => {
    const name = item && item.name ? item.name : "";
    const match = candidates.find((candidate) => candidate.toLowerCase() === name.toLowerCase());
    if (!match) {
      return;
    }
    scores[match] = Number(item.score) || 50;
  });
  return scores;
}

function buildRanking(scores) {
  const ranking = Object.keys(scores).map((name) => ({
    name,
    score: Math.max(0, Math.min(100, Math.round(scores[name]))),
    reason: "",
  }));
  return ranking.sort((a, b) => b.score - a.score);
}

function computeConfidence(ranking) {
  if (ranking.length < 2) {
    return 0.5;
  }
  const gap = ranking[0].score - ranking[1].score;
  const normalized = gap / 40;
  return Math.max(0.2, Math.min(0.95, normalized));
}

function applyImpactScores(impactScores) {
  if (!impactScores) {
    return;
  }
  Object.keys(state.scores).forEach((candidate) => {
    const delta = Number(impactScores[candidate]) || 0;
    state.scores[candidate] += delta;
    state.scores[candidate] = Math.max(0, Math.min(100, state.scores[candidate]));
  });
}

async function fetchResult() {
  setQuestionLoading("Generating your recommendation...");
  const response = await fetch("/api/result", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      category: state.category,
      candidates: state.candidates,
      answers: state.answers,
      scores: state.scores,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to build final recommendation.");
  }

  const data = await response.json();
  renderResults(data);
  showPanel(elements.resultPanel);
}

function renderQuestion(question) {
  const current = Math.min(state.questionCount + 1, state.totalQuestions || 1);
  elements.questionIndex.textContent = `Question ${current} of ${state.totalQuestions || 1}`;
  elements.questionText.textContent = question.text;
  elements.infoGain.textContent = question.info_gain_reason || "";
  elements.options.innerHTML = "";

  question.options.forEach((option) => {
    const button = document.createElement("button");
    button.className = "option-btn";
    button.type = "button";
    button.textContent = option.label;
    button.addEventListener("click", () => handleAnswer(option));
    elements.options.appendChild(button);
  });

  elements.progress.textContent = `Answered ${state.questionCount} of ${state.totalQuestions || 1}`;
}

function handleAnswer(option) {
  const question = state.currentQuestion;
  if (!question) {
    return;
  }

  state.answers.push({
    questionId: question.id,
    question: question.text,
    optionId: option.id,
    optionLabel: option.label,
    value: option.value,
    dimension: question.dimension,
  });

  applyImpactScores(option.impact_scores);
  state.questionCount += 1;
  state.ranking = buildRanking(state.scores);
  state.confidence = computeConfidence(state.ranking);
  renderRanking(elements.rankingList, state.ranking);
  updateConfidence();

  if (state.questionCount >= state.totalQuestions) {
    fetchResult().catch(showError);
    return;
  }

  state.currentQuestion = state.questions[state.questionCount];
  renderQuestion(state.currentQuestion);
}

function renderRanking(container, ranking) {
  container.innerHTML = "";
  ranking.forEach((item) => {
    const row = document.createElement("div");
    row.className = "rank-row";

    const name = document.createElement("div");
    name.textContent = item.name;

    const barWrap = document.createElement("div");
    barWrap.className = "rank-bar";

    const bar = document.createElement("span");
    const width = Math.max(8, Math.min(100, Number(item.score) || 0));
    bar.style.width = `${width}%`;
    barWrap.appendChild(bar);

    row.appendChild(name);
    row.appendChild(barWrap);

    const meta = document.createElement("div");
    meta.className = "rank-meta";
    meta.textContent = item.reason ? item.reason : "";

    container.appendChild(row);
    if (item.reason) {
      container.appendChild(meta);
    }
  });
}

function updateConfidence() {
  const pct = Math.round((state.confidence || 0) * 100);
  elements.confidence.textContent = `Confidence ${pct}%`;
}

function renderResults(data) {
  const ranking = data.ranking || [];
  const top = ranking[0];

  elements.topPick.innerHTML = "";
  if (top) {
    const title = document.createElement("h4");
    title.textContent = top.name;
    const reason = document.createElement("p");
    reason.className = "muted";
    reason.textContent = top.reason || "Highest fit across your answers.";
    elements.topPick.appendChild(title);
    elements.topPick.appendChild(reason);
  }

  elements.finalRanking.innerHTML = "";
  renderRanking(elements.finalRanking, ranking);

  elements.keyReasons.innerHTML = "";
  (data.key_reasons || []).forEach((reason) => {
    const li = document.createElement("li");
    li.textContent = reason;
    elements.keyReasons.appendChild(li);
  });

  elements.tradeoffMap.innerHTML = "";
  (data.tradeoff_map || []).forEach((item) => {
    const card = document.createElement("div");
    card.className = "tradeoff-item";
    const title = document.createElement("strong");
    title.textContent = item.dimension;
    const winner = document.createElement("p");
    winner.textContent = `${item.winner} wins`;
    const why = document.createElement("p");
    why.className = "muted";
    why.textContent = item.why;
    card.appendChild(title);
    card.appendChild(winner);
    card.appendChild(why);
    elements.tradeoffMap.appendChild(card);
  });

  renderCounterfactuals(data.counterfactuals || []);

  elements.actions.innerHTML = "";
  (data.actions || []).forEach((action) => {
    const li = document.createElement("li");
    li.textContent = action;
    elements.actions.appendChild(li);
  });

  if (data.third_option && data.third_option.title) {
    elements.thirdOptionCard.style.display = "block";
    elements.thirdOption.innerHTML = "";
    const title = document.createElement("strong");
    title.textContent = data.third_option.title;
    const why = document.createElement("p");
    why.className = "muted";
    why.textContent = data.third_option.why || "";
    const criteria = document.createElement("p");
    criteria.className = "muted";
    criteria.textContent = data.third_option.criteria || "";
    elements.thirdOption.appendChild(title);
    elements.thirdOption.appendChild(why);
    elements.thirdOption.appendChild(criteria);
  } else {
    elements.thirdOptionCard.style.display = "none";
  }
}

function renderCounterfactuals(list) {
  elements.counterfactuals.innerHTML = "";
  elements.counterfactualRanking.innerHTML = "";

  if (!list.length) {
    return;
  }

  let activeIndex = -1;

  list.forEach((item, index) => {
    const wrapper = document.createElement("label");
    wrapper.className = "toggle-item";

    const input = document.createElement("input");
    input.type = "checkbox";

    const text = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = item.toggle;
    const desc = document.createElement("p");
    desc.className = "muted";
    desc.textContent = item.change || "";
    text.appendChild(title);
    text.appendChild(desc);

    input.addEventListener("change", () => {
      if (input.checked) {
        activeIndex = index;
        Array.from(elements.counterfactuals.querySelectorAll("input")).forEach((el, i) => {
          if (i !== index) {
            el.checked = false;
          }
        });
        renderRanking(elements.counterfactualRanking, item.new_ranking || []);
      } else if (activeIndex === index) {
        activeIndex = -1;
        elements.counterfactualRanking.innerHTML = "";
      }
    });

    wrapper.appendChild(input);
    wrapper.appendChild(text);
    elements.counterfactuals.appendChild(wrapper);
  });
}

function createLoading() {
  const loading = document.createElement("div");
  loading.className = "muted";
  loading.textContent = "Thinking...";
  return loading;
}

function showError(error) {
  elements.options.innerHTML = "";
  const message = document.createElement("div");
  message.className = "muted";
  message.textContent = error.message || "Something went wrong.";
  elements.options.appendChild(message);
}

function resetFlow() {
  state.category = "";
  state.candidates = [];
  state.answers = [];
  state.questionCount = 0;
  state.currentQuestion = null;
  state.questions = [];
  state.totalQuestions = 0;
  state.scores = {};
  state.plan = null;
  state.ranking = [];
  state.confidence = 0;
  elements.category.value = "";
  elements.formError.textContent = "";
  initCandidates();
  showPanel(elements.inputPanel);
}

function startFlow() {
  const candidates = collectCandidates();
  if (candidates.length < 3 || candidates.length > 6) {
    elements.formError.textContent = "Please enter 3 to 6 candidates.";
    return;
  }

  state.category = elements.category.value.trim();
  state.candidates = candidates;
  state.answers = [];
  state.questionCount = 0;
  state.questions = [];
  state.totalQuestions = 0;
  state.scores = {};
  state.plan = null;

  elements.formError.textContent = "";
  showPanel(elements.questionPanel);
  startSession().catch(showError);
}

initCandidates();

elements.addCandidate.addEventListener("click", () => {
  const count = elements.candidateList.querySelectorAll("input").length;
  if (count >= 6) {
    elements.formError.textContent = "Maximum 6 candidates.";
    return;
  }
  addCandidateInput("");
});

elements.startFlow.addEventListener("click", startFlow);

elements.startOver.addEventListener("click", resetFlow);
