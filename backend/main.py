"""
EcoPrompt FastAPI: HumanDelta + Ollama pipeline (skeleton → retrieval → revise) + scores.
Run: cd backend && .venv/bin/uvicorn main:app --reload --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

import logging
import time

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field

from db import queries
from optimizer import DEFAULT_MODE, MODES
from pipeline import run_optimize_pipeline
from settings import DatabaseConfig

logger = logging.getLogger(__name__)

app = FastAPI(title="EcoPrompt API", version="0.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=DatabaseConfig.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class PromptRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    prompt: str
    mode: str = Field(default=DEFAULT_MODE, description="clean | precise | compact | structured")


class SkeletonModel(BaseModel):
    intent: str
    task: str
    subject: str
    output: str
    constraints: str = ""
    prompt: str


class OptimizeResponse(BaseModel):
    run_id: int | None = None
    optimized: str
    optimized_prompt: str
    mode: str
    beforeTokens: float
    afterTokens: float
    efficiency: float
    clarityScore: float
    skeleton: SkeletonModel
    eco_score: float
    eco_breakdown: dict
    retrieval_marker: str = "skipped"
    retrieval_allowed: bool = False
    retrieval_in_prompt: bool = False
    retrieval_gate_reason: str = ""
    retrieval_hit_count: int = 0


@app.get("/health")
def health():
    return {
        "status": "ok",
        "db": bool(DatabaseConfig.DATABASE_URL),
        "ollama_model": DatabaseConfig.OLLAMA_MODEL,
        "humandelta": bool((DatabaseConfig.HD_KEY or "").strip()),
    }

def enforce_direct_instruction(text: str) -> str:
    if not text:
        return text

    replacements = [
        ("Can you please", ""),
        ("Can you", ""),
        ("Could you", ""),
        ("Please", ""),
        ("please", ""),
        ("I want you to", ""),
        ("provide an explanation of", "explain"),
        ("Provide an explanation of", "Explain"),
    ]

    for old, new in replacements:
        text = text.replace(old, new)

    text = text.strip()

    # Remove question format
    if text.endswith("?"):
        text = text[:-1]

    # Force imperative capitalization
    if text:
        text = text[0].upper() + text[1:]

    return text

@app.post("/optimize", response_model=OptimizeResponse)
def optimize_endpoint(req: PromptRequest):
    raw = req.prompt.strip()
    if not raw:
        raise HTTPException(status_code=400, detail="prompt is required")

    mode = (req.mode or DEFAULT_MODE).lower().strip()
    if mode not in MODES:
        mode = DEFAULT_MODE

    run_id = queries.insert_prompt_run(raw, mode, DatabaseConfig.OLLAMA_MODEL or "qwen")

    t0 = time.perf_counter()
    result = run_optimize_pipeline(raw, mode, run_id=run_id)
    result["optimized"] = enforce_direct_instruction(result["optimized"])
    latency_ms = int((time.perf_counter() - t0) * 1000)

    sk = result["skeleton"]
    skeleton_model = SkeletonModel(
        intent=sk.get("intent") or "",
        task=sk.get("task") or "",
        subject=sk.get("subject") or "",
        output=sk.get("output") or "",
        constraints=sk.get("constraints") or "",
        prompt=sk.get("prompt") or "",
    )

    if run_id is not None:
        try:
            tags = [
                f"mode:{mode}",
                "pipeline:ollama+humandelta",
            ]
            if result.get("rules_fallback"):
                tags.append("fallback:rules")
            tags.append(f"retrieval:{result.get('retrieval_marker', 'skipped')}")
            eco_payload = result.get("eco", {})
            changes_payload = {
                "tags": tags,
                "eco_score": eco_payload.get("eco_score"),
                "eco_score_raw": eco_payload.get("eco_score_raw"),
                "eco_breakdown": eco_payload.get("eco_breakdown", {}),
                "eco_version": eco_payload.get("eco_version"),
            }
            queries.insert_prompt_rewrite(
                run_id,
                result["optimized"],
                changes_payload,
                result.get("rewrite_metrics", {}).get("model_name") or DatabaseConfig.OLLAMA_MODEL or "qwen",
                latency_ms,
            )
        except Exception as e:
            logger.warning("DB persist failed (non-fatal): %s", e)

    return OptimizeResponse(
        run_id=run_id,
        optimized=result["optimized"],
        optimized_prompt=result["optimized"],
        mode=result["mode"],
        beforeTokens=result["beforeTokens"],
        afterTokens=result["afterTokens"],
        efficiency=result["efficiency"],
        clarityScore=result["clarityScore"],
        skeleton=skeleton_model,
        eco_score=float(result.get("eco", {}).get("eco_score") or 0.0),
        eco_breakdown=result.get("eco", {}).get("eco_breakdown", {}),
        retrieval_marker=str(result.get("retrieval_marker") or "skipped"),
        retrieval_allowed=bool(result.get("retrieval_allowed")),
        retrieval_in_prompt=bool(result.get("retrieval_in_prompt")),
        retrieval_gate_reason=str(result.get("retrieval_gate_reason") or ""),
        retrieval_hit_count=int(result.get("retrieval_hit_count") or 0),
    )


@app.get("/runs")
def list_runs(limit: int = 20):
    if limit > 100:
        limit = 100
    rows = queries.get_recent_runs(limit)
    return {"runs": rows}


@app.get("/runs/{run_id}")
def get_run(run_id: int):
    row = queries.get_run_by_id(run_id)
    if row is None:
        raise HTTPException(status_code=404, detail="run not found")
    return row
