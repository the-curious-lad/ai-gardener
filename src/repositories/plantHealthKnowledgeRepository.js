'use strict';

const { getKnowledgeDb } = require('../config/db');
const logger = require('../utils/logger');

const COLLECTION = 'plant_health_knowledge';
const AUDIT_COLLECTION = 'plant_health_source_audit';

function col() {
  return getKnowledgeDb().collection(COLLECTION);
}

function auditCol() {
  return getKnowledgeDb().collection(AUDIT_COLLECTION);
}

/**
 * Upsert a single knowledge document.
 * Uses record_id as primary unique key if present, else plant + knowledge_type + title.
 */
async function upsertKnowledge(doc) {
  const filter = doc.record_id
    ? { record_id: doc.record_id }
    : {
        plant: doc.plant,
        knowledge_type: doc.knowledge_type,
        title: doc.title,
      };
  const update = { $set: { ...doc, updatedAt: new Date() } };
  return col().updateOne(filter, update, { upsert: true });
}

/**
 * Bulk upsert knowledge documents for fast CSV ingestion.
 *
 * @param {object[]} docs
 */
async function bulkUpsertKnowledge(docs) {
  if (!docs.length) return { upsertedCount: 0, modifiedCount: 0 };

  const ops = docs.map((doc) => ({
    updateOne: {
      filter: doc.record_id
        ? { record_id: doc.record_id }
        : { plant: doc.plant, knowledge_type: doc.knowledge_type, title: doc.title },
      update: { $set: { ...doc, updatedAt: new Date() } },
      upsert: true,
    },
  }));

  return col().bulkWrite(ops, { ordered: false });
}

/**
 * Bulk upsert source audit records from plant_health_source_audit.csv.
 *
 * @param {object[]} auditDocs
 */
async function bulkUpsertSourceAudit(auditDocs) {
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
 * Find knowledge records by one or more knowledge_type values.
 * Optionally filter by plant.
 */
async function findByTypes(knowledgeTypes, plantFilter = null, limit = 20) {
  const query = {};
  if (knowledgeTypes?.length) query.knowledge_type = { $in: knowledgeTypes };
  if (plantFilter) query.plant = plantFilter.toLowerCase();
  return col().find(query).limit(limit).toArray();
}

/**
 * Find all knowledge for a specific plant.
 */
async function findByPlant(plant) {
  return col().find({ plant: plant.toLowerCase() }).toArray();
}

/**
 * Fetch all documents with embeddings for a given type filter.
 * Used by the in-memory cosine fallback in knowledgeVectorSearch.
 */
async function findAllWithEmbeddings(knowledgeTypes = null, plantFilter = null) {
  const query = { embedding: { $exists: true, $ne: [] } };
  if (knowledgeTypes?.length) query.knowledge_type = { $in: knowledgeTypes };
  if (plantFilter) query.plant = plantFilter.toLowerCase();
  return col().find(query).toArray();
}

/**
 * Run Atlas $vectorSearch pipeline.
 */
async function vectorSearchPipeline(queryVector, knowledgeTypes, plantFilter, limit, indexName) {
  const preFilter = {};
  if (knowledgeTypes?.length) preFilter.knowledge_type = { $in: knowledgeTypes };
  if (plantFilter) preFilter.plant = plantFilter.toLowerCase();

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

  logger.debug('[Repo] running $vectorSearch pipeline');
  return col().aggregate(pipeline).toArray();
}

module.exports = {
  upsertKnowledge,
  bulkUpsertKnowledge,
  bulkUpsertSourceAudit,
  findByTypes,
  findByPlant,
  findAllWithEmbeddings,
  vectorSearchPipeline,
};
