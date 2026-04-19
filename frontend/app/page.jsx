"use client";

import EcoPromptUI from "@/components/EcoPromptUI";
import OceanBackdrop from "@/components/OceanBackdrop";

export default function Home() {
  return (
    <div className="relative min-h-screen">
      <OceanBackdrop />
      <main className="relative z-10 mx-auto max-w-5xl px-4 py-8 md:px-8 md:py-10">
        <header className="mb-8 border-b border-white/[0.06] pb-8">
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-300/75">
            Local model · clearer prompts
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-white md:text-4xl">
            EcoPrompt
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
            Paste your prompt, pick a mode, and optimize. Eco-score and water
            proxies reflect how much load you shed on your stack after
            reprompting.
          </p>
        </header>

        <EcoPromptUI />
      </main>
    </div>
  );
}
