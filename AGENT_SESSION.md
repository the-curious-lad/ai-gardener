# AI Gardener — Agentic Pair-Programming Session Log

**Project:** AI Gardener (`https://ai-gardener.onrender.com`)  
**Repository:** `https://github.com/the-curious-lad/ai-gardener`  
**Agent Environment:** Google Antigravity IDE  
**Open-Source AI Stack:** `gemma3:4b` (Reasoning, Routing & Vision) + `nomic-embed-text` (768-d Embeddings) via Ollama + MongoDB Atlas Vector Search + Render

---

## Session Overview

This document captures the iterative engineering journey of building, debugging, optimizing, and deploying **AI Gardener** for the **Hacktoberfest 2026 Open-Source AI Challenge Week 1: Touch Grass**.

---

## Phase 1: Initial Prototype & Core 4-Stage Pipeline

### Initial Goal
Build an AI gardening assistant that gets people off their screens and outside into their gardens ("Spend 30 seconds here. Spend the rest outside.") using local open-weight models (`gemma3:4b` and `nomic-embed-text` on Ollama).

### Initial Architecture Built
- **Stage 1 — Query Rewriter & Router (`src/services/context/queryRewriter.js`):** Structured JSON output via `gemma3:4b` + Zod schema validation (`RouterDecisionSchema`) to classify user intent and extract garden context (`preferredPlants`, `location`, `land`, `sunlightHours`, `season`).
- **Stage 2 — Dual-Collection Vector Search (`src/services/vectorSearch/`):** 768-dimensional semantic search across `plant_health_knowledge` (2,174 records across 76 crops) and `climate_location_knowledge` (70 ICAR-CRIDA and meteorological climate records).
- **Stage 3 — Multimodal Photo Reader (`src/services/photo/photoReader.js`):** Leaf symptom and disease extraction using `gemma3:4b` vision.
- **Stage 4 — Phase-Aware Planner (`src/services/planner/plannerService.js`):** Generates daily outdoor tasks (`PLANTING` -> `GROWING` -> `MAINTENANCE`).

---

## Phase 2: Iterating on Context Completeness, Multi-Garden UI & Sequential Tasks

### Key Changes Made During Session
1. **Intent-Aware Context Completeness (`evaluateIntentCompleteness`):**
   - Initially, the router either asked for too few fields before generating a plan or asked for garden dimensions when the user only asked a general question like *"What is photosynthesis?"*.
   - We updated `queryRewriter.js` so initial garden planning strictly requires all 5 essential fields (`preferredPlants`, `location.city`, `land.area`, `sunlightHours`, `season`), while general questions (`GENERAL_CHAT`, `ASK_QUESTION`) and leaf photo uploads (`REPORT_OBSERVATION`) run immediately without blocking.
2. **Deterministic Signal Extractor (`extractDeterministicSignals`):**
   - Small 4B models occasionally dropped a city, state, or number when users provided multiple facts in one sentence (e.g., *"hamirpur , lower himachal pradesh"* or *"grow hibiscus in solan in 100 sq ft"*).
   - We paired `gemma3:4b` with a deterministic regex extractor and a 150+ city/state lookup table (`KNOWN_CITY_STATE_MAP`) so user-provided facts are never lost or re-asked.
3. **Multi-Garden Dashboard & Sequential Task Progression (`public/app.js`):**
   - Added lightweight username/password authentication (`src/controllers/authController.js`), support for up to 3 concurrent gardens per user, and a unified **"GO OUTSIDE · TODAY'S NEXT ACTIONS"** card at the top of the screen.
   - Enforced sequential chronological task completion (`Day 1`, `Day 2`, `Day 3`...) and a **"Done — Generate Next Plan"** button after completing a 5-day batch.

---

## Phase 3: Fixing the Day 6+ Replan & Phase Regression Bug

### The Bug
When clicking *"Done — Generate Next Plan"* after completing Days 1–5, `gemma3:4b` sometimes generated duplicate day labels (`Day 6`, `Day 6`, `Day 7`) or regressed the lifecycle phase back to `PLANTING`.

### The Fix (`39dcb11`)
- Updated `src/prompts/planner.prompt.js` to pass completed task titles as an explicit exclusion list.
- Added deterministic post-processing in `src/services/planner/plannerService.js` to deduplicate tasks against completed history, assign monotonic `Day ${startDay + idx}` labels (`Day 6` through `Day 10`), and transition phases forward (`PLANTING` -> `GROWING` -> `MAINTENANCE`).

---

## Phase 4: Solving Render's 512 MB OOM Crash (371 MB -> 114 MB RAM)

### The Bug
After deploying to Render (`https://ai-gardener.onrender.com`) and connecting to local Ollama via a Cloudflare Tunnel, requests occasionally failed with `HTTP 502 Bad Gateway` and `SyntaxError: Unexpected end of JSON input`.

### Root Cause Discovery
We profiled `process.memoryUsage()` across the entire request pipeline and discovered that `loadKnowledgeCSV()` on the 9.2 MB `plant_health_knowledge.csv` fallback file was allocating **371 MB of V8 heap + RSS memory** because `parseCSV` used character-by-character string concatenation (`currentField += ch`), creating millions of V8 `ConsString` objects and pushing Render's 512 MB container over its memory limit.

### The Fix (`e366c23`, `099d930`, `d14b47a`)
1. **Zero-Copy CSV Parser (`src/utils/csvParser.js`):** Rewrote `parseCSV` using index slicing (`content.slice(fieldStart, i)`) and flat UTF-8 allocation, cutting CSV RAM usage from **371 MB down to 114 MB** (a 69% reduction).
2. **Progressive Filter Relaxation (`src/services/vectorSearch/knowledgeVectorSearch.js`):** Replaced full-collection fallback scans with progressive filter relaxation (`plant + knowledgeTypes` -> `plant only` -> bounded 200-doc slice), keeping steady-state vector search memory at **63 MB**.
3. **NDJSON Streaming & Truncated JSON Repair (`src/services/ai/OllamaProvider.js`, `src/utils/jsonParser.js`):** Switched `OllamaProvider._chat` to `stream: true` so bytes flow continuously across the tunnel (preventing proxy idle timeouts), added stack-based JSON auto-repair (`repairJsonCandidate`), and added a one-click `🔄 Retry Sending` button in the chat UI.
4. **24/7 Hybrid Offline Fallback (`7efa0f0`):** Added graceful fallbacks in `queryRewriter.js`, `gardenOrchestrator.js`, and `photoReader.js` so the live Render deployment works 24/7 even when the local laptop GPU is turned off.

---

## Phase 5: Security Cleanup & 5 Domain Guardrails

### Final Hardening (`471e9c2`, `fa3a5b0`)
1. **Removed Pipeline Inspector (`public/index.html`, `public/app.js`):** Removed the internal debug JSON drawer from the client UI so internal routing and database state are never exposed to end users.
2. **Added 5 Deterministic Domain & Input Guardrails (`src/services/context/queryRewriter.js`, `src/services/planner/plannerService.js`):**
   - **600-Character Cap & Prompt-Injection Fast-Path (0 LLM Calls):** Rejects oversized inputs (`> 600 chars`), non-gardening topics, and prompt-injection attempts in `< 1 ms`.
   - **Physical Sunlight Bounds (`1` to `16` hours/day):** Rejects impossible inputs like *"100 hours of sunlight"* and asks for realistic daily sunlight hours (`1–16h`).
   - **Knowledge-Base Location Verification:** Rejects unknown/fictional locations (e.g., *"Atlantis"*) and suggests supported cities/states.
   - **Supported Plant Verification:** Validates plants against all 76 CSV crops + supported Indian garden plants (`KNOWN_PLANTS_MAP`), rejecting unknown or non-plant items.
   - **Low-Sunlight Crop Mismatch Warning:** Automatically prepends a `⚠️ Sunlight Heads-Up` warning when planning sun-loving crops (`tomato`, `sunflower`, `hibiscus`, etc.) with `< 4 hours` of daily sunlight.
