import unittest
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

import main
from db import queries
from pipeline import hd_search, run_optimize_pipeline


class PromptRetrievalPersistenceTests(unittest.TestCase):
    def test_hd_search_applies_similarity_threshold(self):
        class Hit:
            def __init__(self, text, similarity=None, score=None):
                self.text = text
                self.similarity = similarity
                self.score = score

        fake_hits = [
            Hit("keep similarity", similarity=0.70),
            Hit("drop low similarity", similarity=0.64),
            Hit("keep score fallback", similarity=None, score=0.65),
            Hit("drop missing score", similarity=None, score=None),
        ]

        with patch("pipeline._hd_client", return_value=MagicMock(search=MagicMock(return_value=fake_hits))):
            out = hd_search("optimize me", top_k=5)

        self.assertEqual([r["retrieved_text"] for r in out], ["keep similarity", "keep score fallback"])

    def test_insert_prompt_retrievals_uses_run_id_and_rank_order(self):
        fake_cur = MagicMock()
        fake_conn = MagicMock()
        fake_conn.cursor.return_value = fake_cur

        retrievals = [
            {"retrieved_text": "first text", "similarity": 0.91, "example_id": None},
            {"retrieved_text": "second text", "similarity": None, "example_id": None},
            {"retrieved_text": "third text", "similarity": 0.71, "example_id": 42},
        ]

        with patch("db.queries._db_enabled", return_value=True), patch(
            "db.queries.connect_to_database", return_value=fake_conn
        ):
            queries.insert_prompt_retrievals(run_id=123, retrievals=retrievals)

        fake_cur.executemany.assert_called_once()
        _, rows = fake_cur.executemany.call_args[0]
        self.assertEqual(len(rows), 3)
        self.assertEqual(rows[0][0], 123)
        self.assertEqual(rows[0][2], "first text")
        self.assertEqual(rows[0][4], 1)
        self.assertEqual(rows[1][4], 2)
        self.assertEqual(rows[2][4], 3)
        self.assertEqual(rows[1][3], None)
        self.assertEqual(rows[2][1], 42)

    def test_optimize_endpoint_passes_run_id_to_pipeline(self):
        client = TestClient(main.app)
        fake_result = {
            "optimized": "optimized prompt",
            "mode": "precise",
            "beforeTokens": 100.0,
            "afterTokens": 70.0,
            "efficiency": 30.0,
            "clarityScore": 90.0,
            "skeleton": {
                "intent": "how-to",
                "task": "instruction",
                "subject": "task",
                "output": "steps",
                "prompt": "Do thing",
            },
            "rules_fallback": False,
            "retrievals": [],
        }

        with patch("main.run_optimize_pipeline", return_value=fake_result) as mock_run_pipeline, patch(
            "main.queries.insert_prompt_run", return_value=777
        ), patch("main.queries.insert_prompt_rewrite"):
            response = client.post("/optimize", json={"prompt": "please optimize this", "mode": "precise"})

        self.assertEqual(response.status_code, 200)
        mock_run_pipeline.assert_called_once_with("please optimize this", "precise", run_id=777)

    def test_run_pipeline_persists_zero_retrievals_safely(self):
        fallback_skeleton = (
            "INTENT: how-to\n"
            "TASK: instruction\n"
            "SUBJECT: task\n"
            "OUTPUT: steps\n"
            "PROMPT: do thing"
        )
        with patch("pipeline.extract_skeleton_safe", return_value=(fallback_skeleton, {})), patch(
            "pipeline.hd_search", return_value=[]
        ), patch("pipeline.revise_prompt_safe", return_value=("optimized", False)), patch(
            "pipeline.estimate_tokens_by_model", side_effect=[100.0, 70.0]
        ), patch("pipeline.clarity_score", return_value=90.0), patch(
            "pipeline.detect_meaning_loss", return_value=False
        ), patch("pipeline.loses_constraints", return_value=False), patch(
            "pipeline.queries.insert_prompt_retrievals"
        ) as mock_insert_retrievals:
            _ = run_optimize_pipeline("please optimize this", "precise", run_id=778)

        mock_insert_retrievals.assert_called_once_with(
            run_id=778,
            retrievals=[],
            retrieval_source="human_delta",
        )


if __name__ == "__main__":
    unittest.main()
