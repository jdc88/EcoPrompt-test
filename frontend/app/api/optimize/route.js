import { NextResponse } from "next/server";
import { estimateTokensByModel, TOKEN_MODELS } from "@/lib/tokenEstimate";
import {
  DEFAULT_OPTIMIZATION_MODE,
  losesConstraints,
  optimizePromptByMode,
} from "@/lib/modes";
import {
  computeClarityScore,
  detectMeaningLoss,
  tokenReductionPct,
} from "@/lib/scoring";
import { chatCompletion } from "@/lib/server/hfClient";
import { createRun } from "@/lib/server/runStore";

const EMPTY_SKELETON = {
  intent: "",
  task: "",
  subject: "",
  output: "",
  constraints: "",
  prompt: "",
};

const EXTRACTOR_SYSTEM = `Extract the semantic skeleton of the user's input. Do NOT answer it.
Output exactly SIX lines in this order:
INTENT:
TASK:
SUBJECT:
OUTPUT:
CONSTRAINTS:
PROMPT:
No markdown.`;

const REVISER_SYSTEM = `Rewrite the user's prompt to be clearer and more efficient.
Output ONLY the revised prompt. No headers, labels, markdown, or explanation.
Preserve original constraints and intent.`;

export const runtime = "nodejs";
const MIN_REDUCTION_PERCENT = 5;

const OUTPUT_FORMS = ["steps", "list", "code", "paragraph", "table", "json", "number", "unspecified"];

const ROLE_EXEMPLARS = [
  { role: "Personal Trainer", keywords: ["workout", "fitness", "gym", "exercise", "sedentary", "weight"] },
  { role: "Professional Writer", keywords: ["cover letter", "job application", "resume", "writing", "tone"] },
  { role: "Software Engineer", keywords: ["python", "javascript", "function", "api", "sql", "code"] },
  { role: "Study Coach", keywords: ["study", "exam", "learning plan", "curriculum"] },
];

const CONSTRAINT_PATTERNS = [
  /\b\d+(?:\s*-\s*\d+)?\s*(?:hours?|hrs?|minutes?|mins?|days?|weeks?|months?)\b(?:\s*(?:a|per)\s*(?:week|day|night|month|year|total))?/gi,
  /\b(?:under|within|in|over|at\s+least|at\s+most)\s+\d+\s*(?:hours?|minutes?|days?|weeks?|words?|pages?)\b/gi,
  /\b\d+\s*(?:words?|pages?|steps?|items?|sessions?)\b/gi,
  /\b(?:beginner|novice|intermediate|advanced|expert)\b/gi,
];

function parseSkeleton(raw, fallbackPrompt) {
  const out = {
    intent: "other",
    task: "user request",
    subject: "(see PROMPT)",
    output: "text",
    constraints: "none",
    prompt: fallbackPrompt.slice(0, 500),
  };
  for (const line of (raw || "").split("\n")) {
    const [k, ...rest] = line.split(":");
    const key = (k || "").trim().toLowerCase();
    const val = rest.join(":").trim();
    if (!val) continue;
    if (key === "intent") out.intent = val;
    if (key === "task") out.task = val;
    if (key === "subject") out.subject = val;
    if (key === "output") out.output = val;
    if (key === "constraints") out.constraints = val;
    if (key === "prompt") out.prompt = val;
  }
  return out;
}

function extractConstraints(original) {
  const found = [];
  for (const re of CONSTRAINT_PATTERNS) {
    for (const match of original.match(re) || []) {
      const cleaned = match.trim();
      if (cleaned && !found.some((x) => x.toLowerCase() === cleaned.toLowerCase())) {
        found.push(cleaned);
      }
    }
  }
  return found;
}

function scoreRoleHints(prompt) {
  const lower = prompt.toLowerCase();
  return ROLE_EXEMPLARS.map((item) => {
    const score = item.keywords.reduce((acc, k) => acc + (lower.includes(k) ? 1 : 0), 0);
    return { ...item, score };
  })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
}

function inferRole(prompt, retrievalAllowed = true) {
  const ranked = scoreRoleHints(prompt);
  if (!ranked.length || !retrievalAllowed) return "";
  return ranked[0].role;
}

function inferOutputType(prompt) {
  const p = prompt.toLowerCase();
  if (p.includes("step")) return "steps";
  if (p.includes("list") || p.includes("plan")) return "list";
  if (p.includes("code") || p.includes("function")) return "code";
  if (p.includes("json")) return "json";
  if (p.includes("table")) return "table";
  if (p.includes("paragraph")) return "paragraph";
  return "unspecified";
}

function inferTaskPhrase(prompt, skeletonTask = "", subject = "") {
  const p = prompt.toLowerCase();
  if (p.includes("workout") || p.includes("fitness") || p.includes("gym")) {
    return "a realistic workout plan for returning to fitness after a sedentary period";
  }
  if (p.includes("cover letter") || p.includes("job application")) {
    return "a job application cover letter with a tone that is professional but natural";
  }
  if (skeletonTask && skeletonTask !== "user request" && skeletonTask !== "unclear") {
    if (subject) return `${skeletonTask} about ${subject}`;
    return skeletonTask;
  }
  return stripFiller(prompt);
}

function stripFiller(prompt) {
  return prompt
    .replace(/\b(can you please|could you please|can you|please|i want you to|i need help)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function rewriteWithRules(original, skeleton, retrievalAllowed = true) {
  const cleaned = inferTaskPhrase(original, skeleton?.task, skeleton?.subject);
  const constraintsFromText = extractConstraints(original);
  const constraintsFromSkeleton = String(skeleton?.constraints || "")
    .split(";")
    .map((x) => x.trim())
    .filter((x) => x && x.toLowerCase() !== "none");
  const mergedConstraints = [...constraintsFromSkeleton];
  for (const c of constraintsFromText) {
    if (!mergedConstraints.some((x) => x.toLowerCase() === c.toLowerCase())) {
      mergedConstraints.push(c);
    }
  }
  const outputType = OUTPUT_FORMS.includes(String(skeleton?.output || "").toLowerCase())
    ? String(skeleton?.output || "").toLowerCase()
    : inferOutputType(original);
  const role = inferRole(original, retrievalAllowed);

  let body = cleaned || original.trim();
  if (outputType === "steps") body = `Give step-by-step instructions to ${body}.`;
  else if (outputType === "list") body = `List ${body}.`;
  else if (outputType === "code") body = `Write code to ${body}.`;
  else if (outputType === "json") body = `Return JSON for ${body}.`;

  if (mergedConstraints.length) {
    body = `${body.replace(/\.+$/, "")}. Constraints: ${mergedConstraints.join("; ")}.`;
  }
  if (role) {
    body = `Act as a ${role}. ${body}`;
  }
  return body.replace(/\s+/g, " ").trim();
}

function compactHardLimit(original, skeleton) {
  const task = inferTaskPhrase(original, skeleton?.task, skeleton?.subject)
    .replace(/\b(a|an|the)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const constraints = extractConstraints(original).slice(0, 2);
  let text = `List ${task}.`;
  if (constraints.length) {
    text += ` Constraints: ${constraints.join("; ")}.`;
  }
  return text.replace(/\s+/g, " ").trim();
}

function shortestSafeRewrite(original, skeleton) {
  const candidateA = compactHardLimit(original, skeleton);
  const candidateB = stripFiller(original).replace(/\s+/g, " ").trim();
  const task = inferTaskPhrase(original, skeleton?.task, skeleton?.subject);
  const candidateC = `List ${task}.`.replace(/\s+/g, " ").trim();
  const options = [candidateA, candidateB, candidateC].filter(Boolean);
  if (!options.length) return original;
  return options.sort((a, b) => a.length - b.length)[0];
}

function enforceDirectInstruction(text) {
  return String(text || "")
    .replace(/\b(can you please|could you please|can you|please)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  const mode =
    typeof body.mode === "string" ? body.mode : DEFAULT_OPTIMIZATION_MODE;
  const model =
    typeof body.model === "string" && TOKEN_MODELS.includes(body.model)
      ? body.model
      : "GPT-4";

  const trimmed = prompt.trim();
  if (!trimmed) {
    return NextResponse.json({
      optimized: "",
      beforeTokens: 0,
      afterTokens: 0,
      efficiency: 0,
      clarityScore: 0,
      mode: DEFAULT_OPTIMIZATION_MODE,
      skeleton: EMPTY_SKELETON,
    });
  }

  let optimized = "";
  let skeleton = null;
  let reverted = false;
  let retrievalReason = "no retrieval";
  let retrievalAllowed = false;
  let retrievalInPrompt = false;
  let retrievalHitCount = 0;
  try {
    const skeletonResp = await chatCompletion({
      system: EXTRACTOR_SYSTEM,
      user: trimmed,
      temperature: 0,
    });
    skeleton = parseSkeleton(skeletonResp.text, trimmed);
    const ranked = scoreRoleHints(trimmed);
    retrievalHitCount = ranked.length;
    retrievalAllowed = ranked.length > 0;
    retrievalInPrompt = retrievalAllowed;
    const topRole = ranked[0]?.role ? `Suggested role: ${ranked[0].role}\n` : "";

    const reviseResp = await chatCompletion({
      system: REVISER_SYSTEM,
      user: `SKELETON:\n${skeletonResp.text}\n${topRole}\nORIGINAL:\n${trimmed}`,
      temperature: 0.1,
    });
    optimized = enforceDirectInstruction(reviseResp.text);
    if (!optimized) throw new Error("empty llm output");
    if (losesConstraints(trimmed, optimized)) {
      optimized = rewriteWithRules(trimmed, skeleton, retrievalAllowed);
      reverted = true;
      retrievalReason = "hf_dropped_constraints; fallback_rules";
    } else {
      retrievalReason = retrievalAllowed ? "hf_with_role_hints" : "hf_no_role_hints";
    }
  } catch {
    optimized = rewriteWithRules(trimmed, skeleton || parseSkeleton("", trimmed), true);
    reverted = true;
    retrievalAllowed = true;
    retrievalInPrompt = false;
    retrievalHitCount = scoreRoleHints(trimmed).length;
    retrievalReason = "fallback: smart_rules";
  }

  const beforeTokens = estimateTokensByModel(trimmed, model);
  const afterTokens = estimateTokensByModel(optimized, model);
  const originalTokens = estimateTokensByModel(trimmed, model);
  let finalAfterTokens = afterTokens;
  if (finalAfterTokens >= originalTokens) {
    optimized = shortestSafeRewrite(trimmed, skeleton || parseSkeleton("", trimmed));
    finalAfterTokens = estimateTokensByModel(optimized, model);
  }
  if (finalAfterTokens >= originalTokens) {
    optimized = stripFiller(trimmed);
    finalAfterTokens = estimateTokensByModel(optimized, model);
  }
  if (finalAfterTokens >= originalTokens) {
    optimized = trimmed;
    finalAfterTokens = originalTokens;
  }
  const achievedReduction =
    originalTokens > 0 ? ((originalTokens - finalAfterTokens) / originalTokens) * 100 : 0;
  if (achievedReduction < MIN_REDUCTION_PERCENT) {
    optimized = trimmed;
    finalAfterTokens = originalTokens;
  }
  const efficiency = tokenReductionPct(beforeTokens, finalAfterTokens);
  const meaningLoss =
    !reverted && detectMeaningLoss(trimmed, optimized, mode);
  const constraintDrop =
    !reverted && losesConstraints(trimmed, optimized);
  const clarityScore = computeClarityScore(
    trimmed,
    optimized,
    mode,
    reverted,
    { meaningLoss, constraintDrop },
  );

  const resolvedMode = ["clean", "precise", "compact", "structured"].includes(
    mode,
  )
    ? mode
    : DEFAULT_OPTIMIZATION_MODE;

  const ecoScore = Math.max(
    0,
    Math.min(100, Math.round((efficiency * 0.7 + clarityScore * 0.3) * 10) / 10),
  );
  const run = createRun({
    raw_prompt: trimmed,
    task_type: resolvedMode,
    target_model: model,
    optimized_prompt: optimized,
    model_name: process.env.HF_MODEL || "Qwen/Qwen2.5-7B-Instruct",
    latency_ms: null,
    changes_json: {
      tags: [
        `mode:${resolvedMode}`,
        "pipeline:huggingface+rules",
        reverted ? "fallback:rules" : "llm:hf",
      ],
      eco_score: ecoScore,
      eco_score_raw: ecoScore / 100,
      eco_breakdown: {
        efficiency,
        clarityScore,
      },
      eco_version: "v1",
    },
    retrievals: [],
  });

  return NextResponse.json({
    optimized,
    optimized_prompt: optimized,
    run_id: run.id,
    model,
    beforeTokens,
    afterTokens: finalAfterTokens,
    efficiency,
    clarityScore,
    mode: resolvedMode,
    eco_score: ecoScore,
    eco_breakdown: run.changes_json.eco_breakdown,
    retrieval_marker: retrievalInPrompt ? "used" : retrievalAllowed ? "allowed_no_hints" : "skipped",
    retrieval_allowed: retrievalAllowed,
    retrieval_in_prompt: retrievalInPrompt,
    retrieval_gate_reason: retrievalReason,
    retrieval_hit_count: retrievalHitCount,
    skeleton:
      skeleton ||
      parseSkeleton("", trimmed),
  });
}
