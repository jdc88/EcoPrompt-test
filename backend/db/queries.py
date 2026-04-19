"""Persistence aligned with db/schema.sql (prompt_runs + prompt_rewrites)."""

from __future__ import annotations

import json
from typing import Any

from psycopg2.extras import RealDictCursor

from db.db import connect_to_database
from settings import DatabaseConfig


def _db_enabled() -> bool:
    return bool(DatabaseConfig.DATABASE_URL)


def insert_prompt_run(
    raw_prompt: str,
    task_type: str | None,
    target_model: str | None,
) -> int | None:
    if not _db_enabled():
        return None
    conn = connect_to_database()
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(
            """
            INSERT INTO prompt_runs (raw_prompt, task_type, target_model)
            VALUES (%s, %s, %s)
            RETURNING id
            """,
            (raw_prompt, task_type, target_model),
        )
        row = cur.fetchone()
        conn.commit()
        return int(row["id"]) if row else None
    finally:
        conn.close()


def insert_prompt_rewrite(
    run_id: int,
    optimized_prompt: str,
    changes: list[str],
    model_name: str | None,
    latency_ms: int,
) -> None:
    if not _db_enabled():
        return
    conn = connect_to_database()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO prompt_rewrites (
              run_id, optimized_prompt, changes_json, model_name, latency_ms
            )
            VALUES (%s, %s, %s::jsonb, %s, %s)
            """,
            (
                run_id,
                optimized_prompt,
                json.dumps(changes),
                model_name,
                latency_ms,
            ),
        )
        conn.commit()
    finally:
        conn.close()


def insert_prompt_retrievals(
    run_id: int,
    retrievals: list[dict[str, Any]],
    retrieval_source: str = "human_delta",
) -> None:
    if not _db_enabled() or not retrievals:
        return
    conn = connect_to_database()
    try:
        cur = conn.cursor()
        rows = []
        for idx, item in enumerate(retrievals, start=1):
            rows.append(
                (
                    run_id,
                    item.get("example_id"),
                    item.get("retrieved_text"),
                    item.get("similarity"),
                    idx,
                    retrieval_source,
                )
            )
        cur.executemany(
            """
            INSERT INTO prompt_retrievals (
              run_id, example_id, retrieved_text, similarity, rank_position, retrieval_source
            )
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            rows,
        )
        conn.commit()
    finally:
        conn.close()


def get_prompt_retrievals_by_run_ids(run_ids: list[int]) -> dict[int, list[dict[str, Any]]]:
    if not _db_enabled() or not run_ids:
        return {}
    conn = connect_to_database()
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(
            """
            SELECT
              id,
              run_id,
              example_id,
              retrieved_text,
              similarity,
              rank_position,
              retrieval_source,
              created_at
            FROM prompt_retrievals
            WHERE run_id = ANY(%s)
            ORDER BY run_id, rank_position ASC, id ASC
            """,
            (run_ids,),
        )
        out: dict[int, list[dict[str, Any]]] = {}
        for row in cur.fetchall():
            key = int(row["run_id"])
            out.setdefault(key, []).append(dict(row))
        return out
    finally:
        conn.close()


def get_recent_runs(limit: int = 20) -> list[dict[str, Any]]:
    if not _db_enabled():
        return []
    conn = connect_to_database()
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(
            """
            SELECT
              r.id,
              r.raw_prompt,
              r.task_type,
              r.target_model,
              r.created_at,
              pr.optimized_prompt,
              pr.changes_json,
              pr.model_name,
              pr.latency_ms
            FROM prompt_runs r
            LEFT JOIN prompt_rewrites pr ON pr.run_id = r.id
            ORDER BY r.created_at DESC
            LIMIT %s
            """,
            (limit,),
        )
        rows = [dict(r) for r in cur.fetchall()]
        retrievals_by_run = get_prompt_retrievals_by_run_ids([int(r["id"]) for r in rows])
        for row in rows:
            row["retrievals"] = retrievals_by_run.get(int(row["id"]), [])
        return rows
    finally:
        conn.close()
