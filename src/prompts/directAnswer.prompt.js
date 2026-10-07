'use strict';

const config = require('../config/env');

const SYSTEM_PROMPT = `You are "AI Gardener", a concise, practical, outdoor-first gardening assistant.
Use the provided garden context, compact context summary, retrieved plant_health_knowledge, and retrieved climate_location_knowledge to answer the user's question accurately.

Rules:
- Keep answers concise (2–4 sentences) so the user can get back outside quickly.
- Base technical advice on the retrieved plant_health_knowledge and climate_location_knowledge records when provided.
- If frost_risk or heat_risk is UNKNOWN in climate knowledge, do not assume risk is low.
- If the user asks about plant symptoms, explain possible causes and practical checks without claiming 100% medical certainty.
- Never invent chemical treatments not supported by standard gardening practice.

What you must NOT do:
- DO NOT answer questions unrelated to gardening, plants, soil, climate/weather for growing, or the user's active garden plan (e.g., coding, math, sports, politics, movies, cooking recipes). If an off-topic query ever reaches you, politely decline in 1–2 sentences and redirect the user to their garden plan.
- DO NOT reply in a generic way that ignores the user's known GARDEN CONTEXT (always tailor your answer to their city/state, season, and plants when known).
- DO NOT re-ask the user for information already listed in GARDEN CONTEXT or COMPACT CONTEXT SUMMARY.`;

/**
 * Build a grounded prompt combining garden context, compact context summary,
 * retrieved plant health knowledge, retrieved climate/location knowledge, and user message.
 *
 * @param {object} context
 * @param {object[]} retrievedKnowledge
 * @param {string} userMessage
 * @param {object[]} [retrievedClimateKnowledge=[]]
 * @param {object|null} [session=null]
 * @returns {string}
 */
function buildDirectAnswerPrompt(
  context = {},
  retrievedKnowledge = [],
  userMessage = '',
  retrievedClimateKnowledge = [],
  session = null
) {
  const ctxParts = [];
  if (context.location?.city) {
    ctxParts.push(`Location: ${context.location.city}${context.location.country ? ', ' + context.location.country : ''}`);
  }
  if (context.season) ctxParts.push(`Season: ${context.season}`);
  if (context.preferredPlants?.length) ctxParts.push(`Plants: ${context.preferredPlants.join(', ')}`);
  if (context.sunlightHours != null) ctxParts.push(`Sunlight: ${context.sunlightHours}h/day`);
  if (context.land?.area != null) ctxParts.push(`Land: ${context.land.area} ${context.land.unit || 'sq_ft'}`);

  const gs = session?.gardenState ?? {};
  const compactSummary = gs.contextSummary?.trim()
    ? gs.contextSummary.trim()
    : 'None yet';

  const windowSize = config.summarizer?.recentMessagesWindow ?? 4;
  const recentChat = (session?.conversationHistory ?? [])
    .slice(-windowSize)
    .map((m) => `  ${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n');

  const knowledgeStr = retrievedKnowledge.length
    ? retrievedKnowledge
        .map((k, i) => {
          const title = k.topic || k.title || k.problem_name || k.knowledge_type;
          const text = (k.knowledge_text || k.knowledgeText || '').slice(0, 450);
          const source = k.source_name ? ` [Source: ${k.source_name}]` : '';
          return `[P${i + 1}] (${k.record_id || k.knowledge_type} | ${k.knowledge_type}) ${title}: ${text}${source}`;
        })
        .join('\n')
    : 'No plant_health_knowledge records retrieved.';

  const climateStr = retrievedClimateKnowledge.length
    ? retrievedClimateKnowledge
        .map((c, i) => {
          const loc = [c.location_name, c.subregion, c.region, c.country].filter(Boolean).join(', ');
          const text = (c.knowledge_text || '').slice(0, 450);
          const source = c.source_name ? ` [Source: ${c.source_name}]` : '';
          return `[C${i + 1}] (${c.record_id} | ${c.knowledge_type} | Season: ${c.normalized_season || 'N/A'}) ${loc}: ${text}${source}`;
        })
        .join('\n')
    : 'No climate_location_knowledge records retrieved.';

  return `${SYSTEM_PROMPT}

GARDEN CONTEXT:
${ctxParts.length ? ctxParts.join(' | ') : 'None yet'}

COMPACT CONTEXT SUMMARY:
${compactSummary}

RECENT CONVERSATION (last ${windowSize}):
${recentChat || '  None'}

RETRIEVED PLANT HEALTH KNOWLEDGE:
${knowledgeStr}

RETRIEVED CLIMATE & LOCATION KNOWLEDGE:
${climateStr}

USER QUESTION:
${userMessage}

CONCISE ANSWER:`;
}

module.exports = { SYSTEM_PROMPT, buildDirectAnswerPrompt };
