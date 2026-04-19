"use client";

import { useEffect, useMemo, useRef } from "react";
import { calculateImpact } from "@/lib/impact";

const DEFAULT_MAX = 400;

/**
 * ArcGIS SceneView + signal-stability metaphor:
 * - efficiency → resource / token load (thermal + flow density)
 * - clarityScore → smooth vs turbulent compute flow (overlay + motion)
 */
export default function OceanMap({
  tokens = 50,
  maxTokens: maxTokensProp,
  beforeTokens = null,
  efficiency = 0,
  clarityScore = 50,
}) {
  const containerRef = useRef(null);
  const viewRef = useRef(null);

  const maxTokens = Math.max(
    DEFAULT_MAX,
    maxTokensProp ?? 0,
    tokens,
    beforeTokens ?? 0,
  );

  const loadIntensity = useMemo(
    () => Math.min(1, Math.max(0, tokens / maxTokens)),
    [tokens, maxTokens],
  );

  /** 0 = turbulent / noisy signal, 1 = stable / clear */
  const stability = useMemo(() => {
    const c = Math.min(100, Math.max(0, clarityScore));
    return c / 100;
  }, [clarityScore]);

  const efficiencyNorm = useMemo(
    () => Math.min(1, Math.max(0, efficiency / 100)),
    [efficiency],
  );

  const thermalStyle = useMemo(() => {
    const heat = loadIntensity * (1 - efficiencyNorm * 0.55);
    const alpha = 0.1 + heat * 0.55;
    let core;
    if (heat < 0.32) {
      core = `rgba(45, 190, 255, ${alpha * 0.55})`;
    } else if (heat < 0.62) {
      core = `rgba(130, 110, 255, ${alpha * 0.65})`;
    } else {
      core = `rgba(255, 120, 70, ${alpha})`;
    }
    return {
      background: `radial-gradient(circle at 50% 42%, ${core} 0%, rgba(20, 50, 100, ${0.06 + heat * 0.1}) 48%, transparent 70%)`,
      opacity: 0.28 + heat * 0.5,
      transition: "opacity 900ms ease, background 900ms ease",
    };
  }, [loadIntensity, efficiencyNorm]);

  const turbulence = useMemo(
    () => Math.min(1, Math.max(0, 1 - stability * 0.85 + (1 - efficiencyNorm) * 0.25)),
    [stability, efficiencyNorm],
  );

  const flowLines = useMemo(() => {
    const density =
      loadIntensity *
      (0.45 + turbulence * 0.55) *
      (1.1 - efficiencyNorm * 0.35) *
      (1 - 0.5 * efficiencyNorm);
    const n = Math.min(
      22,
      Math.max(0, Math.floor(22 * density)),
    );
    const speedBase = Math.max(0.85, 3.2 - efficiencyNorm * 1.8 + turbulence * 1.4);
    return Array.from({ length: n }, (_, i) => {
      const seed = (i * 19 + tokens * 3 + Math.round(clarityScore)) % 100;
      const wobble = turbulence * 8;
      return {
        id: `${tokens}-${clarityScore}-${i}`,
        topPct: 8 + (seed * 0.74) % 82,
        delayS: (i * 0.18) % 2.2,
        durationS: speedBase + (i % 6) * (0.08 + turbulence * 0.12),
        skew: -8 + (i % 5) * 4 + wobble * (i % 2 ? 1 : -1),
        opacity: 0.28 + turbulence * 0.35 + (i % 3) * 0.08,
      };
    });
  }, [tokens, loadIntensity, efficiencyNorm, turbulence, clarityScore]);

  const impactAfter = useMemo(() => calculateImpact(tokens), [tokens]);
  const impactBefore = useMemo(
    () => (beforeTokens != null ? calculateImpact(beforeTokens) : null),
    [beforeTokens],
  );

  useEffect(() => {
    let cancelled = false;

    async function setup() {
      const [{ default: EsriMap }, { default: SceneView }] = await Promise.all([
        import("@arcgis/core/Map"),
        import("@arcgis/core/views/SceneView"),
      ]);
      await import("@arcgis/core/assets/esri/themes/dark/main.css");

      if (!containerRef.current || cancelled) return;

      const map = new EsriMap({
        basemap: "oceans",
        ground: "world-elevation",
      });

      const view = new SceneView({
        container: containerRef.current,
        map,
        qualityProfile: "medium",
      });

      if (view.environment?.lighting) {
        view.environment.lighting.directShadowsEnabled = false;
      }

      try {
        await view.when();
        await view
          .goTo(
            {
              position: [-118.35, 33.72, -45],
              heading: 22,
              tilt: 94,
            },
            { duration: 1200 },
          )
          .catch(() => {});
      } catch {
        /* non-fatal */
      }

      viewRef.current = view;
    }

    setup();

    return () => {
      cancelled = true;
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
      }
    };
  }, []);

  const fmtSmall = (n) => {
    if (n < 1e-4) return n.toExponential(1);
    if (n < 0.01) return n.toFixed(5);
    return n.toFixed(4);
  };

  const caption =
    stability > 0.62
      ? "Stable signal — higher clarity and stronger efficiency: smoother compute-flow metaphor over the ocean surface."
      : stability > 0.35
        ? "Mixed flow — moderate ambiguity or token load: visible structure in the currents."
        : "Turbulent signal — lower clarity or heavier token load: more crossed flow lines (no pollution metaphor).";

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3 px-1">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-white">
            Compute flow & signal stability
          </h2>
          <p className="max-w-xl text-xs text-slate-400">
            Efficiency maps to how much work the prompt still implies; clarity
            maps to how stable the “signal” reads. Together they drive thermal
            tint and flow turbulence—not environmental pollution.
          </p>
        </div>
        <div className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-cyan-200">
          η {efficiency.toFixed(0)}% · clarity {clarityScore.toFixed(0)} · tokens{" "}
          <span className="tabular-nums text-white">{tokens.toFixed(1)}</span>
        </div>
      </div>

      <div className="relative w-full overflow-hidden rounded-2xl border border-white/10 bg-[#040d1b] shadow-inner">
        <div
          ref={containerRef}
          className="relative z-0 h-[min(56vh,480px)] min-h-[300px] w-full [&_.esri-view-surface]:outline-none"
          role="presentation"
        />

        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[11] mix-blend-screen"
          style={thermalStyle}
        />

        {/* Turbulence veil: stronger when clarity is low */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[11] bg-[repeating-linear-gradient(105deg,transparent,transparent_12px,rgba(34,211,238,0.04)_12px,rgba(34,211,238,0.04)_24px)] transition-opacity duration-700"
          style={{ opacity: 0.15 + turbulence * 0.55 }}
        />

        <div
          key={`flows-${flowLines.length}-${tokens}-${Math.round(clarityScore)}`}
          className="pointer-events-none absolute inset-0 z-[12] overflow-hidden"
          aria-hidden
        >
          {flowLines.map((line) => (
            <div
              key={line.id}
              className="pointer-events-none absolute left-0 w-full overflow-visible"
              style={{
                top: `${line.topPct}%`,
                transform: `skewX(${line.skew}deg)`,
              }}
            >
              <div
                className="h-px w-[42%] rounded-full bg-gradient-to-r from-cyan-300/15 via-cyan-200/75 to-cyan-400/25 shadow-[0_0_14px_rgba(34,211,238,0.45)]"
                style={{
                  opacity: line.opacity,
                  animation: `flow ${line.durationS}s linear infinite`,
                  animationDelay: `${line.delayS}s`,
                }}
              />
            </div>
          ))}
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[20] space-y-1 bg-gradient-to-t from-[#040d1b]/95 via-[#040d1b]/55 to-transparent px-4 pb-3 pt-10">
          <p className="text-[11px] leading-snug text-slate-300">{caption}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-400">
            <span>
              ⚡ After ~{fmtSmall(impactAfter.energy)} kWh · 💧 After ~
              {fmtSmall(impactAfter.water)} L
            </span>
            {impactBefore ? (
              <span className="text-slate-500">
                (vs before ~{fmtSmall(impactBefore.energy)} kWh · ~
                {fmtSmall(impactBefore.water)} L)
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
