'use strict';

const OllamaProvider = require('./OllamaProvider');

// Singleton — one provider instance for the whole app lifetime.
// Swap OllamaProvider for any other AIProvider implementation here
// without touching anything else in the codebase.
const provider = new OllamaProvider();

module.exports = provider;
