# Claude API Hybrid Setup Guide

## Overview

The MoneyHero backend now supports a **hybrid approach** using:

- **Claude Haiku** for classification + RAG responses (fast, high quality)
- **Ollama** for embeddings (free, runs locally)
- **Prompt caching** to reduce Claude costs by 90%

## Cost Estimate

With 1,000 conversations/day (30,000/month):

- **Without caching**: ~$60/month
- **With caching**: ~$6-10/month ✨
- **Ollama only**: Free (but 5-8x slower)

## Setup Steps

### 1. Get Claude API Key

1. Visit https://console.anthropic.com/
2. Sign up or log in
3. Go to "API Keys" section
4. Create a new API key
5. Copy the key (starts with `sk-ant-...`)

**Free tier**: $5 in credits (~1,500-2,000 conversations to test)

### 2. Configure Environment

Create or update your `.env` file:

```bash
# Copy from example
cp .env.example .env

# Edit .env and add your API key
nano .env
```

Add this line with your actual API key:

```env
ANTHROPIC_API_KEY=sk-ant-api03-YOUR-KEY-HERE
```

### 3. Choose Provider

In `.env`, set the LLM provider:

```env
# Use Claude (recommended for production)
LLM_PROVIDER=claude

# Or use Ollama (free but slower)
LLM_PROVIDER=ollama
```

### 4. Enable Caching (Recommended)

Prompt caching reduces costs by 90% for repeated context:

```env
CLAUDE_ENABLE_CACHING=true
```

**How it works:**

- The system prompt + retrieved documents are cached for 5 minutes
- Subsequent queries within 5 minutes only pay for new tokens
- Typical savings: 90% on input tokens

### 5. Choose Model

```env
# Recommended: Fast and cost-effective
CLAUDE_MODEL=claude-3-5-haiku-20241022

# Alternative: Higher quality but 4x more expensive
CLAUDE_MODEL=claude-3-5-sonnet-20241022

# Alternative: Highest quality but 15x more expensive
CLAUDE_MODEL=claude-3-opus-20241022
```

## Full .env Configuration

```env
# Server
PORT=3001

# LLM Provider
LLM_PROVIDER=claude

# Claude API
ANTHROPIC_API_KEY=sk-ant-api03-YOUR-KEY-HERE
CLAUDE_MODEL=claude-3-5-haiku-20241022
CLAUDE_ENABLE_CACHING=true

# Ollama (still needed for embeddings)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_EMBED_MODEL=nomic-embed-text:v1.5

# Ollama models (used when LLM_PROVIDER=ollama)
OLLAMA_MODEL=llama3.2:3b
OLLAMA_CLASSIFIER_MODEL=llama3.2:1b

# Database
DB_PATH=./data/moneyhero.db
```

## Running Locally

### Option 1: With npm (Local Development)

```bash
# Ensure Ollama is running (needed for embeddings)
ollama serve

# Pull the embedding model
ollama pull nomic-embed-text:v1.5

# Start the backend
npm start
```

The backend will use Claude for LLM and Ollama for embeddings.

### Option 2: With Docker

```bash
# Make sure .env has ANTHROPIC_API_KEY set
echo "ANTHROPIC_API_KEY=sk-ant-..." >> .env

# Start services
docker compose up -d

# View logs
docker compose logs -f backend
```

## Testing the Setup

### 1. Check Backend Startup

Look for this in the logs:

```
🤖 LLM Provider: CLAUDE
   Model: claude-3-5-haiku-20241022
   Caching: Enabled ✓
   Embeddings: nomic-embed-text:v1.5 (Ollama)
```

### 2. Test API Call

```bash
# Create session
SESSION_ID=$(curl -s -X POST http://localhost:3001/api/session | jq -r .sessionId)

# Send message
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\": \"$SESSION_ID\", \"message\": \"What are the best cashback credit cards?\"}"
```

Expected response time: **2-5 seconds** (vs 30-60s with Ollama)

### 3. Verify Caching Works

Send the same question twice within 5 minutes:

```bash
# First call (no cache) - slower
time curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\": \"$SESSION_ID\", \"message\": \"Tell me about HSBC Revolution\"}"

# Second call (cached) - faster and cheaper
time curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\": \"$SESSION_ID\", \"message\": \"What about DBS Live Fresh?\"}"
```

The second call should be noticeably faster and cost 90% less.

## Cost Monitoring

Track your usage at: https://console.anthropic.com/settings/usage

**Claude Haiku Pricing:**

- Input: $0.25 per 1M tokens
- Output: $1.25 per 1M tokens
- Cached input: $0.03 per 1M tokens (90% discount!)

**Example conversation costs:**

- Without caching: ~$0.002 per conversation
- With caching: ~$0.0002 per conversation
- 1,000 conversations/day: ~$6/month with caching

## Switching Between Providers

You can dynamically switch without code changes:

```bash
# Switch to Claude
echo "LLM_PROVIDER=claude" >> .env
npm restart

# Switch back to Ollama (free)
echo "LLM_PROVIDER=ollama" >> .env
npm restart
```

## Troubleshooting

### Error: "ANTHROPIC_API_KEY not set"

**Solution**: Add your API key to `.env`:

```bash
echo "ANTHROPIC_API_KEY=sk-ant-YOUR-KEY" >> .env
```

### Error: "Invalid API key"

**Solution**:

1. Check the key at https://console.anthropic.com/settings/keys
2. Make sure it starts with `sk-ant-`
3. No extra spaces or quotes in `.env`

### Error: "Rate limit exceeded"

**Solution**:

- Free tier: 50 requests/minute
- Paid tier: 1,000 requests/minute
- Add exponential backoff or upgrade plan

### Slow responses even with Claude

**Solution**:

1. Check if caching is enabled: `CLAUDE_ENABLE_CACHING=true`
2. Verify Ollama is running for embeddings
3. Check network latency to Anthropic API

### Docker: "Failed to fetch credentials"

**Solution**: Make sure `.env` file exists and has the API key:

```bash
cat .env | grep ANTHROPIC_API_KEY
```

## Performance Comparison

| Metric         | Ollama (llama3.2:7b) | Claude Haiku | Improvement       |
| -------------- | -------------------- | ------------ | ----------------- |
| Response time  | 30-60s               | 2-5s         | **10x faster**    |
| Quality        | Good                 | Excellent    | **More accurate** |
| Context window | 8K tokens            | 200K tokens  | **25x larger**    |
| Cost           | Free                 | ~$6-10/month | Minimal           |
| Setup          | Local GPU            | API key only | Simpler           |
| Scaling        | Limited by hardware  | Automatic    | Better            |

## Best Practices

1. **Always enable caching** in production (`CLAUDE_ENABLE_CACHING=true`)
2. **Use Haiku for most cases** (great balance of speed/cost/quality)
3. **Keep Ollama for embeddings** (free and works perfectly)
4. **Monitor usage** in Anthropic console
5. **Set budget alerts** at https://console.anthropic.com/settings/billing
6. **Test with free credits** before committing to paid plan

## Switching Back to Ollama Only

If you want to go back to 100% free (no Claude):

1. Edit `.env`:

   ```env
   LLM_PROVIDER=ollama
   ```

2. Restart:

   ```bash
   npm restart
   # or
   docker compose restart backend
   ```

3. Optionally remove Claude packages:
   ```bash
   npm uninstall @langchain/anthropic @anthropic-ai/sdk
   ```

## Support

- **Anthropic Console**: https://console.anthropic.com/
- **Claude API Docs**: https://docs.anthropic.com/
- **Pricing**: https://www.anthropic.com/pricing
- **Status**: https://status.anthropic.com/

---

**Quick Start Summary:**

1. Get API key from https://console.anthropic.com/
2. Add to `.env`: `ANTHROPIC_API_KEY=sk-ant-...`
3. Set `LLM_PROVIDER=claude` and `CLAUDE_ENABLE_CACHING=true`
4. Restart backend
5. Enjoy 10x faster responses with 90% cost savings! 🚀
