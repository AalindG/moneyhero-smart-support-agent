import dotenv from 'dotenv'
import { DirectoryLoader } from 'langchain/document_loaders/fs/directory'
import { TextLoader } from 'langchain/document_loaders/fs/text'
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import { OllamaEmbeddings } from '@langchain/ollama'
import { HNSWLib } from '@langchain/community/vectorstores/hnswlib'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

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

  console.log('🚀 Starting document ingestion...')
  console.log(`📂 Loading documents from: ${DOCS_PATH}`)
  console.log(`🔗 Ollama URL: ${OLLAMA_BASE_URL}`)
  console.log(`🤖 Embedding Model: ${OLLAMA_EMBED_MODEL}\n`)

  try {
    // Step 1: Check Ollama connection
    console.log('⏳ Checking Ollama connection...')
    await checkOllamaConnection()
    console.log('✅ Ollama is reachable\n')

    // Step 2: Load all markdown files from docs directory
    console.log('📖 Loading markdown files...')
    const loader = new DirectoryLoader(
      DOCS_PATH,
      {
        '.md': path => new TextLoader(path)
      },
      true // recursive
    )

    const docs = await loader.load()
    console.log(`✅ Loaded ${docs.length} documents\n`)

    // Log each file loaded
    docs.forEach((doc, index) => {
      const relativePath = doc.metadata.source.replace(projectRoot, '')
      console.log(`  ${index + 1}. ${relativePath}`)
    })
    console.log('')

    // Step 3: Split documents into chunks
    console.log('✂️  Splitting documents into chunks...')
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200
    })

    const splitDocs = await textSplitter.splitDocuments(docs)
    console.log(`✅ Created ${splitDocs.length} chunks\n`)

    // Step 4: Create embeddings and save to vector store
    console.log('🧮 Generating embeddings and creating vector store...')
    console.log(
      '   (This may take a while depending on the number of chunks)\n'
    )

    const embeddings = new OllamaEmbeddings({
      model: OLLAMA_EMBED_MODEL,
      baseUrl: OLLAMA_BASE_URL
    })

    // Create and save vector store
    const vectorStore = await HNSWLib.fromDocuments(splitDocs, embeddings)
    await vectorStore.save(VECTORSTORE_PATH)

    console.log(`✅ Vector store saved to: ${VECTORSTORE_PATH}\n`)

    // Step 5: Summary
    const endTime = Date.now()
    const duration = ((endTime - startTime) / 1000).toFixed(2)

    console.log('🎉 Ingestion complete!')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`📊 Summary:`)
    console.log(`   • Documents loaded: ${docs.length}`)
    console.log(`   • Total chunks: ${splitDocs.length}`)
    console.log(`   • Time taken: ${duration}s`)
    console.log(`   • Vector store: ${VECTORSTORE_PATH}`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
  } catch (error) {
    console.error('❌ Error during ingestion:')
    console.error(error.message)

    if (error.message.includes('Ollama not running')) {
      console.error('\n💡 Make sure Ollama is running with: ollama serve')
      console.error(
        '   Then ensure the model is available: ollama pull ' +
          OLLAMA_EMBED_MODEL
      )
    }

    process.exit(1)
  }
}

// Run the ingestion when script is executed directly
ingestDocuments()
