# 🌿 EcoPrompt

> **Revision note:** The original project was built around a local FastAPI + Ollama + HumanDelta multi-process stack (described below).  
> This repository has since been revised for easier deployment/demo (single-command run, serverless API flow, and no local Ollama requirement).  
> The section below preserves the original project description for historical/context purposes.

EcoPrompt is a full-stack web application that optimizes user prompts for clarity, efficiency, and reduced AI compute usage. It uses a **HumanDelta + Ollama pipeline** to rewrite prompts and visualize their environmental impact.

---

## 🚀 Tech Stack

- **Frontend:** Next.js (React + Tailwind)
- **Backend:** FastAPI (Python)
- **LLM:** Ollama (local models like `qwen2.5:1.5b`)
- **Evaluation:** HumanDelta
- **Database:** PostgreSQL (Neon)

---

## 🧠 Ollama Setup (AI Engine)

Ollama runs the local AI model used for prompt optimization.

### Install Ollama
Download from: https://ollama.com/download

```bash
brew install ollama
ollama serve
http://localhost:11434
ollama pull qwen2.5:1.5b
ollama list

cd backend
python3 -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
backend/.env
uvicorn main:app --reload --host 0.0.0.0 --port 8000
http://localhost:8000

cd frontend
npm install
frontend/.env.local
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
npm run dev
```

### Run Order
In 3 separate terminals, start services in this order:

```bash
ollama serve # EcoPrompt

cd backend # backend
source .venv/bin/activate
uvicorn main:app --reload --port 8000

cd frontend # frontend
npm run dev
```
