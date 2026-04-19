# load the keys from the .env file
import os
from dotenv import load_dotenv

load_dotenv()

class DatabaseConfig:
    DATABASE_URL = os.getenv("DATABASE_URL")
    OLLAMA_URL = os.getenv("OLLAMA_URL")
    OLLAMA_MODEL = os.getenv("OLLAMA_MODEL")