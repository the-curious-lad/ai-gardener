'use strict';

const fs = require('fs');
const path = require('path');

/**
 * RFC-4180 compliant CSV parser that handles quoted fields, escaped quotes (""),
 * and embedded commas/newlines.
 *
 * @param {string} content Raw CSV string
 * @returns {object[]} Array of row objects keyed by header names
 */
function parseCSV(content) {
  const rows = [];
  let currentRow = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    const next = content[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        currentField += '"';
        i++; // skip escaped quote
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        currentField += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        currentRow.push(currentField);
        currentField = '';
      } else if (ch === '\r' && next === '\n') {
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
        i++; // skip \n
      } else if (ch === '\n' || ch === '\r') {
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
      } else {
        currentField += ch;
      }
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  if (rows.length === 0) return [];

  const headers = rows[0].map((h) => h.trim());
  const records = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.length === 1 && row[0].trim() === '') continue;

    const obj = {};
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = (row[c] ?? '').trim();
    }
    records.push(obj);
  }

  return records;
}

/**
 * Normalize a raw CSV row from plant_health_knowledge.csv into a unified
 * MongoDB document structure while preserving all 49 original CSV columns.
 *
 * @param {object} row Raw CSV row object
 * @returns {object} Normalized knowledge document
 */
function normalizeKnowledgeRow(row) {
  const plantLower = (row.plant_common_name || 'general').toLowerCase().trim();
  const keywordList = (row.symptom_keywords || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const tags = Array.from(
    new Set([
      plantLower,
      (row.knowledge_type || '').toLowerCase(),
      (row.knowledge_subtype || '').toLowerCase(),
      (row.problem_name || '').toLowerCase(),
      ...keywordList,
    ].filter(Boolean))
  );

  return {
    ...row,
    plant: plantLower,
    title: row.topic || row.problem_name || `${row.plant_common_name} — ${row.knowledge_type}`,
    knowledgeText: row.knowledge_text || '',
    tags,
  };
}

let cachedCsvRecords = null;
let cachedClimateCsvRecords = null;

/**
 * Load and cache normalized records from data/plant_health_knowledge.csv.
 *
 * @returns {object[]}
 */
function loadKnowledgeCSV() {
  if (cachedCsvRecords) return cachedCsvRecords;

  const candidates = [
    path.join(__dirname, '..', '..', 'data', 'plant_health_knowledge.csv'),
    path.join(__dirname, '..', '..', 'plant_health_knowledge.csv'),
  ];

  for (const filePath of candidates) {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      cachedCsvRecords = parseCSV(content).map(normalizeKnowledgeRow);
      return cachedCsvRecords;
    }
  }

  return [];
}

/**
 * Normalize a raw CSV row from climate_location_knowledge.csv into a unified
 * MongoDB document structure while preserving all 33 original CSV columns.
 *
 * Blank cells ("") are converted to null so optional fields are never forced.
 * frost_risk and heat_risk default to 'UNKNOWN' when blank (never 'LOW').
 *
 * @param {object} row Raw CSV row object
 * @returns {object} Normalized climate/location knowledge document
 */
function normalizeClimateRow(row) {
  const cleaned = {};
  for (const [key, val] of Object.entries(row)) {
    const trimmed = typeof val === 'string' ? val.trim() : val;
    cleaned[key] = trimmed === '' ? null : trimmed;
  }

  // Preserve UNKNOWN for frost_risk and heat_risk (never treat UNKNOWN as low)
  cleaned.frost_risk = cleaned.frost_risk || 'UNKNOWN';
  cleaned.heat_risk = cleaned.heat_risk || 'UNKNOWN';

  // Normalize FALL -> AUTUMN while keeping canonical values
  if (cleaned.normalized_season === 'FALL') {
    cleaned.normalized_season = 'AUTUMN';
  }

  return {
    ...cleaned,
    locationLower: cleaned.location_name ? cleaned.location_name.toLowerCase() : null,
    countryLower: cleaned.country ? cleaned.country.toLowerCase() : null,
    regionLower: cleaned.region ? cleaned.region.toLowerCase() : null,
    subregionLower: cleaned.subregion ? cleaned.subregion.toLowerCase() : null,
    knowledgeText: cleaned.knowledge_text || '',
  };
}

/**
 * Load and cache normalized records from data/climate_location_knowledge.csv.
 *
 * @returns {object[]}
 */
function loadClimateCSV() {
  if (cachedClimateCsvRecords) return cachedClimateCsvRecords;

  const candidates = [
    path.join(__dirname, '..', '..', 'data', 'climate_location_knowledge.csv'),
    path.join(__dirname, '..', '..', 'climate_location_knowledge.csv'),
  ];

  for (const filePath of candidates) {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      cachedClimateCsvRecords = parseCSV(content).map(normalizeClimateRow);
      return cachedClimateCsvRecords;
    }
  }

  return [];
}

module.exports = {
  parseCSV,
  normalizeKnowledgeRow,
  loadKnowledgeCSV,
  normalizeClimateRow,
  loadClimateCSV,
};
