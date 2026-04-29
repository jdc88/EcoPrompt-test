"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { calculateSavings } from "@/lib/impact";
import { estimateTokensByModel } from "@/lib/tokenEstimate";

function normalizeChangesJson(raw) {
  if (raw == null) return null;
  if (typeof raw === "object") return raw;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return null;
}

function fmt(n, digits = 4) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  if (Math.abs(x) < 1e-6) return x.toExponential(1);
  return x.toFixed(digits);
}

export default function EcoRunPage({ params }) {
  const runId = Number(params?.runId);
  const [run, setRun] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      setRun(null);
      if (!Number.isFinite(runId) || runId <= 0) {
        setError(
          "Invalid run id.",
        );
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(`/api/runs/${runId}`);
        if (!res.ok) {
          const t = await res.text();
          throw new Error(t || res.statusText);
        }
        const data = await res.json();
        if (!cancelled) setRun(data);
      } catch (e) {
        if (!cancelled) setError(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [runId]);

  const changes = useMemo(() => normalizeChangesJson(run?.changes_json), [run]);
  const ecoScore =
    changes && changes.eco_score != null ? Number(changes.eco_score) : null;
  const ecoBreakdown =
    changes && typeof changes.eco_breakdown === "object"
      ? changes.eco_breakdown
      : null;

  const raw = typeof run?.raw_prompt === "string" ? run.raw_prompt : "";
  const optimized =
    typeof run?.optimized_prompt === "string" ? run.optimized_prompt : "";

  const beforeTok = raw ? estimateTokensByModel(raw, "GPT-4") : 0;
  const afterTok = optimized ? estimateTokensByModel(optimized, "GPT-4") : 0;
  const sessionSavings = calculateSavings(beforeTok, afterTok);

  const panel =
    "rounded-2xl border border-white/10 bg-white/10 p-6 shadow-glow backdrop-blur-xl";

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-4 py-10 md:px-8">
      <header className="flex flex-col gap-2">
        <Link
          href="/"
          className="text-xs font-medium uppercase tracking-wider text-cyan-300/90 hover:text-cyan-200"
        >
          ← Back to EcoPrompt
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-white">
          Run {Number.isFinite(runId) ? `#${runId}` : ""} · Eco view
        </h1>
        <p className="text-sm leading-relaxed text-slate-300">
          This page loads stored run data from the backend database. The{" "}
          <span className="font-medium text-teal-200">eco score</span> is the
          primary metric (relative compute-efficiency proxy from the backend). Any
          kWh / L values below are{" "}
          <span className="font-medium text-cyan-100">estimated, illustrative</span>{" "}
          translations from token differences only, using the same linear heuristics
          as the main UI (
          <span className="font-mono text-slate-400">lib/impact.js</span>) — not
          measured infrastructure data, and not derived by rescaling the eco score.
        </p>
      </header>

      {loading && (
        <div className={`${panel} text-sm text-slate-300`}>Loading run…</div>
      )}
      {!loading && error && (
        <div className={`${panel} text-sm text-rose-200`}>{error}</div>
      )}
      {!loading && !error && run && (
        <div className="flex flex-col gap-6">
          <section className={panel}>
            <h2 className="text-sm font-semibold text-white">Stored run summary</h2>
            <dl className="mt-3 grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wider text-slate-500">
                  Created
                </dt>
                <dd className="font-medium text-slate-100">
                  {run.created_at ? String(run.created_at) : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-slate-500">
                  Mode / target (run row)
                </dt>
                <dd className="font-medium text-slate-100">
                  {(run.task_type && String(run.task_type)) || "—"} ·{" "}
                  {(run.target_model && String(run.target_model)) || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-slate-500">
                  Rewrite model / latency
                </dt>
                <dd className="font-medium text-slate-100">
                  {(run.model_name && String(run.model_name)) || "—"} ·{" "}
                  {run.latency_ms != null ? `${run.latency_ms} ms` : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-slate-500">
                  Retrievals stored
                </dt>
                <dd className="font-medium text-slate-100">
                  {Array.isArray(run.retrievals) ? run.retrievals.length : 0}
                </dd>
              </div>
            </dl>
          </section>

          <section className={panel}>
            <h2 className="text-sm font-semibold text-white">
              Eco score (from <span className="font-mono">changes_json</span>)
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Backend V1: higher is better within this app’s relative efficiency
              model. It is not kWh, liters, or CO₂.
            </p>
            <p className="mt-2 text-3xl font-semibold tabular-nums text-teal-300">
              {ecoScore != null && Number.isFinite(ecoScore) ? ecoScore : "—"}
            </p>
            {ecoBreakdown && (
              <pre className="mt-3 max-h-48 overflow-auto rounded-lg border border-white/10 bg-black/30 p-3 text-[11px] leading-relaxed text-slate-300">
                {JSON.stringify(ecoBreakdown, null, 2)}
              </pre>
            )}
          </section>

          <section className={panel}>
            <h2 className="text-sm font-semibold text-white">
              Illustrative impact (linear, from token reduction only)
            </h2>
            <p className="mt-2 text-sm text-slate-300">
              Scope: <span className="font-medium text-slate-100">original</span>{" "}
              text is <span className="font-mono text-slate-400">prompt_runs.raw_prompt</span>
              ; <span className="font-medium text-slate-100">optimized</span> text is{" "}
              <span className="font-mono text-slate-400">
                prompt_rewrites.optimized_prompt
              </span>
              . Token counts are estimated with the same word heuristic as the app (
              <span className="font-mono text-slate-400">GPT-4</span> profile). One
              successful optimize is assumed (no modeled retries).
            </p>
            <ul className="mt-3 space-y-2 text-sm text-slate-200">
              <li>
                <span className="text-slate-500">Before → after (tokens):</span>{" "}
                <span className="font-medium tabular-nums text-cyan-100">
                  {fmt(beforeTok, 1)} → {fmt(afterTok, 1)}
                </span>
              </li>
              <li>
                <span className="text-slate-500">
                  Estimated illustrative savings (linear in token delta):
                </span>{" "}
                <span className="font-medium tabular-nums text-emerald-200">
                  Δ energy {fmt(sessionSavings.energySaved)} kWh · Δ water{" "}
                  {fmt(sessionSavings.waterSaved)} L
                </span>
              </li>
              <li className="text-xs leading-relaxed text-slate-500">
                These values are exactly{" "}
                <span className="font-mono text-slate-400">calculateImpact(before)</span>{" "}
                minus <span className="font-mono text-slate-400">calculateImpact(after)</span>{" "}
                in <span className="font-mono text-slate-400">lib/impact.js</span> — proportional
                to tokens saved, with no extra scaling from the eco score.
              </li>
            </ul>
          </section>
        </div>
      )}
    </main>
  );
}
