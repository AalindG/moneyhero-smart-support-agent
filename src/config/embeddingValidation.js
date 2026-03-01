/**
 * Embedding Model Validation
 * Ensures consistency between ingestion and retrieval embedding models
 * Prevents silent quality degradation from model version mismatches
 */

import fs from 'fs'
import path from 'path'

/**
 * Normalize model name: treat ":latest" as the implicit default tag.
 * "nomic-embed-text" and "nomic-embed-text:latest" are the same model.
 * @param {string} name - Model name with or without tag
 * @returns {string} Name with ":latest" stripped
 */
function normalizeModelName(name) {
  return typeof name === 'string' && name.endsWith(':latest') ? name.slice(0, -7) : name
}

/**
 * Check if Ollama has the required embedding model
 * @param {string} modelName - Model name (e.g., "nomic-embed-text")
 * @param {string} ollamaBaseUrl - Ollama base URL
 * @returns {Promise<boolean>} True if model exists
 */
export async function checkOllamaModel(modelName, ollamaBaseUrl) {
  try {
    const response = await fetch(`${ollamaBaseUrl}/api/tags`)

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status}`)
    }

    const data = await response.json()

    // Normalize both sides so "nomic-embed-text" matches "nomic-embed-text:latest"
    const normalizedTarget = normalizeModelName(modelName)
    const hasModel = data.models?.some(m => normalizeModelName(m.name) === normalizedTarget)

    if (!hasModel) {
      // List available models for debugging
      const available = data.models?.map(m => m.name).join(', ') || 'none'
      console.error(`❌ Model ${modelName} not found`)
      console.error(`   Available models: ${available}`)
      return false
    }

    return true
  } catch (error) {
    console.error('Error checking Ollama models:', error.message)
    return false
  }
}

/**
 * Validate embedding model is available and consistent
 * @param {string} expectedModel - Expected model name from env
 * @param {string} ollamaBaseUrl - Ollama base URL
 * @throws {Error} If model not found or validation fails
 */
export async function validateEmbeddingModel(expectedModel, ollamaBaseUrl) {
  console.log('Validating embedding model...')
  console.log(`  Expected: ${expectedModel}`)
  console.log(`  Ollama URL: ${ollamaBaseUrl}`)

  const hasModel = await checkOllamaModel(expectedModel, ollamaBaseUrl)

  if (!hasModel) {
    throw new Error(
      `Required embedding model "${expectedModel}" not found in Ollama.\n` +
        `  Run: ollama pull ${expectedModel}\n` +
        `  Or update OLLAMA_EMBED_MODEL in .env to match an available model.`
    )
  }

  console.log(`✓ Embedding model validated: ${expectedModel}`)
  return true
}

/**
 * Save vectorstore metadata including embedding model version
 * @param {string} vectorstorePath - Path to vectorstore directory
 * @param {string} embeddingModel - Model name used for embeddings
 * @param {number} documentCount - Number of source documents
 * @param {number} chunkCount - Number of chunks created
 */
export function saveVectorstoreMetadata(
  vectorstorePath,
  embeddingModel,
  documentCount,
  chunkCount
) {
  const metadata = {
    embedding_model: embeddingModel,
    created_at: new Date().toISOString(),
    document_count: documentCount,
    chunk_count: chunkCount,
    version: '1.0'
  }

  const metadataPath = path.join(vectorstorePath, 'metadata.json')
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2))

  console.log(`✓ Vectorstore metadata saved to ${metadataPath}`)
}

/**
 * Load and validate vectorstore metadata
 * @param {string} vectorstorePath - Path to vectorstore directory
 * @param {string} expectedModel - Expected embedding model
 * @returns {object|null} Metadata object or null if not found
 */
export function loadVectorstoreMetadata(vectorstorePath, expectedModel) {
  const metadataPath = path.join(vectorstorePath, 'metadata.json')

  if (!fs.existsSync(metadataPath)) {
    console.warn('⚠️  No vectorstore metadata found - run ingestion to create it')
    return null
  }

  try {
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'))

    console.log('Vectorstore metadata:')
    console.log(`  Model: ${metadata.embedding_model}`)
    console.log(`  Created: ${metadata.created_at}`)
    console.log(`  Documents: ${metadata.document_count}`)
    console.log(`  Chunks: ${metadata.chunk_count}`)

    // Warn if model mismatch (normalize :latest so "nomic-embed-text" == "nomic-embed-text:latest")
    if (normalizeModelName(metadata.embedding_model) !== normalizeModelName(expectedModel)) {
      console.error('🚨 EMBEDDING MODEL MISMATCH DETECTED!')
      console.error(`   Vectorstore: ${metadata.embedding_model}`)
      console.error(`   Current env: ${expectedModel}`)
      console.error(`   ⚠️  Retrieval quality will be degraded!`)
      console.error(`   Fix: Re-run ingestion with: npm run ingest`)
      throw new Error('Embedding model mismatch - vectorstore incompatible')
    }

    console.log('✓ Vectorstore metadata validated')
    return metadata
  } catch (error) {
    console.error('Error loading vectorstore metadata:', error.message)
    throw error
  }
}
