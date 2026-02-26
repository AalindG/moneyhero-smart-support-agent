#!/bin/bash
set -e

echo "🚀 Starting MoneyHero backend setup..."

# Start services
echo "📦 Starting Docker services..."
docker compose up -d

# Wait for Ollama to be ready
echo "⏳ Waiting for Ollama service to be ready..."
MAX_ATTEMPTS=60
ATTEMPT=0
until curl -s http://localhost:11434/api/tags > /dev/null 2>&1; do
    ATTEMPT=$((ATTEMPT+1))
    if [ $ATTEMPT -gt $MAX_ATTEMPTS ]; then
        echo "❌ Ollama service failed to start within 60 seconds"
        exit 1
    fi
    echo "   Attempt $ATTEMPT/$MAX_ATTEMPTS..."
    sleep 1
done

echo "✅ Ollama service is ready!"

# Pull LLM model
echo "📥 Pulling llama3.2 model..."
docker exec moneyhero-ollama ollama pull llama3.2

# Pull embedding model
echo "📥 Pulling nomic-embed-text model..."
docker exec moneyhero-ollama ollama pull nomic-embed-text

# Run ingestion
echo "🔄 Running document ingestion..."
docker exec moneyhero-backend npm run ingest

echo ""
echo "✅ MoneyHero backend ready!"
echo "   Backend: http://localhost:3001"
echo "   Ollama: http://localhost:11434"
echo ""
