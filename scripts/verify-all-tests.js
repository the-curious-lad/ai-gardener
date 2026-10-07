'use strict';

/**
 * Comprehensive verification script for all 4 architectural improvements
 * and all 8 required verification test cases (TEST 1 through TEST 8).
 */

const assert = require('assert');
const sessionRepo = require('../src/repositories/sessionRepository');
const ai = require('../src/services/ai');
const { handleUserMessage, handlePhotoUpload } = require('../src/services/orchestrator/gardenOrchestrator');
const { buildUserPrompt } = require('../src/prompts/queryRewriter.prompt');
const { buildPlannerPrompt } = require('../src/prompts/planner.prompt');
const { buildPhotoPrompt } = require('../src/prompts/photoReader.prompt');
const { loadClimateCSV, loadKnowledgeCSV } = require('../src/utils/csvParser');

// ── In-memory MongoDB session store for deterministic verification ───────────
const sessions = new Map();

function createFreshSession(id = 'session_verify_1') {
  const doc = {
    _id: id,
    userId: 'user_verify',
    gardenState: {
      context: {
        location: { city: null, country: null },
        land: { area: null, unit: 'sq_ft' },
        preferredPlants: [],
        sunlightHours: null,
        soilType: null,
        waterAvailability: null,
        season: null,
      },
      currentPhase: 'PLANTING',
      currentDay: 1,
      plantsGrowing: [],
      currentPlan: { durationDays: null, summary: null, dailySchedule: [] },
      observations: [],
      photoObservations: [],
      userPreferences: [],
      contextSummary: '',
      summaryMeta: {
        lastSummarizedMessageCount: 0,
        lastSummarizedAt: null,
      },
    },
    tasks: [],
    conversationHistory: [],
  };
  sessions.set(id, doc);
  return doc;
}

sessionRepo.findSessionById = async (id) => {
  const s = sessions.get(id);
  return s ? JSON.parse(JSON.stringify(s)) : null;
};

sessionRepo.updateSession = async (id, updateObj) => {
  const s = sessions.get(id);
  if (!s) throw new Error('Session not found');
  for (const [k, v] of Object.entries(updateObj)) {
    if (k.startsWith('gardenState.')) {
      const subKey = k.replace('gardenState.', '');
      s.gardenState[subKey] = JSON.parse(JSON.stringify(v));
    } else {
      s[k] = JSON.parse(JSON.stringify(v));
    }
  }
  return JSON.parse(JSON.stringify(s));
};

// ── Deterministic Gemma 3 Router / Planner / Vision simulation ────────────────
ai.generateStructuredOutput = async (systemPrompt, userPrompt, schema) => {
  // 1. Query Rewriter calls
  if (systemPrompt.includes('Query Rewriter')) {
    const msgMatch = userPrompt.split('USER MESSAGE:\n')[1] || '';
    const msg = msgMatch.trim();

    if (msg === 'I want to grow tomatoes in Gorakhpur.') {
      return schema.parse({
        status: 'NEEDS_CONTEXT',
        intent: 'CREATE_GARDEN_PLAN',
        normalizedQuery: 'Grow tomatoes in Gorakhpur',
        extractedContext: {
          location: { city: 'Gorakhpur', country: 'India' },
          preferredPlants: ['tomato'],
        },
        missingRequiredContext: ['land.area', 'sunlightHours', 'season'],
        requiredKnowledgeSources: [],
        requiredTools: [],
        needsKnowledge: false,
        knowledgeQuery: null,
        needsClimateKnowledge: false,
        climateQuery: null,
        needsSessionContext: false,
        needsPhotoAnalysis: false,
        needsPlanner: false,
        clarificationQuestion:
          'How much space do you have, roughly how many hours of direct sunlight does it get, and which season are you planning for?',
        directAnswer: null,
      });
    }

    if (msg === 'I want to grow tomatoes in Gorakhpur in 100 sq ft with 6 hours of sunlight in winter.') {
      return schema.parse({
        status: 'READY',
        intent: 'CREATE_GARDEN_PLAN',
        normalizedQuery: 'Create winter tomato garden plan in Gorakhpur for 100 sq ft with 6 hours sunlight',
        extractedContext: {
          location: { city: 'Gorakhpur', country: 'India' },
          land: { area: 100, unit: 'sq_ft' },
          preferredPlants: ['tomato'],
          sunlightHours: 6,
          season: 'winter',
          userPreferences: ['organic mulching'],
        },
        missingRequiredContext: [],
        requiredKnowledgeSources: ['PLANT_HEALTH', 'CLIMATE_LOCATION'],
        requiredTools: ['PLANNER'],
        needsKnowledge: true,
        knowledgeQuery: {
          semanticQuery: 'tomato planting soil water sunlight winter rabi care',
          knowledgeTypes: ['PLANT_BASIC', 'PLANTING', 'SOIL', 'WATER', 'SUNLIGHT', 'CLIMATE'],
          plantFilter: 'tomato',
        },
        needsClimateKnowledge: true,
        climateQuery: {
          semanticQuery: 'Gorakhpur winter rabi temperature rainfall fog gardening implications',
          locationName: 'Gorakhpur',
          country: 'India',
          normalizedSeason: 'WINTER',
          knowledgeTypes: ['LOCATION_MAPPING', 'REGIONAL_CLIMATE', 'SEASONAL_CONTEXT'],
        },
        needsSessionContext: false,
        needsPhotoAnalysis: false,
        needsPlanner: true,
        clarificationQuestion: null,
        directAnswer: null,
      });
    }

    if (msg === 'What is photosynthesis?') {
      return schema.parse({
        status: 'READY',
        intent: 'GENERAL_CHAT',
        normalizedQuery: 'What is photosynthesis?',
        extractedContext: {},
        missingRequiredContext: [],
        requiredKnowledgeSources: [],
        requiredTools: [],
        needsKnowledge: false,
        knowledgeQuery: null,
        needsClimateKnowledge: false,
        climateQuery: null,
        needsSessionContext: false,
        needsPhotoAnalysis: false,
        needsPlanner: false,
        clarificationQuestion: null,
        directAnswer:
          'Photosynthesis is the process by which green plants use sunlight, water, and carbon dioxide to create oxygen and energy in the form of glucose.',
      });
    }

    if (msg === 'How much water does tomato need?') {
      return schema.parse({
        status: 'READY',
        intent: 'ASK_QUESTION',
        normalizedQuery: 'Tomato watering requirements',
        extractedContext: {},
        missingRequiredContext: [],
        requiredKnowledgeSources: ['PLANT_HEALTH'],
        requiredTools: [],
        needsKnowledge: true,
        knowledgeQuery: {
          semanticQuery: 'tomato water requirement irrigation frequency soil moisture',
          knowledgeTypes: ['WATER', 'PLANT_BASIC', 'MAINTENANCE'],
          plantFilter: 'tomato',
        },
        needsClimateKnowledge: false,
        climateQuery: null,
        needsSessionContext: false,
        needsPhotoAnalysis: false,
        needsPlanner: false,
        clarificationQuestion: null,
        directAnswer: null,
      });
    }

    if (msg === 'What should I plant in Gorakhpur this winter?') {
      return schema.parse({
        status: 'READY',
        intent: 'ASK_QUESTION',
        normalizedQuery: 'Suitable winter rabi crops for Gorakhpur',
        extractedContext: {
          location: { city: 'Gorakhpur', country: 'India' },
          season: 'winter',
        },
        missingRequiredContext: [],
        requiredKnowledgeSources: ['CLIMATE_LOCATION', 'PLANT_HEALTH'],
        requiredTools: [],
        needsKnowledge: true,
        knowledgeQuery: {
          semanticQuery: 'winter cool season vegetables tomato spinach carrot radish planting',
          knowledgeTypes: ['PLANT_BASIC', 'PLANTING', 'CLIMATE'],
          plantFilter: null,
        },
        needsClimateKnowledge: true,
        climateQuery: {
          semanticQuery: 'Gorakhpur winter rabi temperature rainfall fog suitable crops',
          locationName: 'Gorakhpur',
          country: 'India',
          normalizedSeason: 'WINTER',
          knowledgeTypes: ['LOCATION_MAPPING', 'REGIONAL_CLIMATE', 'SEASONAL_CONTEXT'],
        },
        needsSessionContext: false,
        needsPhotoAnalysis: false,
        needsPlanner: false,
        clarificationQuestion: null,
        directAnswer: null,
      });
    }

    if (msg === 'What did I tell you yesterday?') {
      return schema.parse({
        status: 'READY',
        intent: 'ASK_QUESTION',
        normalizedQuery: 'Recall previous user statements from session context',
        extractedContext: {},
        missingRequiredContext: [],
        requiredKnowledgeSources: ['SESSION_CONTEXT'],
        requiredTools: [],
        needsKnowledge: false,
        knowledgeQuery: null,
        needsClimateKnowledge: false,
        climateQuery: null,
        needsSessionContext: true,
        needsPhotoAnalysis: false,
        needsPlanner: false,
        clarificationQuestion: null,
        directAnswer: null,
      });
    }

    // Filler messages for TEST 8 threshold check
    return schema.parse({
      status: 'READY',
      intent: 'GENERAL_CHAT',
      normalizedQuery: msg,
      extractedContext: {},
      missingRequiredContext: [],
      requiredKnowledgeSources: [],
      requiredTools: [],
      needsKnowledge: false,
      knowledgeQuery: null,
      needsClimateKnowledge: false,
      climateQuery: null,
      needsSessionContext: false,
      needsPhotoAnalysis: false,
      needsPlanner: false,
      clarificationQuestion: null,
      directAnswer: 'Noted!',
    });
  }

  // 2. Planner calls
  if (systemPrompt.includes('You are the Planner')) {
    const hasPhoto = userPrompt.includes('PHOTO OBSERVATIONS:');
    const hasClimate = userPrompt.includes('SEA_IN_GORAKHPUR_WIN_001');

    if (hasPhoto) {
      return schema.parse({
        updatedPhase: 'GROWING',
        tasks: [
          {
            taskId: 'task_001',
            title: 'Prune lower yellowing spotted tomato leaves',
            description:
              'Remove affected lower leaves with yellow halos and dark spots using clean shears. Avoid wetting foliage during Gorakhpur winter fog.',
            phase: 'MAINTENANCE',
            status: 'PENDING',
            scheduledFor: 'Day 1',
          },
          {
            taskId: 'task_002',
            title: 'Water at soil level in mid-morning',
            description:
              'Irrigate only at the base after morning fog clears so leaves stay dry and fungal blight spread is minimized.',
            phase: 'GROWING',
            status: 'PENDING',
            scheduledFor: 'Day 2',
          },
        ],
        currentPlan: {
          durationDays: 7,
          summary:
            '7-Day Winter Tomato Foliar Disease Management & Recovery Plan for Gorakhpur',
          dailySchedule: [],
        },
        summary:
          'I inspected your tomato leaf photo and cross-checked our plant health and Gorakhpur winter climate data (where morning fog increases blight risk). I transitioned your garden to GROWING and scheduled immediate leaf pruning and base-level morning watering.',
      });
    }

    return schema.parse({
      updatedPhase: 'PLANTING',
      tasks: [
        {
          taskId: 'task_001',
          title: 'Prepare raised loam beds in 100 sq ft',
          description: `Loosen the alluvial loam soil to 20 cm depth and mix well-rotted compost. ${hasClimate ? 'Account for Gorakhpur Rabi winter conditions (mean Tmax 24.2°C, Tmin 8.2°C).' : ''}`,
          phase: 'PLANTING',
          status: 'PENDING',
          scheduledFor: 'Day 1',
        },
        {
          taskId: 'task_002',
          title: 'Transplant tomato seedlings at 60x45 cm spacing',
          description:
            'Set sturdy tomato seedlings in the sunniest 6-hour zone and water gently at the root zone in mid-morning.',
          phase: 'PLANTING',
          status: 'PENDING',
          scheduledFor: 'Day 2',
        },
      ],
      currentPlan: {
        durationDays: 7,
        summary: '7-Day Gorakhpur Winter (Rabi) Tomato Planting Plan (100 sq ft, 6h sunlight)',
        dailySchedule: [],
      },
      summary:
        'Your 7-day winter (Rabi) tomato plan for Gorakhpur is ready! Using local Middle Gangetic Plain winter climate data (24.2°C/8.2°C, low winter rain, morning fog watch), start on Day 1 by preparing your 100 sq ft bed.',
    });
  }

  throw new Error('Unexpected structured output prompt');
};

ai.analyzeImage = async () =>
  JSON.stringify({
    plantDetected: 'tomato',
    visibleSymptoms: ['yellowing on lower leaf margins', 'small dark brown concentric spots'],
    leafCondition: 'spotted',
    possiblePestSigns: [],
    possibleDiseaseSigns: ['early blight (Alternaria-like concentric rings)'],
    growthStageEstimate: 'vegetative',
    severity: 'moderate',
    confidence: 0.72,
    uncertainties: ['Leaf underside not visible in photo'],
  });

ai.generateText = async (prompt) => {
  if (prompt.includes('How much water does tomato need?')) {
    return 'Tomatoes generally need 1 to 1.5 inches of water per week via deep root-zone watering, keeping the soil evenly moist without waterlogging or wetting the foliage.';
  }
  if (prompt.includes('What should I plant in Gorakhpur this winter?')) {
    return 'In Gorakhpur during winter (Rabi season, Dec–Feb mean 24.2°C max / 8.2°C min with low rainfall of ~46 mm), cool-season crops like tomato, spinach, radish, carrot, pea, and coriander thrive—just space plants well and water in mid-morning to manage dense morning fog.';
  }
  if (prompt.includes('What did I tell you yesterday?')) {
    return 'Based on your garden session summary, you are planning a 100 sq ft winter tomato garden in Gorakhpur, India with 6 hours of daily sunlight and a preference for organic mulching.';
  }
  return 'Grounded gardening answer generated from knowledge base.';
};

async function runAllVerificationTests() {
  console.log('================================================================');
  console.log(' RUNNING ALL 8 ARCHITECTURAL VERIFICATION TESTS');
  console.log('================================================================\n');

  const plantCsvCount = loadKnowledgeCSV().length;
  const climateCsvCount = loadClimateCSV().length;
  console.log(`[Dataset Check] plant_health_knowledge.csv: ${plantCsvCount} records loaded`);
  console.log(`[Dataset Check] climate_location_knowledge.csv: ${climateCsvCount} records loaded\n`);
  assert(plantCsvCount === 2174, 'Expected 2,174 plant_health_knowledge data records');
  assert(climateCsvCount === 70, 'Expected 70 climate_location_knowledge data records');

  // ---------------------------------------------------------------------------
  // TEST 1 — INITIAL PLANNING MISSING SEASON
  // ---------------------------------------------------------------------------
  console.log('--- TEST 1: Initial Planning Missing Season ---');
  createFreshSession('session_t1');
  const t1 = await handleUserMessage({
    sessionId: 'session_t1',
    userMessage: 'I want to grow tomatoes in Gorakhpur.',
  });
  console.log('Status:', t1.status);
  console.log('Extracted Context:', JSON.stringify(t1.context));
  console.log('Missing Fields:', t1.routing.missingFields);
  console.log('Clarification Reply:', t1.reply);

  assert.strictEqual(t1.status, 'NEEDS_CONTEXT');
  assert.strictEqual(t1.context.location.city, 'Gorakhpur');
  assert.deepStrictEqual(t1.context.preferredPlants, ['tomato']);
  assert.deepStrictEqual(t1.routing.missingFields, ['land.area', 'sunlightHours', 'season']);
  assert(t1.reply.toLowerCase().includes('season'), 'Clarification must ask for season');
  console.log('✅ TEST 1 PASSED\n');

  // ---------------------------------------------------------------------------
  // TEST 2 — COMPLETE INITIAL PLANNING CONTEXT
  // ---------------------------------------------------------------------------
  console.log('--- TEST 2: Complete Initial Planning Context ---');
  createFreshSession('session_t2');
  const t2 = await handleUserMessage({
    sessionId: 'session_t2',
    userMessage: 'I want to grow tomatoes in Gorakhpur in 100 sq ft with 6 hours of sunlight in winter.',
  });
  console.log('Status:', t2.status);
  console.log('Normalized Season:', t2.context.season);
  console.log('Required Knowledge Sources:', t2.routing.requiredKnowledgeSources);
  console.log('Plant Health Records Retrieved:', t2.retrievedKnowledge.map((r) => r.record_id));
  console.log('Climate Records Retrieved:', t2.retrievedClimateKnowledge.map((r) => `${r.record_id} (${r.knowledge_type})`));
  console.log('Generated Plan:', t2.currentPlan.summary);
  console.log('Tasks Count:', t2.tasks.length);

  assert.strictEqual(t2.status, 'READY');
  assert.strictEqual(t2.context.season, 'WINTER');
  assert(t2.routing.requiredKnowledgeSources.includes('PLANT_HEALTH'));
  assert(t2.routing.requiredKnowledgeSources.includes('CLIMATE_LOCATION'));
  assert(t2.retrievedKnowledgeCount > 0, 'Must retrieve plant_health_knowledge');
  assert(t2.retrievedClimateKnowledgeCount > 0, 'Must retrieve climate_location_knowledge');
  assert(
    t2.retrievedClimateKnowledge.some((c) => c.record_id === 'SEA_IN_GORAKHPUR_WIN_001'),
    'Must retrieve Gorakhpur Winter seasonal context SEA_IN_GORAKHPUR_WIN_001'
  );
  assert(
    t2.retrievedClimateKnowledge.some((c) => c.record_id === 'LOC_IN_GORAKHPUR_001' || c.record_id === 'REG_IN_GORAKHPUR_001'),
    'Must resolve Gorakhpur location/regional hierarchy'
  );
  assert(t2.tasks.length >= 2, 'Planner must generate actionable tasks');
  console.log('✅ TEST 2 PASSED\n');

  // ---------------------------------------------------------------------------
  // TEST 3 — GENERAL QUESTION WITHOUT GARDEN CONTEXT
  // ---------------------------------------------------------------------------
  console.log('--- TEST 3: General Question Without Garden Context ---');
  createFreshSession('session_t3');
  const t3 = await handleUserMessage({
    sessionId: 'session_t3',
    userMessage: 'What is photosynthesis?',
  });
  console.log('Status:', t3.status);
  console.log('Missing Fields:', t3.routing.missingFields);
  console.log('Required Sources:', t3.routing.requiredKnowledgeSources);
  console.log('Reply:', t3.reply);

  assert.strictEqual(t3.status, 'READY');
  assert.deepStrictEqual(t3.routing.missingFields, []);
  assert.strictEqual(t3.retrievedKnowledgeCount, 0);
  assert.strictEqual(t3.retrievedClimateKnowledgeCount, 0);
  assert(t3.reply.toLowerCase().includes('photosynthesis'));
  console.log('✅ TEST 3 PASSED\n');

  // ---------------------------------------------------------------------------
  // TEST 4 — PLANT QUESTION
  // ---------------------------------------------------------------------------
  console.log('--- TEST 4: Plant Question ("How much water does tomato need?") ---');
  createFreshSession('session_t4');
  const t4 = await handleUserMessage({
    sessionId: 'session_t4',
    userMessage: 'How much water does tomato need?',
  });
  console.log('Status:', t4.status);
  console.log('Required Sources:', t4.routing.requiredKnowledgeSources);
  console.log('Plant Health Records:', t4.retrievedKnowledge.map((r) => r.record_id));
  console.log('Climate Records:', t4.retrievedClimateKnowledgeCount);
  console.log('Reply:', t4.reply);

  assert.strictEqual(t4.status, 'READY');
  assert.deepStrictEqual(t4.routing.requiredKnowledgeSources, ['PLANT_HEALTH']);
  assert(t4.retrievedKnowledgeCount > 0);
  assert.strictEqual(t4.retrievedClimateKnowledgeCount, 0);
  console.log('✅ TEST 4 PASSED\n');

  // ---------------------------------------------------------------------------
  // TEST 5 — LOCATION + SEASON QUESTION
  // ---------------------------------------------------------------------------
  console.log('--- TEST 5: Location + Season Question ("What should I plant in Gorakhpur this winter?") ---');
  createFreshSession('session_t5');
  const t5 = await handleUserMessage({
    sessionId: 'session_t5',
    userMessage: 'What should I plant in Gorakhpur this winter?',
  });
  console.log('Status:', t5.status);
  console.log('Required Sources:', t5.routing.requiredKnowledgeSources);
  console.log('Climate Records:', t5.retrievedClimateKnowledge.map((r) => r.record_id));
  console.log('Plant Health Records:', t5.retrievedKnowledge.map((r) => `${r.record_id} (${r.plant})`));
  console.log('Reply:', t5.reply);

  assert.strictEqual(t5.status, 'READY');
  assert(t5.routing.requiredKnowledgeSources.includes('CLIMATE_LOCATION'));
  assert(t5.routing.requiredKnowledgeSources.includes('PLANT_HEALTH'));
  assert(t5.retrievedClimateKnowledgeCount > 0);
  assert(t5.retrievedKnowledgeCount > 0);
  console.log('✅ TEST 5 PASSED\n');

  // ---------------------------------------------------------------------------
  // TEST 6 — CONVERSATION MEMORY QUESTION
  // ---------------------------------------------------------------------------
  console.log('--- TEST 6: Conversation Memory Question ("What did I tell you yesterday?") ---');
  // Reuse session_t2 which already has contextSummary + conversationHistory
  const t6 = await handleUserMessage({
    sessionId: 'session_t2',
    userMessage: 'What did I tell you yesterday?',
  });
  console.log('Status:', t6.status);
  console.log('Required Sources:', t6.routing.requiredKnowledgeSources);
  console.log('needsSessionContext:', t6.routing.needsSessionContext);
  console.log('Reply:', t6.reply);

  assert.strictEqual(t6.status, 'READY');
  assert(t6.routing.requiredKnowledgeSources.includes('SESSION_CONTEXT'));
  assert.strictEqual(t6.routing.needsSessionContext, true);
  assert.strictEqual(t6.retrievedKnowledgeCount, 0);
  assert.strictEqual(t6.retrievedClimateKnowledgeCount, 0);
  assert(t6.reply.includes('Gorakhpur'));
  console.log('✅ TEST 6 PASSED\n');

  // ---------------------------------------------------------------------------
  // TEST 7 — PHOTO DIAGNOSIS
  // ---------------------------------------------------------------------------
  console.log('--- TEST 7: Photo Diagnosis ("Leaves have yellow spots") ---');
  const fakeImageBuffer = Buffer.from('fake-jpeg-bytes-for-tomato-leaf');
  const t7 = await handlePhotoUpload({
    sessionId: 'session_t2',
    imageBuffer: fakeImageBuffer,
    mimeType: 'image/jpeg',
    userNote: 'Leaves have yellow spots',
  });
  console.log('Photo Observation:', JSON.stringify(t7.observation));
  console.log('Updated Phase:', t7.updatedPhase);
  console.log('Plant Health Records:', t7.retrievedKnowledge.map((r) => `${r.record_id} (${r.problem_name || r.knowledge_type})`));
  console.log('Climate Records:', t7.retrievedClimateKnowledge.map((r) => r.record_id));
  console.log('Recommendation:', t7.recommendation);

  assert.strictEqual(t7.observation.plantDetected, 'tomato');
  assert.strictEqual(t7.updatedPhase, 'GROWING');
  assert(t7.retrievedKnowledge.length > 0);
  assert(t7.retrievedClimateKnowledge.length > 0);
  assert(t7.recommendation.includes('Visual confidence is 72%'));
  console.log('✅ TEST 7 PASSED\n');

  // ---------------------------------------------------------------------------
  // TEST 8 — CONTEXT SUMMARIZER (RAW HISTORY PRESERVATION + BOUNDED AI PROMPTS)
  // ---------------------------------------------------------------------------
  console.log('--- TEST 8: Context Summarizer & Raw History Preservation ---');
  // Send additional messages on session_t2 to exceed SUMMARY_MESSAGE_THRESHOLD (6)
  await handleUserMessage({ sessionId: 'session_t2', userMessage: 'Thanks for the update!' });
  await handleUserMessage({ sessionId: 'session_t2', userMessage: 'Should I check the leaves again tomorrow?' });
  const t8Turn = await handleUserMessage({ sessionId: 'session_t2', userMessage: 'Okay, I will check them in the morning.' });

  const finalSession = await sessionRepo.findSessionById('session_t2');
  const rawHistoryCount = finalSession.conversationHistory.length;
  const summaryText = finalSession.gardenState.contextSummary;
  const lastSummarizedCount = finalSession.gardenState.summaryMeta.lastSummarizedMessageCount;

  console.log('Raw conversationHistory length in DB:', rawHistoryCount);
  console.log('lastSummarizedMessageCount:', lastSummarizedCount);
  console.log('Compact Context Summary:\n' + summaryText);

  assert.strictEqual(rawHistoryCount, 12, 'All 12 raw messages (6 turns) must be preserved in MongoDB');
  assert(summaryText.includes('Location: Gorakhpur, India | Season: WINTER'));
  assert(summaryText.includes('Land: 100 sq_ft'));
  assert(summaryText.includes('Sunlight: 6h/day'));
  assert(summaryText.includes('Unresolved Issues: tomato: spotted'));
  assert(summaryText.includes('User Preferences: organic mulching'));
  assert.strictEqual(t8Turn.summaryUpdated, true, 'Summarizer should trigger when 6 messages accumulate since last summary');

  // Verify prompts only include RECENT_MESSAGES_WINDOW (4) messages + COMPACT CONTEXT SUMMARY
  const rewriterPrompt = buildUserPrompt(finalSession, 'Any new tasks today?');
  const plannerPrompt = buildPlannerPrompt(finalSession, finalSession.gardenState.context, [], null, [], 'CREATE_GARDEN_PLAN');
  const photoPrompt = buildPhotoPrompt(finalSession, 'Checking leaf recovery');

  assert(rewriterPrompt.includes('COMPACT CONTEXT SUMMARY:'), 'QueryRewriter prompt must include compact summary');
  assert(rewriterPrompt.includes('RECENT MESSAGES (last 4):'), 'QueryRewriter prompt must bound recent messages to 4');
  assert(!rewriterPrompt.includes('I want to grow tomatoes in Gorakhpur in 100 sq ft'), 'Old turn #1 raw message must not be repeated in recent window');
  assert(plannerPrompt.includes('COMPACT CONTEXT SUMMARY:'), 'Planner prompt must include compact summary');
  assert(plannerPrompt.includes('- Calendar Date:'), 'Planner prompt must separate Calendar Date, Garden Day, and Season');
  assert(photoPrompt.includes('COMPACT CONTEXT SUMMARY:'), 'PhotoReader prompt must include compact summary');

  console.log('✅ TEST 8 PASSED\n');
  console.log('================================================================');
  console.log(' ALL 8 VERIFICATION TESTS PASSED SUCCESSFULLY!');
  console.log('================================================================');
}

runAllVerificationTests().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
