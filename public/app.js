const state = {
  category: "",
  candidates: [],
  answers: [],
  previousQuestions: [],
  questionCount: 0,
  minQuestions: 3,
  maxQuestions: 10,
  currentQuestion: null,
  ranking: [],
  confidence: 0,
};

const elements = {
  jumpStart: document.getElementById("jumpStart"),
  heroStart: document.getElementById("heroStart"),
  heroDemo: document.getElementById("heroDemo"),
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

async function fetchNext() {
  elements.options.innerHTML = "";
  elements.options.appendChild(createLoading());
  elements.infoGain.textContent = "";

  const payload = {
    category: state.category,
    candidates: state.candidates,
    answers: state.answers,
    previousQuestions: state.previousQuestions,
    questionCount: state.questionCount,
    minQuestions: state.minQuestions,
    maxQuestions: state.maxQuestions,
  };

  const response = await fetch("/api/next", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch question.");
  }

  const data = await response.json();
  state.confidence = data.confidence || 0;
  state.ranking = data.ranking || [];

  renderRanking(elements.rankingList, state.ranking);
  updateConfidence();

  if (data.status === "final") {
    renderResults(data);
    showPanel(elements.resultPanel);
    return;
  }

  if (!data.question) {
    throw new Error("No question returned.");
  }

  state.currentQuestion = data.question;
  state.previousQuestions.push(data.question.text);
  renderQuestion(data.question);
}

function renderQuestion(question) {
  elements.questionIndex.textContent = `Question ${state.questionCount + 1}`;
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

  elements.progress.textContent = `Answered ${state.questionCount} of ${state.maxQuestions} max`;
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

  state.questionCount += 1;
  fetchNext().catch(showError);
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
  state.previousQuestions = [];
  state.questionCount = 0;
  state.currentQuestion = null;
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
  state.previousQuestions = [];
  state.questionCount = 0;

  elements.formError.textContent = "";
  showPanel(elements.questionPanel);
  fetchNext().catch(showError);
}

function runDemo() {
  elements.category.value = "Compact SUV";
  const demo = ["Model X", "Model Y", "Model Z", "Model R"];
  elements.candidateList.innerHTML = "";
  demo.forEach((item) => addCandidateInput(item));
  startFlow();
}

initCandidates();

[elements.jumpStart, elements.heroStart].forEach((btn) => {
  btn.addEventListener("click", () => {
    showPanel(elements.inputPanel);
  });
});

elements.heroDemo.addEventListener("click", runDemo);

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
