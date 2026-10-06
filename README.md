<div align="center">

# 🌱 AI Gardener — *Touch Grass*

**Hacktoberfest 2026 · Week 1**

*An open-source AI gardening assistant that gets you off the screen and into the soil.*

[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![MongoDB Atlas](https://img.shields.io/badge/MongoDB-Atlas-47A248?logo=mongodb&logoColor=white)](https://www.mongodb.com/atlas)
[![Gemma 3](https://img.shields.io/badge/Gemma-3%204B-4285F4?logo=google&logoColor=white)](https://ai.google.dev/gemma)
[![Ollama](https://img.shields.io/badge/Powered%20by-Ollama-black?logo=ollama)](https://ollama.com)
[![Render](https://img.shields.io/badge/Deploy-Render-46E3B7?logo=render&logoColor=white)](https://render.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Hacktoberfest](https://img.shields.io/badge/Hacktoberfest-2026-FF6A00)](https://hacktoberfest.com)

</div>

---

## ✨ The Idea

Most AI tools keep you glued to a screen.

**AI Gardener flips that.**

You spend 30 seconds telling it about your garden. It gives you one clear task for today. You go outside, do it, come back, and optionally snap a photo of your plant. The AI analyzes the photo, checks its knowledge base for diseases or care tips, and gives you tomorrow's task.

**The screen is the shortest part of the experience.**

---

## 🎯 Prize Categories

| Category | How We Qualify |
|---|---|
| 🏆 **Overall** | Genuinely useful open-source project with real-world impact |
| 🍃 **MongoDB Atlas** | Dual-database design + two Atlas Vector Search indexes for semantic plant & disease retrieval |
| 🤖 **Gemma** | Gemma 3 4B (via Ollama) used for both text reasoning and multimodal photo analysis |
| ☁️ **Render** | Single-click deploy via `render.yaml`; no cloud AI APIs required |

> Every technology in this stack has a genuine functional role — nothing was added for prize hunting.

---

## 🔄 How It Works

```
You tell it about your garden
        ↓
AI asks only what it needs to know
        ↓
Retrieves planting knowledge (Vector Search)
        ↓
Builds your personalised X-day plan
        ↓
You go outside and complete a task ← THE WHOLE POINT
        ↓
You snap a photo of your plant
        ↓
Gemma 3 analyses the image → structured observation
        ↓
AI searches disease knowledge (second Vector Search)
        ↓
Planner updates your garden state & next tasks
        ↓
Repeat
```

---

## 🧠 Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Express API Layer                     │
└──────────────────────────┬──────────────────────────────┘
                           │
              ┌────────────▼────────────┐
              │   Query Rewriter &      │
              │   Context Manager       │  ← Heart of the system
              └──┬──────────┬───────────┘
                 │          │
        ┌────────▼─┐   ┌────▼───────┐
        │  Photo   │   │  Planner   │  ← Phase-aware decision maker
        │  Reader  │   │  Executor  │
        │(Gemma 3) │   └────┬───────┘
        └────┬─────┘        │
             │         ┌────▼──────────────────┐
        Observation    │   MongoDB Atlas        │
             │         │  ┌─────────────────┐  │
             └────────►│  │ Vector Search   │  │
                        │  │  Plant (Path A) │  │
                        │  │  Disease(Path B)│  │
                        │  └─────────────────┘  │
                        │  garden_sessions       │
                        │  plant_knowledge       │
                        │  disease_knowledge     │
                        └───────────────────────┘
```

### Key Design Principles

- **One backend, no microservices.** All logical components are clean internal modules.
- **Vision is observational only.** A photo never directly mutates the database. It produces an observation → Planner evaluates → state updates.
- **Minimum sufficient context.** The Query Rewriter collects only what it needs, never re-asks what it knows.
- **Modular AI layer.** Swap Gemma 3 / Ollama for any other model without touching application logic.
- **Validated LLM outputs.** Every structured AI response is validated with Zod before any database write.

---

## 🗂️ Project Structure

```
ai-gardener/
├── data/
│   ├── seed_plants.json         # Plant knowledge base
│   └── seed_diseases.json       # Disease knowledge base
├── scripts/
│   ├── seed.js                  # Ingest knowledge + generate embeddings
│   ├── demo-path-1.js           # Demo: clarification → plan
│   └── demo-path-2.js           # Demo: photo → disease → replan
├── public/                      # Minimal frontend (Vanilla JS)
│   ├── index.html
│   ├── styles.css
│   └── app.js
└── src/
    ├── config/                  # Env + DB connection
    ├── models/                  # Zod schemas + Mongoose models
    ├── prompts/                 # Versioned LLM prompts
    ├── repositories/            # All DB operations
    ├── services/
    │   ├── ai/                  # AIProvider → OllamaProvider (Gemma 3)
    │   ├── embeddings/          # EmbeddingProvider → OllamaEmbeddingProvider
    │   ├── vectorSearch/        # Plant (Path A) + Disease (Path B) search
    │   ├── context/             # Query Rewriter & clarification loop
    │   ├── photo/               # Photo Reader (Gemma 3 multimodal)
    │   ├── planner/             # Phase-aware Planner
    │   └── orchestrator/        # KNOW→PLAN→ACT→OBSERVE→UPDATE loop
    ├── controllers/
    ├── routes/
    └── utils/
```

---

## 🚀 Quick Start

### Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | 20+ | — |
| npm | 9+ | — |
| Ollama | latest | [Install](https://ollama.com/download) |
| MongoDB Atlas | — | Free tier works |

### 1 · Clone & Install

```bash
git clone https://github.com/your-username/ai-gardener.git
cd ai-gardener
npm install
```

### 2 · Set Up Ollama

```bash
# Install Ollama (if not installed)
# https://ollama.com/download

# Pull the models
ollama pull gemma3:4b
ollama pull nomic-embed-text

# Verify Ollama is running
ollama list
```

### 3 · Set Up MongoDB Atlas

1. Create a free cluster at [mongodb.com/atlas](https://www.mongodb.com/atlas).
2. Create two databases: `garden_app` and `gardening_knowledge`.
3. Copy your connection string.
4. Create **two Vector Search indexes** (see below).

### 4 · Configure Environment

```bash
cp .env.example .env
# Edit .env with your MongoDB URI and settings
```

```env
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/
MONGODB_APP_DB=garden_app
MONGODB_KNOWLEDGE_DB=gardening_knowledge
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=gemma3:4b
EMBEDDING_MODEL=nomic-embed-text
EMBEDDING_DIMENSIONS=768
PORT=3000
```

### 5 · Seed Knowledge Base

```bash
node scripts/seed.js
```

This ingests plant and disease knowledge into MongoDB, generates embeddings via Ollama, and prepares Vector Search documents.

### 6 · Start the Server

```bash
npm start
# Server running at http://localhost:3000
```

---

## 🔍 MongoDB Atlas Vector Search Setup

Create these indexes in the Atlas UI under **Search → Create Index → JSON Editor**.

### Index 1 — Plant Knowledge

**Database:** `gardening_knowledge` · **Collection:** `plant_knowledge`
**Index name:** `plant_knowledge_vector_index`

```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 768,
      "similarity": "cosine"
    },
    { "type": "filter", "path": "plant" },
    { "type": "filter", "path": "season" }
  ]
}
```

### Index 2 — Disease Knowledge

**Database:** `gardening_knowledge` · **Collection:** `disease_knowledge`
**Index name:** `disease_knowledge_vector_index`

```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 768,
      "similarity": "cosine"
    },
    { "type": "filter", "path": "plant" }
  ]
}
```

> **Note:** Both vector search services include an automatic in-memory cosine similarity fallback while Atlas indexes are building, so local development never breaks.

---

## 📡 API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/sessions` | Create a new garden session |
| `GET` | `/api/sessions/:id` | Get session state & garden context |
| `POST` | `/api/sessions/:id/message` | Send a chat message |
| `POST` | `/api/sessions/:id/photo` | Upload a plant photo for analysis |
| `GET` | `/api/sessions/:id/tasks` | List all tasks |
| `POST` | `/api/tasks/:taskId/complete` | Mark a task complete & trigger replan |

### Example: Start a Garden

```bash
# Create session
curl -X POST http://localhost:3000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"userId": "user_1"}'

# Send first message (triggers clarification loop)
curl -X POST http://localhost:3000/api/sessions/SESSION_ID/message \
  -H "Content-Type: application/json" \
  -d '{"message": "I have some land in Gorakhpur and want to grow tomatoes"}'
```

```json
{
  "reply": "Great! How large is your growing area, and approximately how many hours of direct sunlight does it receive each day?",
  "status": "NEEDS_CONTEXT"
}
```

### Example: Upload a Photo

```bash
curl -X POST http://localhost:3000/api/sessions/SESSION_ID/photo \
  -F "photo=@tomato_leaf.jpg" \
  -F "message=My tomato leaves look strange"
```

```json
{
  "observation": {
    "plantDetected": "tomato",
    "visibleSymptoms": ["yellowing lower leaves", "brown circular spots"],
    "possibleDiseaseSigns": ["fungal-like leaf spotting"],
    "severity": "moderate",
    "confidence": 0.71,
    "uncertainties": ["Image resolution limits certainty"]
  },
  "recommendation": "The observation suggests possible early blight. I've retrieved the relevant care guidance and updated your tasks.",
  "updatedTasks": [...]
}
```

---

## 🪴 Gardening Phases

The system guides you through three phases automatically:

| Phase | Focus |
|-------|-------|
| **🌱 PLANTING** | Choosing plants, soil prep, spacing, initial watering |
| **🌿 GROWING** | Growth monitoring, health checks, growth-stage tracking |
| **✂️ MAINTENANCE** | Irrigation, pruning, fertilisation, disease prevention |

Phase transitions are decided by the **Planner** using observations + plant timelines + retrieved knowledge — never triggered directly by a photo.

---

## 🤝 Contributing

This project was built for Hacktoberfest 2026. All contributions welcome!

1. Fork the repo
2. Create a branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m 'Add some feature'`
4. Push to the branch: `git push origin feature/your-feature`
5. Open a Pull Request

### Good First Issues
- Add more plants to `data/seed_plants.json`
- Add more diseases to `data/seed_diseases.json`
- Improve prompt quality in `src/prompts/`
- Add unit tests for the Query Rewriter
- Improve UI in `public/`

---

## 📄 License

MIT © 2026 — Built with 🌱 for Hacktoberfest

---

<div align="center">

**Go touch grass. The AI will keep track of everything else.**

</div>
