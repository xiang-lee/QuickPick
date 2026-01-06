const express = require("express");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const AI_BASE = process.env.AI_BUILDER_API_BASE || "https://space.ai-builders.com/backend";
const AI_TOKEN = process.env.AI_BUILDER_TOKEN || "";
const AI_MODEL = process.env.AI_BUILDER_MODEL || "grok-4-fast";

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/next", async (req, res) => {
  const payload = req.body || {};
  const category = sanitizeText(payload.category || "");
  const candidates = normalizeCandidates(payload.candidates || []);
  const answers = Array.isArray(payload.answers) ? payload.answers.map(normalizeAnswer) : [];
  const previousQuestions = Array.isArray(payload.previousQuestions)
    ? payload.previousQuestions.map(sanitizeText).filter(Boolean)
    : [];
  const questionCount = Number.isInteger(payload.questionCount)
    ? payload.questionCount
    : answers.length;
  const minQuestions = Number.isInteger(payload.minQuestions) ? payload.minQuestions : 3;
  const maxQuestions = Number.isInteger(payload.maxQuestions) ? payload.maxQuestions : 10;

  if (candidates.length < 3 || candidates.length > 6) {
    return res.status(400).json({
      error: "Please provide between 3 and 6 candidates.",
    });
  }

  const context = {
    category: category || "general consumer product",
    candidates,
    answers,
    previousQuestions,
    questionCount,
    minQuestions,
    maxQuestions,
  };

  if (!AI_TOKEN) {
    return res.json(buildFallbackResponse(context, {
      warning: "Missing AI token. Returning fallback question.",
    }));
  }

  try {
    const aiData = await callAiDecision(context);
    const normalized = normalizeAiOutput(aiData, context);
    res.json(normalized);
  } catch (error) {
    console.error("AI request failed:", error);
    res.json(buildFallbackResponse(context, {
      warning: "AI request failed. Returning fallback question.",
    }));
  }
});

function sanitizeText(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.replace(/\s+/g, " ").trim();
}

function normalizeCandidates(list) {
  if (!Array.isArray(list)) {
    return [];
  }
  const unique = new Set();
  const result = [];
  list.forEach((item) => {
    const text = sanitizeText(item);
    if (!text) {
      return;
    }
    if (!unique.has(text.toLowerCase())) {
      unique.add(text.toLowerCase());
      result.push(text);
    }
  });
  return result.slice(0, 6);
}

function normalizeAnswer(answer) {
  if (!answer || typeof answer !== "object") {
    return null;
  }
  return {
    questionId: sanitizeText(answer.questionId || ""),
    question: sanitizeText(answer.question || ""),
    optionId: sanitizeText(answer.optionId || ""),
    optionLabel: sanitizeText(answer.optionLabel || ""),
    value: sanitizeText(answer.value || ""),
    dimension: sanitizeText(answer.dimension || ""),
  };
}

async function callAiDecision(context) {
  const debug = process.env.DEBUG_AI === "1";
  const systemPrompt = [
    "You are QuickPick, a decision engine for consumer product shortlists.",
    "Goal: ask one high impact question at a time, update ranking, and stop once confident.",
    "Constraints:",
    "- Ask short, scenario-based questions. Avoid jargon and precise numbers.",
    "- Provide 3 to 5 options. Each option must be quick to choose.",
    "- Every question must include an info_gain_reason that explains why it changes ranking.",
    "- Provide ranking for all candidates every time.",
    "- Provide tradeoff_map with 3 to 6 dimensions.",
    "- Provide 2 to 4 counterfactual toggles with alternative ranking.",
    "- If none fit, return a third_option suggestion with why and criteria.",
    "- Keep all text short: <= 18 words per sentence; avoid extra clauses.",
    "Output JSON only. No markdown.",
  ].join("\n");

  const userPrompt = JSON.stringify({
    category: context.category,
    candidates: context.candidates,
    answers: context.answers,
    previousQuestions: context.previousQuestions,
    questionCount: context.questionCount,
    minQuestions: context.minQuestions,
    maxQuestions: context.maxQuestions,
    output_schema: {
      should_stop: "boolean",
      confidence: "number between 0 and 1",
      question: {
        id: "string",
        text: "string",
        dimension: "string",
        info_gain_reason: "string",
        options: [
          {
            id: "string",
            label: "string",
            value: "string",
            impact_hint: "string",
          },
        ],
      },
      ranking: [
        {
          name: "candidate name",
          score: "0-100",
          reason: "short reason tied to answers",
        },
      ],
      key_reasons: ["string"],
      tradeoff_map: [
        {
          dimension: "string",
          winner: "candidate name",
          why: "string",
        },
      ],
      counterfactuals: [
        {
          toggle: "string",
          change: "string",
          new_top: "candidate name",
          new_ranking: [
            {
              name: "candidate name",
              score: "0-100",
            },
          ],
        },
      ],
      actions: ["string"],
      third_option: {
        title: "string",
        why: "string",
        criteria: "string",
      },
    },
  });

  const fallbackModel = process.env.AI_BUILDER_FALLBACK_MODEL || "grok-4-fast";
  const modelsToTry = AI_MODEL && AI_MODEL !== fallbackModel
    ? [AI_MODEL, fallbackModel]
    : [AI_MODEL];

  let lastError = null;

  for (const model of modelsToTry) {
    try {
      const response = await fetch(`${AI_BASE}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${AI_TOKEN}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.4,
          max_tokens: 1400,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      });

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`AI request failed: ${response.status} ${detail}`);
      }

      const data = await response.json();
      const content = data && data.choices && data.choices[0] && data.choices[0].message
        ? data.choices[0].message.content
        : "";

      if (debug) {
        console.log("AI model:", model);
        console.log("AI message:", data && data.choices && data.choices[0] ? data.choices[0].message : null);
        console.log("AI raw content:", typeof content, String(content).slice(0, 500));
      }

      const cleaned = stripJsonFences(String(content));
      const parsed = safeJsonParse(cleaned);
      if (!parsed) {
        throw new Error("AI response was not valid JSON.");
      }

      return parsed;
    } catch (error) {
      lastError = error;
      if (!shouldFallback(error) || model === fallbackModel) {
        break;
      }
    }
  }

  throw lastError || new Error("AI request failed.");
}

function safeJsonParse(value) {
  if (typeof value !== "string") {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch (error) {
    const start = value.indexOf("{");
    const end = value.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      return null;
    }
    try {
      return JSON.parse(value.slice(start, end + 1));
    } catch (error2) {
      return null;
    }
  }
}

function stripJsonFences(value) {
  if (typeof value !== "string") {
    return value;
  }
  let output = value.trim();
  if (output.startsWith("```")) {
    output = output.replace(/^```(?:json)?\s*/i, "");
    output = output.replace(/```$/i, "");
  }
  return output.trim();
}

function shouldFallback(error) {
  if (!error) {
    return false;
  }
  const message = typeof error === "string" ? error : error.message || "";
  return message.includes("valid JSON");
}

function normalizeAiOutput(aiData, context) {
  const confidence = clampNumber(aiData.confidence, 0, 1, 0.5);
  const shouldStop = typeof aiData.should_stop === "boolean"
    ? aiData.should_stop
    : (context.questionCount >= context.minQuestions && confidence >= 0.82)
      || context.questionCount >= context.maxQuestions;

  const normalizedRanking = normalizeRanking(aiData.ranking, context.candidates);
  const question = normalizeQuestion(aiData.question, context, shouldStop);

  return {
    status: shouldStop ? "final" : "question",
    confidence,
    question,
    ranking: normalizedRanking,
    key_reasons: normalizeStringList(aiData.key_reasons, 4),
    tradeoff_map: normalizeTradeoffs(aiData.tradeoff_map, context.candidates),
    counterfactuals: normalizeCounterfactuals(aiData.counterfactuals, context.candidates),
    actions: normalizeStringList(aiData.actions, 5),
    third_option: normalizeThirdOption(aiData.third_option),
  };
}

function buildFallbackResponse(context, meta) {
  const fallback = getFallbackQuestion(context.questionCount, context.candidates);
  const shouldStop = context.questionCount >= context.maxQuestions;
  const ranking = normalizeRanking([], context.candidates);

  return {
    status: shouldStop ? "final" : "question",
    confidence: 0.45,
    question: shouldStop ? null : fallback,
    ranking,
    key_reasons: [
      "Using a fallback path while AI is unavailable.",
      "We will still narrow choices based on your answers.",
    ],
    tradeoff_map: buildFallbackTradeoffs(context.candidates),
    counterfactuals: buildFallbackCounterfactuals(context.candidates),
    actions: [
      "Shortlist the top two and compare hands-on if possible.",
      "Check warranty length and service coverage in your area.",
      "Look for bundles or seasonal pricing changes.",
    ],
    third_option: null,
    warning: meta && meta.warning ? meta.warning : undefined,
  };
}

function normalizeRanking(ranking, candidates) {
  const baseScores = candidates.map((name, index) => ({
    name,
    score: Math.max(100 - index * 8, 60),
    reason: "",
  }));

  if (!Array.isArray(ranking) || ranking.length === 0) {
    return baseScores;
  }

  const mapped = ranking.map((item, index) => ({
    name: sanitizeText(item && item.name ? item.name : candidates[index] || ""),
    score: clampNumber(item && item.score, 0, 100, Math.max(95 - index * 10, 55)),
    reason: sanitizeText(item && item.reason ? item.reason : ""),
  })).filter((item) => item.name);

  const seen = new Set(mapped.map((item) => item.name.toLowerCase()));
  candidates.forEach((candidate) => {
    if (!seen.has(candidate.toLowerCase())) {
      mapped.push({ name: candidate, score: 60, reason: "" });
    }
  });

  return mapped;
}

function normalizeQuestion(question, context, shouldStop) {
  if (shouldStop) {
    return null;
  }

  if (!question || typeof question !== "object") {
    return getFallbackQuestion(context.questionCount, context.candidates);
  }

  const options = Array.isArray(question.options) ? question.options.slice(0, 5) : [];
  if (options.length < 2) {
    return getFallbackQuestion(context.questionCount, context.candidates);
  }

  return {
    id: sanitizeText(question.id || `q${context.questionCount + 1}`),
    text: sanitizeText(question.text || ""),
    dimension: sanitizeText(question.dimension || ""),
    info_gain_reason: sanitizeText(question.info_gain_reason || ""),
    options: options.map((option, index) => ({
      id: sanitizeText(option.id || `o${index + 1}`),
      label: sanitizeText(option.label || ""),
      value: sanitizeText(option.value || ""),
      impact_hint: sanitizeText(option.impact_hint || ""),
    })).filter((option) => option.label),
  };
}

function normalizeStringList(list, maxItems) {
  if (!Array.isArray(list)) {
    return [];
  }
  return list.map((item) => sanitizeText(item)).filter(Boolean).slice(0, maxItems);
}

function normalizeTradeoffs(list, candidates) {
  if (!Array.isArray(list) || list.length === 0) {
    return buildFallbackTradeoffs(candidates);
  }
  return list.map((item) => ({
    dimension: sanitizeText(item.dimension || ""),
    winner: sanitizeText(item.winner || candidates[0] || ""),
    why: sanitizeText(item.why || ""),
  })).filter((item) => item.dimension && item.winner);
}

function normalizeCounterfactuals(list, candidates) {
  if (!Array.isArray(list) || list.length === 0) {
    return buildFallbackCounterfactuals(candidates);
  }
  return list.map((item) => ({
    toggle: sanitizeText(item.toggle || ""),
    change: sanitizeText(item.change || ""),
    new_top: sanitizeText(item.new_top || candidates[0] || ""),
    new_ranking: normalizeRanking(item.new_ranking || [], candidates),
  })).filter((item) => item.toggle);
}

function normalizeThirdOption(item) {
  if (!item || typeof item !== "object") {
    return null;
  }
  const title = sanitizeText(item.title || "");
  if (!title) {
    return null;
  }
  return {
    title,
    why: sanitizeText(item.why || ""),
    criteria: sanitizeText(item.criteria || ""),
  };
}

function clampNumber(value, min, max, fallback) {
  const num = Number(value);
  if (Number.isNaN(num)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, num));
}

function getFallbackQuestion(questionCount, candidates) {
  const fallbackQuestions = [
    {
      text: "Where will you use it most?",
      dimension: "context",
      info_gain_reason: "Usage context shifts which option fits best.",
      options: [
        { label: "Small or quiet spaces", value: "small" },
        { label: "Shared family space", value: "shared" },
        { label: "Mixed locations", value: "mixed" },
        { label: "On the go", value: "mobile" },
      ],
    },
    {
      text: "What matters most for you?",
      dimension: "priority",
      info_gain_reason: "Top priorities re-rank the shortlist quickly.",
      options: [
        { label: "Reliability over time", value: "reliability" },
        { label: "Best overall performance", value: "performance" },
        { label: "Lowest total cost", value: "cost" },
        { label: "Ease of use", value: "ease" },
      ],
    },
    {
      text: "How sensitive are you to size or footprint?",
      dimension: "size",
      info_gain_reason: "Space constraints can eliminate candidates fast.",
      options: [
        { label: "Needs to be compact", value: "compact" },
        { label: "Moderate size is fine", value: "medium" },
        { label: "Size is not a concern", value: "large" },
      ],
    },
  ];

  const pick = fallbackQuestions[questionCount % fallbackQuestions.length];
  return {
    id: `fallback-${questionCount + 1}`,
    text: pick.text,
    dimension: pick.dimension,
    info_gain_reason: pick.info_gain_reason,
    options: pick.options.map((option, index) => ({
      id: `f${questionCount + 1}-${index + 1}`,
      label: option.label,
      value: option.value,
      impact_hint: "",
    })),
  };
}

function buildFallbackTradeoffs(candidates) {
  return [
    {
      dimension: "simplicity",
      winner: candidates[0] || "",
      why: "Straightforward default choice.",
    },
    {
      dimension: "value",
      winner: candidates[1] || candidates[0] || "",
      why: "Balances cost with capability.",
    },
    {
      dimension: "upgrade headroom",
      winner: candidates[2] || candidates[0] || "",
      why: "Leaves room for future needs.",
    },
  ].filter((item) => item.winner);
}

function buildFallbackCounterfactuals(candidates) {
  return [
    {
      toggle: "If budget tightens",
      change: "The value pick becomes more attractive.",
      new_top: candidates[1] || candidates[0] || "",
      new_ranking: normalizeRanking([], candidates).reverse(),
    },
    {
      toggle: "If performance is critical",
      change: "The most capable option rises to the top.",
      new_top: candidates[0] || "",
      new_ranking: normalizeRanking([], candidates),
    },
  ].filter((item) => item.new_top);
}

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`QuickPick running on port ${PORT}`);
  });
}

module.exports = app;
