'use strict';

const { z } = require('zod');

// ── Normalized Season Values & Helper ─────────────────────────────────────────

const SEASON_VALUES = [
  'WINTER',
  'SUMMER',
  'SPRING',
  'AUTUMN',
  'MONSOON',
  'WET_SEASON',
  'DRY_SEASON',
  'YEAR_ROUND',
  'TRANSITIONAL',
  'UNKNOWN',
];

/**
 * Normalize raw season strings into canonical SEASON_VALUES or null.
 *
 * @param {any} val
 * @returns {string|null}
 */
function normalizeSeason(val) {
  if (val === null || val === undefined) return null;
  const raw = String(val).trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (!raw || raw === 'NULL' || raw === 'NONE' || raw === 'UNKNOWN_SEASON') return null;

  if (SEASON_VALUES.includes(raw)) return raw;
  if (raw === 'FALL' || raw.includes('AUTUMN') || raw.includes('SHARAD') || raw.includes('POST_MONSOON')) return 'AUTUMN';
  if (raw.includes('WINTER') || raw.includes('RABI') || raw.includes('COLD')) return 'WINTER';
  if (raw.includes('MONSOON') || raw.includes('KHARIF') || raw.includes('RAINY')) return 'MONSOON';
  if (raw.includes('SUMMER') || raw.includes('ZAID') || raw.includes('HOT') || raw.includes('PRE_MONSOON')) return 'SUMMER';
  if (raw.includes('SPRING') || raw.includes('VASANT')) return 'SPRING';
  if (raw.includes('WET')) return 'WET_SEASON';
  if (raw.includes('DRY')) return 'DRY_SEASON';
  if (raw.includes('YEAR') || raw.includes('ALL_SEASON') || raw.includes('PERENNIAL')) return 'YEAR_ROUND';
  if (raw.includes('TRANSITION')) return 'TRANSITIONAL';

  return 'UNKNOWN';
}

const SeasonEnumSchema = z.preprocess(
  normalizeSeason,
  z.enum(SEASON_VALUES).nullable()
);

// ── Coercion Helpers for Small Local Models (Gemma 3 4B) ──────────────────────

function toStringArray(val) {
  if (val === null || val === undefined) return undefined;
  if (Array.isArray(val)) return val.map((v) => String(v).trim()).filter(Boolean);
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return [];
    return trimmed.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function toNullableNumber(val) {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number' && !Number.isNaN(val)) return val;
  if (typeof val === 'string') {
    const match = val.match(/(\d+(?:\.\d+)?)/);
    return match ? parseFloat(match[1]) : null;
  }
  return null;
}

function toLocationObj(val) {
  if (val === null || val === undefined) return undefined;
  if (typeof val === 'string') {
    const parts = val.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 3) {
      return { city: parts[0] || null, state: parts[1] || null, country: parts[2] || null };
    }
    if (parts.length === 2) {
      return { city: parts[0] || null, state: parts[1] || null, country: null };
    }
    return { city: parts[0] || null, state: null, country: null };
  }
  if (typeof val === 'object') {
    const city = val.city ?? val.name ?? val.town ?? val.district ?? val.location_name ?? null;
    const state = val.state ?? val.state_province ?? val.province ?? val.region ?? null;
    const country = val.country ?? null;
    return {
      city: city != null ? String(city).trim() || null : null,
      state: state != null ? String(state).trim() || null : null,
      country: country != null ? String(country).trim() || null : null,
    };
  }
  return undefined;
}

function toLandObj(val) {
  if (val === null || val === undefined) return undefined;
  if (typeof val === 'number') {
    return { area: val, unit: 'sq_ft' };
  }
  if (typeof val === 'string') {
    const num = toNullableNumber(val);
    const unitMatch = val.replace(/[\d.\s]+/g, '').trim();
    return { area: num, unit: unitMatch || 'sq_ft' };
  }
  if (typeof val === 'object') {
    const areaVal = val.area ?? val.size ?? val.value ?? val.amount ?? null;
    const unitVal = val.unit ?? val.units ?? 'sq_ft';
    return {
      area: toNullableNumber(areaVal),
      unit: unitVal ? String(unitVal).trim() : 'sq_ft',
    };
  }
  return undefined;
}

/**
 * Normalize top-level flat keys that a 4B model might emit inside extractedContext
 * (e.g., { city: "Shimla", state: "Himachal Pradesh", landArea: 100, plants: ["hibiscus"] })
 * into the canonical nested structure expected by ExtractedContextSchema.
 */
function preprocessExtractedContext(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = { ...raw };

  // Normalize location if flat keys were used
  const flatCity = raw.city ?? raw.location_name ?? raw.town ?? raw.district;
  const flatState = raw.state ?? raw.state_province ?? raw.province;
  const flatCountry = raw.country;
  if (flatCity !== undefined || flatState !== undefined || flatCountry !== undefined) {
    const existingLoc = toLocationObj(raw.location) || {};
    out.location = {
      city: existingLoc.city ?? (flatCity != null ? String(flatCity).trim() : undefined),
      state: existingLoc.state ?? (flatState != null ? String(flatState).trim() : undefined),
      country: existingLoc.country ?? (flatCountry != null ? String(flatCountry).trim() : undefined),
    };
  }

  // Normalize land if flat keys were used
  const flatArea = raw.landArea ?? raw.land_area ?? raw.area ?? raw.space ?? raw.landSize ?? raw.land_size;
  const flatUnit = raw.landUnit ?? raw.land_unit ?? raw.unit;
  if (flatArea !== undefined) {
    const existingLand = toLandObj(raw.land) || {};
    const parsedFromFlat = toLandObj(flatArea) || {};
    out.land = {
      area: existingLand.area ?? parsedFromFlat.area,
      unit: existingLand.unit || (flatUnit ? String(flatUnit).trim() : parsedFromFlat.unit || 'sq_ft'),
    };
  }

  // Normalize plants if flat keys were used
  const flatPlants = raw.plants ?? raw.plant ?? raw.crop ?? raw.crops ?? raw.preferred_plants;
  if (out.preferredPlants === undefined && flatPlants !== undefined) {
    out.preferredPlants = toStringArray(flatPlants);
  }

  // Normalize sunlightHours if flat keys were used
  const flatSun = raw.sunlight ?? raw.sunlight_hours ?? raw.sunHours ?? raw.sun_hours;
  if (out.sunlightHours === undefined && flatSun !== undefined) {
    out.sunlightHours = toNullableNumber(flatSun);
  }

  return out;
}

// ── Garden Context ────────────────────────────────────────────────────────────

const GardenContextSchema = z.object({
  location: z.preprocess(
    (v) => toLocationObj(v) ?? {},
    z.object({
      city:    z.string().nullable().default(null),
      state:   z.string().nullable().default(null),
      country: z.string().nullable().default(null),
    }).default({})
  ),
  land: z.preprocess(
    (v) => toLandObj(v) ?? {},
    z.object({
      area: z.number().nullable().default(null),
      unit: z.string().nullable().default('sq_ft'),
    }).default({})
  ),
  preferredPlants:   z.preprocess((v) => toStringArray(v) ?? [], z.array(z.string()).default([])),
  sunlightHours:     z.preprocess(toNullableNumber, z.number().nullable().default(null)),
  soilType:          z.string().nullable().default(null),
  waterAvailability: z.string().nullable().default(null),
  season:            SeasonEnumSchema.default(null),
});

// ── Extracted Context (partial — only fields mentioned in the message) ────────

const ExtractedContextSchema = z.preprocess(
  preprocessExtractedContext,
  z.object({
    location: z.preprocess(
      toLocationObj,
      z.object({
        city:    z.string().nullable().optional(),
        state:   z.string().nullable().optional(),
        country: z.string().nullable().optional(),
      }).optional()
    ),
    land: z.preprocess(
      toLandObj,
      z.object({
        area: z.number().nullable().optional(),
        unit: z.string().nullable().optional(),
      }).optional()
    ),
    preferredPlants:   z.preprocess(toStringArray, z.array(z.string()).optional()),
    sunlightHours:     z.preprocess(
      (v) => (v === undefined ? undefined : toNullableNumber(v)),
      z.number().nullable().optional()
    ),
    soilType:          z.string().nullable().optional(),
    waterAvailability: z.string().nullable().optional(),
    season:            SeasonEnumSchema.optional(),
    userPreferences:   z.preprocess(toStringArray, z.array(z.string()).optional()),
  })
);

// ── Knowledge Query (plant_health_knowledge) ──────────────────────────────────

const PLANT_KNOWLEDGE_TYPES = [
  'PLANT_BASIC', 'PLANTING', 'SOIL', 'WATER', 'SUNLIGHT', 'CLIMATE',
  'GROWTH_STAGE', 'NUTRITION', 'NUTRIENT_DEFICIENCY', 'HEALTHY_BASELINE',
  'DISEASE', 'PEST', 'ENVIRONMENTAL_STRESS', 'PHYSIOLOGICAL_DISORDER',
  'PREVENTION', 'MAINTENANCE', 'HARVESTING',
];

function filterValidEnumArray(val, allowed, fallback = []) {
  const arr = toStringArray(val) ?? [];
  const valid = arr
    .map((s) => s.toUpperCase().replace(/[\s-]+/g, '_'))
    .filter((s) => allowed.includes(s));
  return valid.length > 0 ? valid : fallback;
}

const KnowledgeQuerySchema = z.preprocess(
  (v) => {
    if (!v || typeof v !== 'object' || !v.semanticQuery) return null;
    return v;
  },
  z.object({
    semanticQuery:  z.string(),
    knowledgeTypes: z.preprocess(
      (v) => filterValidEnumArray(v, PLANT_KNOWLEDGE_TYPES, ['PLANT_BASIC', 'PLANTING']),
      z.array(z.enum(PLANT_KNOWLEDGE_TYPES)).default(['PLANT_BASIC', 'PLANTING'])
    ),
    plantFilter: z.preprocess(
      (v) => (Array.isArray(v) ? (v[0] || null) : (v || null)),
      z.string().nullable().default(null)
    ),
  }).nullable().default(null)
);

// ── Climate Location Query (climate_location_knowledge) ───────────────────────

const CLIMATE_KNOWLEDGE_TYPES = [
  'LOCATION_MAPPING',
  'REGIONAL_CLIMATE',
  'SEASONAL_CONTEXT',
  'CLIMATE_ZONE',
];

const ClimateQuerySchema = z.preprocess(
  (v) => {
    if (!v || typeof v !== 'object' || !v.semanticQuery) return null;
    return v;
  },
  z.object({
    semanticQuery:    z.string(),
    locationName:     z.string().nullable().default(null),
    stateProvince:    z.string().nullable().default(null),
    country:          z.string().nullable().default(null),
    region:           z.string().nullable().default(null),
    subregion:        z.string().nullable().default(null),
    normalizedSeason: SeasonEnumSchema.default(null),
    knowledgeTypes:   z.preprocess(
      (v) => filterValidEnumArray(v, CLIMATE_KNOWLEDGE_TYPES, ['LOCATION_MAPPING', 'REGIONAL_CLIMATE', 'SEASONAL_CONTEXT']),
      z.array(z.enum(CLIMATE_KNOWLEDGE_TYPES)).default([
        'LOCATION_MAPPING',
        'REGIONAL_CLIMATE',
        'SEASONAL_CONTEXT',
      ])
    ),
  }).nullable().default(null)
);

// ── Router Decision ───────────────────────────────────────────────────────────

const KNOWLEDGE_SOURCES = [
  'PLANT_HEALTH',
  'CLIMATE_LOCATION',
  'SESSION_CONTEXT',
];

const INTENT_VALUES = [
  'CREATE_GARDEN_PLAN',
  'PROVIDE_CONTEXT',
  'REPORT_OBSERVATION',
  'ASK_QUESTION',
  'TASK_UPDATE',
  'GENERAL_CHAT',
  'OUT_OF_SCOPE',
];

const RouterDecisionSchema = z.object({
  status: z.preprocess(
    (v) => (String(v).toUpperCase() === 'READY' ? 'READY' : 'NEEDS_CONTEXT'),
    z.enum(['NEEDS_CONTEXT', 'READY'])
  ),

  intent: z.preprocess(
    (v) => {
      const norm = String(v || '').toUpperCase().trim();
      return INTENT_VALUES.includes(norm) ? norm : 'CREATE_GARDEN_PLAN';
    },
    z.enum(INTENT_VALUES)
  ),

  normalizedQuery:        z.string().nullable().default(null),
  extractedContext:       z.preprocess((v) => (v && typeof v === 'object' ? v : {}), ExtractedContextSchema.default({})),
  missingRequiredContext: z.preprocess((v) => toStringArray(v) ?? [], z.array(z.string()).default([])),

  requiredKnowledgeSources: z.preprocess(
    (v) => filterValidEnumArray(v, KNOWLEDGE_SOURCES, []),
    z.array(z.enum(KNOWLEDGE_SOURCES)).default([])
  ),
  requiredTools: z.preprocess((v) => toStringArray(v) ?? [], z.array(z.string()).default([])),

  needsKnowledge:        z.boolean().catch(false),
  knowledgeQuery:        KnowledgeQuerySchema,
  needsClimateKnowledge: z.boolean().catch(false),
  climateQuery:          ClimateQuerySchema,
  needsSessionContext:   z.boolean().catch(false),
  needsPhotoAnalysis:    z.boolean().catch(false),
  needsPlanner:          z.boolean().catch(false),

  clarificationQuestion: z.string().nullable().default(null),
  directAnswer:          z.string().nullable().default(null),
});

// ── Photo Observation ─────────────────────────────────────────────────────────

const PhotoObservationSchema = z.object({
  plantDetected:        z.string().nullable().default(null),
  visibleSymptoms:      z.preprocess((v) => toStringArray(v) ?? [], z.array(z.string()).default([])),
  leafCondition:        z.string().nullable().default(null),
  possiblePestSigns:    z.preprocess((v) => toStringArray(v) ?? [], z.array(z.string()).default([])),
  possibleDiseaseSigns: z.preprocess((v) => toStringArray(v) ?? [], z.array(z.string()).default([])),
  growthStageEstimate:  z.string().nullable().default(null),
  severity:             z.string().nullable().default(null),
  confidence:           z.preprocess((v) => toNullableNumber(v) ?? 0.6, z.number().min(0).max(1).default(0.6)),
  uncertainties:        z.preprocess((v) => toStringArray(v) ?? [], z.array(z.string()).default([])),
});

// ── Planner Output ────────────────────────────────────────────────────────────

const PHASE_VALUES = ['PLANTING', 'GROWING', 'MAINTENANCE'];
const TASK_STATUS_VALUES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'RESCHEDULED', 'FAILED'];

const TaskOutputSchema = z.preprocess(
  (v) => {
    if (!v || typeof v !== 'object') return v;
    return {
      ...v,
      title: String(v.title || v.task || v.action || v.name || v.activity || 'Garden Care Step').trim(),
      description: String(v.description || v.details || v.instructions || v.notes || '').trim(),
      scheduledFor: v.scheduledFor || v.day || v.schedule || 'Day 1',
    };
  },
  z.object({
    taskId:       z.string().default('task_001'),
    title:        z.string(),
    description:  z.string().default(''),
    phase:        z.preprocess(
      (v) => {
        const norm = String(v || '').toUpperCase().trim();
        return PHASE_VALUES.includes(norm) ? norm : 'PLANTING';
      },
      z.enum(PHASE_VALUES)
    ),
    status:       z.preprocess(
      (v) => {
        const norm = String(v || '').toUpperCase().trim();
        return TASK_STATUS_VALUES.includes(norm) ? norm : 'PENDING';
      },
      z.enum(TASK_STATUS_VALUES).default('PENDING')
    ),
    scheduledFor: z.string().nullable().default('Day 1'),
  })
);

const PlannerOutputSchema = z.preprocess(
  (v) => {
    if (!v || typeof v !== 'object') return v;
    const root = v.plan && typeof v.plan === 'object' && !Array.isArray(v.plan)
      ? v.plan
      : v.gardenPlan && typeof v.gardenPlan === 'object'
        ? v.gardenPlan
        : v;

    const rawTasks = Array.isArray(root.tasks) && root.tasks.length > 0
      ? root.tasks
      : Array.isArray(root.currentPlan?.dailySchedule) && root.currentPlan.dailySchedule.length > 0
        ? root.currentPlan.dailySchedule
        : Array.isArray(root.dailySchedule) && root.dailySchedule.length > 0
          ? root.dailySchedule
          : Array.isArray(root.steps) && root.steps.length > 0
            ? root.steps
            : Array.isArray(root.actions) && root.actions.length > 0
              ? root.actions
              : [];

    return {
      ...root,
      tasks: rawTasks,
    };
  },
  z.object({
    updatedPhase: z.preprocess(
      (v) => {
        const norm = String(v || '').toUpperCase().trim();
        return PHASE_VALUES.includes(norm) ? norm : 'PLANTING';
      },
      z.enum(PHASE_VALUES)
    ),
    tasks: z.array(TaskOutputSchema).default([]),
    currentPlan: z.object({
      durationDays:  z.preprocess((v) => toNullableNumber(v) ?? 7, z.number().default(7)),
      summary:       z.string().default('7-Day Personalized Garden Plan'),
      dailySchedule: z.array(z.any()).default([]),
    }).default({ durationDays: 7, summary: '7-Day Personalized Garden Plan', dailySchedule: [] }),
    summary: z.string().default('Your personalized garden plan is ready!'),
  })
);

module.exports = {
  SEASON_VALUES,
  PLANT_KNOWLEDGE_TYPES,
  CLIMATE_KNOWLEDGE_TYPES,
  KNOWLEDGE_SOURCES,
  normalizeSeason,
  GardenContextSchema,
  ExtractedContextSchema,
  RouterDecisionSchema,
  PhotoObservationSchema,
  PlannerOutputSchema,
  KnowledgeQuerySchema,
  ClimateQuerySchema,
};
