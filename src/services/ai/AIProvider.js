'use strict';

/**
 * AIProvider — abstract interface.
 *
 * All AI interactions in the application MUST go through a provider that
 * implements this interface. Never call Ollama (or any model API) directly
 * outside of a provider implementation.
 *
 * Methods:
 *   generateText(prompt, options?)
 *     → Promise<string>
 *
 *   generateStructuredOutput(systemPrompt, userPrompt, zodSchema, options?)
 *     → Promise<object>   (Zod-validated)
 *
 *   analyzeImage(imageBuffer, mimeType, prompt, options?)
 *     → Promise<string>   (raw text — vision model output)
 */
class AIProvider {
  // eslint-disable-next-line no-unused-vars
  async generateText(prompt, options = {}) {
    throw new Error('AIProvider.generateText() not implemented.');
  }

  // eslint-disable-next-line no-unused-vars
  async generateStructuredOutput(systemPrompt, userPrompt, zodSchema, options = {}) {
    throw new Error('AIProvider.generateStructuredOutput() not implemented.');
  }

  // eslint-disable-next-line no-unused-vars
  async analyzeImage(imageBuffer, mimeType, prompt, options = {}) {
    throw new Error('AIProvider.analyzeImage() not implemented.');
  }
}

module.exports = AIProvider;
