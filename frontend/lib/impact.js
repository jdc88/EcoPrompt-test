/**
 * Rough heuristic: tokens → resource footprint (hackathon-scale approximations).
 */

/**
 * Human-readable volume for UI hero (liters input from token proxy).
 * @param {number} liters
 * @returns {{ value: string; unit: string; raw: number }}
 */
export function formatWaterVolume(liters) {
  const L = Math.max(0, Number(liters) || 0);
  if (L >= 1) return { value: L.toFixed(L >= 10 ? 1 : 2), unit: "L", raw: L };
  if (L >= 0.001) return { value: (L * 1000).toFixed(2), unit: "mL", raw: L };
  if (L > 0) return { value: (L * 1e6).toFixed(1), unit: "µL", raw: L };
  return { value: "0", unit: "L", raw: 0 };
}

/**
 * Short narrative tying backend eco-score to water proxy (local model load).
 * @param {number | null | undefined} ecoScore 0–100
 * @param {number} waterSavedLiters
 * @param {number} efficiencyPct
 * @returns {string}
 */
export function ecoScoreWaterLine(ecoScore, waterSavedLiters, efficiencyPct) {
  const w = Math.max(0, Number(waterSavedLiters) || 0);
  const eff = Math.max(0, Number(efficiencyPct) || 0);
  const eco =
    ecoScore != null && !Number.isNaN(Number(ecoScore))
      ? Math.max(0, Math.min(100, Number(ecoScore)))
      : null;

  if (w <= 0 && eff < 0.05) {
    return "Almost no token delta this run—try a wordier prompt to see water and energy proxies move.";
  }

  const fv = formatWaterVolume(w);
  const waterBit =
    w > 0
      ? `About ${fv.value} ${fv.unit} less cooling-water proxy than the pre-optimization pass.`
      : "Token savings are tiny on this run—eco-score still reflects compute quality vs. load.";

  if (eco == null) {
    return `${waterBit} Eco-score appears when the Python pipeline returns it.`;
  }

  if (eco >= 70) {
    return `${waterBit} Eco-score ${eco.toFixed(0)} is strong: efficient, quality-adjusted use of your local model.`;
  }
  if (eco >= 40) {
    return `${waterBit} Eco-score ${eco.toFixed(0)} is mid-range—room to tighten prompts or reduce retries.`;
  }
  return `${waterBit} Eco-score ${eco.toFixed(0)} is low; check clarity and verbosity to ease load on the local stack.`;
}

/**
 * @param {number} tokens
 * @returns {{ energy: number, water: number }} kWh and liters
 */
export function calculateImpact(tokens) {
  const t = Math.max(0, Number(tokens) || 0);
  return {
    energy: t * 0.0003,
    water: t * 0.0002,
  };
}

/**
 * @param {number} beforeTokens
 * @param {number} afterTokens
 * @returns {{
 *   energySaved: number,
 *   waterSaved: number,
 *   reductionPercent: number
 * }}
 */
export function calculateSavings(beforeTokens, afterTokens) {
  const before = Math.max(0, Number(beforeTokens) || 0);
  const after = Math.max(0, Number(afterTokens) || 0);
  const bi = calculateImpact(before);
  const ai = calculateImpact(after);
  const energySaved = Math.max(0, bi.energy - ai.energy);
  const waterSaved = Math.max(0, bi.water - ai.water);
  const reductionPercent =
    before <= 0
      ? 0
      : Math.max(0, Math.min(100, Math.round(((before - after) / before) * 1000) / 10));

  return {
    energySaved,
    waterSaved,
    reductionPercent,
  };
}
