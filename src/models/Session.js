'use strict';

const mongoose = require('mongoose');

// ── Task sub-schema ──────────────────────────────────────────────────────────

const TaskSchema = new mongoose.Schema(
  {
    taskId: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    phase: {
      type: String,
      enum: ['PLANTING', 'GROWING', 'MAINTENANCE'],
      required: true,
    },
    status: {
      type: String,
      enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'RESCHEDULED', 'FAILED'],
      default: 'PENDING',
    },
    scheduledFor: { type: String, default: null },   // e.g. "Day 1" or ISO date
    completedAt: { type: Date, default: null },
  },
  { _id: false }
);

// ── GardenContext sub-schema ─────────────────────────────────────────────────

const GardenContextSchema = new mongoose.Schema(
  {
    location: {
      city: { type: String, default: null },
      state: { type: String, default: null },
      country: { type: String, default: null },
    },
    land: {
      area: { type: Number, default: null },
      unit: { type: String, default: 'sq_ft' },
    },
    preferredPlants: { type: [String], default: [] },
    sunlightHours: { type: Number, default: null },
    soilType: { type: String, default: null },
    waterAvailability: { type: String, default: null },
    season: {
      type: String,
      enum: [
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
        null,
      ],
      default: null,
    },
  },
  { _id: false }
);

// ── PlantGrowing sub-schema ──────────────────────────────────────────────────

const PlantGrowingSchema = new mongoose.Schema(
  {
    plant: { type: String, required: true },
    growthStage: { type: String, default: 'seedling' },
    healthStatus: { type: String, default: 'unknown' },
    plantedAt: { type: Date, default: null },
  },
  { _id: false }
);

// ── PhotoObservation sub-schema ──────────────────────────────────────────────

const PhotoObservationSchema = new mongoose.Schema(
  {
    plantDetected: { type: String, default: null },
    visibleSymptoms: { type: [String], default: [] },
    leafCondition: { type: String, default: null },
    possiblePestSigns: { type: [String], default: [] },
    possibleDiseaseSigns: { type: [String], default: [] },
    growthStageEstimate: { type: String, default: null },
    severity: { type: String, default: null },
    confidence: { type: Number, default: null },
    uncertainties: { type: [String], default: [] },
    recordedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

// ── GardenState sub-schema ───────────────────────────────────────────────────

const GardenStateSchema = new mongoose.Schema(
  {
    context: { type: GardenContextSchema, default: () => ({}) },
    currentPhase: {
      type: String,
      enum: ['PLANTING', 'GROWING', 'MAINTENANCE'],
      default: 'PLANTING',
    },
    currentDay: { type: Number, default: 1 },
    plantsGrowing: { type: [PlantGrowingSchema], default: [] },
    currentPlan: {
      durationDays: { type: Number, default: null },
      summary: { type: String, default: null },
      dailySchedule: { type: [mongoose.Schema.Types.Mixed], default: [] },
    },
    observations: { type: [String], default: [] },
    photoObservations: { type: [PhotoObservationSchema], default: [] },
    userPreferences: { type: [String], default: [] },
    contextSummary: { type: String, default: '' },
    summaryMeta: {
      lastSummarizedMessageCount: { type: Number, default: 0 },
      lastSummarizedAt: { type: Date, default: null },
    },
  },
  { _id: false }
);

// ── ConversationMessage sub-schema ───────────────────────────────────────────

const MessageSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

// ── Session (root) schema ────────────────────────────────────────────────────

const SessionSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    gardenState: { type: GardenStateSchema, default: () => ({}) },
    tasks: { type: [TaskSchema], default: [] },
    conversationHistory: { type: [MessageSchema], default: [] },
  },
  {
    timestamps: true,
    collection: 'garden_sessions',
  }
);

module.exports = SessionSchema;
