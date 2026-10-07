'use strict';

require('dotenv').config();

const required = ['MONGODB_URI'];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

module.exports = {
  port: parseInt(process.env.PORT, 10) || 3000,

  mongodb: {
    uri: process.env.MONGODB_URI,
    appDb: process.env.MONGODB_APP_DB || 'garden_app',
    knowledgeDb: process.env.MONGODB_KNOWLEDGE_DB || 'gardening_knowledge',
  },

  ollama: {
    baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    model: process.env.OLLAMA_MODEL || 'gemma3:4b',
  },

  embeddings: {
    model: process.env.EMBEDDING_MODEL || 'nomic-embed-text',
    dimensions: parseInt(process.env.EMBEDDING_DIMENSIONS, 10) || 768,
  },

  summarizer: {
    messageThreshold: parseInt(process.env.SUMMARY_MESSAGE_THRESHOLD, 10) || 6,
    recentMessagesWindow: parseInt(process.env.RECENT_MESSAGES_WINDOW, 10) || 4,
  },

  vectorIndexes: {
    plantHealth: process.env.VECTOR_INDEX_NAME || 'plant_health_knowledge_vector_index',
    climateLocation: process.env.CLIMATE_VECTOR_INDEX_NAME || 'climate_location_knowledge_vector_index',
  },
};
