'use strict';

const { v4: uuidv4 } = require('uuid');
const ai = require('../ai');
const { PlannerOutputSchema } = require('../../models/schemas');
const { SYSTEM_PROMPT, buildPlannerPrompt } = require('../../prompts/planner.prompt');
const logger = require('../../utils/logger');

/**
 * Build a grounded, context-specific fallback plan if the 4B model returns an empty tasks array.
 */
function buildFallbackPlan(updatedContext = {}, startDay = 1, currentPhase = 'PLANTING') {
  const plantRaw = updatedContext.preferredPlants?.[0] || 'garden crop';
  const plantCap = plantRaw.charAt(0).toUpperCase() + plantRaw.slice(1);
  const city = updatedContext.location?.city || 'your area';
  const state = updatedContext.location?.state ? `, ${updatedContext.location.state}` : '';
  const area = updatedContext.land?.area ? `${updatedContext.land.area} ${updatedContext.land.unit || 'sq_ft'}` : 'your growing space';
  const sun = updatedContext.sunlightHours != null ? `${updatedContext.sunlightHours}h/day` : 'available';
  const season = (updatedContext.season || 'seasonal').toLowerCase();

  const isPlanting = currentPhase === 'PLANTING' && startDay === 1;

  const rawTasks = isPlanting
    ? [
        {
          title: `Clear and loosen ${area} bed for ${plantRaw}`,
          description: `Loosen the top 20–25 cm of soil in ${city}${state}, removing stones and weeds so ${plantRaw} roots can expand easily. Mix in well-rotted compost for moisture retention during ${season}.`,
          phase: 'PLANTING',
          status: 'PENDING',
          scheduledFor: `Day ${startDay}`,
        },
        {
          title: `Level soil and set spacing rows`,
          description: `Rake the bed level in the zone receiving ${sun} of sunlight and mark planting rows with proper drainage channels tailored to ${city}'s ${season} conditions.`,
          phase: 'PLANTING',
          status: 'PENDING',
          scheduledFor: `Day ${startDay + 1}`,
        },
        {
          title: `Sow or transplant ${plantRaw} and water gently`,
          description: `Plant your ${plantRaw} seeds or seedlings at recommended depth and water gently at the root zone in the morning so soil settles evenly without washing seeds away.`,
          phase: 'PLANTING',
          status: 'PENDING',
          scheduledFor: `Day ${startDay + 2}`,
        },
        {
          title: `Apply organic mulch around ${plantRaw} rows`,
          description: `Spread a 3–5 cm layer of dry leaves or straw mulch across the ${area} bed to regulate soil temperature under ${sun} sunlight and reduce evaporation.`,
          phase: 'PLANTING',
          status: 'PENDING',
          scheduledFor: `Day ${startDay + 3}`,
        },
        {
          title: `Check soil moisture and early germination`,
          description: `Press your finger 3 cm into the soil in the morning; water deeply at the base if dry and inspect emerging ${plantRaw} shoots for healthy color.`,
          phase: 'GROWING',
          status: 'PENDING',
          scheduledFor: `Day ${startDay + 4}`,
        },
      ]
    : [
        {
          title: `Inspect ${plantRaw} foliage and root-zone moisture`,
          description: `Check leaves (top and underside) across your ${area} space in ${city} for any curl, spots, or pests, and verify topsoil moisture.`,
          phase: currentPhase === 'PLANTING' ? 'GROWING' : currentPhase,
          status: 'PENDING',
          scheduledFor: `Day ${startDay}`,
        },
        {
          title: `Deep morning watering at ${plantRaw} base`,
          description: `Irrigate slowly at soil level in the morning to support steady growth under ${sun} sunlight while keeping foliage dry.`,
          phase: 'GROWING',
          status: 'PENDING',
          scheduledFor: `Day ${startDay + 1}`,
        },
        {
          title: `Thin crowded ${plantRaw} shoots and check stem support`,
          description: `Ensure healthy airflow between ${plantRaw} plants across your ${area} bed and add soft stakes or ties if stems are leaning.`,
          phase: 'GROWING',
          status: 'PENDING',
          scheduledFor: `Day ${startDay + 2}`,
        },
        {
          title: `Weed around root zone and refresh mulch`,
          description: `Hand-pull competing weeds around your ${plantRaw} plants and top up organic mulch to buffer ${city}'s ${season} temperatures.`,
          phase: 'MAINTENANCE',
          status: 'PENDING',
          scheduledFor: `Day ${startDay + 3}`,
        },
        {
          title: `Top-dress with organic compost or vermicompost`,
          description: `Scratch a light handful of vermicompost into the topsoil 5 cm away from each ${plantRaw} stem and water in lightly.`,
          phase: 'MAINTENANCE',
          status: 'PENDING',
          scheduledFor: `Day ${startDay + 4}`,
        },
      ];

  const planSummary = `7-Day ${plantCap} Plan for ${city}${state} (${area}, ${sun} sunlight, ${season.toUpperCase()})`;
  const chatSummary = `Your personalized ${season} ${plantRaw} plan for ${city}${state} (${area}, ${sun} sunlight) is ready! Start on Day ${startDay} with "${rawTasks[0].title}".`;

  return {
    tasks: rawTasks,
    planSummary,
    chatSummary,
  };
}

/**
 * Run the phase-aware Planner.
 *
 * Evaluates current garden state, compact contextSummary, retrieved plant_health_knowledge,
 * retrieved climate_location_knowledge, and any photo observations to produce the next
 * phase, tasks, and X-day plan.
 *
 * @param {object} params
 * @param {object}   params.session                     Current session document
 * @param {object}   params.updatedContext              Merged garden context
 * @param {object[]} [params.retrievedKnowledge]        Records from plant_health_knowledge
 * @param {object[]} [params.retrievedClimateKnowledge] Records from climate_location_knowledge
 * @param {object}   [params.photoObservation]          Structured observation from PhotoReader
 * @param {string}   [params.currentIntent]             Current intent from QueryRewriter
 * @returns {Promise<object>}                           Validated PlannerOutput
 */
async function runPlanner({
  session,
  updatedContext,
  retrievedKnowledge = [],
  retrievedClimateKnowledge = [],
  photoObservation = null,
  currentIntent = 'CREATE_GARDEN_PLAN',
}) {
  const photoSummary = photoObservation
    ? JSON.stringify(photoObservation, null, 2)
    : null;

  const sessionWithTasks = {
    ...session,
    gardenState: {
      ...(session.gardenState ?? {}),
      tasks: session.tasks ?? [],
    },
  };

  const userPrompt = buildPlannerPrompt(
    sessionWithTasks,
    updatedContext,
    retrievedKnowledge,
    photoSummary,
    retrievedClimateKnowledge,
    currentIntent
  );

  const startDay = session.gardenState?.currentDay ?? 1;
  const fallback = buildFallbackPlan(
    updatedContext,
    startDay,
    session.gardenState?.currentPhase ?? 'PLANTING'
  );

  let planOutput;
  try {
    logger.debug('[Planner] Generating plan with Gemma...');
    planOutput = await ai.generateStructuredOutput(
      SYSTEM_PROMPT,
      userPrompt,
      PlannerOutputSchema
    );
  } catch (err) {
    logger.warn('[Planner] LLM structured output failed, using grounded fallback plan:', err.message);
    planOutput = {
      updatedPhase: startDay > 1 ? 'GROWING' : 'PLANTING',
      tasks: fallback.tasks,
      currentPlan: {
        durationDays: 7,
        summary: fallback.planSummary,
        dailySchedule: [],
      },
      summary: fallback.chatSummary,
    };
  }

  // Never regress phase to PLANTING when replanning on Day > 1
  if (startDay > 1 && (!planOutput.updatedPhase || planOutput.updatedPhase === 'PLANTING')) {
    planOutput.updatedPhase = startDay >= 10 ? 'MAINTENANCE' : 'GROWING';
  }

  // Deduplicate tasks and filter out already-completed tasks when replanning on Day > 1
  const completedTitleSet = new Set(
    (session.tasks ?? [])
      .filter((t) => t.status === 'COMPLETED')
      .map((t) => String(t.title || '').trim().toLowerCase())
      .filter(Boolean)
  );
  const seenTitles = new Set();
  const uniqueTasks = [];

  for (const t of planOutput.tasks ?? []) {
    const normTitle = String(t.title || '').trim().toLowerCase();
    if (!normTitle || seenTitles.has(normTitle)) continue;
    if (startDay > 1 && completedTitleSet.has(normTitle)) continue;
    seenTitles.add(normTitle);
    uniqueTasks.push(t);
  }

  // If the 4B model returned 0 tasks, populate with grounded fallback tasks
  if (uniqueTasks.length === 0) {
    logger.warn('[Planner] LLM returned 0 unique tasks — populating grounded fallback tasks.');
    uniqueTasks.push(...fallback.tasks);
  } else if (startDay > 1 && uniqueTasks.length < 4) {
    // On Day > 1 replans, top up to at least 4 distinct GROWING/MAINTENANCE tasks if the LLM returned too few
    for (const fb of fallback.tasks) {
      if (uniqueTasks.length >= 4) break;
      const normFb = fb.title.trim().toLowerCase();
      if (!seenTitles.has(normFb) && !completedTitleSet.has(normFb)) {
        seenTitles.add(normFb);
        uniqueTasks.push(fb);
      }
    }
  }

  planOutput.tasks = uniqueTasks;

  if (
    !planOutput.currentPlan?.summary ||
    planOutput.currentPlan.summary === '7-Day Personalized Garden Plan'
  ) {
    planOutput.currentPlan = {
      durationDays: planOutput.currentPlan?.durationDays ?? 7,
      summary: fallback.planSummary,
      dailySchedule: planOutput.currentPlan?.dailySchedule ?? [],
    };
  }

  if (!planOutput.summary || planOutput.summary === 'Your personalized garden plan is ready!') {
    planOutput.summary = fallback.chatSummary;
  }

  // Deterministically assign strict sequential Day numbers (Day startDay, Day startDay+1, ...)
  // and ensure tasks on Day > 1 never regress to PLANTING phase.
  planOutput.tasks = (planOutput.tasks ?? []).map((t, idx) => {
    const scheduledFor = `Day ${startDay + idx}`;
    const taskPhase =
      startDay > 1 && (!t.phase || t.phase === 'PLANTING')
        ? idx >= 2
          ? 'MAINTENANCE'
          : 'GROWING'
        : t.phase || 'PLANTING';

    return {
      ...t,
      phase: taskPhase,
      status: t.status === 'COMPLETED' ? 'COMPLETED' : 'PENDING',
      scheduledFor,
      taskId:
        t.taskId && t.taskId.startsWith('task_')
          ? `task_${Date.now()}_${idx + 1}`
          : t.taskId || `task_${uuidv4().slice(0, 8)}`,
      completedAt: t.status === 'COMPLETED' ? new Date() : null,
    };
  });

  return planOutput;
}

module.exports = { runPlanner, buildFallbackPlan };
