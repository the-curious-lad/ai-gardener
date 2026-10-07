'use strict';

const fs = require('fs');
const path = require('path');
const { connectDB } = require('../src/config/db');
const embeddingProvider = require('../src/services/embeddings');
const knowledgeRepo = require('../src/repositories/plantHealthKnowledgeRepository');
const climateRepo = require('../src/repositories/climateLocationKnowledgeRepository');
const { parseCSV, normalizeKnowledgeRow, normalizeClimateRow } = require('../src/utils/csvParser');
const logger = require('../src/utils/logger');

/**
 * CLI flags supported:
 *   node scripts/seed.js
 *   node scripts/seed.js --skip-embeddings          (fast bulk upsert of all CSV records)
 *   node scripts/seed.js --climate-only             (only seed climate_location_knowledge + audit)
 *   node scripts/seed.js --plant tomato,pepper      (only embed/upsert specific plants)
 *   node scripts/seed.js --limit 100                (only process first N matching rows)
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    skipEmbeddings: args.includes('--skip-embeddings'),
    climateOnly: args.includes('--climate-only'),
    plants: null,
    limit: null,
    batchSize: 16,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--plant' && args[i + 1]) {
      opts.plants = args[i + 1]
        .split(',')
        .map((p) => p.trim().toLowerCase())
        .filter(Boolean);
      i++;
    } else if (args[i] === '--limit' && args[i + 1]) {
      opts.limit = parseInt(args[i + 1], 10);
      i++;
    }
  }
  return opts;
}

async function seedPlantHealth(opts) {
  // 1. Load plant_health_knowledge.csv (fallback to seed_knowledge.json if CSV missing)
  const csvPath = path.join(__dirname, '..', 'data', 'plant_health_knowledge.csv');
  const rootCsvPath = path.join(__dirname, '..', 'plant_health_knowledge.csv');
  const activeCsvPath = fs.existsSync(csvPath) ? csvPath : (fs.existsSync(rootCsvPath) ? rootCsvPath : null);

  let records = [];
  if (activeCsvPath) {
    const rawCsv = fs.readFileSync(activeCsvPath, 'utf-8');
    records = parseCSV(rawCsv).map(normalizeKnowledgeRow);
    logger.info(`[Seed] Loaded ${records.length} records from ${path.basename(activeCsvPath)}`);
  } else {
    const jsonPath = path.join(__dirname, '..', 'data', 'seed_knowledge.json');
    records = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    logger.info(`[Seed] Loaded ${records.length} records from seed_knowledge.json`);
  }

  if (opts.plants?.length) {
    records = records.filter((r) => opts.plants.includes(r.plant));
    logger.info(`[Seed] Filtered to ${records.length} records for plants: ${opts.plants.join(', ')}`);
  }

  if (opts.limit && opts.limit > 0) {
    records = records.slice(0, opts.limit);
    logger.info(`[Seed] Limited to ${records.length} records`);
  }

  // 2. Also ingest plant_health_source_audit.csv if present
  const auditPath = path.join(__dirname, '..', 'data', 'plant_health_source_audit.csv');
  const rootAuditPath = path.join(__dirname, '..', 'plant_health_source_audit.csv');
  const activeAuditPath = fs.existsSync(auditPath) ? auditPath : (fs.existsSync(rootAuditPath) ? rootAuditPath : null);

  if (activeAuditPath) {
    const auditRecords = parseCSV(fs.readFileSync(activeAuditPath, 'utf-8'));
    const auditRes = await knowledgeRepo.bulkUpsertSourceAudit(auditRecords);
    logger.info(`[Seed] Upserted ${auditRecords.length} plant_health_source_audit records (upserted: ${auditRes.upsertedCount}, modified: ${auditRes.modifiedCount})`);
  }

  // 3. Process plant knowledge records in batches
  const batchSize = opts.batchSize;
  for (let start = 0; start < records.length; start += batchSize) {
    const batch = records.slice(start, start + batchSize);

    if (!opts.skipEmbeddings) {
      const texts = batch.map((r) =>
        [
          r.plant_common_name || r.plant,
          r.knowledge_type,
          r.topic || r.title,
          r.problem_name,
          r.symptom_keywords,
          r.visible_symptoms,
          r.knowledge_text || r.knowledgeText,
        ]
          .filter(Boolean)
          .join(' | ')
      );

      try {
        const embeddings = await embeddingProvider.embedBatch(texts);
        batch.forEach((doc, idx) => {
          doc.embedding = embeddings[idx] || [];
        });
      } catch (err) {
        logger.warn(`[Seed] Batch embedding unavailable (${err.message}). Upserting batch without embeddings.`);
      }
    }

    await knowledgeRepo.bulkUpsertKnowledge(batch);
    logger.info(`[Seed] Upserted plant records ${start + 1}–${Math.min(start + batch.length, records.length)} of ${records.length}`);
  }

  logger.info('[Seed] Completed seeding gardening_knowledge.plant_health_knowledge.');
}

async function seedClimateLocation(opts) {
  const climateCsvPath = path.join(__dirname, '..', 'data', 'climate_location_knowledge.csv');
  const rootClimateCsvPath = path.join(__dirname, '..', 'climate_location_knowledge.csv');
  const activeClimatePath = fs.existsSync(climateCsvPath)
    ? climateCsvPath
    : (fs.existsSync(rootClimateCsvPath) ? rootClimateCsvPath : null);

  if (!activeClimatePath) {
    logger.info('[Seed] No climate_location_knowledge.csv found — skipping climate collection seed.');
    return;
  }

  let climateRecords = parseCSV(fs.readFileSync(activeClimatePath, 'utf-8')).map(normalizeClimateRow);
  logger.info(`[Seed] Loaded ${climateRecords.length} climate records from ${path.basename(activeClimatePath)}`);

  if (opts.limit && opts.limit > 0) {
    climateRecords = climateRecords.slice(0, opts.limit);
  }

  // Ingest climate_location_source_audit.csv if present
  const climateAuditPath = path.join(__dirname, '..', 'data', 'climate_location_source_audit.csv');
  const rootClimateAuditPath = path.join(__dirname, '..', 'climate_location_source_audit.csv');
  const activeClimateAuditPath = fs.existsSync(climateAuditPath)
    ? climateAuditPath
    : (fs.existsSync(rootClimateAuditPath) ? rootClimateAuditPath : null);

  if (activeClimateAuditPath) {
    const climateAuditRecords = parseCSV(fs.readFileSync(activeClimateAuditPath, 'utf-8'));
    const auditRes = await climateRepo.bulkUpsertClimateSourceAudit(climateAuditRecords);
    logger.info(`[Seed] Upserted ${climateAuditRecords.length} climate_location_source_audit records (upserted: ${auditRes.upsertedCount}, modified: ${auditRes.modifiedCount})`);
  }

  const batchSize = opts.batchSize;
  for (let start = 0; start < climateRecords.length; start += batchSize) {
    const batch = climateRecords.slice(start, start + batchSize);

    if (!opts.skipEmbeddings) {
      const texts = batch.map((r) =>
        [
          r.location_name,
          r.state_province,
          r.country,
          r.subregion,
          r.region,
          r.knowledge_type,
          r.normalized_season,
          r.climate_zone,
          r.seasonal_gardening_implications,
          r.planting_window_context,
          r.knowledge_text,
        ]
          .filter(Boolean)
          .join(' | ')
      );

      try {
        const embeddings = await embeddingProvider.embedBatch(texts);
        batch.forEach((doc, idx) => {
          doc.embedding = embeddings[idx] || [];
        });
      } catch (err) {
        logger.warn(`[Seed] Climate batch embedding unavailable (${err.message}). Upserting batch without embeddings.`);
      }
    }

    await climateRepo.bulkUpsertClimateKnowledge(batch);
    logger.info(`[Seed] Upserted climate records ${start + 1}–${Math.min(start + batch.length, climateRecords.length)} of ${climateRecords.length}`);
  }

  logger.info('[Seed] Completed seeding gardening_knowledge.climate_location_knowledge.');
}

async function seed() {
  const opts = parseArgs();
  await connectDB();

  if (!opts.climateOnly) {
    await seedPlantHealth(opts);
  }
  await seedClimateLocation(opts);

  process.exit(0);
}

seed().catch((err) => {
  logger.error('[Seed] Fatal error:', err);
  process.exit(1);
});
