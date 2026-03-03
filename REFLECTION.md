# Reflection: Building the MoneyHero Backend with AI Assistance

## AI Tools Used

**Tools used to build the project:** The primary tool was **Claude Code** (Anthropic's CLI), running inside VS Code via the native extension. I used it in agentic mode — dispatching specialized subagents (scaffolder, rag-engineer, principal-backend-dev, senior-qa-engineer) rather than asking for single-file edits. No other AI *coding* tools were used to write or generate code.

**LLMs powering the product itself:**

| Model | Provider | Role | When Used |
|---|---|---|---|
| **Claude Sonnet 4.6** | Anthropic API | Primary response generation | `USE_CLAUDE=true` + API key set |
| `llama3.2:3b` | Ollama (local Docker) | Fallback response generation | Claude API error / key missing |
| `nomic-embed-text` | Ollama (local Docker) | Document embeddings | Always (vector search) |

**Why Claude as primary?** During development, `llama3.2:1b` (the originally planned model) hallucinated product details — wrong cashback percentages, nonexistent cards — even when the correct information was present in the retrieved context. The 1B model simply lacked the instruction-following capacity to stay grounded. Upgrading to `llama3.2:3b` improved but did not fully resolve this. Claude Sonnet 4.6 solved it entirely: responses are accurate, concise, and faithfully drawn from the retrieved documents.

**Fallback conditions:** If `USE_CLAUDE=false`, `ANTHROPIC_API_KEY` is absent, or the Anthropic API returns an error (timeout, quota exceeded, network failure), the controller automatically retries the same prompt with Ollama. The user sees no interruption — the stream continues seamlessly from the fallback model. This makes Claude an enhancement rather than a hard dependency: the system is fully functional with Ollama alone.

**Embeddings remain local.** `nomic-embed-text` runs in the Ollama Docker container regardless of the `USE_CLAUDE` setting. Document ingestion and vector search never make external API calls.

---

## Velocity Examples

AI assistance had the clearest impact in four areas:

**Parallel implementation.** The biggest time saving came from dispatching the rag-engineer and principal-backend-dev agents simultaneously. Tasks that would normally be sequential — building the RAG pipeline in `agent.js` while wiring up Express routes and SQLite across the MVC layer — ran in parallel because the agents worked on non-overlapping files. A full afternoon of work was compressed to roughly 30 minutes of wall-clock time.

**Guardrails layer.** Adding production guardrails (rate limiting, input validation, session checks, profanity filtering, LLM timeouts, vectorstore fallbacks, history capping, output validation) across multiple files in a single session would have taken hours manually. With clear per-agent task lists and explicit file ownership, agents completed their changes concurrently with no conflicts.

**Iterative debugging and strategy review.** When specific conversation patterns produced wrong answers (comparison queries returning one card instead of many, loan listing returning credit card names), Claude Code traced each bug to its root cause — duplicate `const` declarations causing SyntaxErrors, misrouted keywords pointing to the wrong product category, an unresolved `{history}` placeholder — and implemented fixes in priority order across multiple files simultaneously. A strategy review session identified 8 issues in the RAG pipeline, LLM selection, and output validation layers; all 8 were fixed and committed in a single pass.

**Diagnosing LLM capability limits.** After repeated hallucination from llama3.2:1b despite correct RAG context, Claude Code identified that the model's instruction-following capacity was the root cause — not the retrieval pipeline. This led to the Claude Sonnet 4.6 upgrade. Separately, it diagnosed a LangChain `@langchain/anthropic` bug where `topP` defaults to `-1` (rejected by Claude 4.x), and that Claude 4.x rejects receiving both `temperature` and `top_p` simultaneously. The fix (`topP: 1, temperature: null`) was identified by tracing LangChain source code, not by guessing parameter values.

**Boilerplate elimination.** Setting up the Docker Compose configuration, the `setup.sh` script, `.env.example`, `.gitignore`, and the MVC folder restructuring (18 files) required almost no manual effort. The scaffolder and senior-qa-engineer agents handled structural work that would otherwise have been tedious copy-paste from previous projects.

**Security audit and hardening.** Asking an AI expert agent to review the codebase for security issues produced a structured report covering 18 findings. The high-priority items — hardcoded model names and tuning parameters, the retrieval score threshold being too permissive, and the docker-compose.yml `environment:` block silently overriding `.env` values — were fixed in a single pass across 7 files. An admin portal with timing-safe credential comparison, in-memory token store, and 8-hour TTL was added as a complete feature spanning 6 backend and 4 frontend files, all in one session.

---

## Prompting Strategies

**File ownership rules worked well.** Defining which agent owned which files in `CLAUDE.md` eliminated merge conflicts entirely. When the principal-backend-dev and rag-engineer ran in parallel, they never touched the same file.

**Giving agents full context up front.** Rather than letting agents explore the codebase themselves for every task, I pre-read the relevant files and included the current structure in the prompt. This cut down on wasted tool calls and produced more targeted edits on the first attempt.

**Naming errors precisely.** For the Docker bug, quoting the exact error message ("Ollama service failed to start within 60 seconds") allowed the agent to trace it to the specific line in `setup.sh` immediately, rather than guessing at causes. The same held for LLM output bugs — quoting the wrong output verbatim ("personal loan options: 1. HSBC Revolution Card") helped the agent identify the misrouted keyword map rather than the vector search threshold.

**Escalating to strategy reviews when patterns repeated.** After fixing individual output bugs two or three times, asking for a comprehensive review of the RAG, ingestion, and LLM strategy surfaced 8 root causes in one pass — rather than continuing to play whack-a-mole with individual symptoms.

**Treating agents as black boxes with contracts.** The principal-backend-dev calling `agent.chat()` without knowing its internals, and the rag-engineer never touching Express code, kept each agent focused and prevented scope creep.

---

## Time Spent (Rough Breakdown)

| Component | Estimated Time |
|---|---|
| Initial scaffold + package setup | ~20 min |
| Sample docs + vector store ingestion | ~30 min |
| RAG agent (`agent.js`) — initial | ~25 min |
| API routes + SQLite (`db.js`, `routes/`) | ~25 min |
| SSE streaming integration + testing | ~20 min |
| Guardrails layer (rate limiting, validation, profanity, timeouts) | ~35 min |
| MVC restructuring (18 files) | ~40 min |
| Docker setup + `setup.sh` bug fix | ~20 min |
| React frontend (chat UI, streaming, session management) | ~45 min |
| Deterministic retrieval shortcuts (catalog, comparison, fee extraction) | ~50 min |
| Strategy review + 8-bug fix pass | ~40 min |
| Security audit + env var extraction (7 files) | ~25 min |
| Admin portal (backend + frontend, 10 files) | ~30 min |
| Top 10 questions feature + documentation update | ~20 min |
| Documentation + port fixes | ~15 min |
| **Total** | **~7.5 hours** |

The bulk of that time was spent writing prompts, reviewing agent output, and testing conversations — not writing code directly. The most valuable investment was the upfront architecture decisions in `CLAUDE.md` (file ownership, agent routing rules, API contracts) which made all subsequent parallel work conflict-free.
