# 🌿 EcoPrompt

EcoPrompt is a full-stack web application that optimizes user prompts for clarity, efficiency, and reduced AI compute usage. It uses a **HumanDelta + Ollama pipeline** to rewrite prompts and visualize their environmental impact.

---

## 🚀 Tech Stack

- **Frontend:** Next.js (React + Tailwind)
- **Backend:** FastAPI (Python)
- **LLM:** Ollama (local models like `qwen2.5:1.5b`)
- **Evaluation:** HumanDelta
- **Database (optional):** PostgreSQL (Neon)

---

## ⚙️ Prerequisites

Make sure you have installed:

- Node.js (v18+)
- Python 3.9+
- pip
- Git

---

## 🧠 1. Setup Ollama (AI Engine)

Ollama runs your local AI model.

### Install Ollama

👉 https://ollama.com/download

OR (Mac with Homebrew):

```bash
brew install ollama
ollama serve
http://localhost:11434

cd backend
source .venv/bin/activate
uvicorn main:app --reload --port 8000

cd frontend
npm run dev