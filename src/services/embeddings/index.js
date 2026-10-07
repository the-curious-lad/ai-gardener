'use strict';

const OllamaEmbeddingProvider = require('./OllamaEmbeddingProvider');

// Singleton — swap here to change embedding model globally.
const provider = new OllamaEmbeddingProvider();

module.exports = provider;
