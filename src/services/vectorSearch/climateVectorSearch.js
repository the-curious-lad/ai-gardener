'use strict';

const embeddingProvider = require('../embeddings');
const climateRepo = require('../../repositories/climateLocationKnowledgeRepository');
const { loadClimateCSV } = require('../../utils/csvParser');
const { normalizeSeason } = require('../../models/schemas');
const logger = require('../../utils/logger');

const INDEX_NAME =
  process.env.CLIMATE_VECTOR_INDEX_NAME || 'climate_location_knowledge_vector_index';

// ── Cosine similarity ─────────────────────────────────────────────────────────

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ── Geographic Hierarchy Resolution ───────────────────────────────────────────

/**
 * Resolve a location (e.g. "Gorakhpur", "Shimla", "Fresno", "Nairobi") and/or
 * stateProvince (e.g. "Himachal Pradesh", "Uttar Pradesh", "California") to its
 * LOCATION_MAPPING or REGIONAL_CLIMATE record(s) and extracted regional hierarchy
 * (subregion, region, state_province, country, climate_zone).
 *
 * Checks MongoDB first (if connected), then falls back to cached CSV records.
 *
 * @param {string|null} locationName
 * @param {string|null} [country=null]
 * @param {string|null} [stateProvince=null]
 * @returns {Promise<{ mappings: object[], hierarchy: object }>}
 */
async function resolveLocationHierarchy(locationName, country = null, stateProvince = null) {
  const emptyHierarchy = {
    locationName: locationName || null,
    stateProvince: stateProvince || null,
    country: country || null,
    subregion: null,
    region: null,
    climateZone: null,
  };

  if (!locationName && !stateProvince) {
    return { mappings: [], hierarchy: emptyHierarchy };
  }

  const locLower = (locationName || '').trim().toLowerCase();
  const stateLower = (stateProvince || '').trim().toLowerCase();
  let mappings = [];

  if (locationName) {
    try {
      mappings = await climateRepo.findLocationMappings(locationName, country);
    } catch (_err) {
      // DB not connected or offline — fall through to CSV lookup
    }
  }

  const csvRecords = loadClimateCSV();

  if (!mappings.length && locLower) {
    mappings = csvRecords.filter((r) => {
      if (r.knowledge_type !== 'LOCATION_MAPPING') return false;
      const nameMatch =
        (r.locationLower && (r.locationLower === locLower || r.locationLower.includes(locLower) || locLower.includes(r.locationLower))) ||
        (r.state_province && r.state_province.toLowerCase() === locLower);
      if (!nameMatch) return false;
      if (country && r.countryLower && r.countryLower !== country.toLowerCase()) {
        return false;
      }
      return true;
    });
  }

  // Fallback to stateProvince matching across LOCATION_MAPPING and REGIONAL_CLIMATE
  // (e.g. "Shimla, Himachal Pradesh" -> matches REG_IN_PCREGION_01_001 Western Himalayan Region (I))
  if (!mappings.length && (stateLower || locLower)) {
    const searchTerms = [stateLower, locLower].filter(Boolean);
    mappings = csvRecords.filter((r) => {
      const sp = (r.state_province || '').toLowerCase();
      const locCtx = (r.location_context || '').toLowerCase();
      const kText = (r.knowledge_text || '').toLowerCase();
      return searchTerms.some(
        (term) => (sp && sp.includes(term)) || locCtx.includes(term) || kText.includes(term)
      );
    });
  }

  const primary = mappings[0] || null;
  const hierarchy = {
    locationName: locationName || primary?.location_name || null,
    stateProvince: stateProvince || primary?.state_province || null,
    country: primary?.country || country || null,
    subregion: primary?.subregion || null,
    region: primary?.region || null,
    climateZone: primary?.climate_zone || null,
  };

  return { mappings, hierarchy };
}

// ── Hierarchical & Keyword Search over Climate Records ────────────────────────

/**
 * Score and retrieve climate_location_knowledge records using:
 *   1. Exact / partial location_name match
 *   2. State / province match (including multi-state macro regions in location_context)
 *   3. Resolved geographic hierarchy match (subregion, region, country)
 *   4. Normalized season match (exact season + YEAR_ROUND regional context)
 *   5. Semantic query terms across climate_zone, temperature_range, rainfall_pattern,
 *      seasonal_gardening_implications, planting_window_context, knowledge_text.
 *
 * @param {object} params
 * @returns {object[]}
 */
function hierarchicalClimateFallbackSearch({
  semanticQuery = '',
  locationName = null,
  stateProvince = null,
  country = null,
  region = null,
  subregion = null,
  normalizedSeason = null,
  knowledgeTypes = [],
  hierarchy = {},
  limit = 6,
}) {
  const records = loadClimateCSV();
  if (!records.length) return [];

  const targetLoc = (locationName || hierarchy.locationName || '').trim().toLowerCase();
  const targetSubregion = (subregion || hierarchy.subregion || '').trim().toLowerCase();
  const targetRegion = (region || hierarchy.region || '').trim().toLowerCase();
  const targetState = (stateProvince || hierarchy.stateProvince || '').trim().toLowerCase();
  const targetCountry = (country || hierarchy.country || '').trim().toLowerCase();
  const targetSeason = normalizeSeason(normalizedSeason);

  const queryTerms = (semanticQuery || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3);

  const candidates = records.filter((doc) => {
    if (knowledgeTypes?.length && !knowledgeTypes.includes(doc.knowledge_type)) {
      return false;
    }
    return true;
  });

  const scored = candidates.map((doc) => {
    let score = 0;

    const docLoc = (doc.location_name || '').toLowerCase();
    const docSub = (doc.subregion || '').toLowerCase();
    const docReg = (doc.region || '').toLowerCase();
    const docState = (doc.state_province || '').toLowerCase();
    const docLocCtx = (doc.location_context || '').toLowerCase();
    const docCountry = (doc.country || '').toLowerCase();
    const docSeason = normalizeSeason(doc.normalized_season);

    // 1. Direct location match (e.g. "Gorakhpur" matches "Gorakhpur" and "Gorakhpur district")
    if (targetLoc && docLoc) {
      if (docLoc === targetLoc) score += 18;
      else if (docLoc.includes(targetLoc) || targetLoc.includes(docLoc)) score += 14;
    }

    // 2. Hierarchical subregion / region / state match
    if (targetSubregion && docSub && (docSub === targetSubregion || docSub.includes(targetSubregion))) {
      score += 10;
    }
    if (targetRegion && docReg && (docReg === targetRegion || docReg.includes(targetRegion) || docLoc === targetRegion)) {
      score += 8;
    }
    if (targetState) {
      if (docState && (docState === targetState || docState.includes(targetState))) {
        score += 12;
      } else if (docLocCtx.includes(targetState) || (doc.knowledge_text || '').toLowerCase().includes(targetState)) {
        score += 10;
      }
    }
    if (targetCountry && docCountry && docCountry === targetCountry) {
      score += 3;
    } else if (targetCountry && docCountry && docCountry !== targetCountry) {
      score -= 10;
    }

    // 3. Season match
    if (targetSeason && targetSeason !== 'UNKNOWN') {
      if (docSeason === targetSeason) {
        score += 12;
      } else if (docSeason === 'YEAR_ROUND' || doc.knowledge_type === 'LOCATION_MAPPING' || doc.knowledge_type === 'REGIONAL_CLIMATE') {
        score += 4;
      } else if (docSeason && docSeason !== targetSeason) {
        // Different specific season (e.g., SUMMER record when asking about WINTER)
        score -= 8;
      }
    }

    // 4. Keyword terms match
    const searchable = [
      doc.location_name,
      doc.state_province,
      doc.country,
      doc.subregion,
      doc.region,
      doc.climate_zone,
      doc.season,
      doc.normalized_season,
      doc.typical_temperature_context,
      doc.temperature_range,
      doc.rainfall_pattern,
      doc.humidity_pattern,
      doc.general_growing_conditions,
      doc.seasonal_gardening_implications,
      doc.soil_environment_context,
      doc.water_management_context,
      doc.planting_window_context,
      doc.location_context,
      doc.knowledge_text,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    for (const term of queryTerms) {
      if (docLoc.includes(term)) score += 5;
      if (docSub.includes(term) || docReg.includes(term)) score += 3;
      if ((doc.season || '').toLowerCase().includes(term)) score += 4;
      if ((doc.climate_zone || '').toLowerCase().includes(term)) score += 3;
      if ((doc.seasonal_gardening_implications || '').toLowerCase().includes(term)) score += 2;
      if ((doc.planting_window_context || '').toLowerCase().includes(term)) score += 2;
      if (searchable.includes(term)) score += 1;
    }

    return { ...doc, score };
  });

  return scored
    .filter((d) => d.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// ── In-memory Cosine Similarity Fallback ──────────────────────────────────────

async function inMemoryClimateFallback(queryVector, searchParams, hierarchy) {
  logger.warn('[ClimateVectorSearch] Falling back to in-memory cosine / hierarchical CSV search.');

  try {
    if (Array.isArray(queryVector) && queryVector.length > 0) {
      const docs = await climateRepo.findAllWithEmbeddings({
        knowledgeTypes: searchParams.knowledgeTypes,
        country: hierarchy.country || searchParams.country,
        normalizedSeason: searchParams.normalizedSeason,
      });

      if (docs.length > 0) {
        const scored = docs
          .filter((d) => Array.isArray(d.embedding) && d.embedding.length === queryVector.length)
          .map((d) => ({ ...d, score: cosineSimilarity(queryVector, d.embedding) }))
          .sort((a, b) => b.score - a.score)
          .slice(0, searchParams.limit || 6);

        if (scored.length > 0) {
          return scored.map(({ embedding: _e, ...rest }) => rest);
        }
      }
    }
  } catch (err) {
    logger.warn('[ClimateVectorSearch] DB fallback query skipped:', err.message);
  }

  return hierarchicalClimateFallbackSearch({ ...searchParams, hierarchy });
}

// ── Main Climate & Location Knowledge Search ──────────────────────────────────

/**
 * Search `gardening_knowledge.climate_location_knowledge` with automatic
 * geographic hierarchy resolution (`LOCATION_MAPPING` -> `subregion` / `region`
 * -> `REGIONAL_CLIMATE` + `SEASONAL_CONTEXT`).
 *
 * 1. Resolves location hierarchy via `LOCATION_MAPPING` records if `locationName` is provided.
 * 2. Tries MongoDB Atlas `$vectorSearch` on `climate_location_knowledge_vector_index`.
 * 3. Falls back to in-memory cosine similarity over embedded MongoDB records.
 * 4. Supplements / falls back to hierarchical CSV search so exact location + season + region
 *    records are always included.
 *
 * @param {object} params
 * @param {string}   params.semanticQuery
 * @param {string}   [params.locationName=null]
 * @param {string}   [params.country=null]
 * @param {string}   [params.region=null]
 * @param {string}   [params.subregion=null]
 * @param {string}   [params.normalizedSeason=null]
 * @param {string[]} [params.knowledgeTypes=[]]
 * @param {number}   [params.limit=5]
 * @returns {Promise<object[]>}
 */
async function searchClimateKnowledge({
  semanticQuery = '',
  locationName = null,
  stateProvince = null,
  country = null,
  region = null,
  subregion = null,
  normalizedSeason = null,
  knowledgeTypes = [],
  limit = 5,
}) {
  const canonicalSeason = normalizeSeason(normalizedSeason);
  const { mappings, hierarchy } = await resolveLocationHierarchy(locationName, country, stateProvince);

  const enrichedQuery = [
    semanticQuery,
    hierarchy.locationName,
    hierarchy.stateProvince,
    hierarchy.subregion,
    hierarchy.region,
    hierarchy.country,
    canonicalSeason && canonicalSeason !== 'UNKNOWN' ? canonicalSeason : null,
  ]
    .filter(Boolean)
    .join(' ')
    .trim();

  if (!enrichedQuery) return [];

  logger.debug(
    `[ClimateVectorSearch] query="${enrichedQuery}" location=${hierarchy.locationName} state=${hierarchy.stateProvince} region=${hierarchy.region} season=${canonicalSeason}`
  );

  // Always obtain hierarchical matches for the resolved location/state/region/season
  const hierarchicalMatches = hierarchicalClimateFallbackSearch({
    semanticQuery: enrichedQuery,
    locationName: hierarchy.locationName,
    stateProvince: hierarchy.stateProvince,
    country: hierarchy.country,
    region: region || hierarchy.region,
    subregion: subregion || hierarchy.subregion,
    normalizedSeason: canonicalSeason,
    knowledgeTypes,
    hierarchy,
    limit,
  });

  let vectorResults = [];
  let queryVector = null;

  try {
    queryVector = await embeddingProvider.embedText(enrichedQuery);
  } catch (err) {
    logger.warn('[ClimateVectorSearch] Embedding generation unavailable, using hierarchical fallback:', err.message);
    return mergeUniqueClimateRecords(mappings, hierarchicalMatches, [], limit);
  }

  try {
    vectorResults = await climateRepo.vectorSearchPipeline(
      queryVector,
      {
        knowledgeTypes,
        country: hierarchy.country,
        normalizedSeason: canonicalSeason && canonicalSeason !== 'UNKNOWN' ? canonicalSeason : null,
      },
      limit,
      INDEX_NAME
    );
    if (!vectorResults.length) {
      vectorResults = await inMemoryClimateFallback(
        queryVector,
        {
          semanticQuery: enrichedQuery,
          locationName: hierarchy.locationName,
          country: hierarchy.country,
          region: region || hierarchy.region,
          subregion: subregion || hierarchy.subregion,
          normalizedSeason: canonicalSeason,
          knowledgeTypes,
          limit,
        },
        hierarchy
      );
    }
  } catch (err) {
    logger.warn('[ClimateVectorSearch] Atlas $vectorSearch unavailable, using fallback:', err.message);
    vectorResults = await inMemoryClimateFallback(
      queryVector,
      {
        semanticQuery: enrichedQuery,
        locationName: hierarchy.locationName,
        country: hierarchy.country,
        region: region || hierarchy.region,
        subregion: subregion || hierarchy.subregion,
        normalizedSeason: canonicalSeason,
        knowledgeTypes,
        limit,
      },
      hierarchy
    );
  }

  return mergeUniqueClimateRecords(mappings, hierarchicalMatches, vectorResults, limit);
}

/**
 * Merge location mappings, hierarchical matches, and vector search results without
 * duplicate `record_id` entries.
 */
function mergeUniqueClimateRecords(mappings = [], hierarchical = [], vectorResults = [], limit = 5) {
  const seen = new Set();
  const merged = [];

  for (const list of [hierarchical, mappings, vectorResults]) {
    for (const item of list) {
      if (!item || !item.record_id) continue;
      if (!seen.has(item.record_id)) {
        seen.add(item.record_id);
        merged.push(item);
        if (merged.length >= limit) return merged;
      }
    }
  }

  return merged;
}

module.exports = {
  searchClimateKnowledge,
  resolveLocationHierarchy,
  hierarchicalClimateFallbackSearch,
};
