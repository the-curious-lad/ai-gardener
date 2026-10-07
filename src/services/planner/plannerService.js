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
          title: `Weed around root zone and refresh mulch`,
          description: `Hand-pull competing weeds around your ${plantRaw} plants and top up organic mulch to buffer ${city}'s ${season} temperatures.`,
          phase: 'MAINTENANCE',
          status: 'PENDING',
          scheduledFor: `Day ${startDay + 2}`,
        },
        {
          title: `Top-dress with organic compost or vermicompost`,
          description: `Scratch a light handful of vermicompost into the topsoil 5 cm away from each ${plantRaw} stem and water in lightly.`,
          phase: 'MAINTENANCE',
          status: 'PENDING',
          scheduledFor: `Day ${startDay + 3}`,
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

  // If the 4B model returned 0 tasks, populate with grounded fallback tasks
  if (!Array.isArray(planOutput.tasks) || planOutput.tasks.length === 0) {
    logger.warn('[Planner] LLM returned 0 tasks — populating grounded fallback tasks.');
    planOutput.tasks = fallback.tasks;
  }

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

  // Extract first day number from the first task to check if the 4B model reset to Day 1
  const firstSched = String(planOutput.tasks?.[0]?.scheduledFor || '');
  const firstNumMatch = firstSched.match(/\d+/);
  const firstTaskDay = firstNumMatch ? parseInt(firstNumMatch[0], 10) : null;
  const dayOffset =
    startDay > 1 && firstTaskDay != null && firstTaskDay < startDay
      ? startDay - firstTaskDay
      : 0;

  // Assign stable unique taskIds and enforce sequential Day X+1 numbering
  planOutput.tasks = (planOutput.tasks ?? []).map((t, idx) => {
    let scheduledFor = t.scheduledFor || `Day ${startDay + idx}`;
    if (dayOffset > 0 && /\d+/.test(scheduledFor)) {
      scheduledFor = scheduledFor.replace(/\d+/g, (m) => String(parseInt(m, 10) + dayOffset));
    } else if (startDay > 1 && !/day\s*\d+/i.test(scheduledFor)) {
      scheduledFor = `Day ${startDay + idx}`;
    }

    return {
      ...t,
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
