'use strict';

const logger = require('./logger');

/**
 * Safely extract a JSON object from a raw LLM response string.
 * Handles:
 *   - Plain JSON
 *   - JSON wrapped in ```json ... ``` markdown fences
 *   - JSON embedded in prose (extracts the first {...} block)
 *
 * @param {string} raw  Raw string from LLM
 * @returns {object}    Parsed JS object
 * @throws {Error}      If no valid JSON is found
 */
function extractJSON(raw) {
  if (!raw || typeof raw !== 'string') throw new Error('LLM returned empty response.');

  // 1. Strip markdown fences if present
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenceMatch ? fenceMatch[1].trim() : raw.trim();

  // 2. Try direct parse first
  try {
    return JSON.parse(candidate);
  } catch (_) {
    // continue
  }

  // 3. Find the first balanced { ... } block
  const start = candidate.indexOf('{');
  if (start === -1) throw new Error('No JSON object found in LLM response.');

  let depth = 0;
  let end = -1;
  for (let i = start; i < candidate.length; i++) {
    if (candidate[i] === '{') depth++;
    else if (candidate[i] === '}') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }

  if (end === -1) throw new Error('Unbalanced JSON braces in LLM response.');

  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch (err) {
    throw new Error(`Failed to parse extracted JSON: ${err.message}`);
  }
}

/**
 * Extract JSON from raw LLM output and validate it against a Zod schema.
 *
 * @param {string} raw       Raw LLM string
 * @param {import('zod').ZodTypeAny} schema  Zod schema to validate against
 * @returns {object}         Validated, typed result
 */
function parseAndValidate(raw, schema) {
  const parsed = extractJSON(raw);
  const result = schema.safeParse(parsed);

  if (!result.success) {
    const issues = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
    logger.warn('[jsonParser] Zod validation failed:', issues);
    throw new Error(`LLM output failed schema validation: ${issues}`);
  }

  return result.data;
}

module.exports = { extractJSON, parseAndValidate };
