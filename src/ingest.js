import dotenv from 'dotenv'
import { DirectoryLoader } from 'langchain/document_loaders/fs/directory'
import { TextLoader } from 'langchain/document_loaders/fs/text'
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import { OllamaEmbeddings } from '@langchain/ollama'
import { HNSWLib } from '@langchain/community/vectorstores/hnswlib'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { validateEmbeddingModel, saveVectorstoreMetadata } from './config/embeddingValidation.js'

// Load environment variables
dotenv.config()

// Get project root directory
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = join(__dirname, '..')

// Configuration
const DOCS_PATH = join(projectRoot, 'docs')
const VECTORSTORE_PATH = join(projectRoot, 'vectorstore')
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text'

/**
 * Check if Ollama is reachable
 */
async function checkOllamaConnection() {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`)
    if (!response.ok) {
      throw new Error(`Ollama returned status ${response.status}`)
    }
    return true
  } catch (error) {
    throw new Error('Ollama not running. Start with: ollama serve')
  }
}

/**
 * Load and process documents from the docs directory
 */
async function ingestDocuments() {
  const startTime = Date.now()

  console.log('Starting document ingestion...')
  console.log(`Loading documents from: ${DOCS_PATH}`)
  console.log(`Ollama URL: ${OLLAMA_BASE_URL}`)
  console.log(`Embedding Model: ${OLLAMA_EMBED_MODEL}\n`)

  try {
    // Step 1: Check Ollama connection and validate embedding model
    console.log('Checking Ollama connection...')
    await checkOllamaConnection()
    console.log('Ollama is reachable\n')

    // Validate embedding model is available
    await validateEmbeddingModel(OLLAMA_EMBED_MODEL, OLLAMA_BASE_URL)
    console.log('')

    // Step 2: Load all markdown files from docs directory
    console.log('Loading markdown files...')
    const loader = new DirectoryLoader(
      DOCS_PATH,
      {
        '.md': path => new TextLoader(path)
      },
      true // recursive
    )

    const docs = await loader.load()
    console.log(`Loaded ${docs.length} documents\n`)

    // Log each file loaded
    docs.forEach((doc, index) => {
      const relativePath = doc.metadata.source.replace(projectRoot, '')
      console.log(`  ${index + 1}. ${relativePath}`)
    })
    console.log('')

    // Step 3: Improved text splitting for financial documents
    console.log('Splitting documents into chunks (improved strategy)...')
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1500, // Increased from 1000 to preserve tables
      chunkOverlap: 250, // Increased overlap for better context
      // Prioritize section boundaries over table rows
      separators: ['\n## ', '\n### ', '\n#### ', '\n\n', '\n- ', '\n', ' ']
    })

    const splitDocs = await textSplitter.splitDocuments(docs)

    // Step 3.1: Enrich every chunk with structured metadata for retrieval and citation.
    //   source   — relative filepath within docs (e.g. "credit-cards/hsbc-revolution.md")
    //   product  — filename without extension    (e.g. "hsbc-revolution")
    //   category — parent folder name            (e.g. "credit-cards")
    console.log('Enriching chunks with metadata...')
    splitDocs.forEach(doc => {
      const absolutePath = doc.metadata.source || ''
      const pathParts = absolutePath.split('/')

      // Locate the 'docs' segment to derive the relative path
      const docsIndex = pathParts.indexOf('docs')
      const category =
        docsIndex >= 0 && pathParts[docsIndex + 1] ? pathParts[docsIndex + 1] : 'unknown'

      const filename = pathParts[pathParts.length - 1] || 'unknown'
      const product = filename.replace(/\.md$/, '')

      doc.metadata.source = `${category}/${filename}`
      doc.metadata.product = product
      doc.metadata.category = category
    })

    console.log(`Created ${splitDocs.length} chunks with metadata\n`)

    // Step 4: Create embeddings and save to vector store
    console.log('Generating embeddings and creating vector store...')
    console.log('   (This may take a while depending on the number of chunks)\n')

    const embeddings = new OllamaEmbeddings({
      model: OLLAMA_EMBED_MODEL,
      baseUrl: OLLAMA_BASE_URL
    })

    // Create and save vector store
    const vectorStore = await HNSWLib.fromDocuments(splitDocs, embeddings)
    await vectorStore.save(VECTORSTORE_PATH)

    console.log(`Vector store saved to: ${VECTORSTORE_PATH}`)

    // Save metadata for version tracking and validation
    saveVectorstoreMetadata(VECTORSTORE_PATH, OLLAMA_EMBED_MODEL, docs.length, splitDocs.length)
    console.log('')

    // Step 5: Summary with quality metrics
    const endTime = Date.now()
    const duration = ((endTime - startTime) / 1000).toFixed(2)

    // Calculate average chunk size
    const totalChars = splitDocs.reduce((sum, doc) => sum + doc.pageContent.length, 0)
    const avgChunkSize = Math.round(totalChars / splitDocs.length)

    // Count chunks by category
    const chunksByCategory = {}
    splitDocs.forEach(doc => {
      const category = doc.metadata.category || 'unknown'
      chunksByCategory[category] = (chunksByCategory[category] || 0) + 1
    })

    console.log('Ingestion complete!')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`Summary:`)
    console.log(`   • Total files ingested: ${docs.length}`)
    console.log(`   • Total chunks created: ${splitDocs.length}`)
    console.log(`   • Average chunk size: ${avgChunkSize} characters`)
    console.log(`   • Chunks per category:`)
    Object.entries(chunksByCategory)
      .sort()
      .forEach(([cat, count]) => {
        console.log(`      - ${cat}: ${count} chunks`)
      })
    console.log(`   • Time taken: ${duration}s`)
    console.log(`   • Vector store: ${VECTORSTORE_PATH}`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
  } catch (error) {
    console.error('Error during ingestion:')
    console.error(error.message)

    if (error.message.includes('Ollama not running')) {
      console.error('\nMake sure Ollama is running with: ollama serve')
      console.error('   Then ensure the model is available: ollama pull ' + OLLAMA_EMBED_MODEL)
    }

    process.exit(1)
  }
}

// Run the ingestion when script is executed directly
ingestDocuments()
