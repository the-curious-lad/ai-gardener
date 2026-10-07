'use strict';

const { getKnowledgeDb } = require('../config/db');
const logger = require('../utils/logger');

const COLLECTION = 'climate_location_knowledge';
const AUDIT_COLLECTION = 'climate_location_source_audit';

function col() {
  return getKnowledgeDb().collection(COLLECTION);
}

function auditCol() {
  return getKnowledgeDb().collection(AUDIT_COLLECTION);
}

/**
 * Upsert a single climate/location knowledge document into
 * `gardening_knowledge.climate_location_knowledge`.
 *
 * @param {object} doc
 */
async function upsertClimateKnowledge(doc) {
  const filter = doc.record_id
    ? { record_id: doc.record_id }
    : {
        knowledge_type: doc.knowledge_type,
        location_name: doc.location_name,
        normalized_season: doc.normalized_season,
      };
  const update = { $set: { ...doc, updatedAt: new Date() } };
  return col().updateOne(filter, update, { upsert: true });
}

/**
 * Bulk upsert climate/location knowledge documents for CSV ingestion.
 *
 * @param {object[]} docs
 */
async function bulkUpsertClimateKnowledge(docs) {
  if (!docs.length) return { upsertedCount: 0, modifiedCount: 0 };

  const ops = docs.map((doc) => ({
    updateOne: {
      filter: doc.record_id
        ? { record_id: doc.record_id }
        : {
            knowledge_type: doc.knowledge_type,
            location_name: doc.location_name,
            normalized_season: doc.normalized_season,
          },
      update: { $set: { ...doc, updatedAt: new Date() } },
      upsert: true,
    },
  }));

  return col().bulkWrite(ops, { ordered: false });
}

/**
 * Bulk upsert climate/location source audit records into
 * `gardening_knowledge.climate_location_source_audit`.
 *
 * @param {object[]} auditDocs
 */
async function bulkUpsertClimateSourceAudit(auditDocs) {
  if (!auditDocs.length) return { upsertedCount: 0, modifiedCount: 0 };

  const ops = auditDocs.map((doc) => ({
    updateOne: {
      filter: { record_id: doc.record_id, source_url: doc.source_url },
      update: { $set: { ...doc, updatedAt: new Date() } },
      upsert: true,
    },
  }));

  return auditCol().bulkWrite(ops, { ordered: false });
}

/**
 * Find LOCATION_MAPPING records for a given city/location name (and optional country)
 * to resolve its geographic hierarchy (subregion, region, state_province, climate_zone).
 *
 * @param {string} locationName
 * @param {string|null} [country=null]
 * @returns {Promise<object[]>}
 */
async function findLocationMappings(locationName, country = null) {
  if (!locationName) return [];
  const locNorm = locationName.trim().toLowerCase();
  const query = {
    knowledge_type: 'LOCATION_MAPPING',
    $or: [
      { locationLower: locNorm },
      { location_name: { $regex: new RegExp(locNorm, 'i') } },
    ],
  };
  if (country) {
    query.countryLower = country.trim().toLowerCase();
  }
  return col().find(query).limit(5).toArray();
}

/**
 * Fetch all climate documents with embeddings matching optional filters.
 * Used by the in-memory cosine similarity fallback in climateVectorSearch.
 *
 * @param {object} [filters={}]
 */
async function findAllWithEmbeddings(filters = {}) {
  const query = { embedding: { $exists: true, $ne: [] } };
  if (filters.knowledgeTypes?.length) {
    query.knowledge_type = { $in: filters.knowledgeTypes };
  }
  if (filters.country) {
    query.countryLower = filters.country.toLowerCase();
  }
  if (filters.normalizedSeason) {
    query.normalized_season = { $in: [filters.normalizedSeason, 'YEAR_ROUND', null] };
  }
  return col().find(query).toArray();
}

/**
 * Run MongoDB Atlas $vectorSearch pipeline on `climate_location_knowledge`.
 *
 * @param {number[]} queryVector
 * @param {object}   filters
 * @param {number}   limit
 * @param {string}   indexName
 * @returns {Promise<object[]>}
 */
async function vectorSearchPipeline(queryVector, filters = {}, limit = 6, indexName = 'climate_location_knowledge_vector_index') {
  const preFilter = {};
  if (filters.knowledgeTypes?.length) {
    preFilter.knowledge_type = { $in: filters.knowledgeTypes };
  }
  if (filters.country) {
    preFilter.country = filters.country;
  }
  if (filters.normalizedSeason) {
    preFilter.normalized_season = { $in: [filters.normalizedSeason, 'YEAR_ROUND'] };
  }

  const pipeline = [
    {
      $vectorSearch: {
        index: indexName,
        path: 'embedding',
        queryVector,
        numCandidates: Math.max(limit * 10, 50),
        limit,
        ...(Object.keys(preFilter).length ? { filter: preFilter } : {}),
      },
    },
    {
      $project: {
        embedding: 0,
        score: { $meta: 'vectorSearchScore' },
      },
    },
  ];

  logger.debug('[ClimateRepo] running $vectorSearch pipeline on climate_location_knowledge');
  return col().aggregate(pipeline).toArray();
}

module.exports = {
  COLLECTION,
  AUDIT_COLLECTION,
  upsertClimateKnowledge,
  bulkUpsertClimateKnowledge,
  bulkUpsertClimateSourceAudit,
  findLocationMappings,
  findAllWithEmbeddings,
  vectorSearchPipeline,
};
