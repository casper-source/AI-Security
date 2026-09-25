# NodeLine Tech Chatbot — Student Lab Guide

This is your handout for the NodeLine Tech (NLT) AI Security Training lab. It covers everything you need to get the application running on your own machine, log in, and control the training knobs your instructor will reference during exercises.

For what to actually *test* and how findings are graded, follow the exercise sheet your instructor hands out separately — this guide is purely the "how do I run this thing" reference.

---

## 1. What is this?

NLT Chatbot is a realistic (but intentionally vulnerable-by-configuration) AI customer service application: a Flask web app, a locally-hosted LLM (via [Ollama](https://ollama.com)), a RAG knowledge base (ChromaDB), a ticketing system, and an autonomous AI agent that makes decisions about tickets. It runs entirely on your machine — no cloud API keys, no data leaves your laptop.

It ships with a **configurable AI Security Level (1–5)** that turns prompt-injection defenses and output filtering on and off, so you can attack the same app at different defense postures and compare results.

---

## 2. Prerequisites

Install these once, before your first session:

| Tool | Purpose | Notes |
|---|---|---|
| **Docker Desktop** | Runs the Flask app in a container | Windows/Mac: enable WSL2 backend on install. ~4GB disk. |
| **Ollama** | Runs the LLM locally | [ollama.com/download](https://ollama.com/download) |

Hardware: the app runs fine CPU-only (no GPU required). Expect **5–15 seconds per chat response** on CPU; if you have an NVIDIA or AMD GPU, inference is much faster (<2s) but isn't required for any exercise.

You'll also need about **5GB free disk space** for the `mistral:7b` model.

---

## 3. First-time setup

**Step 1 — Pull the model** (one-time, ~4.4GB download):

```powershell
ollama pull mistral:7b
```

Confirm it's there:
```powershell
ollama list
```

**Step 2 — Create the model selector file.** In the project root, create a file named `.selected_model` containing exactly:
```
mistral:7b
```

**Step 3 — Windows only: put Docker's CLI on your PATH for the session** (Docker Desktop's own binary sometimes isn't on PATH):
```powershell
$env:PATH = "C:\Users\<you>\AppData\Local\Programs\DockerDesktop\resources\bin;$env:PATH"
```
(Mac/Linux users using the standard `docker` CLI can skip this.)

**Step 4 — Build and start the app:**
```powershell
docker compose -f docker-compose.windows-local.yml up -d --build
```

> **Not on Windows, or want the "official" multi-container setup instead?** The repo's `README.md` documents `./launch.sh`, which auto-detects your hardware and picks the right `docker-compose.*.yml` for you (CPU/NVIDIA/AMD/hybrid). `docker-compose.windows-local.yml` is a lab-specific variant that runs Ollama natively on the host (via `host.docker.internal`) instead of in its own container, which is the simplest path on Windows without WSL-based Docker networking.

**Step 5 — Verify it's healthy:**
```powershell
curl http://localhost:5000/api/health
```
You should see `"flask_status":"running"`, `"ollama_status":"running"`, `"database_status":"running"`, and `"rag_status":"running"`. First boot takes ~20–30 seconds (it initializes the database and builds the vector index).

**Step 6 — Open it:** [http://localhost:5000](http://localhost:5000)

---

## 4. Logging in

Two pre-seeded accounts (from the database init script):

| Role | Email | Password | Access |
|---|---|---|---|
| Customer | `customer@example.com` | `customer123` | Chat, tickets, standard user features |
| Admin | `admin@nodelinetech.com` | `admin123` | Everything a customer has, plus `/admin/tickets` and all `/api/admin/*` endpoints |

You don't need to log in to use the chat — it works anonymously too, but tickets and conversation history require an account.

---

## 5. Everyday commands

All commands assume you're in the project root and (Windows) have Docker's `resources\bin` on PATH as in step 3 above.

**Start it:**
```powershell
docker compose -f docker-compose.windows-local.yml up -d
```

**Stop it** (keeps your data — tickets, conversations, accounts you created):
```powershell
docker compose -f docker-compose.windows-local.yml down
```

**Restart** (needed any time you change an environment variable, like the security level — see below):
```powershell
docker compose -f docker-compose.windows-local.yml restart chatbot
```

**View live logs** (useful for seeing security-filter blocks in real time):
```powershell
docker compose -f docker-compose.windows-local.yml logs -f chatbot
```

**Full reset** — wipes the database and vector index and rebuilds from scratch (use this if you want a clean slate between exercises, or if state gets confusing):
```powershell
docker compose -f docker-compose.windows-local.yml down -v
docker compose -f docker-compose.windows-local.yml up -d --build
```
After a full reset, the test accounts above are automatically recreated by the entrypoint script — no extra steps needed.

---

## 6. Changing the AI Security Level

This is the main lever for the lab. It's read from the `AI_SECURITY_LEVEL` environment variable, which is baked into the container at start time — **changing it always requires a restart** (the app doesn't hot-reload it).

| Level | Input filtering | Output filtering | What it means for you |
|---|---|---|---|
| **1** (default) | None | None | Baseline — no defenses. Good starting point to see the model's raw behavior. |
| **2** | Pattern-matching only | None | Regex-based jailbreak/injection detection (catches obvious "ignore previous instructions" style attacks). |
| **3** | Patterns + AI threat-scoring | None | Adds a second LLM call that scores your input 1–10 for maliciousness; blocks at score ≥ 5. |
| **4** | None | AI content moderation | Input is unfiltered, but the *response* is scored and blocked if harmful/off-topic. |
| **5** | Patterns + AI threat-scoring | AI content moderation | Full stack — both input and output filtering active. |

**To change it (PowerShell):**
```powershell
$env:AI_SECURITY_LEVEL = "3"
docker compose -f docker-compose.windows-local.yml up -d
```
Docker Compose detects the environment value changed and recreates the container automatically — you don't need `down` first.

**To check what level is currently active:**
```powershell
curl http://localhost:5000/api/health
```
Look for `"ai_security_level"` in the response.

Setting it back to the default (or unsetting the variable) returns you to Level 1.

---

## 7. Where things are

| What | URL |
|---|---|
| Homepage | http://localhost:5000/ |
| Product catalog | http://localhost:5000/products |
| Live chat | http://localhost:5000/chat |
| Your tickets | http://localhost:5000/tickets |
| Admin ticket dashboard (admin login required) | http://localhost:5000/admin/tickets |
| Health check | http://localhost:5000/api/health |
| Full API reference | `docs/api.md` in the repo |

Support tickets use the format `NLT-XXXXXX`. Mentioning a ticket number in chat (e.g. "what's the status of NLT-123456?") pulls that ticket's context into the conversation and can trigger the autonomous AI agent to summarize/act on it — this is intentional and relevant to some exercises.

---

## 8. Rate limits (so you don't get confused by 429 errors)

The app enforces these regardless of security level:

| Endpoint | Limit |
|---|---|
| `POST /api/chat` | 30 requests / minute |
| `POST /api/login` | 5 requests / minute |
| `POST /api/register` | 3 requests / 5 minutes |
| General API | 100 requests / hour |
| Admin endpoints | 200 requests / hour |

If you get a `429 Too Many Requests`, this is working as intended — slow down, don't try to defeat it (see your exercise sheet / RoE for what's actually in scope).

---

## 9. Troubleshooting

**"Connection refused" / health check fails:**
- Confirm Docker Desktop is actually running (not just installed).
- Confirm Ollama is running: `ollama list` should return without error.
- Check logs: `docker compose -f docker-compose.windows-local.yml logs chatbot --tail 60`

**Model outputs garbage / repeated characters:**
- This is a known local-LLM failure mode ("model corruption"). Check `GET /api/health/ollama` for a `corrupted` status, then restart Ollama (`ollama stop mistral:7b` — it reloads on next request) or restart the container.

**Chat is very slow (>15s per response):**
- Expected on CPU-only hardware. If it's consistently much worse, check nothing else heavy is running, and confirm you're using `mistral:7b` (not a larger model like `mixtral:8x7b`, which needs far more RAM/CPU).

**"Security violation" blocking everything, even normal messages:**
- Check your current `AI_SECURITY_LEVEL` — Level 3/5's AI threat-scoring can occasionally over-trigger on ordinary phrasing. This is a legitimate observation to note, not necessarily a bug on your end.

**Port 5000 already in use:**
- Something else is bound to it. Either stop that process or edit the `ports:` mapping in `docker-compose.windows-local.yml`.

---

## 10. Cleaning up at the end of a session

If you're done for the day and just want to free up resources without losing your work:
```powershell
docker compose -f docker-compose.windows-local.yml stop
```
This stops the container but keeps everything (fast to resume with `up -d` later, no rebuild).

If you're fully done with the lab and want to reclaim disk space:
```powershell
docker compose -f docker-compose.windows-local.yml down -v
docker system prune
```
This removes the containers, volumes (your data), and unused Docker images. Ollama and its models are untouched (they live outside Docker) — remove a model with `ollama rm mistral:7b` if you want that space back too.
