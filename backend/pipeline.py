"""
HumanDelta-powered prompt pipeline:
  A) extract_skeleton (Qwen via Ollama)
  B) hd.search (HumanDelta retrieval — style only)
  C) revise_prompt (Qwen + mode + skeleton + examples)
"""

from __future__ import annotations

import logging
import os
import re
from typing import Any

import ollama
from humandelta import HumanDelta

from optimizer import DEFAULT_MODE, MODES, loses_constraints, optimize_prompt
from scoring import clarity_score, detect_meaning_loss, efficiency_percent
from settings import DatabaseConfig
from token_estimate import estimate_tokens_by_model

logger = logging.getLogger(__name__)

EXTRACTOR_SYSTEM = """You extract the semantic skeleton from a user's input. You do NOT answer the prompt.

Output exactly these five fields, one per line, in this order:

INTENT: <question type — one of: how-to, factual, definition, opinion, creative, comparison, classification, other>
TASK: <the core task in 2-6 words, e.g. "procedural instruction", "code generation", "summarization">
SUBJECT: <main subject or action in 2-5 words, e.g. "walking a dog", "tying a tie">
OUTPUT: <desired output form, e.g. "steps", "bulleted list", "single paragraph", "python function">
PROMPT: <the user's request with obvious filler stripped, semantic meaning preserved>

Rules:
- Capture the SEMANTIC essence only. Ignore incidental modifiers (colors, dates, names, adjectives) unless they change the meaning of the request.
- PROMPT only removes filler like "please", "show me", "I was wondering if", hedges, and restated context.
- No preamble, no explanation, no extra fields.
"""

REVISER_SYSTEM = """You are a Prompt Optimization Engine.

You are NOT a chatbot.
You do NOT respond to the user.
You ONLY transform text.

STRICT RULES (HARD ENFORCED):

1. Output ONLY the optimized prompt text.
2. DO NOT include greetings (e.g., "Sure!", "Of course", "Certainly").
3. DO NOT include explanations or commentary.
4. DO NOT rephrase as a response to the user.
5. DO NOT ask questions back.
6. DO NOT add any prefix or suffix text.

FORBIDDEN OUTPUT STARTS:
- "Sure!"
- "Here is..."
- "Of course"
- "Certainly"
- "Absolutely"
- any conversational filler

CONTENT RULES:
- Remove filler words (please, can you, I want you to, etc.)
- Preserve full semantic meaning
- Preserve all constraints and requirements
- Improve clarity only when safe
- Do NOT change subject or intent

OUTPUT FORMAT:
Return ONLY the rewritten prompt text. Nothing else.
"""

# Kept alongside strict engine identity (retrieval + skeleton anchor)
REVISER_CONTEXT_RULES = """CONTEXT (do not violate when transforming):
- STYLE EXAMPLES in the user message are for formatting and phrasing patterns ONLY — never copy their topic, task, or domain.
- The SKELETON block is a semantic anchor — preserve the same subject and intent as the ORIGINAL PROMPT; do not answer or fulfill the request."""

MODE_DIRECTIVES: dict[str, str] = {
    "clean": """
MODE: CLEAN
- Remove filler words only. Preserve full meaning. No rephrasing of intent.
- No structural changes (no new bullets/sections unless already present).
- Output ONLY the optimized prompt, one block of text.
""".strip(),
    "precise": """
MODE: PRECISE (default)
- Improve clarity and reduce ambiguity. Preserve ALL constraints and meaning.
- Do NOT aggressively shorten. Best balance of specificity and brevity.
- Output ONLY the optimized prompt.
""".strip(),
    "compact": """
MODE: COMPACT
- Reduce redundancy safely. Remove repeated or unnecessary phrasing only.
- Must NOT remove constraints, numbers, quoted requirements, or task requirements.
- Output ONLY the optimized prompt.
""".strip(),
    "structured": """
MODE: STRUCTURED
- Convert the prompt into a structured format using bullet points OR numbered steps.
- Improve readability only. Preserve full semantic meaning — do not drop content.
- Output ONLY the optimized prompt (structured text).
""".strip(),
}

# Longer phrases first so "Sure! Here's" strips before bare "Sure"
_CHATTY_PREFIXES: tuple[str, ...] = (
    "Here is the revised prompt:",
    "Here is the revised prompt",
    "Here is the optimized prompt:",
    "Here is the optimized prompt",
    "Here is your optimized prompt:",
    "Here is your optimized prompt",
    "Sure! Here's",
    "Sure! Here’s",
    "Sure, here's",
    "Sure, here’s",
    "Certainly!",
    "Certainly.",
    "Certainly,",
    "Certainly",
    "Absolutely!",
    "Absolutely.",
    "Absolutely,",
    "Absolutely",
    "Of course!",
    "Of course.",
    "Of course,",
    "Of course",
    "Sure!",
    "Sure.",
    "Sure,",
    "Here’s",
    "Here's",
    "Here is",
)


def remove_chatty_prefixes(text: str) -> str:
    """Strip common LLM conversational openers from the start of output."""
    t = (text or "").strip()
    if not t:
        return t
    # Unwrap accidental ``` fenced single block
    if t.startswith("```"):
        lines = t.split("\n")
        if len(lines) >= 2 and lines[-1].strip().startswith("```"):
            inner = "\n".join(lines[1:-1]).strip()
            if inner:
                t = inner
    for _ in range(8):
        stripped_this_round = False
        for p in _CHATTY_PREFIXES:
            if t.lower().startswith(p.lower()):
                t = t[len(p) :].lstrip(" \t:;,-—*'\"").lstrip()
                stripped_this_round = True
                break
        if not stripped_this_round:
            break
    return t.strip()


def _ollama_model() -> str:
    return (DatabaseConfig.OLLAMA_MODEL or "qwen2.5:1.5b").strip()


def _hd_client() -> HumanDelta | None:
    key = (DatabaseConfig.HD_KEY or "").strip()
    if not key:
        logger.warning("HD_KEY not set — HumanDelta retrieval disabled")
        return None
    try:
        return HumanDelta(api_key=key)
    except Exception as e:
        logger.warning("HumanDelta client init failed: %s", e)
        return None


def extract_skeleton(user_prompt: str) -> str:
    """STEP A — Ollama / Qwen skeleton extraction (semantic only, no answers)."""
    r = ollama.chat(
        model=_ollama_model(),
        messages=[
            {"role": "system", "content": EXTRACTOR_SYSTEM},
            {"role": "user", "content": user_prompt},
        ],
        options={"temperature": 0},
    )
    return (r.message.content or "").strip()


def hd_search(user_prompt: str, top_k: int = 5) -> list[str]:
    """STEP B — HumanDelta semantic retrieval (style/structure guidance only)."""
    hd = _hd_client()
    if hd is None:
        return []
    try:
        hits = hd.search(user_prompt, top_k=top_k)
        return [h.text for h in hits if getattr(h, "text", None)]
    except Exception as e:
        logger.warning("HumanDelta search failed: %s", e)
        return []


def parse_skeleton_block(skeleton_text: str) -> dict[str, str]:
    """Parse five-line skeleton into API skeleton object."""
    keys_order = [
        ("INTENT:", "intent"),
        ("TASK:", "task"),
        ("SUBJECT:", "subject"),
        ("OUTPUT:", "output"),
        ("PROMPT:", "prompt"),
    ]
    out: dict[str, str] = {v: "" for _, v in keys_order}
    for line in skeleton_text.splitlines():
        stripped = line.strip()
        ul = stripped.upper()
        for prefix, key in keys_order:
            if ul.startswith(prefix):
                out[key] = stripped.split(":", 1)[-1].strip()
                break
    return out


def _fallback_skeleton(user_prompt: str) -> str:
    """Minimal skeleton when Ollama is unavailable (keeps contract)."""
    short = re.sub(r"\s+", " ", user_prompt).strip()[:400]
    return (
        "INTENT: other\n"
        "TASK: user request\n"
        "SUBJECT: (see PROMPT)\n"
        "OUTPUT: text\n"
        f"PROMPT: {short}"
    )


def extract_skeleton_safe(user_prompt: str) -> tuple[str, dict[str, str]]:
    """
    Runs extract_skeleton; on failure uses heuristic fallback.
    Returns (raw_skeleton_block, parsed_dict).
    """
    try:
        raw = extract_skeleton(user_prompt)
        if not raw or len(raw) < 10:
            raise ValueError("empty skeleton")
        parsed = parse_skeleton_block(raw)
        if not any(parsed.values()):
            raise ValueError("unparseable skeleton")
        return raw, parsed
    except Exception as e:
        logger.warning("extract_skeleton fallback: %s", e)
        raw = _fallback_skeleton(user_prompt)
        return raw, parse_skeleton_block(raw)


def revise_prompt(
    user_prompt: str,
    mode: str,
    skeleton: str,
    examples: str,
) -> str:
    """STEP C — Qwen reviser with skeleton + examples + injected MODE."""
    m = mode if mode in MODES else DEFAULT_MODE
    directive = MODE_DIRECTIVES.get(m, MODE_DIRECTIVES[DEFAULT_MODE])
    system = f"{REVISER_SYSTEM}\n\n{REVISER_CONTEXT_RULES}\n\n{directive}"

    examples_block = examples.strip() if examples else (
        "(No style examples retrieved — rely on skeleton and original only.)"
    )

    user_msg = (
        f"OPTIMIZATION_MODE: {m}\n\n"
        f"SKELETON (semantic anchor — preserve intent/subject; do NOT answer it):\n{skeleton}\n\n"
        f"STYLE EXAMPLES (formatting/phrasing ONLY — NEVER copy topics):\n{examples_block}\n\n"
        f"ORIGINAL PROMPT:\n{user_prompt}\n\n"
        "Transform the ORIGINAL PROMPT per MODE rules. "
        "Return ONLY the transformed prompt text — no other characters before or after."
    )

    r = ollama.chat(
        model=_ollama_model(),
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user_msg},
        ],
        options={"temperature": 0.15},
    )
    raw_out = (r.message.content or "").strip()
    return remove_chatty_prefixes(raw_out)


def revise_prompt_safe(
    user_prompt: str,
    mode: str,
    skeleton: str,
    examples: str,
) -> tuple[str, bool]:
    """Returns (optimized_text, used_rules_fallback)."""
    try:
        out = revise_prompt(user_prompt, mode, skeleton, examples)
        if not out:
            raise ValueError("empty revision")
        return out, False
    except Exception as e:
        logger.warning("revise_prompt Ollama failed, rules fallback: %s", e)
        text, _rev = optimize_prompt(user_prompt, mode)
        return remove_chatty_prefixes(text), True


def run_optimize_pipeline(user_prompt: str, mode: str) -> dict[str, Any]:
    """
    Full pipeline through STEP E (scores). Returns dict for OptimizeResponse + skeleton.
    """
    m = mode if mode in MODES else DEFAULT_MODE
    raw = user_prompt.strip()

    skeleton_raw, skeleton_obj = extract_skeleton_safe(raw)
    examples_list = hd_search(raw, top_k=5)
    examples = "\n\n---\n\n".join(examples_list)

    optimized, rules_fallback = revise_prompt_safe(raw, m, skeleton_raw, examples)

    before_t = estimate_tokens_by_model(raw, "GPT-4")
    after_t = estimate_tokens_by_model(optimized, "GPT-4")
    eff = efficiency_percent(before_t, after_t)

    reverted = rules_fallback
    meaning_loss = (not reverted) and detect_meaning_loss(raw, optimized, m)
    constraint_drop = (not reverted) and loses_constraints(raw, optimized)
    clar = clarity_score(
        raw,
        optimized,
        m,
        reverted,
        meaning_loss=meaning_loss,
        constraint_drop=constraint_drop,
    )

    return {
        "optimized": optimized,
        "mode": m,
        "beforeTokens": before_t,
        "afterTokens": after_t,
        "efficiency": eff,
        "clarityScore": clar,
        "skeleton": skeleton_obj,
        "skeleton_raw": skeleton_raw,
        "rules_fallback": rules_fallback,
    }
