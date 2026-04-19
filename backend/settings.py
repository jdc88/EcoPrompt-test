# load the keys from the .env file
import os
from dotenv import load_dotenv

load_dotenv()


def _csv_env(name: str, default: str) -> list[str]:
    raw = os.getenv(name, default)
    return [x.strip() for x in raw.split(",") if x.strip()]


class DatabaseConfig:
    DATABASE_URL = os.getenv("DATABASE_URL")
    OLLAMA_URL = os.getenv("OLLAMA_URL")
    # Qwen2.5 (or other) tag for Ollama — used by extract_skeleton + revise_prompt
    OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5:1.5b")
    # HumanDelta API (semantic retrieval for style examples)
    HD_KEY = os.getenv("HD_KEY") or os.getenv("HUMANDELTA_API_KEY")
    BACKEND_CORS_ORIGINS = _csv_env(
        "BACKEND_CORS_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000",
    )