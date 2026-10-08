'use strict';

const embeddingProvider = require('../embeddings');
const repo = require('../../repositories/plantHealthKnowledgeRepository');
const { loadKnowledgeCSV } = require('../../utils/csvParser');
const logger = require('../../utils/logger');

const INDEX_NAME = process.env.VECTOR_INDEX_NAME || 'plant_health_knowledge_vector_index';

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

// ── Keyword / BM25-style fallback over CSV / unembedded docs ──────────────────

function keywordFallbackSearch(semanticQuery, knowledgeTypes = [], plantFilter = null, limit = 5) {
  const records = loadKnowledgeCSV();
  if (!records.length) return [];

  const plantNorm = plantFilter ? plantFilter.toLowerCase().trim() : null;
  const queryTerms = semanticQuery
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3);

  const candidates = records.filter((doc) => {
    if (knowledgeTypes?.length && !knowledgeTypes.includes(doc.knowledge_type)) {
      return false;
    }
    if (plantNorm && doc.plant !== plantNorm) {
      return false;
    }
    return true;
  });

  const scored = candidates.map((doc) => {
    const searchable = [
      doc.plant_common_name,
      doc.plant_category,
      doc.topic,
      doc.problem_name,
      doc.season,
      doc.temperature_range,
      doc.humidity_conditions,
      doc.sunlight_requirement,
      doc.soil_type,
      doc.soil_ph,
      doc.water_requirement,
      doc.geographic_or_climate_notes,
      doc.symptom_keywords,
      doc.visible_symptoms,
      doc.knowledge_subtype,
      doc.distinguishing_features,
      doc.knowledge_text,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    let score = 0;
    for (const term of queryTerms) {
      if ((doc.plant_common_name || '').toLowerCase().includes(term)) score += 4;
      if ((doc.problem_name || '').toLowerCase().includes(term)) score += 4;
      if ((doc.symptom_keywords || '').toLowerCase().includes(term)) score += 3;
      if ((doc.season || '').toLowerCase().includes(term)) score += 3;
      if ((doc.sunlight_requirement || '').toLowerCase().includes(term)) score += 3;
      if ((doc.temperature_range || '').toLowerCase().includes(term)) score += 3;
      if ((doc.soil_type || '').toLowerCase().includes(term)) score += 3;
      if ((doc.geographic_or_climate_notes || '').toLowerCase().includes(term)) score += 3;
      if ((doc.topic || '').toLowerCase().includes(term)) score += 2;
      if (searchable.includes(term)) score += 1;
    }

    return { ...doc, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // When plantFilter is null (e.g. "What plants can I grow here?"),
  // diversify top results across distinct plants so the user gets multiple crop options
  if (!plantNorm) {
    const diverse = [];
    const seenPlants = new Set();
    for (const item of scored) {
      if (!seenPlants.has(item.plant)) {
        seenPlants.add(item.plant);
        diverse.push(item);
        if (diverse.length >= limit) break;
      }
    }
    if (diverse.length >= Math.min(limit, 3)) {
      return diverse;
    }
  }

  return scored.slice(0, limit);
}

async function inMemoryFallback(queryVector, semanticQuery, knowledgeTypes, plantFilter, limit) {
  logger.warn('[VectorSearch] Falling back to in-memory cosine / CSV search.');

  try {
    if (Array.isArray(queryVector) && queryVector.length > 0) {
      const docs = await repo.findAllWithEmbeddings(knowledgeTypes, plantFilter);
      if (docs.length > 0) {
        const scored = docs
          .filter((d) => Array.isArray(d.embedding) && d.embedding.length === queryVector.length)
          .map((d) => ({ ...d, score: cosineSimilarity(queryVector, d.embedding) }))
          .sort((a, b) => b.score - a.score)
          .slice(0, limit);

        if (scored.length > 0) {
          return scored.map(({ embedding: _e, ...rest }) => rest);
        }
      }
    }
  } catch (err) {
    logger.warn('[VectorSearch] DB fallback query skipped:', err.message);
  }

  return keywordFallbackSearch(semanticQuery, knowledgeTypes, plantFilter, limit);
}

// ── Main search function ──────────────────────────────────────────────────────

/**
 * Semantic search over plant_health_knowledge.
 *
 * 1. Tries MongoDB Atlas $vectorSearch with pre-filter on knowledge_type and plant.
 * 2. Falls back to in-memory cosine similarity over embedded MongoDB records.
 * 3. Falls back to weighted keyword search over plant_health_knowledge.csv if
 *    embeddings/DB are not yet populated.
 *
 * @param {object} params
 * @param {string}   params.semanticQuery   Natural language query
 * @param {string[]} params.knowledgeTypes  Array of knowledge_type values to filter
 * @param {string}   [params.plantFilter]   Optional plant name filter
 * @param {number}   [params.limit=5]       Max results to return
 * @returns {Promise<object[]>}
 */
async function searchKnowledge({ semanticQuery, knowledgeTypes = [], plantFilter = null, limit = 5 }) {
  if (!semanticQuery?.trim()) return [];

  logger.debug(`[VectorSearch] query="${semanticQuery}" types=${knowledgeTypes} plant=${plantFilter}`);

  let queryVector = null;
  try {
    queryVector = await embeddingProvider.embedText(semanticQuery);
  } catch (err) {
    logger.warn('[VectorSearch] Embedding generation unavailable, using CSV fallback:', err.message);
    return keywordFallbackSearch(semanticQuery, knowledgeTypes, plantFilter, limit);
  }

  try {
    let results = await repo.vectorSearchPipeline(
      queryVector,
      knowledgeTypes,
      plantFilter,
      limit,
      INDEX_NAME
    );
    // If narrow knowledgeTypes pre-filter matched 0 docs in Atlas, retry with plantFilter only
    if (results.length === 0 && knowledgeTypes?.length) {
      results = await repo.vectorSearchPipeline(
        queryVector,
        [],
        plantFilter,
        limit,
        INDEX_NAME
      );
    }
    // If specific plant (e.g. "sunflower") has 0 exact-plant docs, retry semantic vector search across general crops
    if (results.length === 0 && plantFilter) {
      results = await repo.vectorSearchPipeline(
        queryVector,
        [],
        null,
        limit,
        INDEX_NAME
      );
    }
    if (results.length > 0) {
      logger.debug(`[VectorSearch] Atlas returned ${results.length} results`);
      return results;
    }
    return inMemoryFallback(queryVector, semanticQuery, knowledgeTypes, plantFilter, limit);
  } catch (err) {
    logger.warn('[VectorSearch] Atlas $vectorSearch unavailable, using fallback:', err.message);
    return inMemoryFallback(queryVector, semanticQuery, knowledgeTypes, plantFilter, limit);
  }
}

module.exports = { searchKnowledge, keywordFallbackSearch };
