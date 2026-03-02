# Reflection: Building the MoneyHero Backend with AI Assistance

## AI Tools Used

The primary tool throughout this project was **Claude Code** (Anthropic's CLI), running inside VS Code via the native extension. I used it in agentic mode — dispatching specialized subagents (scaffolder, rag-engineer, api-engineer, qa-integrator) rather than asking for single-file edits. No other AI coding tools were used.

---

## Velocity Examples

AI assistance had the clearest impact in four areas:

**Parallel implementation.** The biggest time saving came from dispatching the rag-engineer and api-engineer agents simultaneously. Tasks that would normally be sequential — building the RAG pipeline in `agent.js` while wiring up Express routes and SQLite in `db.js` and `routes/chat.js` — ran in parallel because the agents worked on non-overlapping files. A full afternoon of work was compressed to roughly 30 minutes of wall-clock time.

**Guardrails layer.** Adding production guardrails (rate limiting, input validation, session checks, profanity filtering, LLM timeouts, vectorstore fallbacks, history capping, output validation) across multiple files in a single session would have taken hours manually. With clear per-agent task lists and explicit file ownership, agents completed their changes concurrently with no conflicts.

**Iterative debugging and strategy review.** When specific conversation patterns produced wrong answers (comparison queries returning one card instead of many, loan listing returning credit card names), Claude Code traced each bug to its root cause — duplicate `const` declarations causing SyntaxErrors, misrouted keywords pointing to the wrong product category, an unresolved `{history}` placeholder — and implemented fixes in priority order across multiple files simultaneously. A strategy review session identified 8 issues in the RAG pipeline, LLM selection, and output validation layers; all 8 were fixed and committed in a single pass.

**Boilerplate elimination.** Setting up the Docker Compose configuration, the `setup.sh` script, `.env.example`, `.gitignore`, and the MVC folder restructuring (18 files) required almost no manual effort. The scaffolder and qa-integrator agents handled structural work that would otherwise have been tedious copy-paste from previous projects.

---

## Prompting Strategies

**File ownership rules worked well.** Defining which agent owned which files in `CLAUDE.md` eliminated merge conflicts entirely. When the api-engineer and rag-engineer ran in parallel, they never touched the same file.

**Giving agents full context up front.** Rather than letting agents explore the codebase themselves for every task, I pre-read the relevant files and included the current structure in the prompt. This cut down on wasted tool calls and produced more targeted edits on the first attempt.

**Naming errors precisely.** For the Docker bug, quoting the exact error message ("Ollama service failed to start within 60 seconds") allowed the agent to trace it to the specific line in `setup.sh` immediately, rather than guessing at causes. The same held for LLM output bugs — quoting the wrong output verbatim ("personal loan options: 1. HSBC Revolution Card") helped the agent identify the misrouted keyword map rather than the vector search threshold.

**Escalating to strategy reviews when patterns repeated.** After fixing individual output bugs two or three times, asking for a comprehensive review of the RAG, ingestion, and LLM strategy surfaced 8 root causes in one pass — rather than continuing to play whack-a-mole with individual symptoms.

**Treating agents as black boxes with contracts.** The api-engineer calling `agent.chat()` without knowing its internals, and the rag-engineer never touching Express code, kept each agent focused and prevented scope creep.

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
| Documentation + port fixes | ~15 min |
| **Total** | **~6 hours** |

The bulk of that time was spent writing prompts, reviewing agent output, and testing conversations — not writing code directly. The most valuable investment was the upfront architecture decisions in `CLAUDE.md` (file ownership, agent routing rules, API contracts) which made all subsequent parallel work conflict-free.
