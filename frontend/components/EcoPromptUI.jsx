"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { computeHumanDelta } from "@/lib/humanDelta";
import { estimateTokensByModel, TOKEN_MODELS } from "@/lib/tokenEstimate";
import {
  calculateImpact,
  calculateSavings,
  ecoScoreWaterLine,
  formatWaterVolume,
} from "@/lib/impact";
import { getBackendUrl, isBackendConfigured } from "@/lib/backend";
import {
  DEFAULT_OPTIMIZATION_MODE,
  optimizePromptByMode,
  losesConstraints,
} from "@/lib/modes";
import WaterMeter from "@/components/WaterMeter";
import {
  computeClarityScore,
  detectMeaningLoss,
  tokenReductionPct,
} from "@/lib/scoring";

const MODEL_HINTS = {
  "GPT-4": "words × 1.3",
  Claude: "words × 1.2",
  LLaMA: "words × 1.4",
};

/** Fixed pipeline mode (UI no longer exposes mode picker). */
const OPTIMIZATION_MODE = DEFAULT_OPTIMIZATION_MODE;

/** @typedef {{ source: "backend" | "local"; marker?: string; inPrompt?: boolean; allowed?: boolean; reason?: string; hitCount?: number }} RetrievalUiState */

function retrievalChipClasses(retrieval) {
  if (!retrieval || retrieval.source === "local") {
    return "border-white/15 bg-white/5 text-slate-400";
  }
  if (retrieval.inPrompt) {
    return "border-cyan-400/45 bg-cyan-500/15 text-cyan-100";
  }
  if (retrieval.allowed) {
    return "border-amber-400/35 bg-amber-500/10 text-amber-100";
  }
  return "border-white/15 bg-white/5 text-slate-400";
}

function retrievalHeadline(retrieval) {
  if (!retrieval || retrieval.source === "local") {
    return "Local rules only";
  }
  if (retrieval.inPrompt) {
    return "Retrieval context used";
  }
  if (retrieval.allowed) {
    return "Retrieval allowed, no hints added";
  }
  return "Retrieval not used";
}

export default function EcoPromptUI() {
  const [prompt, setPrompt] = useState("");
  const [targetModel, setTargetModel] = useState("GPT-4");
  const [optimized, setOptimized] = useState("");
  const [lastRaw, setLastRaw] = useState(null);
  const [lastOptimized, setLastOptimized] = useState(null);
  const [lastReverted, setLastReverted] = useState(false);
  const [runMetrics, setRunMetrics] = useState(null);
  /** @type {null | { intent: string; task: string; subject: string; output: string; prompt: string }} */
  const [skeleton, setSkeleton] = useState(null);
  /** @type {null | RetrievalUiState} */
  const [retrieval, setRetrieval] = useState(null);
  const [copied, setCopied] = useState(false);

  const tokenStats = useMemo(() => {
    if (!lastRaw || lastOptimized == null || lastOptimized === "") return null;

    const byModel = {};
    for (const m of TOKEN_MODELS) {
      const before = estimateTokensByModel(lastRaw, m);
      const after = estimateTokensByModel(lastOptimized, m);
      byModel[m] = {
        before,
        after,
        delta: computeHumanDelta(before, after),
      };
    }

    const row = byModel[targetModel];
    return { byModel, delta: row.delta };
  }, [lastRaw, lastOptimized, targetModel]);

  const tokensBefore = tokenStats?.delta.beforeTokens ?? null;
  const tokensAfter = tokenStats?.delta.afterTokens ?? null;
  const reductionPct =
    runMetrics?.efficiency ?? tokenStats?.delta.efficiencyScore ?? null;
  const clarityScore =
    runMetrics?.clarityScore ??
    (tokenStats && lastRaw && lastOptimized != null
      ? computeClarityScore(
          lastRaw,
          lastOptimized,
          OPTIMIZATION_MODE,
          lastReverted,
          {
            meaningLoss:
              !lastReverted &&
              detectMeaningLoss(lastRaw, lastOptimized, OPTIMIZATION_MODE),
            constraintDrop:
              !lastReverted && losesConstraints(lastRaw, lastOptimized),
          },
        )
      : null);
  const ecoScore =
    runMetrics?.ecoScore != null && !Number.isNaN(runMetrics.ecoScore)
      ? runMetrics.ecoScore
      : null;
  const runIdForEco =
    runMetrics?.runId != null && !Number.isNaN(runMetrics.runId)
      ? runMetrics.runId
      : null;

  const panelClass =
    "rounded-2xl border border-white/10 bg-white/10 p-6 shadow-glow backdrop-blur-xl transition hover:border-cyan-400/25 hover:bg-white/[0.12]";

  async function handleOptimize() {
    const raw = prompt.trim();
    if (!raw) {
      setOptimized("");
      setLastRaw(null);
      setLastOptimized(null);
      setRunMetrics(null);
      setSkeleton(null);
      setRetrieval(null);
      setLastReverted(false);
      setCopied(false);
      return;
    }

    const base = getBackendUrl();
    if (base) {
      try {
        const res = await fetch(`${base}/optimize`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: raw,
            mode: OPTIMIZATION_MODE,
          }),
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        const out =
          typeof data.optimized === "string" ? data.optimized : "";
        setLastRaw(raw);
        setLastOptimized(out);
        setOptimized(out);
        setLastReverted(false);
        setRunMetrics({
          efficiency: Number(data.efficiency) || 0,
          clarityScore: Number(data.clarityScore) || 0,
          beforeTokens: Number(data.beforeTokens) || 0,
          afterTokens: Number(data.afterTokens) || 0,
          mode: typeof data.mode === "string" ? data.mode : OPTIMIZATION_MODE,
          runId:
            data.run_id != null && data.run_id !== ""
              ? Number(data.run_id)
              : null,
          ecoScore:
            data.eco_score != null && data.eco_score !== ""
              ? Number(data.eco_score)
              : null,
          ecoBreakdown:
            data.eco_breakdown && typeof data.eco_breakdown === "object"
              ? data.eco_breakdown
              : null,
        });
        setRetrieval({
          source: "backend",
          marker:
            typeof data.retrieval_marker === "string"
              ? data.retrieval_marker
              : undefined,
          inPrompt: Boolean(data.retrieval_in_prompt),
          allowed: Boolean(data.retrieval_allowed),
          reason:
            typeof data.retrieval_gate_reason === "string"
              ? data.retrieval_gate_reason
              : "",
          hitCount:
            typeof data.retrieval_hit_count === "number"
              ? data.retrieval_hit_count
              : Number(data.retrieval_hit_count) || 0,
        });
        if (data.skeleton && typeof data.skeleton === "object") {
          setSkeleton({
            intent: String(data.skeleton.intent ?? ""),
            task: String(data.skeleton.task ?? ""),
            subject: String(data.skeleton.subject ?? ""),
            output: String(data.skeleton.output ?? ""),
            constraints: String(data.skeleton.constraints ?? ""),
            prompt: String(data.skeleton.prompt ?? ""),
          });
        } else {
          setSkeleton(null);
        }
        setCopied(false);
        return;
      } catch {
        /* local fallback */
      }
    }

    const { text: out, reverted } = optimizePromptByMode(raw, OPTIMIZATION_MODE);
    const before = estimateTokensByModel(raw, targetModel);
    const after = estimateTokensByModel(out, targetModel);
    setLastRaw(raw);
    setLastOptimized(out);
    setOptimized(out);
    setLastReverted(reverted);
    setSkeleton(null);
    setRetrieval({ source: "local" });
    setRunMetrics({
      efficiency: tokenReductionPct(before, after),
      clarityScore: computeClarityScore(raw, out, OPTIMIZATION_MODE, reverted, {
        meaningLoss:
          !reverted && detectMeaningLoss(raw, out, OPTIMIZATION_MODE),
        constraintDrop: !reverted && losesConstraints(raw, out),
      }),
      beforeTokens: before,
      afterTokens: after,
      mode: OPTIMIZATION_MODE,
      runId: null,
      ecoScore: null,
      ecoBreakdown: null,
    });
    setCopied(false);
  }

  async function handleCopy() {
    if (!optimized) return;
    try {
      await navigator.clipboard.writeText(optimized);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const resourceFootprint = useMemo(() => {
    if (tokensBefore == null || tokensAfter == null) return null;
    const before = calculateImpact(tokensBefore);
    const after = calculateImpact(tokensAfter);
    const savings = calculateSavings(tokensBefore, tokensAfter);
    return { before, after, savings };
  }, [tokensBefore, tokensAfter]);

  const fmtRes = (n) => {
    if (n < 1e-4) return n.toExponential(1);
    if (n < 0.01) return n.toFixed(5);
    return n.toFixed(4);
  };

  const ringPct =
    ecoScore != null && !Number.isNaN(ecoScore)
      ? Math.max(0, Math.min(100, ecoScore))
      : null;

  return (
    <div className="grid flex-1 gap-8 xl:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
      <section className={`${panelClass} flex flex-col gap-5`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          {isBackendConfigured() ? (
            <p className="text-[10px] font-medium uppercase tracking-wider text-emerald-400/90">
              Backend connected
            </p>
          ) : (
            <p className="text-[10px] text-slate-500">
              Local rules only — set{" "}
              <span className="font-mono text-slate-400">NEXT_PUBLIC_BACKEND_URL</span>{" "}
              for full pipeline
            </p>
          )}
        </div>

        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold uppercase tracking-[0.12em] text-cyan-200/90">
            Your prompt
          </span>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={11}
            placeholder="Paste your prompt here — this is the main workspace…"
            className="min-h-[220px] w-full resize-y rounded-xl border border-cyan-500/20 bg-black/35 px-4 py-4 text-[15px] leading-relaxed text-slate-100 placeholder:text-slate-500 outline-none ring-cyan-400/20 transition focus:border-cyan-400/45 focus:ring-2 focus:ring-cyan-400/25"
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
            Token model (comparison)
          </span>
          <select
            value={targetModel}
            onChange={(e) => setTargetModel(e.target.value)}
            className="rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm text-slate-100 outline-none ring-cyan-400/30 transition focus:border-cyan-400/40 focus:ring-2"
          >
            {TOKEN_MODELS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <span className="text-[10px] text-slate-500">
            Heuristic: {MODEL_HINTS[targetModel]}
          </span>
        </label>

        <button
          type="button"
          onClick={handleOptimize}
          className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-400 px-5 py-3.5 text-sm font-semibold text-[#040d1b] shadow-glow transition hover:from-cyan-400 hover:to-cyan-300 hover:shadow-[0_0_48px_-8px_rgba(34,211,238,0.55)] active:scale-[0.99]"
        >
          <span className="relative z-10">Optimize prompt</span>
          <span
            aria-hidden
            className="absolute inset-0 bg-white/10 opacity-0 transition group-hover:opacity-100"
          />
        </button>

        {tokenStats ? (
          <div className="rounded-xl border border-teal-500/25 bg-gradient-to-br from-teal-950/30 via-black/40 to-slate-950/50 p-4 sm:p-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-teal-200/85">
              Results · tied to this prompt
            </p>
            {resourceFootprint ? (
              <div className="mt-5 border-b border-white/10 pb-6">
                <WaterMeter
                  beforeLiters={resourceFootprint.before.water}
                  savedLiters={resourceFootprint.savings.waterSaved}
                />
              </div>
            ) : null}
            <div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-stretch">
              <div className="flex flex-col items-center gap-2 sm:w-[7.5rem] sm:shrink-0">
                <div
                  className="rounded-full p-[3px] shadow-[0_0_28px_-6px_rgba(45,212,191,0.4)]"
                  style={{
                    background:
                      ringPct == null
                        ? "rgba(51,65,85,0.75)"
                        : `conic-gradient(from -90deg, rgba(45,212,191,0.9) 0% ${ringPct}%, rgba(30,41,59,0.92) ${ringPct}% 100%)`,
                  }}
                >
                  <div className="flex h-[5.5rem] w-[5.5rem] flex-col items-center justify-center rounded-full border border-white/5 bg-[#040d1b]/95">
                    <p className="text-[8px] font-semibold uppercase tracking-wider text-slate-500">
                      Eco
                    </p>
                    <p className="text-2xl font-bold tabular-nums text-white">
                      {ringPct != null ? ringPct.toFixed(0) : "—"}
                    </p>
                    <p className="text-[9px] text-slate-500">v1</p>
                  </div>
                </div>
                {runIdForEco != null ? (
                  <Link
                    href={`/eco/${runIdForEco}`}
                    className="text-[10px] font-medium text-teal-300/90 underline-offset-2 hover:text-teal-200 hover:underline"
                  >
                    Run details
                  </Link>
                ) : null}
              </div>
              <div className="min-w-0 flex-1 space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg border border-white/10 bg-black/25 px-2 py-2.5 text-center sm:px-3">
                    <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">
                      Tokens
                    </p>
                    <p className="mt-1 text-sm font-semibold tabular-nums text-white sm:text-base">
                      {tokensBefore}
                      <span className="text-slate-500">→</span>
                      {tokensAfter}
                    </p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/25 px-2 py-2.5 text-center sm:px-3">
                    <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">
                      η
                    </p>
                    <p className="mt-1 text-sm font-semibold tabular-nums text-cyan-300 sm:text-base">
                      {reductionPct != null ? `${reductionPct}%` : "—"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/25 px-2 py-2.5 text-center sm:px-3">
                    <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">
                      Clarity
                    </p>
                    <p className="mt-1 text-sm font-semibold tabular-nums text-emerald-300 sm:text-base">
                      {clarityScore != null ? clarityScore : "—"}
                    </p>
                  </div>
                </div>
                {resourceFootprint && resourceFootprint.savings.energySaved > 0 ? (
                  <div className="border-t border-white/10 pt-3 text-xs text-amber-100/85">
                    ⚡ Energy proxy avoided this run:{" "}
                    <span className="font-mono font-semibold tabular-nums">
                      {fmtRes(resourceFootprint.savings.energySaved)} kWh
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
            <p className="mt-4 border-t border-white/10 pt-3 text-[11px] leading-relaxed text-slate-400">
              {ecoScoreWaterLine(
                ecoScore,
                resourceFootprint?.savings.waterSaved ?? 0,
                reductionPct ?? 0,
              )}
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-white/15 bg-black/20 px-4 py-6 text-center text-sm text-slate-500">
            Eco-score, token delta, and water proxy appear here after you optimize.
          </div>
        )}
      </section>

      <section className={`${panelClass} flex flex-col gap-6`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Optimized output</h2>
            {retrieval && (
              <div className="mt-2 flex flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${retrievalChipClasses(retrieval)}`}
                  >
                    {retrieval.inPrompt ? (
                      <span
                        className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-cyan-300"
                        aria-hidden
                      />
                    ) : null}
                    {retrievalHeadline(retrieval)}
                  </span>
                  {retrieval.source === "backend" &&
                    typeof retrieval.hitCount === "number" && (
                      <span className="text-[10px] text-slate-500">
                        {retrieval.hitCount} retrieval
                        {retrieval.hitCount === 1 ? "" : "s"} stored for this run
                      </span>
                    )}
                </div>
                {retrieval.source === "backend" && retrieval.reason ? (
                  <p className="max-w-md text-[10px] leading-snug text-slate-500">
                    {retrieval.inPrompt
                      ? "Structural role hints from Human Delta were included in the reviser prompt."
                      : retrieval.allowed
                        ? "Human Delta returned hits, but no usable role labels were extracted for the reviser."
                        : "Human Delta was not used for reviser context on this run."}{" "}
                    <span className="text-slate-500">·</span>{" "}
                    <span className="font-mono text-slate-500">{retrieval.reason}</span>
                  </p>
                ) : retrieval.source === "local" ? (
                  <p className="max-w-md text-[10px] leading-snug text-slate-500">
                    Backend unavailable — in-browser rules only (no Human Delta
                    retrieval).
                  </p>
                ) : null}
              </div>
            )}
          </div>
          <button
            type="button"
            disabled={!optimized}
            onClick={handleCopy}
            className="rounded-lg border border-cyan-400/35 bg-cyan-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-cyan-200 transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-slate-500"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>

        <div className="min-h-[180px] rounded-xl border border-white/10 bg-black/25 px-4 py-3">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-100">
            {optimized || (
              <span className="text-slate-500">
                Run optimize to see output here.
              </span>
            )}
          </p>
        </div>

        {skeleton && (
          <div className="rounded-xl border border-cyan-400/20 bg-black/30 px-4 py-3">
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-cyan-300/90">
              Semantic skeleton (Ollama extract)
            </h3>
            <dl className="mt-2 grid gap-1.5 text-xs text-slate-300 sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">Intent</dt>
                <dd className="font-medium text-slate-100">{skeleton.intent || "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Task</dt>
                <dd className="font-medium text-slate-100">{skeleton.task || "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Subject</dt>
                <dd className="font-medium text-slate-100">{skeleton.subject || "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Output</dt>
                <dd className="font-medium text-slate-100">{skeleton.output || "—"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-slate-500">Constraints</dt>
                <dd className="mt-0.5 text-slate-200">{skeleton.constraints || "—"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-slate-500">PROMPT (cleaned)</dt>
                <dd className="mt-0.5 text-slate-200">{skeleton.prompt || "—"}</dd>
              </div>
            </dl>
          </div>
        )}

        <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-center text-[10px] text-slate-400">
          Scores use the{" "}
          <span className="font-semibold text-cyan-200">{targetModel}</span> tokenizer
          heuristic for approximate tokens, efficiency, and clarity.
        </div>

        <div
          className="grid gap-3 sm:grid-cols-3"
          title={
            runMetrics?.ecoBreakdown
              ? JSON.stringify(runMetrics.ecoBreakdown)
              : undefined
          }
        >
          <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Tokens ({targetModel})
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-white">
              {tokensBefore != null && tokensAfter != null ? (
                <>
                  {tokensBefore}
                  <span className="mx-1 text-slate-500">→</span>
                  {tokensAfter}
                </>
              ) : (
                <span className="text-slate-500">—</span>
              )}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Efficiency
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-cyan-300">
              {reductionPct != null ? `${reductionPct}%` : "—"}
            </p>
            <p className="mt-0.5 text-[9px] text-slate-500">Token reduction</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Clarity score
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-emerald-300">
              {clarityScore != null ? clarityScore : "—"}
            </p>
            <p className="mt-0.5 text-[9px] text-slate-500">0–100 heuristic</p>
          </div>
        </div>
        <p className="text-center text-[10px] text-slate-500">
          Eco-score lives under your prompt —{" "}
          {runIdForEco != null ? (
            <Link
              href={`/eco/${runIdForEco}`}
              className="text-teal-400/90 underline-offset-2 hover:text-teal-300 hover:underline"
            >
              open full breakdown
            </Link>
          ) : (
            <span>full breakdown when backend returns a run id</span>
          )}
        </p>

        {resourceFootprint && (
          <div className="relative overflow-hidden rounded-xl border border-cyan-500/20 bg-gradient-to-br from-cyan-950/40 via-black/40 to-teal-950/30 px-4 py-4">
            <div
              className="pointer-events-none absolute -right-8 top-0 h-32 w-32 rounded-full bg-cyan-400/10 blur-2xl"
              aria-hidden
            />
            <h3 className="relative text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-200/80">
              Ocean impact · local model
            </h3>
            <p className="relative mt-1 text-[11px] leading-snug text-slate-400">
              Token heuristics → approximate kWh and cooling-water proxies. Eco-score
              (when shown) blends quality with compute load—higher often aligns with
              more “water kept” for the same intent.
            </p>
            <ul className="relative mt-4 space-y-3 text-sm text-slate-200">
              <li className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-lg" aria-hidden>
                  💧
                </span>
                <span className="min-w-[5rem] text-slate-400">Water</span>
                <span className="font-medium tabular-nums text-cyan-50">
                  {fmtRes(resourceFootprint.before.water)} L
                  <span className="mx-1 text-slate-500">→</span>
                  {fmtRes(resourceFootprint.after.water)} L
                </span>
                {resourceFootprint.savings.waterSaved > 0 ? (
                  <span className="ml-auto rounded-full border border-cyan-400/30 bg-cyan-500/15 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-cyan-100">
                    −{formatWaterVolume(resourceFootprint.savings.waterSaved).value}{" "}
                    {formatWaterVolume(resourceFootprint.savings.waterSaved).unit}
                  </span>
                ) : null}
              </li>
              <li className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-lg" aria-hidden>
                  ⚡
                </span>
                <span className="min-w-[5rem] text-slate-400">Energy</span>
                <span className="font-medium tabular-nums text-amber-100/90">
                  {fmtRes(resourceFootprint.before.energy)} kWh
                  <span className="mx-1 text-slate-500">→</span>
                  {fmtRes(resourceFootprint.after.energy)} kWh
                </span>
                {resourceFootprint.savings.energySaved > 0 ? (
                  <span className="ml-auto text-xs tabular-nums text-amber-200/80">
                    Δ {fmtRes(resourceFootprint.savings.energySaved)} kWh
                  </span>
                ) : null}
              </li>
              <li className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-t border-white/10 pt-3">
                <span className="text-base" aria-hidden>
                  📉
                </span>
                <span className="text-slate-400">Token reduction</span>
                <span className="font-semibold tabular-nums text-emerald-300">
                  {resourceFootprint.savings.reductionPercent}%
                </span>
              </li>
            </ul>
          </div>
        )}

        {tokenStats && (
          <div className="rounded-xl border border-white/10 bg-black/25 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              All models (before → after)
            </h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {TOKEN_MODELS.map((m) => {
                const row = tokenStats.byModel[m];
                const active = m === targetModel;
                return (
                  <div
                    key={m}
                    className={`rounded-lg border px-3 py-2 text-center transition ${
                      active
                        ? "border-cyan-400/50 bg-cyan-500/10"
                        : "border-white/10 bg-white/5"
                    }`}
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      {m}
                    </p>
                    <p className="mt-1 text-sm font-semibold tabular-nums text-white">
                      {row.before}
                      <span className="mx-0.5 text-slate-500">→</span>
                      {row.after}
                    </p>
                    <p className="mt-0.5 text-[10px] text-cyan-300/90">
                      {row.delta.efficiencyScore}% reduction
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <h3 className="text-sm font-semibold text-white">What changed</h3>
          <ul className="mt-3 space-y-2 text-sm text-slate-300">
            {[
              "Filler and ambiguity passes on your prompt",
              "Constraint and task-verb safety check",
              "Clearer structure where it helps the model follow intent",
              "Token, clarity, and eco signals for this run",
            ].map((line) => (
              <li key={line} className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400" />
                {line}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
