'use strict';

const config = require('../config/env');

const SYSTEM_PROMPT = `You are the Photo Reader (vision observation module) for "AI Gardener".
Your ONLY job is to inspect the uploaded plant photograph and output a structured JSON observation.

CRITICAL RULES:
- You are an observation system, NOT a final decision maker or medical diagnostician.
- Do NOT prescribe treatments, change gardening phases, or claim 100% certainty.
- Report what is visually observable on the leaves, stems, soil, or fruit.
- Always provide a realistic confidence score between 0.0 and 1.0 and list any visual uncertainties (e.g., lighting, blur, angle, multiple possible causes).`;

/**
 * Build the vision prompt for Gemma 3 4B using relevant garden context,
 * compact contextSummary, and only recent relevant messages.
 *
 * @param {object} session   Current session document
 * @param {string} [userNote] Optional message sent alongside the photo
 * @returns {string}
 */
function buildPhotoPrompt(session = {}, userNote = '') {
  const gs = session.gardenState ?? {};
  const ctx = gs.context ?? {};
  const expectedPlants = ctx.preferredPlants?.length
    ? ctx.preferredPlants.join(', ')
    : 'unknown';
  const locationStr = ctx.location?.city
    ? `${ctx.location.city}${ctx.location.country ? ', ' + ctx.location.country : ''}`
    : 'unknown';
  const seasonStr = ctx.season || 'unknown';
  const currentPhase = gs.currentPhase ?? 'PLANTING';
  const currentDay = gs.currentDay ?? 1;

  const prevObs = (gs.photoObservations ?? [])
    .slice(-2)
    .map((o, idx) => `  [${idx + 1}] Plant: ${o.plantDetected}, Symptoms: ${(o.visibleSymptoms || []).join(', ') || 'none'}, Severity: ${o.severity}`)
    .join('\n');

  const compactSummary = gs.contextSummary?.trim()
    ? gs.contextSummary.trim()
    : '  None generated yet.';

  const windowSize = config.summarizer?.recentMessagesWindow ?? 4;
  const recentChat = (session.conversationHistory ?? [])
    .slice(-windowSize)
    .map((m) => `  ${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n');

  return `${SYSTEM_PROMPT}

GARDEN CONTEXT:
- Location: ${locationStr}
- Season: ${seasonStr}
- Expected plant(s): ${expectedPlants}
- Sunlight: ${ctx.sunlightHours != null ? ctx.sunlightHours + ' hours/day' : 'unknown'}
- Current phase: ${currentPhase} (Day ${currentDay})
- Previous photo observations:
${prevObs || '  None recorded yet.'}

COMPACT CONTEXT SUMMARY:
${compactSummary}

RECENT RELEVANT MESSAGES (last ${windowSize}):
${recentChat || '  No prior messages.'}
${userNote ? `\nCURRENT PHOTO CAPTION / USER NOTE: "${userNote}"` : ''}

Analyze the attached plant image and respond with ONLY a valid JSON object matching this exact structure:
{
  "plantDetected": "common plant name in lowercase or null",
  "visibleSymptoms": ["symptom 1", "symptom 2"],
  "leafCondition": "healthy" | "abnormal" | "wilting" | "spotted" | "yellowing" | "curled",
  "possiblePestSigns": ["visual pest indicator if any"],
  "possibleDiseaseSigns": ["visual disease pattern if any, e.g. fungal-like leaf spotting"],
  "growthStageEstimate": "seedling" | "vegetative" | "flowering" | "fruiting" | "mature",
  "severity": "none" | "mild" | "moderate" | "severe",
  "confidence": 0.0 to 1.0,
  "uncertainties": ["reason 1 why certainty is limited"]
}`;
}

module.exports = { SYSTEM_PROMPT, buildPhotoPrompt };
