'use strict';

/**
 * Demo Path 1:
 *   USER (incomplete gardening request)
 *   -> Query Rewriter detects missing context & asks clarification question
 *   -> USER supplies missing context
 *   -> Unified plant_health_knowledge retrieval (PLANT_BASIC, PLANTING, SOIL, SUNLIGHT, WATER, CLIMATE)
 *   -> Phase-aware Planner
 *   -> 7-day gardening plan & outdoor tasks
 */

const sessionRepo = require('../src/repositories/sessionRepository');
const ai = require('../src/services/ai');
const { handleUserMessage } = require('../src/services/orchestrator/gardenOrchestrator');

async function isOllamaReachable() {
  try {
    const res = await fetch('http://localhost:11434/api/tags');
    return res.ok;
  } catch (_) {
    return false;
  }
}

async function runDemo1() {
  console.log('============================================================');
  console.log('🌱 AI GARDENER — DEMO PATH 1 (Clarification -> Knowledge -> Plan)');
  console.log('============================================================\n');

  // Use in-memory session store if MongoDB Atlas is not connected in this CLI run
  const store = new Map();
  sessionRepo.createSession = async (userId) => {
    const doc = {
      _id: 'demo_session_1',
      userId,
      gardenState: { context: {}, currentPhase: 'PLANTING', currentDay: 1, plantsGrowing: [], photoObservations: [], observations: [] },
      tasks: [],
      conversationHistory: [],
      createdAt: new Date(),
    };
    store.set(doc._id, doc);
    return doc;
  };
  sessionRepo.findSessionById = async (id) => store.get(id) || null;
  sessionRepo.updateSession = async (id, updates) => {
    const s = store.get(id);
    for (const [k, v] of Object.entries(updates)) {
      if (k.startsWith('gardenState.')) {
        const subKey = k.split('.')[1];
        s.gardenState[subKey] = v;
      } else {
        s[k] = v;
      }
    }
    return s;
  };

  const ollamaOnline = await isOllamaReachable();
  if (!ollamaOnline) {
    console.log('[Info] Local Ollama (11434) not detected — using deterministic Gemma 3 responses + live CSV knowledge base.\n');
    let callIdx = 0;
    ai.generateStructuredOutput = async (_sys, _usr, schema) => {
      callIdx++;
      if (callIdx === 1) {
        return schema.parse({
          status: 'NEEDS_CONTEXT',
          intent: 'CREATE_GARDEN_PLAN',
          extractedContext: {
            location: { city: 'Gorakhpur', country: 'India' },
            preferredPlants: ['tomato'],
          },
          missingRequiredContext: ['land.area', 'sunlightHours', 'season'],
          clarificationQuestion:
            'Great! Before I build your tomato plan for Gorakhpur, how much growing space do you have, how many hours of direct sunlight does it receive daily, and which season are you planning for?',
        });
      }
      if (callIdx === 2) {
        return schema.parse({
          status: 'READY',
          intent: 'PROVIDE_CONTEXT',
          extractedContext: {
            land: { area: 100, unit: 'sq_ft' },
            sunlightHours: 6,
            season: 'winter',
          },
          needsKnowledge: true,
          knowledgeQuery: {
            semanticQuery: 'tomato planting soil sunlight water spacing requirements winter',
            knowledgeTypes: ['PLANT_BASIC', 'PLANTING', 'SOIL', 'SUNLIGHT', 'WATER', 'CLIMATE'],
            plantFilter: 'tomato',
          },
          needsClimateKnowledge: true,
          climateQuery: {
            semanticQuery: 'Gorakhpur winter rabi temperature rainfall fog gardening',
            locationName: 'Gorakhpur',
            country: 'India',
            normalizedSeason: 'WINTER',
            knowledgeTypes: ['LOCATION_MAPPING', 'REGIONAL_CLIMATE', 'SEASONAL_CONTEXT'],
          },
          needsPlanner: true,
        });
      }
      return schema.parse({
        updatedPhase: 'PLANTING',
        tasks: [
          {
            taskId: 'task_001',
            title: 'Loosen top 8–10 inches of soil & mix compost',
            description: 'Clear weeds in your 100 sq ft bed in Gorakhpur and work in aged compost for well-drained loamy soil (pH 6.0–6.8).',
            phase: 'PLANTING',
            status: 'PENDING',
            scheduledFor: 'Day 1',
          },
          {
            taskId: 'task_002',
            title: 'Space tomato transplants 18–24 inches apart',
            description: 'Set sturdy tomato seedlings deep enough to bury the lower stem in the sunniest 6-hour zone.',
            phase: 'PLANTING',
            status: 'PENDING',
            scheduledFor: 'Day 2',
          },
          {
            taskId: 'task_003',
            title: 'Water deeply at soil line & install stakes',
            description: 'Water at the base in mid-morning (avoiding foliage during Gorakhpur winter fog) and place 5-foot stakes beside each plant.',
            phase: 'PLANTING',
            status: 'PENDING',
            scheduledFor: 'Day 3',
          },
        ],
        currentPlan: {
          durationDays: 7,
          summary: '7-Day Winter (Rabi) Tomato Bed Preparation & Transplanting Plan for Gorakhpur (100 sq ft, 6h sun)',
          dailySchedule: [],
        },
        summary:
          'Your 7-day winter tomato planting plan for Gorakhpur is ready! Head outside today to loosen the top 8–10 inches of soil and mix in compost.',
      });
    };
  }

  const session = await sessionRepo.createSession('demo_user');
  console.log(`Created Session: ${session._id} (Phase: ${session.gardenState.currentPhase})\n`);

  // Turn 1: Incomplete context
  const msg1 = 'I have some land in Gorakhpur and want to start growing tomatoes.';
  console.log(`👤 USER: "${msg1}"`);
  const res1 = await handleUserMessage({ sessionId: session._id, userMessage: msg1 });
  console.log(`🤖 STATUS: ${res1.status} | Missing: [${res1.routing.missingFields.join(', ')}]`);
  console.log(`🤖 ASSISTANT: "${res1.reply}"\n`);

  // Turn 2: User supplies missing context (including season)
  const msg2 = 'It is about 100 sq ft, gets 6 hours of direct sunlight, and I am planning for winter.';
  console.log(`👤 USER: "${msg2}"`);
  const res2 = await handleUserMessage({ sessionId: session._id, userMessage: msg2 });
  console.log(`🤖 STATUS: ${res2.status} | Plant Health Records: ${res2.retrievedKnowledgeCount} | Climate Records: ${res2.retrievedClimateKnowledgeCount}`);
  for (const k of res2.retrievedKnowledge) {
    console.log(`   🌿 [${k.record_id}] (${k.knowledge_type}) ${k.title} — ${k.source_name}`);
  }
  for (const c of res2.retrievedClimateKnowledge) {
    console.log(`   🌦️ [${c.record_id}] (${c.knowledge_type}) ${c.location_name} [${c.normalized_season || 'N/A'}] — ${c.source_name}`);
  }
  console.log(`\n🤖 ASSISTANT: "${res2.reply}"`);
  console.log('\n📋 GENERATED OUTDOOR TASKS:');
  for (const t of res2.tasks) {
    console.log(`   • [${t.scheduledFor}] (${t.phase}) ${t.title}: ${t.description}`);
  }
}

runDemo1().catch((err) => {
  console.error('Demo 1 failed:', err);
  process.exit(1);
});
