"use client";

import { useMemo, useState } from "react";
import { estimateTokens, optimizePrompt } from "@/lib/optimizer";
import { computeHumanDelta } from "@/lib/humanDelta";

const TASK_TYPES = ["Explain", "Summarize", "Analyze", "Generate"];

function efficiencyLabelFromScore(score) {
  if (score >= 60) return "HIGH";
  if (score >= 30) return "MEDIUM";
  return "LOW";
}

/**
 * @param {{ onHumanDeltaChange?: (delta: null | { efficiencyScore: number; impactLevel: string; beforeTokens: number; afterTokens: number }) => void }} props
 */
export default function EcoPromptUI({ onHumanDeltaChange }) {
  const [prompt, setPrompt] = useState("");
  const [taskType, setTaskType] = useState("Explain");
  const [optimized, setOptimized] = useState("");
  const [tokensBefore, setTokensBefore] = useState(null);
  const [tokensAfter, setTokensAfter] = useState(null);
  const [efficiencyScore, setEfficiencyScore] = useState(null);
  const [impactLevel, setImpactLevel] = useState(null);
  const [copied, setCopied] = useState(false);

  const reductionPct = efficiencyScore;

  const efficiencyLabel =
    efficiencyScore != null ? efficiencyLabelFromScore(efficiencyScore) : null;

  const panelClass =
    "rounded-2xl border border-white/10 bg-white/10 p-6 shadow-glow backdrop-blur-xl transition hover:border-cyan-400/25 hover:bg-white/[0.12]";

  function handleOptimize() {
    const raw = prompt.trim();
    if (!raw) {
      setOptimized("");
      setTokensBefore(null);
      setTokensAfter(null);
      setEfficiencyScore(null);
      setImpactLevel(null);
      onHumanDeltaChange?.(null);
      return;
    }

    const before = estimateTokens(raw);
    const out = optimizePrompt(raw, { taskType });
    const after = estimateTokens(out);
    const delta = computeHumanDelta(before, after);

    setTokensBefore(before);
    setTokensAfter(after);
    setOptimized(out);
    setEfficiencyScore(delta.efficiencyScore);
    setImpactLevel(delta.impactLevel);
    onHumanDeltaChange?.(delta);
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

  const tokenDelta = useMemo(() => {
    if (tokensBefore == null || tokensAfter == null) return null;
    return Math.max(0, Math.round((tokensBefore - tokensAfter) * 10) / 10);
  }, [tokensBefore, tokensAfter]);

  return (
    <div className="grid flex-1 gap-6 lg:grid-cols-2 lg:gap-8">
      <section className={`${panelClass} flex flex-col gap-6`}>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-white lg:text-4xl">
            🌿 EcoPrompt
          </h1>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-300">
            Same intent, fewer tokens—measure the Human Delta and watch the
            ocean metaphor respond to lighter AI compute.
          </p>
        </div>

        <label className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
            Your prompt
          </span>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={8}
            placeholder="Paste a verbose prompt…"
            className="min-h-[180px] w-full resize-y rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none ring-cyan-400/30 transition focus:border-cyan-400/40 focus:ring-2"
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
            Task type
          </span>
          <select
            value={taskType}
            onChange={(e) => setTaskType(e.target.value)}
            className="rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm text-slate-100 outline-none ring-cyan-400/30 transition focus:border-cyan-400/40 focus:ring-2"
          >
            {TASK_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={handleOptimize}
          className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-400 px-5 py-3.5 text-sm font-semibold text-[#040d1b] shadow-glow transition hover:from-cyan-400 hover:to-cyan-300 hover:shadow-[0_0_48px_-8px_rgba(34,211,238,0.55)] active:scale-[0.99]"
        >
          <span className="relative z-10">Optimize Prompt</span>
          <span
            aria-hidden
            className="absolute inset-0 bg-white/10 opacity-0 transition group-hover:opacity-100"
          />
        </button>
      </section>

      <section className={`${panelClass} flex flex-col gap-6`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">Optimized Output</h2>
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
                Run optimize to see a tighter prompt here.
              </span>
            )}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Tokens
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
              Reduction
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-cyan-300">
              {reductionPct != null ? `${reductionPct}%` : "—"}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Efficiency
            </p>
            <p className="mt-1 text-lg font-semibold text-white">
              {efficiencyLabel ?? "—"}
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-cyan-400/20 bg-cyan-950/30 px-4 py-4">
          <h3 className="text-sm font-semibold text-cyan-200">🧬 Human Delta</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">
            Language efficiency maps to lighter AI workloads—and a calmer ocean
            in the view below.
            {tokenDelta != null &&
            tokensBefore != null &&
            efficiencyScore != null &&
            impactLevel ? (
              <>
                {" "}
                ~<span className="font-medium text-cyan-100">{tokenDelta}</span>{" "}
                fewer estimated tokens (
                <span className="tabular-nums">{efficiencyScore}%</span>{" "}
                reduction). Impact:{" "}
                <span className="font-medium text-cyan-100">{impactLevel}</span>{" "}
                on compute.
              </>
            ) : (
              <> Optimize to see savings and impact band.</>
            )}
          </p>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-white">What Changed</h3>
          <ul className="mt-3 space-y-2 text-sm text-slate-300">
            {[
              "Removed filler words",
              "Reduced redundancy",
              "Improved clarity",
              "Compressed structure",
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
