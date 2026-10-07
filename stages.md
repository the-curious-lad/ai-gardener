# AI Gardener — Build Stages

> Each stage is self-contained. Complete and verify before moving to the next.

---

## Stage 1 · Foundation

**Goal:** Running Express server connected to MongoDB Atlas.

**Create:**
```
src/config/env.js          # load & validate process.env
src/config/db.js           # mongoose connect (garden_app + gardening_knowledge)
src/models/Session.js      # garden_sessions schema
src/models/User.js         # users schema
src/repositories/userRepository.js
src/repositories/sessionRepository.js
src/routes/api.js          # mount all routes
src/app.js                 # express setup
src/server.js              # listen
.env.example
.gitignore
package.json
```

**Endpoints:**
```
POST   /api/sessions               → create session
GET    /api/sessions/:id           → get session + gardenState
POST   /api/sessions/:id/message   → echo message (stub)
```

**Verify:** `npm start` → `POST /api/sessions` returns `{ sessionId }`.

---

## Stage 2 · Query Rewriter & Context Loop

**Goal:** Incremental context extraction, missing-field detection, clarification loop.

**Create:**
```
src/models/schemas.js          # Zod: GardenContext, RouterDecision
src/prompts/queryRewriter.prompt.js
src/services/context/queryRewriter.js
src/controllers/sessionController.js  # wire message endpoint
```

**Logic:**
- Extract entities from user message → merge into `session.gardenState.context`.
- Evaluate required fields: `location`, `land.area`, `sunlightHours`, `preferredPlants`.
- If missing → return `{ status:"NEEDS_CONTEXT", clarificationQuestion }`.
- If complete → return `{ status:"READY", intent, needsPlantKnowledge, needsPlanner }`.
- Never re-ask already-stored fields.

**Verify:** Send "I have land in Gorakhpur" → receive clarification question. Follow up with size + sunlight → receive `status: READY`.

---

## Stage 3 · Unified Knowledge Base & Vector Search

**Goal:** Seed `plant_health_knowledge`, generate embeddings, Atlas Vector Search ready.

**Create:**
```
data/seed_knowledge.json                             # records with varied knowledge_type values
scripts/seed.js                                      # ingest + embed + upsert to plant_health_knowledge
src/services/embeddings/EmbeddingProvider.js         # interface: embedText(text), embedBatch(texts[])
src/services/embeddings/OllamaEmbeddingProvider.js
src/services/embeddings/index.js
src/repositories/plantHealthKnowledgeRepository.js  # upsert, findByType, findByPlant
src/services/vectorSearch/knowledgeVectorSearch.js  # $vectorSearch + knowledge_type pre-filter + cosine fallback
```

**`seed_knowledge.json` record shape:**
```json
{
  "plant": "tomato",
  "knowledge_type": "DISEASE",
  "title": "Early Blight",
  "tags": ["fungal", "leaf-spots"],
  "knowledgeText": "...",
  "structuredData": { "symptoms": [...], "treatment": "..." }
}
```

**Supported `knowledge_type` values:**
```
PLANT_BASIC · PLANTING · SOIL · WATER · SUNLIGHT · CLIMATE
GROWTH_STAGE · NUTRITION · NUTRIENT_DEFICIENCY · HEALTHY_BASELINE
DISEASE · PEST · ENVIRONMENTAL_STRESS · PHYSIOLOGICAL_DISORDER
PREVENTION · MAINTENANCE · HARVESTING
```

**Atlas Index (create in Atlas UI → JSON Editor):**

**Database:** `gardening_knowledge` · **Collection:** `plant_health_knowledge`
**Index name:** `plant_health_knowledge_vector_index`
```json
{
  "fields": [
    { "type": "vector", "path": "embedding", "numDimensions": 768, "similarity": "cosine" },
    { "type": "filter", "path": "plant" },
    { "type": "filter", "path": "knowledge_type" },
    { "type": "filter", "path": "tags" }
  ]
}
```

**`knowledgeVectorSearch` usage:**
```js
knowledgeVectorSearch({
  semanticQuery: "tomato sunlight soil requirements",
  knowledgeTypes: ["PLANT_BASIC", "PLANTING", "SOIL", "SUNLIGHT"],
  plantFilter: "tomato",
  limit: 5
})
```

**Verify:** `node scripts/seed.js` → documents appear in Atlas with `embedding` arrays and `knowledge_type` set. `knowledgeVectorSearch({ semanticQuery: "tomato sunlight needs", knowledgeTypes: ["PLANT_BASIC", "SUNLIGHT"] })` returns ≥1 result.


---

## Stage 4 · Planner & Task Lifecycle

**Goal:** Phase-aware plan generation and task management.

**Create:**
```
src/prompts/planner.prompt.js
src/services/planner/plannerService.js
src/controllers/taskController.js
src/routes/api.js  # add task routes
```

**Task statuses:** `PENDING | IN_PROGRESS | COMPLETED | RESCHEDULED | FAILED`

**Phases:** `PLANTING | GROWING | MAINTENANCE` (instruction sets, not agents)

**Endpoints:**
```
GET  /api/sessions/:id/tasks      → list tasks
POST /api/tasks/:taskId/complete  → mark complete, trigger replan
```

**Planner input:** `{ gardenState, retrievedKnowledge, conversationHistory }`
**Planner output (Zod-validated):** `{ updatedPhase, tasks[], currentPlan, summary }`

**Verify:** Complete Stage 2 flow → Planner returns a 7-day plan with ≥3 tasks.

---

## Stage 5 · Ollama / Gemma 3 AI Provider

**Goal:** Clean AI abstraction over Ollama, structured JSON output with validation.

**Create:**
```
src/services/ai/AIProvider.js              # interface: generateText, analyzeImage, generateStructuredOutput
src/services/ai/OllamaProvider.js          # calls http://localhost:11434
src/services/ai/index.js
src/prompts/directAnswer.prompt.js
src/utils/jsonParser.js                    # safe LLM JSON extract + Zod validate
src/utils/logger.js
```

**Env vars used:** `OLLAMA_BASE_URL`, `OLLAMA_MODEL=gemma3:4b`

**Rules:**
- All LLM calls go through `AIProvider` only — never raw `fetch` to Ollama elsewhere.
- `generateStructuredOutput` retries once on invalid JSON before throwing.

**Verify:** `generateText("Say hello")` returns a string. `generateStructuredOutput` with a Zod schema returns a validated object.

---

## Stage 6 · Photo Upload & Vision Analysis

**Goal:** Multimodal image analysis → structured observation (never DB mutation).

**Create:**
```
src/services/photo/photoReader.js
src/prompts/photoReader.prompt.js
src/models/schemas.js  # add PhotoObservation Zod schema
src/routes/api.js      # add photo route
```

**Endpoint:** `POST /api/sessions/:id/photo` (multipart, `multer` in-memory)

**PhotoObservation schema:**
```js
{
  plantDetected, visibleSymptoms[], leafCondition,
  possibleDiseaseSigns[], growthStageEstimate,
  severity, confidence, uncertainties[]
}
```

**Rules:**
- Vision model returns observation only.
- Observation stored in `session.gardenState.photoObservations[]`.
- DB state mutated only after Planner evaluation (Stage 8).

**Verify:** Upload a leaf photo → receive structured JSON observation with `confidence` field.

---

## Stage 7 · Expand Health Knowledge & Verify Symptom Retrieval

**Goal:** Add disease, pest, nutrient-deficiency, and healthy-baseline records to `plant_health_knowledge`. No new collection or index needed.

**Add to `data/seed_knowledge.json`:** records with these `knowledge_type` values:
```
DISEASE · PEST · NUTRIENT_DEFICIENCY · ENVIRONMENTAL_STRESS
PHYSIOLOGICAL_DISORDER · HEALTHY_BASELINE
```

**Re-run seed:** `node scripts/seed.js` — new records embedded and upserted into `plant_health_knowledge`.

**Query Rewriter routing table (photo/symptom path):**
```
"My tomato leaves have yellow spots" + photo
  → knowledgeTypes: ["DISEASE", "PEST", "NUTRIENT_DEFICIENCY",
                     "ENVIRONMENTAL_STRESS", "HEALTHY_BASELINE"]
  → plantFilter: "tomato"
```

**Verify:** `knowledgeVectorSearch({ semanticQuery: "yellowing leaves brown circular spots tomato", knowledgeTypes: ["DISEASE", "NUTRIENT_DEFICIENCY"] })` returns early blight or similar record.

---

## Stage 8 · Full Orchestration Loop

**Goal:** Wire the complete KNOW → PLAN → ACT → OBSERVE → UPDATE cycle.

**Create:**
```
src/services/orchestrator/gardenOrchestrator.js
```

**Flow:**
```
Message/Photo
  → QueryRewriter (intent + context check)
  → [if NEEDS_CONTEXT] → clarificationQuestion → return
  → [if needsPhotoAnalysis] → PhotoReader → PhotoObservation
  → [if needsKnowledge] → knowledgeVectorSearch({ semanticQuery, knowledgeTypes, plantFilter })
  → Planner (gardenState + retrievedKnowledge + observation)
  → Zod validate PlannerOutput
  → sessionRepository.update (single atomic write)
  → return response to user
```

**Rules:**
- Only Orchestrator calls `sessionRepository.update`.
- Planner never directly writes to DB.
- Phase transitions only happen inside Planner logic.
- Vision model never triggers DB mutation — only produces a `PhotoObservation`.

**Verify:** Run demo path 1 (clarification → plan) and demo path 2 (photo → knowledge search → replan) end-to-end via API.

---

## Stage 9 · Frontend & Deployment

**Goal:** Minimal "Touch Grass" UI + Render deployment config.

**Create:**
```
public/index.html    # chat window, photo upload, current tasks card
public/styles.css    # clean, mobile-friendly, earthy palette
public/app.js        # fetch-based API calls, no framework
render.yaml          # Render web service config
README.md            # polished, judge-ready (already created)
scripts/demo-path-1.js
scripts/demo-path-2.js
```

**UI Components (keep minimal):**
- **Action Card** — today's top task, "I did it" button.
- **Chat** — message input + photo attach.
- **Plan View** — current X-day plan, task list.

**Render config:** single Node.js web service, env vars via Render dashboard.

**Verify:** `npm start` → open `localhost:3000` → complete demo path 1 through the UI.

---

## Stage Completion Checklist

| Stage | Description                                 | Status |
|-------|---------------------------------------------|--------|
| 1     | Foundation & MongoDB                        | `[x]`  |
| 2     | Query Rewriter & Context Loop               | `[x]`  |
| 3     | Unified Knowledge Base & Vector Search      | `[x]`  |
| 4     | Planner & Task Lifecycle                    | `[x]`  |
| 5     | Ollama / Gemma 3 AI Provider                | `[x]`  |
| 6     | Photo Upload & Vision Analysis              | `[x]`  |
| 7     | Health Knowledge Expansion & Symptom Search | `[x]`  |
| 8     | Full Orchestration Loop                     | `[x]`  |
| 9     | Frontend & Deployment                       | `[x]`  |

