# HandOff.AI — Backend

Embedded agentic AI co-pilot powered by Fetch.ai uAgents, Gemini Vision, and Firebase.

---

## Architecture

```
Frontend (React/Vite)
  │
  ├── WebSocket ──→ FastAPI /ws/{session_id}   (port 8000)
  │                      │
  │                      └── HTTP POST ──→ Context Agent  (port 8001)
  │                                               │
  │                              ┌────────────────┴──────────────────┐
  │                              ↓                                   ↓
  │                       Knowledge Agent                      Vision Agent
  │                         (port 8002)                          (port 8003)
  │                       Firestore SOP                      Gemini Vision API
  │                              │                                   │
  │                              └──────── merged StepResponse ──────┘
  │                                               │
  │                              Firebase Realtime DB  ←── cursor X/Y written here
  │
  └── Firebase Realtime DB listener (sub-100ms cursor sync, bypasses WebSocket)
```

---

## Quick Start

### 1. Install dependencies

```bash
cd backend
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS/Linux
source .venv/bin/activate

pip install -r requirements.txt
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env — fill in GEMINI_API_KEY, FIREBASE_* values, and agent seeds
```

### 3. Add Firebase service account

Download your Firebase service account JSON from the Firebase console and save it as:

```
backend/firebase-service-account.json
```

### 4. Run

```bash
# All-in-one (agents + API)
python run_agents.py

# API only
python run_agents.py api

# Agents only
python run_agents.py agents
```

The FastAPI server starts at `http://localhost:8000`.  
Interactive API docs: `http://localhost:8000/docs`

---

## Project Structure

```
backend/
├── agents/
│   ├── context_agent.py      # Orchestrator — fan-out to Knowledge + Vision
│   ├── knowledge_agent.py    # SOP step retrieval from Firestore
│   └── vision_agent.py       # DOM screenshot → Gemini Vision → coordinates
├── api/
│   ├── main.py               # FastAPI app + WebSocket /ws/{session_id}
│   └── routes/
│       ├── sop.py            # CRUD + Record Mode → SOP generation
│       ├── sessions.py       # Session lifecycle
│       └── admin.py          # Analytics, guardrails, product config
├── models/
│   ├── agent_models.py       # uAgents inter-agent message schemas
│   ├── sop_models.py         # Firestore SOP document shapes
│   └── session_models.py     # Session state + WebSocket envelopes
├── services/
│   ├── firebase_service.py   # Firestore + Realtime DB client
│   └── gemini_service.py     # Gemini Vision API + SOP generation
├── config.py                 # Pydantic-settings configuration singleton
├── run_agents.py             # Entry point — launches bureau + API
└── requirements.txt
```

---

## Key API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/sessions` | Create a new guidance session |
| `GET` | `/sessions/{id}` | Get session state |
| `DELETE` | `/sessions/{id}` | End session |
| `WS` | `/ws/{session_id}` | Real-time Ghost Cursor bridge |
| `POST` | `/sops` | Create a new SOP |
| `GET` | `/sops?product_id=...` | List SOPs for a product |
| `GET` | `/sops/{id}` | Get full SOP |
| `POST` | `/sops/{id}/steps` | Add a step to an SOP |
| `POST` | `/sops/{id}/publish` | Publish SOP to end-users |
| `POST` | `/sops/record/start` | Start Record Mode session |
| `POST` | `/sops/record/{id}/events` | Append recorded DOM events |
| `POST` | `/sops/record/{id}/finalise` | Stop recording → generate SOP via Gemini |
| `GET` | `/admin/analytics/{product_id}` | Usage analytics dashboard |
| `POST` | `/admin/guardrails` | Configure destructive-action selectors |

---

## WebSocket Message Protocol

### Frontend → API

```json
{ "type": "START_SESSION", "session_id": "...", "payload": {} }
{ "type": "VOICE_COMMAND",  "session_id": "...", "payload": { "voice_command": "next step", "screenshot_base64": "..." } }
{ "type": "AUTOFILL_CONFIRM", "session_id": "...", "payload": { "step_index": 2 } }
{ "type": "END_SESSION", "session_id": "...", "payload": {} }
```

### API → Frontend

```json
{ "type": "STEP_UPDATE",        "session_id": "...", "payload": { "instruction_text": "...", "target_x": 0.45, "target_y": 0.32, ... } }
{ "type": "GUARDRAIL_WARNING",  "session_id": "...", "payload": { "warning": "This action is permanent..." } }
{ "type": "AUTOFILL_REQUEST",   "session_id": "...", "payload": { "autofill_value": "...", ... } }
{ "type": "SESSION_COMPLETE",   "session_id": "...", "payload": { "message": "..." } }
{ "type": "ERROR",              "session_id": "...", "payload": { "detail": "..." } }
```

---

## Fetch.ai Agent Addresses

After first run, each agent's address is printed to stdout:

```
INFO:  context_agent  address: agent1q...
INFO:  knowledge_agent address: agent1q...
INFO:  vision_agent   address: agent1q...
```

The Context Agent auto-resolves the other agents' addresses via the shared
`Bureau` — no manual address configuration needed in development.

---

## Deployment (Railway / Render)

Create two services:

**api** — runs `python run_agents.py api`  
**agents** — runs `python run_agents.py agents`

Both services share the same `.env` values (Firebase + Gemini credentials).  
Set `CONTEXT_AGENT_PORT`, `KNOWLEDGE_AGENT_PORT`, `VISION_AGENT_PORT` as env vars
and update `CONTEXT_AGENT_ENDPOINT` in the API service to point to the agents service
internal hostname.
