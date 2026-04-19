"use client";

/**
 * Ambient deep-ocean layer (marine snow + depth gradient) — no interaction.
 * Reference: cinematic underwater hero treatments.
 */
export default function OceanBackdrop() {
  return (
    <div
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      aria-hidden
    >
      <div
        className="absolute inset-0 opacity-90"
        style={{
          background:
            "radial-gradient(ellipse 85% 55% at 50% 100%, rgba(8, 47, 73, 0.55) 0%, transparent 50%), radial-gradient(ellipse 60% 40% at 80% 20%, rgba(34, 211, 238, 0.06) 0%, transparent 45%), linear-gradient(180deg, #020617 0%, #040d1b 38%, #071a2c 100%)",
        }}
      />
      <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg viewBox=%220 0 256 256%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22n%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.85%22 numOctaves=%224%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23n)%22 opacity=%220.04%22/%3E%3C/svg%3E')] opacity-40 mix-blend-overlay" />
      {[...Array(18)].map((_, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-cyan-200/20 shadow-[0_0_6px_rgba(165,243,252,0.35)]"
          style={{
            width: 1 + (i % 4),
            height: 1 + (i % 4),
            left: `${(i * 47 + 11) % 100}%`,
            top: `${(i * 23 + 7) % 100}%`,
            animation: `marine-drift ${18 + (i % 9)}s linear infinite`,
            animationDelay: `${-(i * 0.7)}s`,
          }}
        />
      ))}
    </div>
  );
}
