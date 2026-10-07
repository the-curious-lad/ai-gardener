'use strict';

const mongoose = require('mongoose');

/**
 * Mongoose schema for `gardening_knowledge.climate_location_knowledge`.
 *
 * Matches the 33-column structure of `data/climate_location_knowledge.csv` plus
 * `embedding` for MongoDB Atlas Vector Search (`climate_location_knowledge_vector_index`).
 *
 * Blank cells in the CSV are normalized to `null` (optional/nullable) so that
 * `LOCATION_MAPPING`, `REGIONAL_CLIMATE`, `SEASONAL_CONTEXT`, and `CLIMATE_ZONE`
 * records can omit fields that do not apply to their `knowledge_type`.
 *
 * Risk fields (`frost_risk`, `heat_risk`) preserve `'UNKNOWN'` when unspecified
 * rather than defaulting to `'LOW'`.
 */
const ClimateLocationKnowledgeSchema = new mongoose.Schema(
  {
    record_id: { type: String, required: true, unique: true, index: true },
    knowledge_type: {
      type: String,
      enum: ['LOCATION_MAPPING', 'REGIONAL_CLIMATE', 'SEASONAL_CONTEXT', 'CLIMATE_ZONE'],
      required: true,
      index: true,
    },
    location_name: { type: String, default: null, index: true },
    state_province: { type: String, default: null },
    country: { type: String, default: null, index: true },
    subregion: { type: String, default: null, index: true },
    region: { type: String, default: null, index: true },
    climate_zone: { type: String, default: null },
    climate_classification_system: { type: String, default: null },
    latitude_band: { type: String, default: null },
    longitude_band: { type: String, default: null },
    season: { type: String, default: null },
    normalized_season: {
      type: String,
      enum: [
        'WINTER',
        'SUMMER',
        'SPRING',
        'AUTUMN',
        'FALL',
        'MONSOON',
        'WET_SEASON',
        'DRY_SEASON',
        'YEAR_ROUND',
        'TRANSITIONAL',
        'UNKNOWN',
        null,
      ],
      default: null,
      index: true,
    },
    typical_temperature_context: { type: String, default: null },
    temperature_range: { type: String, default: null },
    rainfall_pattern: { type: String, default: null },
    humidity_pattern: { type: String, default: null },
    frost_risk: { type: String, default: 'UNKNOWN' },
    heat_risk: { type: String, default: 'UNKNOWN' },
    general_growing_conditions: { type: String, default: null },
    seasonal_gardening_implications: { type: String, default: null },
    soil_environment_context: { type: String, default: null },
    water_management_context: { type: String, default: null },
    planting_window_context: { type: String, default: null },
    location_context: { type: String, default: null },
    knowledge_text: { type: String, required: true },
    source_name: { type: String, default: null },
    source_url: { type: String, default: null },
    secondary_source_name: { type: String, default: null },
    secondary_source_url: { type: String, default: null },
    evidence_notes: { type: String, default: null },
    confidence_level: { type: String, default: null },
    last_verified: { type: String, default: null },

    // Normalized helper fields for fast case-insensitive lookup & vector search
    locationLower: { type: String, default: null, index: true },
    countryLower: { type: String, default: null, index: true },
    regionLower: { type: String, default: null, index: true },
    subregionLower: { type: String, default: null, index: true },
    embedding: { type: [Number], default: [] },
  },
  {
    timestamps: true,
    collection: 'climate_location_knowledge',
  }
);

/**
 * Mongoose schema for `gardening_knowledge.climate_location_source_audit`.
 */
const ClimateLocationSourceAuditSchema = new mongoose.Schema(
  {
    record_id: { type: String, required: true, index: true },
    location_or_region: { type: String, default: null },
    knowledge_type: { type: String, default: null },
    source_name: { type: String, default: null },
    source_url: { type: String, default: null },
    source_type: { type: String, default: null },
    organization: { type: String, default: null },
    verification_status: { type: String, default: null },
    notes: { type: String, default: null },
  },
  {
    timestamps: true,
    collection: 'climate_location_source_audit',
  }
);

module.exports = {
  ClimateLocationKnowledgeSchema,
  ClimateLocationSourceAuditSchema,
};
