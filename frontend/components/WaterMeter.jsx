"use client";

import { useMemo } from "react";
import { formatWaterVolume } from "@/lib/impact";

/**
 * Vertical “tank” meter: fill height = share of pre-run water proxy this run
 * did not need (saved / before). Large typography for impact.
 * @param {{ beforeLiters: number; savedLiters: number }} props
 */
export default function WaterMeter({ beforeLiters, savedLiters }) {
  const before = Math.max(0, Number(beforeLiters) || 0);
  const saved = Math.max(0, Number(savedLiters) || 0);

  const fillPct = useMemo(() => {
    if (saved <= 0) return 0;
    if (before <= 0) return Math.min(100, Math.max(10, saved * 12000));
    return Math.min(100, Math.max(6, (saved / before) * 100));
  }, [before, saved]);

  const fv = formatWaterVolume(saved);
  const beforeFmt = formatWaterVolume(before);

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-3 sm:max-w-none">
      <div className="w-full text-center">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-200/80">
          Water kept this run
        </p>
        <p className="mt-1 text-3xl font-extrabold tracking-tight text-white tabular-nums sm:text-4xl">
          {saved > 0 ? (
            <>
              {fv.value}
              <span className="ml-1.5 text-xl font-bold text-cyan-200 sm:text-2xl">
                {fv.unit}
              </span>
            </>
          ) : (
            <span className="text-lg font-semibold text-slate-500">No net savings</span>
          )}
        </p>
        <p className="mt-1 text-[11px] text-slate-500">
          Cooling-water proxy vs ~{beforeFmt.value} {beforeFmt.unit} before optimize
        </p>
      </div>

      <div
        className="relative mx-auto w-[min(100%,7.5rem)] shrink-0"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(fillPct)}
        aria-label={`Water proxy saved, about ${fillPct.toFixed(0)} percent of pre-optimization footprint`}
      >
        <div className="relative aspect-[1/3.2] w-full overflow-hidden rounded-b-3xl rounded-t-2xl border-2 border-cyan-400/35 bg-gradient-to-b from-slate-900 to-slate-950 shadow-[0_0_40px_-8px_rgba(34,211,238,0.35)]">
          <div
            className="absolute inset-x-0 bottom-0 bg-slate-800/90"
            style={{ height: "100%" }}
            aria-hidden
          />
          <div
            className="water-meter-fill absolute inset-x-0 bottom-0 overflow-hidden rounded-b-2xl bg-gradient-to-t from-teal-700 via-cyan-500 to-sky-300 transition-[height] duration-[900ms] ease-out"
            style={{ height: `${fillPct}%` }}
          >
            <span
              className="pointer-events-none absolute inset-x-0 top-0 h-3 bg-gradient-to-b from-white/35 to-transparent"
              aria-hidden
            />
            <span
              className="water-meter-wave pointer-events-none absolute inset-x-[-20%] bottom-[92%] h-4 opacity-70"
              aria-hidden
            />
          </div>
          <div className="pointer-events-none absolute inset-0 rounded-b-3xl rounded-t-2xl bg-gradient-to-br from-white/[0.07] to-transparent" />
        </div>
        <p className="mt-2 text-center text-[9px] leading-snug text-slate-500">
          Fill height ≈ share of your pre-run cooling-water proxy this optimization
          did not need
        </p>
      </div>

      {saved > 0 ? (
        <p className="max-w-xs text-center text-[11px] leading-snug text-cyan-100/70">
          Taller fill = a larger share of your pre-run water proxy returned—same
          intent, lighter local inference pass.
        </p>
      ) : (
        <p className="max-w-xs text-center text-[11px] text-slate-500">
          Try a longer prompt or backend optimize to move the meter.
        </p>
      )}
    </div>
  );
}
