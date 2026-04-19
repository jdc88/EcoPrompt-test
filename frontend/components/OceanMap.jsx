"use client";

import { useEffect, useMemo, useRef } from "react";

/**
 * ArcGIS SceneView + “ocean health” overlay driven by Human Delta efficiency (0–100).
 * Overlay opacity ≈ 1 − score/100 — clearer water when prompts are leaner.
 */
/** Baseline overlay before first optimize — avoids max murk (score 0) by default. */
const NEUTRAL_PREVIEW_SCORE = 52;

export default function OceanMap({ efficiencyScore }) {
  const containerRef = useRef(null);
  const viewRef = useRef(null);

  const hasRun = efficiencyScore != null;
  const score = efficiencyScore ?? NEUTRAL_PREVIEW_SCORE;

  const tier = useMemo(() => {
    if (score >= 80) return "clear";
    if (score >= 40) return "medium";
    return "murky";
  }, [score]);

  /** Softer than raw (1 − score/100) so the basemap stays visible; scales with score. */
  const overlayOpacity = useMemo(() => {
    const raw = Math.min(1, Math.max(0, 1 - score / 100));
    return raw * 0.62;
  }, [score]);

  const overlayBackground = useMemo(() => {
    if (tier === "clear") {
      return "linear-gradient(145deg, rgba(40,160,200,0.38) 0%, rgba(30,100,150,0.22) 100%)";
    }
    if (tier === "medium") {
      return "linear-gradient(145deg, rgba(130,100,70,0.38) 0%, rgba(55,70,85,0.28) 100%)";
    }
    return "linear-gradient(165deg, rgba(55,35,28,0.55) 0%, rgba(22,28,38,0.62) 100%)";
  }, [tier]);

  useEffect(() => {
    let cancelled = false;

    async function setup() {
      const [{ default: EsriMap }, { default: SceneView }] = await Promise.all([
        import("@arcgis/core/Map"),
        import("@arcgis/core/views/SceneView"),
      ]);
      await import("@arcgis/core/assets/esri/themes/light/main.css");

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
        /* Sunlit surface view — basemap reads brighter than deep underwater (-z). */
        await view
          .goTo(
            {
              position: [-118.35, 33.72, 280],
              heading: 22,
              tilt: 62,
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

  const tierCaption =
    tier === "clear"
      ? "Clear coastal water — strong token efficiency."
      : tier === "medium"
        ? "Moderate turbidity — room to trim prompts further."
        : "Heavy overlay — inefficient language strains compute (murkier ocean).";

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3 px-1">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-white">
            Ocean metaphor
          </h2>
          <p className="max-w-xl text-xs text-slate-400">
            Spatial view: cleaner water when Human Delta savings are higher. Overlay
            opacity follows{" "}
            <code className="rounded bg-white/10 px-1 py-0.5 text-[10px] text-cyan-200">
              1 − score / 100
            </code>
            .
          </p>
        </div>
        <div className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-cyan-200">
          Δ score:{" "}
          <span className="tabular-nums text-white">
            {hasRun ? score.toFixed(1) : "—"}
          </span>
          {!hasRun && (
            <span className="ml-1 font-normal normal-case text-slate-400">
              (preview)
            </span>
          )}
          {" · "}
          {tier === "clear"
            ? "Low murk"
            : tier === "medium"
              ? "Medium turbidity"
              : "High murk"}
        </div>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-800/30 shadow-inner ring-1 ring-white/5">
        <div
          ref={containerRef}
          className="relative z-0 h-[min(52vh,420px)] min-h-[280px] w-full [&_.esri-view-surface]:outline-none"
          role="presentation"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10 transition-[opacity,background] duration-700 ease-out"
          style={{
            opacity: overlayOpacity,
            background: overlayBackground,
          }}
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-[#040d1b]/55 via-[#040d1b]/10 to-transparent px-4 py-3">
          <p className="text-[11px] leading-snug text-slate-300">{tierCaption}</p>
        </div>
      </div>
    </section>
  );
}
