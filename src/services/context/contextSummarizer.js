'use strict';

const config = require('../../config/env');
const ai = require('../ai');
const logger = require('../../utils/logger');

/**
 * Detect whether a meaningful garden-state change occurred during this turn.
 *
 * Meaningful changes defined by architecture spec:
 *  - new plant added (preferredPlants or plantsGrowing)
 *  - location changed
 *  - land size changed
 *  - sunlight information added/changed
 *  - season added/changed
 *  - soil information added/changed
 *  - water availability added/changed
 *  - new important observation
 *  - photo observation
 *  - new plan created / plan significantly changed
 *  - phase transition
 *  - important user preference discovered
 *
 * @param {object} params
 * @param {object} params.prevSession
 * @param {object} params.updatedContext
 * @param {string} [params.updatedPhase]
 * @param {object} [params.planOutput]
 * @param {object} [params.photoObservation]
 * @param {string[]} [params.updatedObservations]
 * @param {string[]} [params.updatedPreferences]
 * @returns {{ changed: boolean, reasons: string[] }}
 */
function detectMeaningfulStateChange({
  prevSession = {},
  updatedContext = {},
  updatedPhase = null,
  planOutput = null,
  photoObservation = null,
  updatedObservations = null,
  updatedPreferences = null,
}) {
  const reasons = [];
  const prevGs = prevSession.gardenState ?? {};
  const prevCtx = prevGs.context ?? {};

  // 1. Location changed
  if (
    (updatedContext.location?.city ?? null) !== (prevCtx.location?.city ?? null) ||
    (updatedContext.location?.country ?? null) !== (prevCtx.location?.country ?? null)
  ) {
    reasons.push('location_changed');
  }

  // 2. Land size changed
  if (
    (updatedContext.land?.area ?? null) !== (prevCtx.land?.area ?? null) ||
    (updatedContext.land?.unit ?? 'sq_ft') !== (prevCtx.land?.unit ?? 'sq_ft')
  ) {
    reasons.push('land_size_changed');
  }

  // 3. Sunlight added/changed
  if ((updatedContext.sunlightHours ?? null) !== (prevCtx.sunlightHours ?? null)) {
    reasons.push('sunlight_changed');
  }

  // 4. Season added/changed
  if ((updatedContext.season ?? null) !== (prevCtx.season ?? null)) {
    reasons.push('season_changed');
  }

  // 5. Soil added/changed
  if ((updatedContext.soilType ?? null) !== (prevCtx.soilType ?? null)) {
    reasons.push('soil_changed');
  }

  // 6. Water availability added/changed
  if ((updatedContext.waterAvailability ?? null) !== (prevCtx.waterAvailability ?? null)) {
    reasons.push('water_changed');
  }

  // 7. New plant added
  const prevPlants = new Set((prevCtx.preferredPlants ?? []).map((p) => p.toLowerCase()));
  const nextPlants = (updatedContext.preferredPlants ?? []).map((p) => p.toLowerCase());
  if (nextPlants.length !== prevPlants.size || nextPlants.some((p) => !prevPlants.has(p))) {
    reasons.push('plants_changed');
  }

  // 8. Phase transition
  if (updatedPhase && updatedPhase !== (prevGs.currentPhase ?? 'PLANTING')) {
    reasons.push('phase_transition');
  }

  // 9. New plan created or significantly changed
  if (planOutput && planOutput.currentPlan) {
    const prevSummary = prevGs.currentPlan?.summary ?? null;
    if (!prevSummary || prevSummary !== planOutput.currentPlan.summary) {
      reasons.push('plan_created_or_updated');
    }
  }

  // 10. Photo observation
  if (photoObservation) {
    reasons.push('photo_observation');
  }

  // 11. New important text observation
  if (
    Array.isArray(updatedObservations) &&
    updatedObservations.length > (prevGs.observations ?? []).length
  ) {
    reasons.push('new_observation');
  }

  // 12. Important user preference discovered
  const prevPrefs = new Set(prevGs.userPreferences ?? []);
  if (
    Array.isArray(updatedPreferences) &&
    (updatedPreferences.length !== prevPrefs.size || updatedPreferences.some((p) => !prevPrefs.has(p)))
  ) {
    reasons.push('user_preference_discovered');
  }

  return {
    changed: reasons.length > 0,
    reasons,
  };
}

/**
 * Determine whether the Context Summarizer should run on this turn:
 *   Condition A: Message count since last summary >= SUMMARY_MESSAGE_THRESHOLD
 *   Condition B: A meaningful garden-state change occurred
 *
 * @param {object} params
 * @param {object} params.session
 * @param {number} params.totalMessages
 * @param {boolean} params.hasMeaningfulChange
 * @param {number} [params.thresholdOverride]
 * @returns {{ shouldRun: boolean, trigger: string|null }}
 */
function shouldUpdateSummary({
  session = {},
  totalMessages = 0,
  hasMeaningfulChange = false,
  thresholdOverride = null,
}) {
  const threshold = thresholdOverride ?? config.summarizer?.messageThreshold ?? 6;
  const lastCount = session.gardenState?.summaryMeta?.lastSummarizedMessageCount ?? 0;
  const accumulated = totalMessages - lastCount;

  if (hasMeaningfulChange) {
    return { shouldRun: true, trigger: 'MEANINGFUL_STATE_CHANGE' };
  }

  if (accumulated >= threshold) {
    return { shouldRun: true, trigger: `MESSAGE_THRESHOLD_REACHED (${accumulated}>=${threshold})` };
  }

  return { shouldRun: false, trigger: null };
}

/**
 * Build a deterministic, structured, compact summary from the current garden state
 * and recent conversation. Preserves all durable gardening facts for downstream prompts.
 *
 * @param {object} params
 * @returns {string}
 */
function buildStructuredSummary({
  context = {},
  currentPhase = 'PLANTING',
  currentDay = 1,
  plantsGrowing = [],
  currentPlan = null,
  tasks = [],
  observations = [],
  photoObservations = [],
  userPreferences = [],
  previousSummary = '',
}) {
  const parts = [];

  // 1. Location & Season
  const loc = context.location?.city
    ? `${context.location.city}${context.location.country ? ', ' + context.location.country : ''}`
    : 'unspecified';
  const season = context.season || 'unspecified';
  parts.push(`Location: ${loc} | Season: ${season}`);

  // 2. Site Conditions
  const siteBits = [];
  if (context.land?.area != null) siteBits.push(`Land: ${context.land.area} ${context.land.unit || 'sq_ft'}`);
  if (context.sunlightHours != null) siteBits.push(`Sunlight: ${context.sunlightHours}h/day`);
  if (context.soilType) siteBits.push(`Soil: ${context.soilType}`);
  if (context.waterAvailability) siteBits.push(`Water: ${context.waterAvailability}`);
  if (siteBits.length) parts.push(`Site: ${siteBits.join(', ')}`);

  // 3. Plants & Lifecycle
  const pref = context.preferredPlants?.length ? context.preferredPlants.join(', ') : 'none selected';
  const growing = plantsGrowing?.length
    ? plantsGrowing.map((p) => `${p.plant} (${p.growthStage || 'seedling'}, ${p.healthStatus || 'healthy'})`).join('; ')
    : 'none active';
  parts.push(`Lifecycle: Phase=${currentPhase}, Garden Day=${currentDay} | Preferred Plants: ${pref} | Growing: ${growing}`);

  // 4. Current Plan & Tasks
  if (currentPlan?.summary) {
    const pendingCount = (tasks || []).filter((t) => t.status === 'PENDING').length;
    const completedCount = (tasks || []).filter((t) => t.status === 'COMPLETED').length;
    parts.push(
      `Active Plan (${currentPlan.durationDays || 7}d): ${currentPlan.summary} [Tasks: ${pendingCount} pending, ${completedCount} completed]`
    );
  }

  // 5. Observations & Unresolved Gardening Issues
  const recentObs = (observations || []).slice(-3);
  const recentPhotos = (photoObservations || []).slice(-2);
  const unresolvedIssues = [];

  for (const p of recentPhotos) {
    if (p.leafCondition && p.leafCondition !== 'healthy') {
      unresolvedIssues.push(
        `${p.plantDetected || 'plant'}: ${p.leafCondition} (${(p.visibleSymptoms || []).join(', ') || 'abnormal'}, severity: ${p.severity || 'moderate'})`
      );
    }
  }
  if (recentObs.length) {
    parts.push(`Recent Observations: ${recentObs.join(' | ')}`);
  }
  if (unresolvedIssues.length) {
    parts.push(`Unresolved Issues: ${unresolvedIssues.join('; ')}`);
  }

  // 6. User Preferences
  if (userPreferences?.length) {
    parts.push(`User Preferences: ${userPreferences.join(', ')}`);
  } else if (previousSummary && previousSummary.includes('Conversation Notes:')) {
    const match = previousSummary.match(/Conversation Notes:\s*(.+)$/);
    if (match) parts.push(`Conversation Notes: ${match[1]}`);
  }

  return parts.join('\n');
}

/**
 * Update the compact `contextSummary` and `summaryMeta` for a session.
 * Never deletes or modifies raw `conversationHistory`.
 *
 * @param {object} params
 * @param {object} params.session
 * @param {object} params.updatedContext
 * @param {string} params.currentPhase
 * @param {number} params.currentDay
 * @param {object[]} params.plantsGrowing
 * @param {object} params.currentPlan
 * @param {object[]} params.tasks
 * @param {string[]} params.observations
 * @param {object[]} params.photoObservations
 * @param {string[]} params.userPreferences
 * @param {object[]} params.conversationHistory
 * @param {string} [params.trigger]
 * @param {boolean} [params.useLLMForNotes=false]
 * @returns {Promise<{ contextSummary: string, summaryMeta: { lastSummarizedMessageCount: number, lastSummarizedAt: Date } }>}
 */
async function updateContextSummary({
  session = {},
  updatedContext = {},
  currentPhase = 'PLANTING',
  currentDay = 1,
  plantsGrowing = [],
  currentPlan = null,
  tasks = [],
  observations = [],
  photoObservations = [],
  userPreferences = [],
  conversationHistory = [],
  trigger = 'MEANINGFUL_STATE_CHANGE',
  useLLMForNotes = false,
}) {
  const previousSummary = session.gardenState?.contextSummary || '';

  let baseSummary = buildStructuredSummary({
    context: updatedContext,
    currentPhase,
    currentDay,
    plantsGrowing,
    currentPlan,
    tasks,
    observations,
    photoObservations,
    userPreferences,
    previousSummary,
  });

  // Optionally distill recent conversation nuances when triggered by message threshold
  if (useLLMForNotes && conversationHistory.length >= 4) {
    try {
      const recentSlice = conversationHistory
        .slice(-6)
        .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n');
      const prompt = `Summarize any durable gardening preferences, constraints, or unresolved questions from these recent messages in ONE concise sentence (max 25 words). Do not repeat structured context.\n\n${recentSlice}\n\nONE SENTENCE NOTE:`;
      const note = await ai.generateText(prompt);
      if (note && note.trim()) {
        baseSummary += `\nConversation Notes: ${note.trim()}`;
      }
    } catch (err) {
      logger.debug(`[ContextSummarizer] Optional LLM note skipped (${err.message})`);
    }
  }

  const summaryMeta = {
    lastSummarizedMessageCount: conversationHistory.length,
    lastSummarizedAt: new Date(),
  };

  logger.info(`[ContextSummarizer] Updated contextSummary (trigger: ${trigger}, messages: ${conversationHistory.length})`);

  return {
    contextSummary: baseSummary,
    summaryMeta,
  };
}

/**
 * Slice only the most recent relevant messages to send to AI components
 * alongside `contextSummary`, avoiding full raw history token bloat.
 *
 * @param {object[]} conversationHistory
 * @param {number} [windowSize]
 * @returns {object[]}
 */
function getRecentMessagesWindow(conversationHistory = [], windowSize = null) {
  const limit = windowSize ?? config.summarizer?.recentMessagesWindow ?? 4;
  return (conversationHistory || []).slice(-limit);
}

module.exports = {
  detectMeaningfulStateChange,
  shouldUpdateSummary,
  buildStructuredSummary,
  updateContextSummary,
  getRecentMessagesWindow,
};
