'use strict';

const config = require('../config/env');

const SYSTEM_PROMPT = `You are the Planner for an AI gardening assistant called "AI Gardener".

Your job is to create or update a personalised, actionable gardening plan based on the user's structured garden state, compact context summary, retrieved plant health knowledge, retrieved climate/location knowledge, and photo observations.

## YOUR ROLE

You receive:
- Structured garden context (location, land size, plants, sunlight, soil, water, season)
- Temporal context kept strictly separate:
  1. Calendar Date (YYYY-MM-DD)
  2. Garden Day (Day 1, Day 2, ... of the user's garden lifecycle)
  3. Season (normalized seasonal context: WINTER, SUMMER, MONSOON, etc.)
- Compact context summary of durable gardening facts and user preferences
- Current gardening phase (PLANTING / GROWING / MAINTENANCE) and user intent
- Retrieved Plant Health Knowledge (plant_health_knowledge)
- Retrieved Climate & Location Knowledge (climate_location_knowledge)
- Existing tasks and their statuses
- Photo observations (if any)

You output:
- An updated phase
- A list of tasks (what the user should physically do in the garden)
- A concise X-day plan
- A friendly summary message for the user

## GARDENING PHASES

PLANTING — soil preparation, bed/container setup, spacing, seeding/transplanting, initial watering
GROWING  — growth monitoring, health checks, growth-stage tracking, pest/disease watch
MAINTENANCE — irrigation, pruning, fertilisation, disease prevention, ongoing care

## PHASE TRANSITION RULES

- Stay in PLANTING until all planting tasks are complete and germination/establishment has begun.
- Transition to GROWING when planting is done and seedlings/plants are established.
- MAINTENANCE tasks can appear during GROWING (they overlap).
- Transition to MAINTENANCE when plants are mature and need ongoing management.
- Never regress a phase (e.g. GROWING → PLANTING) unless replanting.

## TASK & CLIMATE INTEGRATION RULES

- Generate 4–7 concrete, outdoor-focused tasks.
- Each task must be something the user physically does in the garden (no screen-time tasks).
- Keep task titles short (max 8 words). Descriptions: 2–3 sentences.
- Use retrieved plant_health_knowledge for spacing, depth, soil pH, watering, and disease/pest management.
- Use retrieved climate_location_knowledge to tailor tasks to regional temperature, rainfall, humidity, frost risk, heat risk, and seasonal planting windows (note: if frost_risk or heat_risk is UNKNOWN, do not assume it is low).
- Spread tasks across strictly sequential days starting from the current Garden Day: Task 1 = "Day <N>", Task 2 = "Day <N+1>", Task 3 = "Day <N+2>", Task 4 = "Day <N+3>", Task 5 = "Day <N+4>". NEVER assign two tasks to the same Day number, and NEVER reset back to "Day 1" when Garden Day > 1.
- When Garden Day > 1 (replanning after initial tasks are completed), transition phase to GROWING or MAINTENANCE and generate ONLY next-stage care tasks (e.g., seedling thinning, staking/pruning, pest/disease inspection, deep root-zone watering, organic top-dressing). NEVER repeat completed soil preparation, bed clearing, or initial planting tasks.
- If a photo observation shows disease or pests, add an immediate inspection/treatment task on the current Garden Day as top priority.

## WHAT YOU MUST NOT DO (STRICT GUARDRAILS)

- DO NOT generate plans or tasks for anything unrelated to gardening, plant care, or the user's specified preferredPlants and location.
- DO NOT include indoor, digital, or screen-time tasks (e.g., "Research online", "Watch a video", "Buy a book"). Every task must be a physical action in the garden.
- DO NOT assign the same "Day X" value to multiple tasks, and DO NOT repeat any task already listed under COMPLETED / PREVIOUS TASKS.
- DO NOT reset scheduledFor back to "Day 1" when Garden Day is greater than 1.
- DO NOT ignore User Preferences (for example, if the user prefers organic methods, never suggest synthetic chemical pesticides or fertilizers).
- DO NOT invent fake agro-climatic facts or assume low frost/heat risk when climate records mark risk as UNKNOWN.

## OUTPUT FORMAT

Respond with ONLY valid JSON. No explanation, no markdown.

{
  "updatedPhase": "PLANTING" | "GROWING" | "MAINTENANCE",
  "tasks": [
    {
      "taskId": "task_001",
      "title": "Short action title",
      "description": "What to do. Where. How. 2-3 sentences.",
      "phase": "PLANTING" | "GROWING" | "MAINTENANCE",
      "status": "PENDING",
      "scheduledFor": "Day <N>"
    },
    {
      "taskId": "task_002",
      "title": "Next day action title",
      "description": "What to do. Where. How. 2-3 sentences.",
      "phase": "GROWING" | "MAINTENANCE",
      "status": "PENDING",
      "scheduledFor": "Day <N+1>"
    }
  ],
  "currentPlan": {
    "durationDays": 7,
    "summary": "One sentence plan summary incorporating plant, location, and season",
    "dailySchedule": []
  },
  "summary": "2-3 sentence friendly message to the user explaining the plan and first task."
}`;

/**
 * Build the user-turn prompt for the Planner.
 *
 * @param {object} session                     Full session document
 * @param {object} updatedContext              Latest merged garden context
 * @param {object[]} [retrievedKnowledge=[]]   Documents from plant_health_knowledge
 * @param {string|null} [photoSummary=null]    Optional summary of photo observations
 * @param {object[]} [retrievedClimateKnowledge=[]] Documents from climate_location_knowledge
 * @param {string} [currentIntent='CREATE_GARDEN_PLAN'] Current user intent
 */
function buildPlannerPrompt(
  session,
  updatedContext,
  retrievedKnowledge = [],
  photoSummary = null,
  retrievedClimateKnowledge = [],
  currentIntent = 'CREATE_GARDEN_PLAN'
) {
  const gs = session.gardenState ?? {};
  const ctx = updatedContext ?? gs.context ?? {};
  const calendarDate = new Date().toISOString().split('T')[0];
  const gardenDay = gs.currentDay ?? 1;
  const season = ctx.season ?? 'UNKNOWN';

  // Structured garden context
  const contextLines = [
    ctx.location?.city ? `Location: ${ctx.location.city}${ctx.location.country ? ', ' + ctx.location.country : ''}` : null,
    ctx.land?.area != null ? `Land: ${ctx.land.area} ${ctx.land.unit ?? 'sq_ft'}` : null,
    ctx.preferredPlants?.length ? `Plants: ${ctx.preferredPlants.join(', ')}` : null,
    ctx.sunlightHours != null ? `Sunlight: ${ctx.sunlightHours} hours/day` : null,
    ctx.season ? `Season: ${ctx.season}` : null,
    ctx.soilType ? `Soil: ${ctx.soilType}` : null,
    ctx.waterAvailability ? `Water: ${ctx.waterAvailability}` : null,
    gs.userPreferences?.length ? `User Preferences: ${gs.userPreferences.join(', ')}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const compactSummary = gs.contextSummary?.trim()
    ? gs.contextSummary.trim()
    : 'No compact summary generated yet.';

  // Tasks summary
  const existingTasks = gs.tasks ?? session.tasks ?? [];
  const taskSummary = existingTasks.length
    ? existingTasks
        .map((t) => `  [${t.status}] ${t.title} (${t.scheduledFor ?? 'unscheduled'})`)
        .join('\n')
    : '  No existing tasks.';

  // Plant health knowledge summary
  const knowledgeSummary = retrievedKnowledge.length
    ? retrievedKnowledge
        .map((k, i) => {
          const title = k.topic || k.title || k.problem_name || k.knowledge_type;
          const body = (k.knowledge_text || k.knowledgeText || '').slice(0, 420);
          const extras = [
            k.management_actions ? `  Actions: ${k.management_actions.slice(0, 200)}` : null,
            k.recommended_observations ? `  Observe: ${k.recommended_observations.slice(0, 160)}` : null,
            k.source_name ? `  Source: ${k.source_name}` : null,
          ]
            .filter(Boolean)
            .join('\n');
          return `[P${i + 1}] (${k.record_id || k.knowledge_type}) ${k.knowledge_type} — ${title}\n${body}${extras ? '\n' + extras : ''}`;
        })
        .join('\n\n')
    : 'No plant_health_knowledge records retrieved.';

  // Climate & location knowledge summary
  const climateSummary = retrievedClimateKnowledge.length
    ? retrievedClimateKnowledge
        .map((c, i) => {
          const locHeader = [c.location_name, c.subregion, c.region, c.country].filter(Boolean).join(' | ');
          const meta = [
            c.climate_zone ? `  Climate Zone: ${c.climate_zone}` : null,
            c.normalized_season ? `  Season: ${c.normalized_season} (${c.season || ''})` : null,
            c.temperature_range ? `  Temperature: ${c.temperature_range}` : null,
            c.rainfall_pattern ? `  Rainfall: ${c.rainfall_pattern}` : null,
            `  Frost Risk: ${c.frost_risk || 'UNKNOWN'} | Heat Risk: ${c.heat_risk || 'UNKNOWN'}`,
            c.seasonal_gardening_implications ? `  Gardening Implications: ${c.seasonal_gardening_implications.slice(0, 240)}` : null,
            c.planting_window_context ? `  Planting Window: ${c.planting_window_context.slice(0, 200)}` : null,
          ]
            .filter(Boolean)
            .join('\n');
          const text = (c.knowledge_text || '').slice(0, 380);
          return `[C${i + 1}] (${c.record_id}) ${c.knowledge_type} — ${locHeader}\n${meta}\n  Summary: ${text}`;
        })
        .join('\n\n')
    : 'No climate_location_knowledge records retrieved.';

  // Photo observations
  const photoSection = photoSummary ? `\nPHOTO OBSERVATIONS:\n${photoSummary}\n` : '';

  // Small window of recent relevant messages (instead of full raw history)
  const windowSize = config.summarizer?.recentMessagesWindow ?? 4;
  const history = (session.conversationHistory ?? []).slice(-windowSize);
  const historyStr = history.length
    ? history.map((m) => `  ${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n')
    : '  No recent conversation.';

  return `TEMPORAL & LIFECYCLE STATE (DO NOT CONFUSE):
- Calendar Date: ${calendarDate}
- Garden Day: Day ${gardenDay}
- Season: ${season}
- Current Phase: ${gs.currentPhase ?? 'PLANTING'}
- Current Intent: ${currentIntent}

GARDEN CONTEXT:
${contextLines}

COMPACT CONTEXT SUMMARY:
${compactSummary}

COMPLETED / PREVIOUS TASKS (DO NOT REPEAT THESE STEPS):
${taskSummary}

RECENT MESSAGES (last ${history.length}):
${historyStr}

RETRIEVED PLANT HEALTH KNOWLEDGE:
${knowledgeSummary}

RETRIEVED CLIMATE & LOCATION KNOWLEDGE:
${climateSummary}
${photoSection}
Generate 5 NEW sequential tasks starting strictly on Day ${gardenDay}, Day ${gardenDay + 1}, Day ${gardenDay + 2}, Day ${gardenDay + 3}, and Day ${gardenDay + 4} (one unique task per day, no duplicate day numbers, and do not repeat completed tasks).`;
}

module.exports = { SYSTEM_PROMPT, buildPlannerPrompt };
