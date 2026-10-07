'use strict';

const logger = require('./logger');

/**
 * Attempt to repair common LLM JSON formatting issues:
 *   - Unescaped literal newlines/tabs inside string literals
 *   - Trailing commas before } or ]
 *   - Truncated JSON missing closing quotes, brackets, or braces ("Unexpected end of JSON input")
 *
 * @param {string} str
 * @returns {string}
 */
function repairJsonCandidate(str) {
  if (!str || typeof str !== 'string') return '';

  let inString = false;
  let escaped = false;
  const stack = [];
  let out = '';

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];

    if (inString) {
      if (escaped) {
        out += ch;
        escaped = false;
      } else if (ch === '\\') {
        out += ch;
        escaped = true;
      } else if (ch === '"') {
        out += ch;
        inString = false;
      } else if (ch === '\n') {
        out += '\\n';
      } else if (ch === '\r') {
        // skip raw CR inside string
      } else if (ch === '\t') {
        out += '\\t';
      } else {
        out += ch;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      out += ch;
    } else if (ch === '{') {
      stack.push('}');
      out += ch;
    } else if (ch === '[') {
      stack.push(']');
      out += ch;
    } else if (ch === '}' || ch === ']') {
      if (stack.length > 0 && stack[stack.length - 1] === ch) {
        stack.pop();
      }
      out += ch;
    } else {
      out += ch;
    }
  }

  // If truncated inside a string literal, close the quote
  if (inString) {
    if (escaped) out += '\\';
    out += '"';
  }

  // Strip trailing commas or dangling colons before closing
  out = out.replace(/,\s*([}\]])/g, '$1');
  out = out.replace(/,\s*$/, '');

  // Close any unclosed brackets/braces in reverse order
  while (stack.length > 0) {
    out += stack.pop();
  }

  // Final cleanup of trailing commas created before auto-closed braces/brackets
  out = out.replace(/,\s*([}\]])/g, '$1');
  return out;
}

/**
 * Safely extract a JSON object from a raw LLM response string.
 * Handles:
 *   - Plain JSON
 *   - JSON wrapped in ```json ... ``` markdown fences
 *   - JSON embedded in prose (extracts the first {...} block)
 *   - Truncated or slightly malformed JSON ("Unexpected end of JSON input")
 *
 * @param {string} raw  Raw string from LLM
 * @returns {object}    Parsed JS object
 * @throws {Error}      If no valid JSON is found
 */
function extractJSON(raw) {
  if (!raw || typeof raw !== 'string' || !raw.trim()) {
    throw new Error('LLM returned empty response.');
  }

  // 1. Strip markdown fences if present
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenceMatch ? fenceMatch[1].trim() : raw.trim();

  // 2. Try direct parse first
  try {
    return JSON.parse(candidate);
  } catch (_) {
    // continue
  }

  // 3. Find the first { and try balanced block or repaired block
  const start = candidate.indexOf('{');
  if (start === -1) throw new Error('No JSON object found in LLM response.');

  let depth = 0;
  let end = -1;
  let inStr = false;
  let esc = false;
  for (let i = start; i < candidate.length; i++) {
    const ch = candidate[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  const slice = end !== -1 ? candidate.slice(start, end + 1) : candidate.slice(start);

  try {
    return JSON.parse(slice);
  } catch (_) {
    // Attempt structural repair (handles truncated JSON / trailing commas / raw newlines)
    const repaired = repairJsonCandidate(slice);
    try {
      return JSON.parse(repaired);
    } catch (err) {
      throw new Error(`Failed to parse extracted JSON: ${err.message}`);
    }
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
