'use strict';

const EmbeddingProvider = require('./EmbeddingProvider');
const config = require('../../config/env');
const logger = require('../../utils/logger');

const MAX_EMBED_CACHE_SIZE = 256;

class OllamaEmbeddingProvider extends EmbeddingProvider {
  constructor() {
    super();
    this.baseUrl = config.ollama.baseUrl;
    this.model   = config.embeddings.model;
    this.cache   = new Map();
  }

  _getCacheKey(text) {
    return `${this.model}:${String(text || '').trim().toLowerCase().replace(/\s+/g, ' ')}`;
  }

  _setCache(key, vector) {
    if (!Array.isArray(vector) || vector.length === 0) return;
    if (this.cache.size >= MAX_EMBED_CACHE_SIZE) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
    this.cache.set(key, vector);
  }

  /**
   * Call Ollama /api/embed (current API) with fallback to /api/embeddings (legacy).
   * @param {string|string[]} input
   * @returns {Promise<number[][]>}
   */
  async _embed(input) {
    // Try current Ollama embed API first (with keep_alive to prevent model cold-starts)
    try {
      const res = await fetch(`${this.baseUrl}/api/embed`, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
        body: JSON.stringify({ model: this.model, input, keep_alive: '30m' }),
      });

      const rawText = await res.text();
      if (res.ok && rawText && rawText.trim()) {
        const data = JSON.parse(rawText);
        // Returns { embeddings: [[...], [...]] }
        if (Array.isArray(data.embeddings)) return data.embeddings;
      }
    } catch (_) { /* fall through */ }

    // Legacy fallback: /api/embeddings (single prompt only)
    const prompt = Array.isArray(input) ? input[0] : input;
    const res = await fetch(`${this.baseUrl}/api/embeddings`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
      },
      body: JSON.stringify({ model: this.model, prompt, keep_alive: '30m' }),
    });

    const rawText = await res.text();
    if (!res.ok) {
      throw new Error(`Ollama embed error ${res.status}: ${rawText}`);
    }
    if (!rawText || !rawText.trim()) {
      throw new Error('Ollama embed returned an empty response body.');
    }

    const data = JSON.parse(rawText);
    // Returns { embedding: [...] }
    return [data.embedding];
  }

  async embedText(text) {
    const key = this._getCacheKey(text);
    if (this.cache.has(key)) {
      logger.debug(`[Embed] cache hit — model: ${this.model}`);
      return this.cache.get(key);
    }

    logger.debug(`[Embed] embedText — model: ${this.model}`);
    const results = await this._embed(text);
    const vec = results[0];
    this._setCache(key, vec);
    return vec;
  }

  async embedBatch(texts) {
    logger.debug(`[Embed] embedBatch — ${texts.length} texts, model: ${this.model}`);
    // Ollama /api/embed supports array input in newer versions
    const results = await this._embed(texts);
    // If the API only returned one (legacy fallback), embed the rest individually
    if (results.length < texts.length) {
      for (let i = results.length; i < texts.length; i++) {
        const r = await this._embed(texts[i]);
        results.push(r[0]);
      }
    }
    return results;
  }
}

module.exports = OllamaEmbeddingProvider;
