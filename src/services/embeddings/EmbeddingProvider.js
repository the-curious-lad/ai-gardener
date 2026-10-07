'use strict';

/**
 * EmbeddingProvider — abstract interface.
 *
 * All embedding generation MUST go through a provider that implements this.
 * The embedding model is independent of the chat model.
 *
 * Methods:
 *   embedText(text)          → Promise<number[]>       single embedding
 *   embedBatch(texts)        → Promise<number[][]>     batch embeddings
 */
class EmbeddingProvider {
  // eslint-disable-next-line no-unused-vars
  async embedText(text) {
    throw new Error('EmbeddingProvider.embedText() not implemented.');
  }

  // eslint-disable-next-line no-unused-vars
  async embedBatch(texts) {
    throw new Error('EmbeddingProvider.embedBatch() not implemented.');
  }
}

module.exports = EmbeddingProvider;
