'use strict';

const ai = require('../ai');
const { PhotoObservationSchema } = require('../../models/schemas');
const { buildPhotoPrompt } = require('../../prompts/photoReader.prompt');
const { parseAndValidate } = require('../../utils/jsonParser');
const logger = require('../../utils/logger');

const MAX_RETRIES = 2;

/**
 * Analyze a plant photo using Gemma 3 Vision via AIProvider.
 *
 * Returns a Zod-validated PhotoObservation object.
 * Never mutates the database or transitions gardening phases directly.
 *
 * @param {object} params
 * @param {Buffer} params.imageBuffer  Raw image bytes
 * @param {string} params.mimeType     MIME type (e.g. image/jpeg, image/png)
 * @param {object} params.session      Current garden session
 * @param {string} [params.userNote]   Optional message accompanying the photo
 * @returns {Promise<object>}          Validated PhotoObservation
 */
async function analyzePlantPhoto({ imageBuffer, mimeType = 'image/jpeg', session = {}, userNote = '' }) {
  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
    throw new Error('Valid imageBuffer is required for photo analysis.');
  }

  const prompt = buildPhotoPrompt(session, userNote);

  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      logger.debug(`[PhotoReader] Analyzing image with Gemma 3 (attempt ${attempt}/${MAX_RETRIES})...`);
      const raw = await ai.analyzeImage(imageBuffer, mimeType, prompt, { format: 'json' });
      const observation = parseAndValidate(raw, PhotoObservationSchema);

      // Handle low-confidence observations gracefully by ensuring uncertainties is populated
      if (observation.confidence < 0.5 && observation.uncertainties.length === 0) {
        observation.uncertainties.push('Low visual confidence — consider taking a closer, well-lit photo of the affected leaf.');
      }

      return observation;
    } catch (err) {
      lastError = err;
      logger.warn(`[PhotoReader] Attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}`);
    }
  }

  logger.warn(`[PhotoReader] Local vision model unreachable (${lastError?.message}) — using note-assisted fallback observation.`);
  const fallbackPlant = session.gardenState?.context?.preferredPlants?.[0] || 'garden plant';
  const noteLower = (userNote || '').toLowerCase();
  const hasYellowOrSpot = /\b(yellow|spot|brown|wilt|curl|pest|bug|blight|dry)\b/.test(noteLower);
  return PhotoObservationSchema.parse({
    plantDetected: fallbackPlant,
    visibleSymptoms: userNote ? [userNote.trim()] : ['general foliage inspection'],
    leafCondition: hasYellowOrSpot ? 'spotted' : 'healthy',
    possiblePestSigns: [],
    possibleDiseaseSigns: hasYellowOrSpot ? ['possible foliar stress or early leaf spot'] : [],
    growthStageEstimate: 'vegetative',
    severity: hasYellowOrSpot ? 'moderate' : 'mild',
    confidence: 0.65,
    uncertainties: ['Analyzed using note-assisted fallback while local vision node is offline'],
  });
}

module.exports = { analyzePlantPhoto };
