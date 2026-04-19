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

const EMPTY_SKELETON = {
  intent: "",
  task: "",
  subject: "",
  output: "",
  prompt: "",
};

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

  const { text: optimized, reverted } = optimizePromptByMode(trimmed, mode);
  const beforeTokens = estimateTokensByModel(trimmed, model);
  const afterTokens = estimateTokensByModel(optimized, model);
  const efficiency = tokenReductionPct(beforeTokens, afterTokens);
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

  return NextResponse.json({
    optimized,
    model,
    beforeTokens,
    afterTokens,
    efficiency,
    clarityScore,
    mode: resolvedMode,
    skeleton: {
      intent: "other",
      task: "user request",
      subject: "(see PROMPT)",
      output: "text",
      prompt: trimmed.slice(0, 500),
    },
  });
}
