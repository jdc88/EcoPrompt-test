"use client";

import { useMemo } from "react";
import { formatWaterVolume, ecoScoreWaterLine } from "@/lib/impact";

/**
 * @param {{ signal: null | {
 *   beforeTokens: number;
 *   afterTokens: number;
 *   efficiency: number;
 *   clarityScore: number;
 *   ecoScore: number | null;
 *   waterSaved: number;
 *   energySaved: number;
 * }}} props
 */
export default function ImpactHero({ signal }) {
  const water = useMemo(() => {
    if (!signal) return null;
    return formatWaterVolume(signal.waterSaved);
  }, [signal]);

  const eco = signal?.ecoScore;
  const ringPct = eco != null && !Number.isNaN(eco) ? Math.max(0, Math.min(100, eco)) : null;

  return (
    <section className="relative mb-8 overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-slate-950/80 via-[#061a2e]/85 to-slate-950/90 px-6 py-8 shadow-[0_0_80px_-20px_rgba(34,211,238,0.15)] backdrop-blur-xl md:px-10 md:py-10">
      <div
        className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-teal-600/10 blur-3xl"
        aria-hidden
      />

      <div className="relative grid gap-10 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="relative min-w-0">
          <div className="relative inline-block pl-5 pt-5">
            <span
              className="pointer-events-none absolute left-0 top-0 block h-10 w-10 border-l border-t border-white/25"
              aria-hidden
            />
            <p className="text-[10px] font-medium uppercase tracking-[0.35em] text-cyan-200/70">
              Compute ocean
            </p>
            <h2 className="mt-2 max-w-xl text-3xl font-bold tracking-tight text-white md:text-4xl lg:text-5xl">
              {water && signal.waterSaved > 0 ? (
                <>
                  <span className="block text-white">Water kept</span>
                  <span className="mt-1 block bg-gradient-to-r from-cyan-200 via-white to-teal-200 bg-clip-text font-extrabold text-transparent tabular-nums">
                    {water.value}
                    <span className="ml-2 text-2xl font-semibold text-cyan-100/90 md:text-3xl">
                      {water.unit}
                    </span>
                  </span>
                </>
              ) : (
                <span className="text-slate-300">
                  Shorter prompts, calmer ocean
                </span>
              )}
            </h2>
            <p className="mt-4 max-w-lg text-sm leading-relaxed text-slate-400">
              {signal
                ? ecoScoreWaterLine(eco, signal.waterSaved, signal.efficiency)
                : "Eco-score reflects quality-adjusted efficiency on your local stack. Fewer tokens mean a lighter inference pass—we surface that as approximate energy and cooling-water proxies."}
            </p>
          </div>
          <div className="relative mt-8 flex flex-wrap items-end gap-6 border-t border-white/10 pt-6">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-500">
                Energy avoided
              </p>
              <p className="mt-1 font-mono text-xl tabular-nums text-amber-100/90 md:text-2xl">
                {signal && signal.energySaved > 1e-8
                  ? `${signal.energySaved < 0.0001 ? signal.energySaved.toExponential(1) : signal.energySaved.toFixed(5)} kWh`
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-500">
                Token efficiency
              </p>
              <p className="mt-1 font-mono text-xl tabular-nums text-cyan-200 md:text-2xl">
                {signal ? `${signal.efficiency.toFixed(1)}%` : "—"}
              </p>
            </div>
            <div className="hidden h-10 w-px bg-white/10 sm:block" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-500">
                Clarity
              </p>
              <p className="mt-1 font-mono text-xl tabular-nums text-emerald-200/90 md:text-2xl">
                {signal ? signal.clarityScore.toFixed(0) : "—"}
              </p>
            </div>
          </div>
        </div>

        <div className="relative flex shrink-0 justify-center lg:justify-end">
          <span
            className="pointer-events-none absolute bottom-0 right-0 block h-10 w-10 border-b border-r border-white/20"
            aria-hidden
          />
          <div
            className="rounded-full p-[3px] shadow-[0_0_40px_-8px_rgba(45,212,191,0.35)] md:p-1"
            style={{
              background:
                ringPct == null
                  ? "rgba(51,65,85,0.8)"
                  : `conic-gradient(from -90deg, rgba(45,212,191,0.9) 0% ${ringPct}%, rgba(30,41,59,0.9) ${ringPct}% 100%)`,
            }}
          >
            <div className="flex h-[9.25rem] w-[9.25rem] flex-col items-center justify-center rounded-full border border-white/5 bg-[#040d1b]/95 backdrop-blur-sm md:h-[10.25rem] md:w-[10.25rem]">
              <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                Eco-score
              </p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-white md:text-4xl">
                {ringPct != null ? ringPct.toFixed(0) : "—"}
              </p>
              <p className="mt-0.5 text-[10px] text-slate-500">v1 · backend</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
