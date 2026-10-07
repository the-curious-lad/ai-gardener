'use strict';

const sessionRepo = require('../../repositories/sessionRepository');
const ai = require('../ai');
const { runQueryRewriter } = require('../context/queryRewriter');
const {
  detectMeaningfulStateChange,
  shouldUpdateSummary,
  updateContextSummary,
} = require('../context/contextSummarizer');
const { analyzePlantPhoto } = require('../photo/photoReader');
const { searchKnowledge } = require('../vectorSearch/knowledgeVectorSearch');
const { searchClimateKnowledge } = require('../vectorSearch/climateVectorSearch');
const { runPlanner } = require('../planner/plannerService');
const { buildDirectAnswerPrompt } = require('../../prompts/directAnswer.prompt');
const logger = require('../../utils/logger');

/**
 * Ensure plantsGrowing is populated from preferredPlants when a plan is active.
 */
function syncPlantsGrowing(existingPlants = [], preferredPlants = [], photoObservation = null) {
  const map = new Map(existingPlants.map((p) => [p.plant.toLowerCase(), { ...p }]));

  for (const plantName of preferredPlants) {
    const key = plantName.toLowerCase();
    if (!map.has(key)) {
      map.set(key, {
        plant: key,
        growthStage: 'seedling',
        healthStatus: 'healthy',
        plantedAt: new Date(),
      });
    }
  }

  if (photoObservation?.plantDetected) {
    const key = photoObservation.plantDetected.toLowerCase();
    const current = map.get(key) || {
      plant: key,
      growthStage: 'vegetative',
      healthStatus: 'unknown',
      plantedAt: new Date(),
    };
    if (photoObservation.growthStageEstimate) {
      current.growthStage = photoObservation.growthStageEstimate;
    }
    if (photoObservation.leafCondition) {
      current.healthStatus =
        photoObservation.leafCondition === 'healthy'
          ? 'healthy'
          : `attention (${photoObservation.severity || 'moderate'})`;
    }
    map.set(key, current);
  }

  return Array.from(map.values());
}

/**
 * Orchestrate a user chat message through the KNOW -> PLAN -> ACT -> UPDATE loop.
 *
 * All database mutations happen in a single atomic sessionRepository.updateSession call.
 * Raw conversationHistory is always preserved in full in MongoDB while contextSummary
 * is maintained for token-efficient AI calls.
 *
 * @param {object} params
 * @param {string} params.sessionId
 * @param {string} params.userMessage
 * @returns {Promise<object>}
 */
async function handleUserMessage({ sessionId, userMessage }) {
  const session = await sessionRepo.findSessionById(sessionId);
  if (!session) {
    const err = new Error('Session not found.');
    err.statusCode = 404;
    throw err;
  }

  // 1. Query Rewriter & Context Manager
  const { decision, updatedContext, updatedPreferences } = await runQueryRewriter(session, userMessage);

  let reply;
  let retrievedKnowledge = [];
  let retrievedClimateKnowledge = [];
  let planOutput = null;

  const updatedHistory = [
    ...(session.conversationHistory ?? []),
    { role: 'user', content: userMessage, timestamp: new Date() },
  ];

  const currentDay = session.gardenState?.currentDay ?? 1;
  let updatedObservations = [...(session.gardenState?.observations ?? [])];
  if (decision.intent === 'REPORT_OBSERVATION') {
    updatedObservations.push(`Day ${currentDay}: ${userMessage.trim()}`);
  }

  // 1B. Out-of-Scope Rejection at the Query Rewriter Phase (no vector search or planner invoked)
  if (decision.intent === 'OUT_OF_SCOPE') {
    reply =
      decision.directAnswer ??
      "I'm AI Gardener, so I can only help with gardening, plant care, and your active garden plan. Please ask me about your plants, soil, watering, or daily tasks!";

    updatedHistory.push({ role: 'assistant', content: reply, timestamp: new Date() });

    await sessionRepo.updateSession(sessionId, {
      conversationHistory: updatedHistory,
    });

    return {
      reply,
      status: decision.status,
      intent: decision.intent,
      context: updatedContext,
      contextSummary: session.gardenState?.contextSummary ?? '',
      summaryUpdated: false,
      summaryTrigger: null,
      currentPhase: session.gardenState?.currentPhase ?? 'PLANTING',
      currentPlan: session.gardenState?.currentPlan ?? null,
      tasks: session.tasks ?? [],
      retrievedKnowledge: [],
      retrievedKnowledgeCount: 0,
      retrievedClimateKnowledge: [],
      retrievedClimateKnowledgeCount: 0,
      routing: {
        requiredKnowledgeSources: [],
        requiredTools: [],
        needsKnowledge: false,
        needsClimateKnowledge: false,
        needsSessionContext: false,
        needsPlanner: false,
        needsPhotoAnalysis: false,
        knowledgeQuery: null,
        climateQuery: null,
        missingFields: [],
      },
    };
  }

  // 2. Clarification Loop if required context for this intent is missing
  if (decision.status === 'NEEDS_CONTEXT') {
    reply =
      decision.clarificationQuestion ??
      'Could you tell me a bit more about your garden space, sunlight, and which season you are planning for?';

    updatedHistory.push({ role: 'assistant', content: reply, timestamp: new Date() });

    const stateChange = detectMeaningfulStateChange({
      prevSession: session,
      updatedContext,
      updatedObservations,
      updatedPreferences,
    });
    const summaryCheck = shouldUpdateSummary({
      session,
      totalMessages: updatedHistory.length,
      hasMeaningfulChange: stateChange.changed,
    });

    let contextSummary = session.gardenState?.contextSummary ?? '';
    let summaryMeta = session.gardenState?.summaryMeta ?? {
      lastSummarizedMessageCount: 0,
      lastSummarizedAt: null,
    };

    if (summaryCheck.shouldRun) {
      const sumRes = await updateContextSummary({
        session,
        updatedContext,
        currentPhase: session.gardenState?.currentPhase ?? 'PLANTING',
        currentDay,
        plantsGrowing: session.gardenState?.plantsGrowing ?? [],
        currentPlan: session.gardenState?.currentPlan ?? null,
        tasks: session.tasks ?? [],
        observations: updatedObservations,
        photoObservations: session.gardenState?.photoObservations ?? [],
        userPreferences: updatedPreferences,
        conversationHistory: updatedHistory,
        trigger: summaryCheck.trigger,
      });
      contextSummary = sumRes.contextSummary;
      summaryMeta = sumRes.summaryMeta;
    }

    await sessionRepo.updateSession(sessionId, {
      'gardenState.context': updatedContext,
      'gardenState.userPreferences': updatedPreferences,
      'gardenState.observations': updatedObservations,
      'gardenState.contextSummary': contextSummary,
      'gardenState.summaryMeta': summaryMeta,
      conversationHistory: updatedHistory,
    });

    return {
      reply,
      status: decision.status,
      intent: decision.intent,
      context: updatedContext,
      contextSummary,
      summaryUpdated: summaryCheck.shouldRun,
      summaryTrigger: summaryCheck.trigger,
      currentPhase: session.gardenState?.currentPhase ?? 'PLANTING',
      currentPlan: session.gardenState?.currentPlan ?? null,
      tasks: session.tasks ?? [],
      retrievedKnowledge: [],
      retrievedKnowledgeCount: 0,
      retrievedClimateKnowledge: [],
      retrievedClimateKnowledgeCount: 0,
      routing: {
        requiredKnowledgeSources: decision.requiredKnowledgeSources,
        requiredTools: decision.requiredTools,
        needsKnowledge: decision.needsKnowledge,
        needsClimateKnowledge: decision.needsClimateKnowledge,
        needsSessionContext: decision.needsSessionContext,
        needsPlanner: decision.needsPlanner,
        needsPhotoAnalysis: decision.needsPhotoAnalysis,
        knowledgeQuery: decision.knowledgeQuery ?? null,
        climateQuery: decision.climateQuery ?? null,
        missingFields: decision.missingRequiredContext,
      },
    };
  }

  // 3A & 3B. Retrieve from plant_health_knowledge and climate_location_knowledge CONCURRENTLY
  const shouldQueryPlantHealth =
    decision.needsKnowledge ||
    (decision.requiredKnowledgeSources || []).includes('PLANT_HEALTH');

  const shouldQueryClimate =
    decision.needsClimateKnowledge ||
    (decision.requiredKnowledgeSources || []).includes('CLIMATE_LOCATION');

  const plantHealthPromise =
    shouldQueryPlantHealth && decision.knowledgeQuery
      ? (() => {
          const resolvedPlantFilter =
            decision.knowledgeQuery.plantFilter !== undefined && decision.knowledgeQuery.plantFilter !== null
              ? decision.knowledgeQuery.plantFilter
              : decision.intent === 'ASK_QUESTION'
                ? null
                : (updatedContext.preferredPlants?.[0] ?? null);

          return searchKnowledge({
            semanticQuery: decision.knowledgeQuery.semanticQuery,
            knowledgeTypes: decision.knowledgeQuery.knowledgeTypes,
            plantFilter: resolvedPlantFilter,
            limit: 6,
          });
        })()
      : Promise.resolve([]);

  const climatePromise = shouldQueryClimate
    ? (() => {
        const cq = decision.climateQuery || {};
        return searchClimateKnowledge({
          semanticQuery:
            cq.semanticQuery ||
            [updatedContext.location?.city, updatedContext.location?.state, updatedContext.season, userMessage].filter(Boolean).join(' '),
          locationName: cq.locationName || updatedContext.location?.city || null,
          stateProvince: cq.stateProvince || updatedContext.location?.state || null,
          country: cq.country || updatedContext.location?.country || null,
          region: cq.region || null,
          subregion: cq.subregion || null,
          normalizedSeason: cq.normalizedSeason || updatedContext.season || null,
          knowledgeTypes: cq.knowledgeTypes || ['LOCATION_MAPPING', 'REGIONAL_CLIMATE', 'SEASONAL_CONTEXT'],
          limit: 5,
        });
      })()
    : Promise.resolve([]);

  [retrievedKnowledge, retrievedClimateKnowledge] = await Promise.all([
    plantHealthPromise,
    climatePromise,
  ]);

  // 4. Phase-Aware Planner (if needed)
  let nextPhase = session.gardenState?.currentPhase ?? 'PLANTING';
  let nextPlan = session.gardenState?.currentPlan ?? null;
  let nextTasks = session.tasks ?? [];
  let plantsGrowing = session.gardenState?.plantsGrowing ?? [];

  if (decision.needsPlanner) {
    planOutput = await runPlanner({
      session,
      updatedContext,
      retrievedKnowledge,
      retrievedClimateKnowledge,
      currentIntent: decision.intent,
    });

    reply = planOutput.summary;
    nextPhase = planOutput.updatedPhase;
    nextPlan = planOutput.currentPlan;
    nextTasks = planOutput.tasks;
    plantsGrowing = syncPlantsGrowing(
      session.gardenState?.plantsGrowing ?? [],
      updatedContext.preferredPlants ?? []
    );
  } else {
    if (
      retrievedKnowledge.length > 0 ||
      retrievedClimateKnowledge.length > 0 ||
      (decision.needsSessionContext && !decision.directAnswer)
    ) {
      const answerPrompt = buildDirectAnswerPrompt(
        updatedContext,
        retrievedKnowledge,
        userMessage,
        retrievedClimateKnowledge,
        session
      );
      reply = await ai.generateText(answerPrompt);
    } else {
      reply = decision.directAnswer ?? 'Got it! Your garden state is up to date.';
    }
  }

  updatedHistory.push({ role: 'assistant', content: reply, timestamp: new Date() });

  // 5. Context Summarizer check (runs on message threshold OR meaningful state change)
  const stateChange = detectMeaningfulStateChange({
    prevSession: session,
    updatedContext,
    updatedPhase: nextPhase,
    planOutput,
    updatedObservations,
    updatedPreferences,
  });

  const summaryCheck = shouldUpdateSummary({
    session,
    totalMessages: updatedHistory.length,
    hasMeaningfulChange: stateChange.changed,
  });

  let contextSummary = session.gardenState?.contextSummary ?? '';
  let summaryMeta = session.gardenState?.summaryMeta ?? {
    lastSummarizedMessageCount: 0,
    lastSummarizedAt: null,
  };

  if (summaryCheck.shouldRun) {
    const sumRes = await updateContextSummary({
      session,
      updatedContext,
      currentPhase: nextPhase,
      currentDay,
      plantsGrowing,
      currentPlan: nextPlan,
      tasks: nextTasks,
      observations: updatedObservations,
      photoObservations: session.gardenState?.photoObservations ?? [],
      userPreferences: updatedPreferences,
      conversationHistory: updatedHistory,
      trigger: summaryCheck.trigger,
    });
    contextSummary = sumRes.contextSummary;
    summaryMeta = sumRes.summaryMeta;
  }

  // 6. Single atomic DB write (raw conversationHistory is always preserved in full)
  const updatePayload = {
    'gardenState.context': updatedContext,
    'gardenState.userPreferences': updatedPreferences,
    'gardenState.observations': updatedObservations,
    'gardenState.contextSummary': contextSummary,
    'gardenState.summaryMeta': summaryMeta,
    conversationHistory: updatedHistory,
  };

  if (decision.needsPlanner && planOutput) {
    updatePayload['gardenState.currentPhase'] = nextPhase;
    updatePayload['gardenState.currentPlan'] = nextPlan;
    updatePayload['gardenState.plantsGrowing'] = plantsGrowing;
    updatePayload.tasks = nextTasks;
  }

  await sessionRepo.updateSession(sessionId, updatePayload);

  return {
    reply,
    status: decision.status,
    intent: decision.intent,
    context: updatedContext,
    contextSummary,
    summaryUpdated: summaryCheck.shouldRun,
    summaryTrigger: summaryCheck.trigger,
    currentPhase: nextPhase,
    currentPlan: nextPlan,
    tasks: nextTasks,
    retrievedKnowledge: retrievedKnowledge.map((k) => ({
      record_id: k.record_id,
      plant: k.plant,
      knowledge_type: k.knowledge_type,
      title: k.topic || k.title,
      source_name: k.source_name,
    })),
    retrievedKnowledgeCount: retrievedKnowledge.length,
    retrievedClimateKnowledge: retrievedClimateKnowledge.map((c) => ({
      record_id: c.record_id,
      knowledge_type: c.knowledge_type,
      location_name: c.location_name,
      subregion: c.subregion,
      region: c.region,
      normalized_season: c.normalized_season,
      source_name: c.source_name,
    })),
    retrievedClimateKnowledgeCount: retrievedClimateKnowledge.length,
    routing: {
      requiredKnowledgeSources: decision.requiredKnowledgeSources,
      requiredTools: decision.requiredTools,
      needsKnowledge: decision.needsKnowledge,
      needsClimateKnowledge: decision.needsClimateKnowledge,
      needsSessionContext: decision.needsSessionContext,
      needsPlanner: decision.needsPlanner,
      needsPhotoAnalysis: decision.needsPhotoAnalysis,
      knowledgeQuery: decision.knowledgeQuery ?? null,
      climateQuery: decision.climateQuery ?? null,
      missingFields: decision.missingRequiredContext,
    },
  };
}

/**
 * Orchestrate a photo upload through the OBSERVE -> RETRIEVE -> PLAN -> UPDATE loop:
 *   Photo -> Gemma 3 Vision -> PhotoObservation -> plant_health_knowledge (+ climate_location_knowledge)
 *   -> Planner -> Context Summarizer -> Single atomic DB update.
 *
 * @param {object} params
 * @param {string} params.sessionId
 * @param {Buffer} params.imageBuffer
 * @param {string} params.mimeType
 * @param {string} [params.userNote]
 * @returns {Promise<object>}
 */
async function handlePhotoUpload({ sessionId, imageBuffer, mimeType = 'image/jpeg', userNote = '' }) {
  const session = await sessionRepo.findSessionById(sessionId);
  if (!session) {
    const err = new Error('Session not found.');
    err.statusCode = 404;
    throw err;
  }

  // 1. Vision model produces structured observation ONLY (no DB mutation)
  const observation = await analyzePlantPhoto({
    imageBuffer,
    mimeType,
    session,
    userNote,
  });

  // 2. Construct unified plant_health_knowledge query from observation + chat context
  const plantFilter =
    observation.plantDetected ||
    session.gardenState?.context?.preferredPlants?.[0] ||
    null;

  const lastUserChat = [...(session.conversationHistory ?? [])]
    .reverse()
    .find((m) => m.role === 'user')?.content || '';

  const symptomParts = [
    ...(observation.visibleSymptoms || []),
    ...(observation.possibleDiseaseSigns || []),
    ...(observation.possiblePestSigns || []),
    observation.leafCondition !== 'healthy' ? observation.leafCondition : null,
    userNote || lastUserChat,
  ].filter(Boolean);

  const hasAbnormalSigns =
    symptomParts.length > 0 && observation.leafCondition !== 'healthy';

  const knowledgeTypes = hasAbnormalSigns
    ? [
        'DISEASE',
        'PEST',
        'NUTRIENT_DEFICIENCY',
        'ENVIRONMENTAL_STRESS',
        'PHYSIOLOGICAL_DISORDER',
        'HEALTHY_BASELINE',
      ]
    : ['HEALTHY_BASELINE', 'GROWTH_STAGE', 'MAINTENANCE', 'PREVENTION'];

  const semanticQuery = [
    plantFilter,
    ...symptomParts,
    observation.growthStageEstimate,
  ]
    .filter(Boolean)
    .join(' ');

  const ctx = session.gardenState?.context ?? {};

  const [retrievedKnowledge, retrievedClimateKnowledge] = await Promise.all([
    searchKnowledge({
      semanticQuery: semanticQuery || `${plantFilter || 'garden plant'} health baseline`,
      knowledgeTypes,
      plantFilter,
      limit: 5,
    }),
    ctx.location?.city
      ? searchClimateKnowledge({
          semanticQuery: `${ctx.location.city} ${ctx.season || ''} humidity temperature disease stress`.trim(),
          locationName: ctx.location.city,
          country: ctx.location.country || null,
          normalizedSeason: ctx.season || null,
          knowledgeTypes: ['LOCATION_MAPPING', 'REGIONAL_CLIMATE', 'SEASONAL_CONTEXT'],
          limit: 3,
        })
      : Promise.resolve([]),
  ]);

  // 3. Planner evaluates observation + retrieved knowledge + current state + compact summary
  const updatedContext = JSON.parse(JSON.stringify(ctx));
  if (
    observation.plantDetected &&
    (!updatedContext.preferredPlants || updatedContext.preferredPlants.length === 0)
  ) {
    updatedContext.preferredPlants = [observation.plantDetected.toLowerCase()];
  }

  const sessionForPlanner = userNote
    ? {
        ...session,
        conversationHistory: [
          ...(session.conversationHistory ?? []),
          { role: 'user', content: `[Uploaded photo] ${userNote}`, timestamp: new Date() },
        ],
      }
    : session;

  const planOutput = await runPlanner({
    session: sessionForPlanner,
    updatedContext,
    retrievedKnowledge,
    retrievedClimateKnowledge,
    photoObservation: observation,
    currentIntent: 'REPORT_OBSERVATION',
  });

  // 4. Communicate uncertainty explicitly if confidence is moderate/low
  let recommendation = planOutput.summary;
  if (observation.confidence < 0.75 && observation.uncertainties?.length) {
    recommendation += ` (Note: Visual confidence is ${Math.round(observation.confidence * 100)}% — ${observation.uncertainties[0]})`;
  }

  const updatedPhotoObs = [
    ...(session.gardenState?.photoObservations ?? []),
    { ...observation, recordedAt: new Date() },
  ];

  const currentDay = session.gardenState?.currentDay ?? 1;
  const updatedObsStrings = [
    ...(session.gardenState?.observations ?? []),
    `Day ${currentDay}: [${observation.plantDetected || 'plant'}] ${(observation.visibleSymptoms || []).join(', ') || observation.leafCondition || 'observed'}`,
  ];

  const plantsGrowing = syncPlantsGrowing(
    session.gardenState?.plantsGrowing ?? [],
    updatedContext.preferredPlants ?? [],
    observation
  );

  const updatedHistory = [
    ...(session.conversationHistory ?? []),
    {
      role: 'user',
      content: userNote ? `[Uploaded photo] ${userNote}` : '[Uploaded plant photo for inspection]',
      timestamp: new Date(),
    },
    {
      role: 'assistant',
      content: recommendation,
      timestamp: new Date(),
    },
  ];

  // 5. Update Context Summarizer (photo observation is a meaningful state change)
  const { contextSummary, summaryMeta } = await updateContextSummary({
    session,
    updatedContext,
    currentPhase: planOutput.updatedPhase,
    currentDay,
    plantsGrowing,
    currentPlan: planOutput.currentPlan,
    tasks: planOutput.tasks,
    observations: updatedObsStrings,
    photoObservations: updatedPhotoObs,
    userPreferences: session.gardenState?.userPreferences ?? [],
    conversationHistory: updatedHistory,
    trigger: 'MEANINGFUL_STATE_CHANGE (photo_observation)',
  });

  // 6. Single atomic DB update
  await sessionRepo.updateSession(sessionId, {
    'gardenState.context': updatedContext,
    'gardenState.currentPhase': planOutput.updatedPhase,
    'gardenState.currentPlan': planOutput.currentPlan,
    'gardenState.plantsGrowing': plantsGrowing,
    'gardenState.photoObservations': updatedPhotoObs,
    'gardenState.observations': updatedObsStrings,
    'gardenState.contextSummary': contextSummary,
    'gardenState.summaryMeta': summaryMeta,
    tasks: planOutput.tasks,
    conversationHistory: updatedHistory,
  });

  logger.info(`[Orchestrator] Completed photo->knowledge->planner->summarizer loop for session ${sessionId}`);

  return {
    observation,
    recommendation,
    updatedPhase: planOutput.updatedPhase,
    currentPlan: planOutput.currentPlan,
    updatedTasks: planOutput.tasks,
    contextSummary,
    retrievedKnowledge: retrievedKnowledge.map((k) => ({
      record_id: k.record_id,
      plant: k.plant,
      knowledge_type: k.knowledge_type,
      title: k.topic || k.title,
      problem_name: k.problem_name || null,
      source_name: k.source_name || null,
    })),
    retrievedClimateKnowledge: retrievedClimateKnowledge.map((c) => ({
      record_id: c.record_id,
      knowledge_type: c.knowledge_type,
      location_name: c.location_name,
      normalized_season: c.normalized_season,
    })),
    photoObservationsCount: updatedPhotoObs.length,
  };
}

/**
/**
 * Extract the highest "Day X" number from a list of tasks.
 *
 * @param {object[]} tasks
 * @param {number} [fallbackDay=0]
 * @returns {number}
 */
function extractMaxDayFromTasks(tasks = [], fallbackDay = 0) {
  let maxDay = fallbackDay;
  for (const t of tasks) {
    const sched = String(t.scheduledFor || t.title || '');
    const dayMatches = sched.match(/day\s*(\d+(?:\s*[-–]\s*\d+)?)/i);
    if (dayMatches) {
      const nums = dayMatches[0].match(/\d+/g);
      if (nums) {
        for (const n of nums) {
          const val = parseInt(n, 10);
          if (!Number.isNaN(val) && val > maxDay) {
            maxDay = val;
          }
        }
      }
    }
  }
  return maxDay || Math.max(fallbackDay, tasks.length);
}

/**
 * Orchestrate task completion and optional replanning.
 *
 * @param {object} params
 * @param {string} params.sessionId
 * @param {string} params.taskId
 * @param {boolean} [params.triggerReplan=false]
 */
async function handleTaskCompletion({ sessionId, taskId, triggerReplan = false }) {
  const session = await sessionRepo.findSessionById(sessionId);
  if (!session) {
    const err = new Error('Session not found.');
    err.statusCode = 404;
    throw err;
  }

  const existingTasks = session.tasks ?? [];
  const existingPending = existingTasks.filter(
    (t) => t.status === 'PENDING' || t.status === 'IN_PROGRESS'
  );
  const earliestPending = existingPending[0] || null;

  // Enforce sequential order: cannot complete a later task before completing an earlier one
  if (!triggerReplan && earliestPending && earliestPending.taskId !== taskId) {
    const targetTask = existingTasks.find((t) => t.taskId === taskId);
    if (targetTask && targetTask.status !== 'COMPLETED') {
      const err = new Error(
        `Please complete "${earliestPending.title}" (${earliestPending.scheduledFor || 'earlier task'}) first before completing later tasks.`
      );
      err.statusCode = 400;
      throw err;
    }
  }

  const tasks = existingTasks.map((t) =>
    t.taskId === taskId
      ? { ...t, status: 'COMPLETED', completedAt: t.completedAt || new Date() }
      : t
  );

  const completedTask = tasks.find((t) => t.taskId === taskId) || null;
  if (!completedTask && !triggerReplan) {
    const err = new Error('Task not found.');
    err.statusCode = 404;
    throw err;
  }

  const completedTasksList = tasks.filter((t) => t.status === 'COMPLETED');
  const lastCompletedDay = extractMaxDayFromTasks(
    completedTasksList.length ? completedTasksList : tasks,
    session.gardenState?.currentDay ?? 1
  );
  const nextStartDay = lastCompletedDay + 1;

  const remainingPending = tasks.filter(
    (t) => t.status === 'PENDING' || t.status === 'IN_PROGRESS'
  );
  const pendingCount = remainingPending.length;
  const nextTask = remainingPending[0] || null;

  const clientMessage = completedTask
    ? `✓ Completed [${completedTask.scheduledFor || 'Task'}]: "${completedTask.title}".`
    : '✓ Completed all current tasks. Please generate the next plan.';

  const ctx = session.gardenState?.context ?? {};
  const primaryPlant = ctx.preferredPlants?.[0] ?? null;

  let planOutput = null;
  let llmReply = null;
  let retrievedKnowledge = [];
  let retrievedClimateKnowledge = [];

  if (triggerReplan || pendingCount === 0) {
    // Advance phase when initial planting batch is finished so the LLM generates GROWING/MAINTENANCE tasks
    const prevPhase = session.gardenState?.currentPhase ?? 'PLANTING';
    const nextPhaseHint =
      prevPhase === 'PLANTING'
        ? 'GROWING'
        : nextStartDay >= 10
          ? 'MAINTENANCE'
          : prevPhase;

    // All tasks up to Day X are completed -> call LLM Planner to generate Day X+1 tasks
    retrievedKnowledge = primaryPlant
      ? await searchKnowledge({
          semanticQuery: `${primaryPlant} ${nextPhaseHint} maintenance next steps Day ${nextStartDay}`,
          knowledgeTypes: ['GROWTH_STAGE', 'MAINTENANCE', 'WATER', 'PREVENTION'],
          plantFilter: primaryPlant,
          limit: 4,
        })
      : [];

    retrievedClimateKnowledge = ctx.location?.city
      ? await searchClimateKnowledge({
          semanticQuery: `${ctx.location.city} ${ctx.season || ''} seasonal gardening maintenance`,
          locationName: ctx.location.city,
          country: ctx.location.country || null,
          normalizedSeason: ctx.season || null,
          limit: 3,
        })
      : [];

    const sessionForPlanner = {
      ...session,
      tasks,
      gardenState: {
        ...(session.gardenState ?? {}),
        currentPhase: nextPhaseHint,
        currentDay: nextStartDay,
      },
    };

    planOutput = await runPlanner({
      session: sessionForPlanner,
      updatedContext: ctx,
      retrievedKnowledge,
      retrievedClimateKnowledge,
      currentIntent: 'TASK_UPDATE',
    });

    llmReply =
      planOutput.summary ||
      `Great job completing all tasks through Day ${lastCompletedDay}! I've generated your next plan starting from Day ${nextStartDay}.`;

    const updatedHistory = [
      ...(session.conversationHistory ?? []),
      { role: 'user', content: clientMessage, timestamp: new Date() },
      { role: 'assistant', content: llmReply, timestamp: new Date() },
    ];

    const { contextSummary, summaryMeta } = await updateContextSummary({
      session,
      updatedContext: ctx,
      currentPhase: planOutput.updatedPhase,
      currentDay: nextStartDay,
      plantsGrowing: session.gardenState?.plantsGrowing ?? [],
      currentPlan: planOutput.currentPlan,
      tasks: planOutput.tasks,
      observations: session.gardenState?.observations ?? [],
      photoObservations: session.gardenState?.photoObservations ?? [],
      userPreferences: session.gardenState?.userPreferences ?? [],
      conversationHistory: updatedHistory,
      trigger: `MEANINGFUL_STATE_CHANGE (task_replan_day_${nextStartDay})`,
    });

    await sessionRepo.updateSession(sessionId, {
      'gardenState.currentPhase': planOutput.updatedPhase,
      'gardenState.currentPlan': planOutput.currentPlan,
      'gardenState.currentDay': nextStartDay,
      'gardenState.contextSummary': contextSummary,
      'gardenState.summaryMeta': summaryMeta,
      tasks: planOutput.tasks,
      conversationHistory: updatedHistory,
    });
  } else {
    // Individual task [Day X] completed while more tasks remain -> call LLM to respond to this strikethrough
    retrievedKnowledge = primaryPlant
      ? await searchKnowledge({
          semanticQuery: `${primaryPlant} ${completedTask.title} ${nextTask ? nextTask.title : ''}`,
          knowledgeTypes: ['PLANTING', 'WATER', 'SOIL', 'MAINTENANCE', 'GROWTH_STAGE'],
          plantFilter: primaryPlant,
          limit: 2,
        })
      : [];

    const knowledgeSnippet = retrievedKnowledge
      .map((k) => `- ${k.topic || k.knowledge_type}: ${(k.knowledge_text || '').slice(0, 220)}`)
      .join('\n');

    const stepPrompt = `You are "AI Gardener", a warm, practical outdoor gardening coach.
The user is growing ${primaryPlant || 'plants'} in ${[ctx.location?.city, ctx.location?.state].filter(Boolean).join(', ') || 'their garden'} (${ctx.season || 'current season'}).
They just completed this task:
- Completed: [${completedTask.scheduledFor || 'Today'}] ${completedTask.title} — ${completedTask.description || ''}

Their next upcoming task in the queue is:
- Next Up: [${nextTask.scheduledFor || 'Next'}] ${nextTask.title} — ${nextTask.description || ''}

${knowledgeSnippet ? `Relevant Plant Knowledge:\n${knowledgeSnippet}\n` : ''}
Write a concise, encouraging 2-3 sentence response confirming their completed step and giving one practical, specific tip to prepare for "${nextTask.title}" (${nextTask.scheduledFor}). Plain text only.`;

    try {
      const generated = await ai.generateText(stepPrompt);
      llmReply =
        generated && generated.trim()
          ? generated.trim()
          : `Great job completing "${completedTask.title}" (${completedTask.scheduledFor})! Next up for ${nextTask.scheduledFor} is "${nextTask.title}": ${nextTask.description}`;
    } catch (err) {
      logger.warn(`[handleTaskCompletion] LLM step response fallback: ${err.message}`);
      llmReply = `Great job completing "${completedTask.title}" (${completedTask.scheduledFor})! Next up for ${nextTask.scheduledFor} is "${nextTask.title}".`;
    }

    const updatedDay = Math.max(session.gardenState?.currentDay ?? 1, lastCompletedDay);
    const updatedHistory = [
      ...(session.conversationHistory ?? []),
      { role: 'user', content: clientMessage, timestamp: new Date() },
      { role: 'assistant', content: llmReply, timestamp: new Date() },
    ];

    const { contextSummary, summaryMeta } = await updateContextSummary({
      session,
      updatedContext: ctx,
      currentPhase: session.gardenState?.currentPhase ?? 'PLANTING',
      currentDay: updatedDay,
      plantsGrowing: session.gardenState?.plantsGrowing ?? [],
      currentPlan: session.gardenState?.currentPlan ?? null,
      tasks,
      observations: session.gardenState?.observations ?? [],
      photoObservations: session.gardenState?.photoObservations ?? [],
      userPreferences: session.gardenState?.userPreferences ?? [],
      conversationHistory: updatedHistory,
      trigger: `TASK_COMPLETED (${completedTask.scheduledFor || completedTask.taskId})`,
    });

    await sessionRepo.updateSession(sessionId, {
      'gardenState.currentDay': updatedDay,
      'gardenState.contextSummary': contextSummary,
      'gardenState.summaryMeta': summaryMeta,
      tasks,
      conversationHistory: updatedHistory,
    });
  }

  return {
    completedTask,
    clientMessage,
    reply: llmReply,
    summary: llmReply,
    replanned: Boolean(planOutput),
    lastCompletedDay,
    nextStartDay,
    updatedPhase: planOutput?.updatedPhase ?? session.gardenState?.currentPhase,
    currentPlan: planOutput?.currentPlan ?? session.gardenState?.currentPlan ?? null,
    tasks: planOutput?.tasks ?? tasks,
  };
}

module.exports = {
  handleUserMessage,
  handlePhotoUpload,
  handleTaskCompletion,
};
