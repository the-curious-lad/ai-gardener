'use strict';

const AIProvider = require('./AIProvider');
const { parseAndValidate } = require('../../utils/jsonParser');
const logger = require('../../utils/logger');
const config = require('../../config/env');

const MAX_RETRIES = 2;

class OllamaProvider extends AIProvider {
  constructor() {
    super();
    this.baseUrl = config.ollama.baseUrl;
    this.model   = config.ollama.model;
  }

  // ── Internal: POST to Ollama /api/chat ──────────────────────────────────────

  async _chat(messages, options = {}) {
    const body = {
      model:      this.model,
      messages,
      stream:     false,
      keep_alive: '30m',
      ...options,
    };

    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ollama API error ${res.status}: ${text}`);
    }

    const data = await res.json();
    return data?.message?.content ?? '';
  }

  // ── generateText ─────────────────────────────────────────────────────────────

  async generateText(prompt, options = {}) {
    logger.debug('[Ollama] generateText');
    return this._chat([{ role: 'user', content: prompt }], options);
  }

  // ── generateStructuredOutput ──────────────────────────────────────────────────

  async generateStructuredOutput(systemPrompt, userPrompt, zodSchema, options = {}) {
    logger.debug('[Ollama] generateStructuredOutput');

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt },
    ];

    // Request JSON mode from Ollama
    const callOptions = { format: 'json', ...options };

    let lastError;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const raw = await this._chat(messages, callOptions);
        logger.debug('[Ollama] raw response:', raw.slice(0, 300));
        const validated = parseAndValidate(raw, zodSchema);
        return validated;
      } catch (err) {
        lastError = err;
        logger.warn(`[Ollama] attempt ${attempt}/${MAX_RETRIES} failed:`, err.message);
        if (attempt < MAX_RETRIES) {
          // Append error feedback so the model self-corrects
          messages.push({ role: 'assistant', content: 'ERROR: ' + err.message });
          messages.push({
            role: 'user',
            content: 'Your previous response was invalid JSON or failed schema validation. Please respond with only valid JSON matching the required schema.',
          });
        }
      }
    }

    throw new Error(`generateStructuredOutput failed after ${MAX_RETRIES} attempts: ${lastError?.message}`);
  }

  // ── analyzeImage ──────────────────────────────────────────────────────────────
  // Implemented in Stage 6 — Gemma 3 multimodal vision

  async analyzeImage(imageBuffer, mimeType, prompt, options = {}) {
    logger.debug('[Ollama] analyzeImage');

    const base64 = imageBuffer.toString('base64');
    const messages = [
      {
        role:    'user',
        content: prompt,
        images:  [base64],
      },
    ];

    return this._chat(messages, options);
  }
}

module.exports = OllamaProvider;
