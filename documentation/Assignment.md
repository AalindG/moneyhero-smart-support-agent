26/11/2025, 20:05 Practical Assignment: MoneyHero Smart Support Agent
Practical Assignment: MoneyHero Smart
Support Agent
Assignment for Senior Full Stack Developer (AI Native Builder)
Overview
Build a Smart Financial Support Agent for MoneyHero - an AI-powered chat assistant that helps
users with questions about financial products (credit cards, personal loans). The agent should use
RAG (Retrieval Augmented Generation) over a knowledge base, maintain conversation context, and
handle escalation requests.
Time Expectation: 3-5 evenings (~12-18 hours total)
What You're Building
A f
ull-stack JavaScript application with:

1. LangChain.js Agent - Conversational AI with:
   RAG over financial product documentation
   Multi-turn conversation with memory
   Basic intent routing (answer vs escalate)
2. React Frontend - Chat interface:
   Clean chat widget for conversations
   Message history within session
   (Use any React-based framework: Vite, Next.js, CRA, etc.)
3. Node.js Backend - API layer:
   Express or Fastify
   Chat endpoints
   LangChain.js orchestration
4. Database - Data persistence (your choice):
   SQLite (simplest - no server needed)
   https://md2pdf.netlify.app 1/7
   26/11/2025, 20:05 Practical Assignment: MoneyHero Smart Support Agent
   PostgreSQL (if you prefer relational)
   MongoDB (if you prefer document-based)
   Functional Requirements
   Core Agent Capabilities
   R1: Knowledge Retrieval (RAG)
   Agent retrieves relevant information from a knowledge base of financial products
   Supports questions like:
   "What credit cards have no annual fee?"
   "What's the interest rate on the CashBack Plus card?"
   "How do I apply for a personal loan?"
   R2: Multi-Turn Conversation
   Maintains context across messages
   Handles follow-ups: "What about its rewards?" (referring to previously mentioned card)
   R3: Intent Routing
   Classifies user intent into:
   answer - Product questions (handle with RAG)
   escalate - User wants human support
   off
   \_
   topic - Non-financial queries (polite redirect)
   R4: Escalation Handling
   Detects escalation signals ("speak to someone", frustration)
   Acknowledges and logs the request
   Frontend Requirements
   R5: Chat Interface
   Clean, responsive chat widget
   Shows typing/loading state during response
   Message history within session
   Technical Requirements
   R6: LangChain.js Implementation
   https://md2pdf.netlify.app 2/7
   26/11/2025, 20:05 Use LangChain.js to build the RAG pipeline
   Implement a retrieval chain for product questions
   Use conversation memory for multi-turn context
   Practical Assignment: MoneyHero Smart Support Agent
   R7: Document Ingestion & Vector Search
   Load and chunk the provided markdown documents from /docs folder
   Generate embeddings and store in a vector store
   Use any
   vector store (LangChain.js MemoryVectorStore, Chroma, HNSWLib, etc.)
   11 sample documents are provided - use as-is or expand
   R8: Local Development
   App should run with simple setup commands (documented in README)
   SQLite recommended for easiest setup (no external services)
   If
   using Postgres/MongoDB, include Docker Compose or clear setup instructions
   Tech Stack
   Layer Technology
   FrontendReact (Vite, Next.js, or your choice)
   Backend Node.js (Express or Fastify)
   AI/RAG LangChain.js
   Database SQLite, PostgreSQL, or MongoDB (your choice)
   Vector Store Your choice (MemoryVectorStore, Chroma, HNSWLib)
   LL
   M Claude API (preferred) or OpenAI
   Containerization Optional (bonus points)
   Knowledge Base Documents
   Your RAG system should ingest and search over document content (not just structured JSON).
   Create a /docs folder with markdown or text files representing product information and FAQs.
   Example Document Structure
   https://md2pdf.netlify.app 3/7
   26/11/2025, 20:05 /docs
   /credit-cards
   cashback-plus.md
   travel-rewards-elite.md
   student-card.md
   /personal-loans
   flexiloan.md
   home-renovation-loan.md
   /faqs
   application-process.md
   eligibility-requirements.md
   fees-and-charges.md
   Practical Assignment: MoneyHero Smart Support Agent
   Sample Document: docs/credit-cards/cashback-plus.md

# CashBack Plus Card

## Overview

The CashBack Plus Card is our most popular no-fee credit card, perfect for everyday sp

## Key Benefits

- **No annual fee** - Keep it forever at zero cost
- **1.5% unlimited cashback** on all purchases
- **Contactless payments** supported
- Accepted worldwide wherever Visa is accepted

## Eligibility

- Minimum annual income: $30,000
- Singapore citizen or PR
- Age 21 and above

## How to Apply

1. Submit online application at moneyhero.com/apply
2. Upload required documents (NRIC, payslips)
3. Receive approval within 2 business days
4. Card delivered to your address in 5-7 days

## Fees

| Fee Type            | Amount       |
| ------------------- | ------------ |
| Annual Fee          | $0           |
| Late Payment        | $100         |
| Cash Advance        | 6% (min $15) |
| Foreign Transaction | 3.25%        |

Sample Document: docs/faqs/application-process.md
https://md2pdf.netlify.app 4/7
26/11/2025, 20:05 Practical Assignment: MoneyHero Smart Support Agent

# Application Process FAQ

## What documents do I need to apply?

To apply for any MoneyHero financial product, you'll need:

- NRIC or passport (front and back)
- Latest 3 months of payslips OR latest Notice of Assessment
- Proof of address dated within the last 3 months

## How long does approval take?

- Credit cards: 2-5 business days
- Personal loans: 1-3 business days
- Same-day approval available for selected products

## Can I check my application status?

Yes! Log into your MoneyHero account or contact support with your application referenc

## What if my application is rejected?

You'll receive an email explaining the reason. Common reasons include:

- Income below minimum requirement
- Existing credit commitments too high
- Incomplete documentation
  Provided Sample Documents (11 files)
  We've included starter documents in the /docs folder that you can use as your knowledge base:
  docs/
  ├── credit-cards/
  │ ├── citi-cashback-plus.md
  │ ├── dbs-live-fresh.md
  │ ├── hsbc-revolution.md
  │ ├── ocbc-365.md
  │ └── uob-krisflyer.md
  ├── personal-loans/
  │ ├── dbs-personal-loan.md
  │ └── standard-chartered-cashone.md
  └── faqs/
  ├── application-process.md
  ├── credit-card-basics.md
  ├── fees-and-charges.md
  └── personal-loan-basics.md
  Feel free to use these as-is or add more documents to expand the knowledge base.
  Deliverables
  https://md2pdf.netlify.app 5/7
  26/11/2025, 20:05 Practical Assignment: MoneyHero Smart Support Agent

1. GitHub
   Repository
   Public or private repo (share access if private)
   Clean commit history showing development progression
   README with setup instructions
2. Working Application
   Clear setup instructions in README (ideally npm install && npm start )
   Chat interface accessible at localhost:3000
3. Written Reflection (300-500 words)
   Include in README or separate REFLECTION.md:
   AI Tools Used: Which tools? (Claude Code, Cursor, etc.)
   Velocity Examples: What did AI help you build faster?
   Prompting Strategies: What worked well?
   Time Spent: Rough breakdown by component
   Evaluation Criteria
   Area Weight What We Look For
   Agent
   Quality
   40%RAG retrieval works, multi-turn context maintained, intent routing
   f
   unctions
   Full Stack 35% Clean code, working API, responsive chat UI
   LangChain.js 15%RAG chain implemented correctly, conversation memory works
   Easy Setup 10% npm install && npm start works, clear README
   Bonus Points (Optional)
   Docker Compose setup
   Streaming responses in chat
   Persistent conversation history across sessions
   Tests
   https://md2pdf.netlify.app 6/7
   26/11/2025, 20:05 Submission
4. Email GitHub repo link to HR
5. Subject: "Odyssey Assignment - [Your Name]"
6. Ensure repo is accessible (public or invite sent)
7. Include estimated total hours spent
   Practical Assignment: MoneyHero Smart Support Agent
   Questions?
   If you have questions about requirements, email HR. We're happy to clarify scope but won't provide
   implementation guidance - that's what we're evaluating!
   Why This Assignment?
   This assignment mirrors real work at Project Odyssey:
   AI-Native Building: LangChain.js for RAG and conversational AI
   Full Stack JavaScript: Single runtime, modern tooling
   Speed Matters: We want to see how
   fast you can ship quality work
   Practical Fintech: Support automation is a real priority
   Show
   us how you build. Show
   us how AI tools multiply your output.
   Good luck!
   https://md2pdf.netlify.app 7/7
