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

  // ── Internal: POST to Ollama /api/chat (streamed keep-alive + safe JSON parse) ──

  async _chat(messages, options = {}) {
    const body = {
      model:      this.model,
      messages,
      stream:     true,
      keep_alive: '30m',
      ...options,
    };

    let lastFetchErr = null;
    for (let netAttempt = 1; netAttempt <= 2; netAttempt++) {
      try {
        const res = await fetch(`${this.baseUrl}/api/chat`, {
          method:  'POST',
          headers: {
            'Content-Type': 'application/json',
            'ngrok-skip-browser-warning': 'true',
          },
          body: JSON.stringify(body),
        });

        const rawText = await res.text();
        if (!res.ok) {
          throw new Error(`Ollama API error ${res.status}: ${rawText || res.statusText}`);
        }

        const trimmed = (rawText || '').trim();
        if (!trimmed) {
          throw new Error('Ollama returned an empty response body over tunnel.');
        }

        // 1. Try single JSON object first (in case stream:false was passed in options)
        try {
          const single = JSON.parse(trimmed);
          if (single && typeof single === 'object' && ! trimmed.includes('\n{')) {
            return single?.message?.content ?? single?.response ?? '';
          }
        } catch (_) {
          // Proceed to NDJSON stream accumulation
        }

        // 2. Accumulate NDJSON lines from stream:true
        const lines = trimmed.split(/\r?\n/).filter((l) => l.trim());
        let combinedContent = '';
        let parsedAnyChunk = false;
        for (const line of lines) {
          try {
            const chunk = JSON.parse(line);
            parsedAnyChunk = true;
            if (chunk?.error) {
              throw new Error(`Ollama stream error: ${chunk.error}`);
            }
            if (typeof chunk?.message?.content === 'string') {
              combinedContent += chunk.message.content;
            } else if (typeof chunk?.response === 'string') {
              combinedContent += chunk.response;
            }
          } catch (chunkErr) {
            if (chunkErr.message.startsWith('Ollama stream error:')) throw chunkErr;
            // Ignore a truncated trailing NDJSON metadata line if content was already collected
          }
        }

        if (!parsedAnyChunk) {
          throw new Error('Failed to parse JSON response from Ollama.');
        }

        return combinedContent;
      } catch (err) {
        lastFetchErr = err;
        logger.warn(`[Ollama._chat] network/parse attempt ${netAttempt}/2 failed: ${err.message}`);
        if (netAttempt < 2) {
          await new Promise((r) => setTimeout(r, 800));
        }
      }
    }

    throw lastFetchErr;
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
