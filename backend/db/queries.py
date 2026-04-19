# queries for the database

import json
from db.db import connect_to_database

def insert_prompt_run(raw_prompt: str, task_type: str, target_model: str | None):
    conn = connect_to_database()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO prompt_runs (raw_prompt, task_type, target_model)
            VALUES (%s, %s, %s)
            RETURNING id
            """,
            (raw_prompt, task_type, target_model),
        )
        run_id = cur.fetchone()["id"]
        conn.commit()
        return run_id
    finally:
        conn.close()

def insert_prompt_result(run_id: int, optimized_prompt: str, issues: list[str], changes: list[str], model_name: str, latency_ms: int):
    conn = connect_to_database()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO prompt_results (run_id, optimized_prompt, issues_json, changes_json, model_name, latency_ms)
            VALUES (%s, %s, %s::jsonb, %s::jsonb, %s, %s)
            """,
            (run_id, optimized_prompt, json.dumps(issues), json.dumps(changes), model_name, latency_ms),
        )
        conn.commit()
    finally:
        conn.close()

def insert_prompt_scores(
    run_id: int,
    clarity_before: float,
    clarity_after: float,
    specificity_before: float,
    specificity_after: float,
    conciseness_before: float,
    conciseness_after: float,
    overall_before: float,
    overall_after: float,
):
    conn = connect_to_database()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO prompt_scores (
              run_id,
              clarity_before, clarity_after,
              specificity_before, specificity_after,
              conciseness_before, conciseness_after,
              overall_before, overall_after
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                run_id,
                clarity_before, clarity_after,
                specificity_before, specificity_after,
                conciseness_before, conciseness_after,
                overall_before, overall_after,
            ),
        )
        conn.commit()
    finally:
        conn.close()

def get_recent_runs(limit: int = 20):
    conn = connect_to_database()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT
              r.id,
              r.raw_prompt,
              r.task_type,
              r.target_model,
              r.created_at,
              pr.optimized_prompt,
              pr.issues_json,
              pr.changes_json,
              pr.model_name,
              pr.latency_ms,
              ps.clarity_before,
              ps.clarity_after,
              ps.specificity_before,
              ps.specificity_after,
              ps.conciseness_before,
              ps.conciseness_after,
              ps.overall_before,
              ps.overall_after
            FROM prompt_runs r
            LEFT JOIN prompt_results pr ON pr.run_id = r.id
            LEFT JOIN prompt_scores ps ON ps.run_id = r.id
            ORDER BY r.created_at DESC
            LIMIT %s
            """,
            (limit,),
        )
        return cur.fetchall()
    finally:
        conn.close()

def get_run_by_id(run_id: int):
    conn = connect_to_database()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT
              r.id,
              r.raw_prompt,
              r.task_type,
              r.target_model,
              r.created_at,
              pr.optimized_prompt,
              pr.issues_json,
              pr.changes_json,
              pr.model_name,
              pr.latency_ms,
              ps.clarity_before,
              ps.clarity_after,
              ps.specificity_before,
              ps.specificity_after,
              ps.conciseness_before,
              ps.conciseness_after,
              ps.overall_before,
              ps.overall_after
            FROM prompt_runs r
            LEFT JOIN prompt_results pr ON pr.run_id = r.id
            LEFT JOIN prompt_scores ps ON ps.run_id = r.id
            WHERE r.id = %s
            """,
            (run_id,),
        )
        return cur.fetchone()
    finally:
        conn.close()