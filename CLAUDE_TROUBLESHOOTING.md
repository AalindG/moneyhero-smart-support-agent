# Claude API Troubleshooting Guide

## Current Issue: Model Not Found (404 Error)

You're seeing this error:

```
404 {"type":"error","error":{"type":"not_found_error","message":"model: claude-3-5-sonnet-20241022"}}
```

### Root Cause

The API key needs **credits added** before you can use Claude models. Even though the API key is valid, Anthropic requires payment information to access models.

### Solution: Add Credits to Your Account

#### Option 1: Free $5 Credits (Recommended for Testing)

1. Visit https://console.anthropic.com/settings/billing
2. Sign in with your Anthropic account
3. Click "Add payment method"
4. After adding payment, you'll receive **$5 in free credits**
5. This covers ~1,500-2,000 conversations for testing

#### Option 2: Add Payment Method

1. Go to https://console.anthropic.com/settings/billing
2. Add a credit card
3. Set a budget limit (e.g., $10/month)
4. Enable billing alerts

### Available Claude Models (as of March 2026)

Once credits are added, use these model names:

| Model                 | Name                         | Speed   | Cost   | Best For                  |
| --------------------- | ---------------------------- | ------- | ------ | ------------------------- |
| **Claude 3.5 Sonnet** | `claude-3-5-sonnet-20241022` | Fast    | Medium | Production (best balance) |
| **Claude 3 Opus**     | `claude-3-opus-20240229`     | Slower  | High   | Highest quality           |
| **Claude 3 Sonnet**   | `claude-3-sonnet-20240229`   | Fast    | Medium | Good balance              |
| **Claude 3 Haiku**    | `claude-3-haiku-20240307`    | Fastest | Low    | Simple tasks              |

**Note**: Model names include dates and may change. Check https://docs.anthropic.com/en/docs/about-claude/models for latest.

### After Adding Credits

1. Update your `.env` file with the model name:

   ```env
   LLM_PROVIDER=claude
   CLAUDE_MODEL=claude-3-5-sonnet-20241022
   ```

2. Restart the server:

   ```bash
   npm restart
   ```

3. Test the integration:
   ```bash
   SESSION_ID=$(curl -s -X POST http://localhost:3001/api/session | jq -r .sessionId)
   curl -X POST http://localhost:3001/api/chat \
     -H "Content-Type: application/json" \
     -d "{\"sessionId\": \"$SESSION_ID\", \"message\": \"What are the benefits of HSBC Revolution?\"}"
   ```

### Alternative: Use Ollama (Free)

If you prefer not to add payment info, use Ollama:

1. Edit `.env`:

   ```env
   LLM_PROVIDER=ollama
   OLLAMA_MODEL=llama3.2:1b
   ```

2. Restart:
   ```bash
   npm restart
   ```

**Trade-offs**:

- ✅ Free
- ❌ 5-8x slower (30-60s vs 3-8s responses)
- ❌ Smaller context window (8K vs 200K tokens)
- ❌ Lower quality responses

### Monitoring Usage & Costs

Once credits are added:

1. **Check usage**: https://console.anthropic.com/settings/usage
2. **Set budget alerts**: https://console.anthropic.com/settings/billing
3. **Enable caching** in `.env` to save 90%:
   ```env
   CLAUDE_ENABLE_CACHING=true
   ```

### Common Errors

#### Error: "Invalid API key"

```
401 invalid_api_key
```

**Solution**: Check your API key at https://console.anthropic.com/settings/keys

#### Error: "Credit balance too low"

```
400 {"error": {"message": "Your credit balance is too low..."}}
```

**Solution**: Add payment method or credits

#### Error: "Rate limit exceeded"

```
429 rate_limit_exceeded
```

**Solution**:

- Free tier: 50 requests/minute
- Wait or upgrade to paid tier (1,000 req/min)

#### Error: "Model not found"

```
404 not_found_error "model: claude-3-5-sonnet-20241022"
```

**Solutions**:

1. Add credits first (main cause)
2. Check model name is correct
3. Verify API key has model access

### Cost Estimates (with Caching Enabled)

For 1,000 conversations/day (~30,000/month):

| Model             | Without Caching | With Caching | Savings |
| ----------------- | --------------- | ------------ | ------- |
| Claude 3.5 Sonnet | ~$60/month      | ~$6-10/month | 90%     |
| Claude 3 Haiku    | ~$20/month      | ~$2-4/month  | 90%     |
| Ollama            | Free            | Free         | N/A     |

### Support Resources

- **Anthropic Console**: https://console.anthropic.com/
- **API Documentation**: https://docs.anthropic.com/
- **Model Information**: https://docs.anthropic.com/en/docs/about-claude/models
- **Pricing**: https://www.anthropic.com/pricing
- **Status Page**: https://status.anthropic.com/

### Quick Checklist

Before using Claude:

- [ ] API key added to `.env`
- [ ] Payment method added at console.anthropic.com
- [ ] Credits available (free $5 or paid)
- [ ] Correct model name in `.env`
- [ ] Caching enabled for cost savings
- [ ] Budget alerts configured
- [ ] Server restarted after config changes

---

**Current Status**: System configured to use Ollama (free) until Claude credits are added.

To switch to Claude:

1. Add credits at https://console.anthropic.com/settings/billing
2. Set `LLM_PROVIDER=claude` in `.env`
3. Restart: `npm restart`
