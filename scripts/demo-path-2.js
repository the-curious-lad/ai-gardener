'use strict';

/**
 * Demo Path 2:
 *   USER uploads tomato leaf photo
 *   -> Gemma 3 Vision produces structured PhotoObservation (with confidence & uncertainties)
 *   -> Unified plant_health_knowledge search (DISEASE, PEST, NUTRIENT_DEFICIENCY, HEALTHY_BASELINE)
 *   -> Planner evaluates observation + extension evidence
 *   -> Updates garden state & generates actionable outdoor inspection/care tasks
 */

const sessionRepo = require('../src/repositories/sessionRepository');
const ai = require('../src/services/ai');
const { handlePhotoUpload } = require('../src/services/orchestrator/gardenOrchestrator');

async function isOllamaReachable() {
  try {
    const res = await fetch('http://localhost:11434/api/tags');
    return res.ok;
  } catch (_) {
    return false;
  }
}

async function runDemo2() {
  console.log('============================================================');
  console.log('📷 AI GARDENER — DEMO PATH 2 (Photo -> Vision -> Knowledge -> Replan)');
  console.log('============================================================\n');

  const store = new Map();
  const initialSession = {
    _id: 'demo_session_2',
    userId: 'demo_user',
    gardenState: {
      context: {
        location: { city: 'Gorakhpur', country: 'India' },
        land: { area: 100, unit: 'sq_ft' },
        preferredPlants: ['tomato'],
        sunlightHours: 6,
        season: 'WINTER',
      },
      currentPhase: 'GROWING',
      currentDay: 24,
      plantsGrowing: [{ plant: 'tomato', growthStage: 'vegetative', healthStatus: 'healthy' }],
      photoObservations: [],
      observations: [],
    },
    tasks: [],
    conversationHistory: [],
  };
  store.set(initialSession._id, initialSession);

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
    console.log('[Info] Local Ollama (11434) not detected — using deterministic Gemma 3 Vision + live CSV knowledge base.\n');
    ai.analyzeImage = async () =>
      JSON.stringify({
        plantDetected: 'tomato',
        visibleSymptoms: ['yellowing lower leaves', 'brown circular spots with concentric rings'],
        leafCondition: 'spotted',
        possiblePestSigns: [],
        possibleDiseaseSigns: ['early blight target-like lesions'],
        growthStageEstimate: 'vegetative',
        severity: 'moderate',
        confidence: 0.72,
        uncertainties: ['Single leaf angle; check stem lesions and underside of leaves to confirm'],
      });

    ai.generateStructuredOutput = async (_sys, _usr, schema) =>
      schema.parse({
        updatedPhase: 'GROWING',
        tasks: [
          {
            taskId: 'task_101',
            title: 'Prune & bag spotted lower tomato leaves',
            description: 'Carefully clip the affected lower leaves showing concentric brown spots and dispose of them outside the garden (do not compost).',
            phase: 'MAINTENANCE',
            status: 'PENDING',
            scheduledFor: 'Day 1',
          },
          {
            taskId: 'task_102',
            title: 'Apply organic mulch around stem base',
            description: 'Lay 2–3 inches of straw or dry leaf mulch around the base of your tomato plants to block soil-splash of fungal spores.',
            phase: 'MAINTENANCE',
            status: 'PENDING',
            scheduledFor: 'Day 1',
          },
          {
            taskId: 'task_103',
            title: 'Inspect upper canopy & water at soil line only',
            description: 'Check upper leaves in 48 hours for new spots and ensure all watering is done strictly at ground level in the morning.',
            phase: 'GROWING',
            status: 'PENDING',
            scheduledFor: 'Day 3',
          },
        ],
        currentPlan: {
          durationDays: 7,
          summary: '7-Day Early Blight Containment & Canopy Monitoring Plan',
          dailySchedule: [],
        },
        summary:
          'The photo shows concentric brown spots and yellowing on the lower leaves, which commonly points toward early blight (though visual observation alone is not a certainty). I have updated your tasks to prune affected lower leaves, mulch the soil base to stop spore splash, and monitor new growth.',
      });
  }

  // Minimal 1x1 JPEG buffer for test upload
  const sampleImageBuffer = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');

  console.log('👤 USER: [Uploads tomato_leaf.jpg] "My lower tomato leaves have brown spots and yellow halos."');
  const result = await handlePhotoUpload({
    sessionId: 'demo_session_2',
    imageBuffer: sampleImageBuffer,
    mimeType: 'image/jpeg',
    userNote: 'My lower tomato leaves have brown spots and yellow halos.',
  });

  console.log('\n👁️ GEMMA 3 VISION OBSERVATION (No direct DB mutation):');
  console.log(JSON.stringify(result.observation, null, 2));

  console.log(`\n📚 RETRIEVED FROM plant_health_knowledge (${result.retrievedKnowledge.length} records):`);
  for (const k of result.retrievedKnowledge) {
    console.log(`   • [${k.record_id}] (${k.knowledge_type}) ${k.title} — ${k.source_name}`);
  }

  console.log(`\n🤖 PLANNER RECOMMENDATION (Phase: ${result.updatedPhase}):`);
  console.log(`"${result.recommendation}"`);

  console.log('\n📋 UPDATED OUTDOOR TASKS:');
  for (const t of result.updatedTasks) {
    console.log(`   • [${t.scheduledFor}] (${t.phase}) ${t.title}: ${t.description}`);
  }

  const updatedSession = await sessionRepo.findSessionById('demo_session_2');
  console.log('\n💾 UPDATED PERSISTENT GARDEN STATE (plantsGrowing):');
  console.log(JSON.stringify(updatedSession.gardenState.plantsGrowing, null, 2));
}

runDemo2().catch((err) => {
  console.error('Demo 2 failed:', err);
  process.exit(1);
});
