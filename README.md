<div align="center">

<img src="https://readme-typing-svg.herokuapp.com?font=Fira+Code&size=32&duration=2800&pause=2000&color=6366F1&center=true&vCenter=true&width=600&lines=Wandr;AI-Powered+Trip+Planner" alt="Wandr" />

<p align="center">
  <strong>Plan smarter. Explore deeper. Travel with AI.</strong><br/>
  A full-stack intelligent travel assistant powered by a planner → executor → composer LangGraph pipeline —<br/>
  live flights, live maps, web intelligence, saved-trip awareness, and durable background workflows. All in one place.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/LangGraph-Agents-FF6B6B?style=for-the-badge&logo=langchain&logoColor=white" />
  <img src="https://img.shields.io/badge/Temporal-Workflows-000000?style=for-the-badge" />
  <img src="https://img.shields.io/badge/OpenAI-GPT--4.1-412991?style=for-the-badge&logo=openai&logoColor=white" />
  <img src="https://img.shields.io/badge/Node.js-Express_5-339933?style=for-the-badge&logo=node.js&logoColor=white" />
  <img src="https://img.shields.io/badge/MongoDB-Mongoose-47A248?style=for-the-badge&logo=mongodb&logoColor=white" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" />
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?style=for-the-badge&logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/Vite-7-646CFF?style=for-the-badge&logo=vite&logoColor=white" />
</p>

</div>

---

## Demo

<div align="center">

[![Watch Demo](https://img.shields.io/badge/Watch_Full_Demo-FF0000?style=for-the-badge&logo=youtube&logoColor=white)](https://drive.google.com/drive/folders/1A2feOyBObSuauCB_3Cn2WcIo3ZHr3qsT?usp=drive_link)

</div>

## How It Works

Wandr runs a LangGraph pipeline on every user message. Each node has one job, and workers are bounded so nothing can loop forever. Every fact in the answer comes from a live tool call or from the user's saved trip, which is pushed into the graph state with each query.

<div align="center">
  <img width="2000" height="2522" alt="Image" src="https://github.com/user-attachments/assets/dec4f176-cb5d-4533-a64c-3da33fb5c20c" />
</div>

The graph is **linear with no cycles**. The only loops live inside workers, and they are capped.

### Pipeline Walkthrough

| Step | Node | Model | Description |
|------|------|-------|-------------|
| 1 | `planner` | `gpt-4.1-mini` (structured output, Zod schema) | Detects intent (`trip_plan`, `lookup`, `chitchat`), resolves references like "my trip", "that hotel", "it" from chat history and the saved trip, extracts trip facts (origin, destination, start date, days, travellers, budget), and picks MCP servers with one focused task per server |
| 2 | `clarifier` | — | Asks **one** short question (e.g. "where and when?") when essential info is missing, then jumps straight to `finalizer` |
| 3 | `executor` | `gpt-4.1-mini` workers | Runs MCP workers in stages. Each worker gets only its own task, the saved trip, and earlier findings. 100 s timeout per worker; a failure becomes a `FAILED` finding, never a crash |
| 4 | `composer` | `gpt-4.1` | Writes the final answer from findings and the saved trip only. No tools |
| 5 | `finalizer` | — | Extracts the last human + AI exchange as the chat log |

Routing edges out of `planner`:

- **Needs clarification** → `clarifier` → `finalizer`
- **Servers chosen** → `executor` → `composer` → `finalizer`
- **No tools needed** (chit-chat or a question about the saved trip) → `composer` directly

#### Planner details

- Trip plans always add `places` + `tavily`, plus `flights` when origin, destination, and date are known.
- Dates are validated in code; return date = start date + days − 1.
- The flights task is built in code from the trip facts, not by the LLM.
- If the model call fails, a fallback plan (`tavily` only) is used.

#### Executor stages

| Stage | Workers | Notes |
|-------|---------|-------|
| 1 (parallel) | `flights`, `places` | `flights`: round-trip search; if every option has 2+ stops or takes 10 h+, one extra search from a nearby hub airport. `places`: one search per category (attractions, restaurants, hotels) in a single parallel step |
| 2 | `tavily` | Sees stage 1 findings. Weather (forecast or typical), prices and timings, trip costs, visa and advisories, practical tips |

#### Composer rules

- Trip plans include: snapshot, getting there, where to stay, one section per day, weather, budget, tips.
- Prices and timings only appear if a source says so; otherwise "price not listed" plus the website.
- Weather is a real forecast when the trip is within about 10 days, otherwise labelled "typical conditions".
- A post-check removes any link or image URL that is not in the findings.
- A friendly fallback message is returned if the model call fails.

### Inside Each Worker

Each worker is a **bounded ReAct loop** (`worker.ts`):

1. The model gets its playbook, task, the saved trip, and earlier findings. `tool_choice` is `required` on step 1.
2. `admit()` rejects identical repeat calls and calls over the per-tool cap.
3. `executeTool()` runs the call on the MCP server (120 s per request, one retry on timeout or closed link).
4. `compactToolOutput()` drops bulky fields and trims arrays to the size cap.
5. The loop ends on `DONE`, the step cap, all calls rejected, or 2 all-error steps.

| Server | Max steps | Calls per tool | Max chars |
|--------|-----------|----------------|-----------|
| `flights` | 4 | 2 | 16k |
| `places` | 5 | 5 | 6k |
| `tavily` | 4 | 3 | 6k |

### Graph State

| Field | Description |
|-------|-------------|
| `messages` | Chat history (the last 16 are read) |
| `savedTrip` | The user's trip, pushed in with every query (replaces the old DB MCP server) |
| `plan` | Intent, trip facts, servers, one task per server, clarification |
| `findings` | One per worker: `ok` or `FAILED`, with data |
| `conversation` | Last human + AI exchange |

### MCP Servers (Tool Layer)

| Server | Data Source | Tools |
|--------|-------------|-------|
| `flights` | Kiwi.com | `search_flights` — round trip; best / cheapest / fastest with booking links |
| `places` | Google Places (custom MCP) | `search_destinations`, `search_nearby`, `get_place_details`, `geocode_address`, `reverse_geocode`, `autocomplete_address`, `get_route` |
| `tavily` | Live web (remote HTTP MCP) | `tavily_search`, `tavily_extract` |

- Sessions are reused, health-checked after 30 s idle, evicted after 10 min, and shared safely across concurrent runs.
- Tool traffic never enters chat history.
- MCP sessions stay warm: no per-message teardown.

### Models and Runtime

| Role | Model |
|------|-------|
| Planner | `gpt-4.1-mini`, structured output |
| Workers | `gpt-4.1-mini`, tool calling |
| Composer | `gpt-4.1` |

All three models are overridable by environment variables.

---

## Temporal Workflows

Two long-running durable workflows are managed by Temporal.

### Assistant Workflow

Wraps the LangGraph run in a durable Temporal workflow so a conversation survives crashes, timeouts, and restarts.

```
User sends message
       │
       ▼
┌──────────────────────────────────────────┐
│  Temporal: assistantWorkflow             │
│                                          │
│  Activity: runAssistantGraph             │
│  ├── Load chat history + saved trip      │
│  │   (in parallel)                       │
│  ├── graph.invoke({ messages, savedTrip })│
│  │   ├── planner                         │
│  │   ├── clarifier  (if info missing)    │
│  │   ├── executor                        │
│  │   │   ├── flights + places (parallel) │
│  │   │   └── tavily                      │
│  │   ├── composer                        │
│  │   └── finalizer                       │
│  └── Save to MongoDB, return             │
│      { conversation, reply }             │
│                                          │
│  Activity timeout: 5 min                 │
│  Retry: 2 attempts                       │
│  continueAsNew: every 200 messages       │
└──────────────────────────────────────────┘
       │
       ▼
  Response to user
```

Temporal retries a failed run once more and keeps the workflow alive after a failure.

### Weather Monitoring Workflow

A scheduled, long-running workflow that monitors weather at a user's trip destination via Tomorrow.io and sends alerts over WhatsApp and email when severe changes are detected.

```
Trip created / updated
       │
       ▼
┌──────────────────────────────────────┐
│  Temporal: weatherMonitoringWorkflow │
│                                      │
│  Activity: fetchWeather              │
│  └── Poll Tomorrow.io API            │
│                                      │
│  Activity: evaluateConditions        │
│  └── Compare against thresholds      │
│       (storm, extreme temp, etc.)    │
│                                      │
│  Activity: sendAlert (conditional)   │
│  ├── WhatsApp via Twilio             │
│  └── Email via Brevo                 │
│                                      │
│  Sleep interval: configurable        │
│  Runs: from trip start → trip end    │
└──────────────────────────────────────┘
       │
       ▼
  Loop until trip ends
```

| Property | Assistant Workflow | Weather Monitoring Workflow |
|----------|-------------------|----------------------------|
| Trigger | Incoming chat message | Trip created or updated |
| Duration | Single request lifecycle | Trip start date → trip end date |
| Activities | `runAssistantGraph` | Weather fetch, condition evaluation, alert dispatch |
| Data sources | Kiwi.com, Google Places, Tavily, saved trip | Tomorrow.io |
| Notification | None | WhatsApp (Twilio) + Email (Brevo) |
| Retry policy | 2 attempts, 5 min activity timeout | Automatic on fetch or send failure |

---

## Features

### Core

| Feature | Description |
|---------|-------------|
| **Planner → Executor → Composer Pipeline** | A linear LangGraph with five nodes. A structured-output planner picks the servers, parallel bounded workers call the tools, and a tool-free composer writes the answer |
| **Real-Time Flight Search** | Live round-trip fares and booking links from Kiwi.com, with an automatic nearby-hub retry when every option is slow or has many stops |
| **Live Web Intelligence** | Weather, prices, visa rules, advisories, and practical tips via Tavily |
| **Geospatial POI Search** | Attractions, restaurants, hotels, geocoding, and routing via a custom Google Places MCP server |
| **Smart Clarification** | Asks exactly one short question when essential trip info is missing |

### Enhanced

| Feature | Description |
|---------|-------------|
| **Saved-Trip Awareness** | The user's saved trip is pushed into the graph state with every query, so "my trip", "that hotel", and "it" resolve correctly |
| **Grounded Answers** | Prices and timings only appear if a source says so, forecasts are labelled by confidence, and a post-check strips any link or image not found in the findings |
| **Weather Monitoring** | Temporal workflows poll destination weather and send email and WhatsApp alerts before and during a trip |
| **Interactive Maps** | Leaflet-powered maps render destination pins, multi-stop routes, and trip overlays |
| **Durable Workflows** | Temporal handles the assistant run (retry, timeout, `continueAsNew`) and background weather monitoring |

### Reliability

| Feature | Description |
|---------|-------------|
| **Bounded Workers** | Step caps, per-tool call caps, duplicate-call rejection, and output size caps on every worker |
| **Failure Isolation** | A worker failure becomes a `FAILED` finding; the composer still answers with what it has |
| **Fallbacks** | Fallback plan if the planner fails; friendly fallback message if the composer fails |
| **Warm MCP Sessions** | Reused, health-checked, idle-evicted sessions shared across concurrent runs |
| **Notifications** | Email via Brevo and Nodemailer; WhatsApp/SMS via Twilio |
| **Authentication** | Google OAuth 2.0 and JWT cookie sessions via Passport.js |

---

## Tech Stack

<details>
<summary><strong>Frontend</strong></summary>
<br/>

| Package | Version | Role |
|---------|---------|------|
| React | 19 | UI framework |
| TypeScript | 5.9 | Type safety |
| Vite | 7 | Build tool and dev server |
| Tailwind CSS | 4 | Utility-first styling |
| React Leaflet | 5 | Interactive maps |
| React Router DOM | 7 | Client-side routing |
| Axios | latest | HTTP client |

</details>

<details>
<summary><strong>Backend</strong></summary>
<br/>

| Package | Version | Role |
|---------|---------|------|
| LangGraph + LangChain | latest | Graph orchestration |
| Temporal | 1.14 | Durable workflows |
| OpenAI | via LangChain | `gpt-4.1-mini` (planner, workers), `gpt-4.1` (composer) |
| Node.js + Express | 5 | REST API server |
| TypeScript | 5.9 | Type safety |
| MongoDB + Mongoose | 9 | Primary database |
| Passport.js | latest | Authentication middleware |
| Brevo + Nodemailer | latest | Email notifications |
| Twilio | 6 | WhatsApp / SMS notifications |
| Kiwi.com | MCP | Flight data |
| Tavily | remote HTTP MCP | Web search and extraction |
| Zod | 3 | Planner structured output and validation |

</details>

---

## Project Structure

```
trip-planner/
│
├── frontend/
│   └── src/
│       ├── api/                  # Axios API layer
│       ├── components/           # Reusable UI components
│       ├── pages/                # Route-level page components
│       ├── assets/               # Static assets
│       ├── App.tsx
│       └── main.tsx
│
└── backend/
    └── src/
        ├── langgraph_mcp/              # Core AI pipeline
        │   ├── assistant_graph.ts        # Linear graph: planner → executor → composer → finalizer
        │   ├── worker.ts                 # Bounded ReAct loop used by every MCP worker
        │   ├── prompts.ts                # Planner, worker, and composer prompts
        │   ├── state.ts                  # Graph state schema
        │   ├── mcpWrapper.ts             # MCP client + session reuse / health checks
        │   └── configuration.ts          # Models, caps, timeouts
        │
        ├── mcp-servers/
        │   └── places-mcp-server/        # Google Places MCP server
        │
        ├── controllers/                  # Express route handlers
        ├── routes/                       # API route definitions
        ├── models/                       # Mongoose schemas
        ├── services/                     # Business logic layer
        ├── temporal-workflow/            # Assistant + weather workflows and activities
        ├── validators/                   # Zod validators
        ├── types/                        # Shared TypeScript types
        ├── config/                       # Passport, DB configuration
        └── server.ts                     # Application entry point
```

---

## Getting Started

### Prerequisites

- Node.js >= 18
- MongoDB — local or [Atlas](https://www.mongodb.com/cloud/atlas)
- Temporal — run locally with `temporal server start-dev`
- API keys for: OpenAI · Google OAuth · Google Places · Kiwi.com MCP · Tavily · Tomorrow.io · Brevo · Twilio

### 1. Clone

```bash
git clone https://github.com/YOUR_USERNAME/trip-planner.git
cd trip-planner
```

### 2. Backend

```bash
cd backend
npm install
```

Create `backend/.env`:

```env
# Server
NODE_ENV=development
PORT=3000
MONGO_URI=your_mongodb_uri
JWT_SECRET=your_jwt_secret

# AI
OPENAI_API_KEY=your_openai_key
# Optional model overrides (defaults: planner gpt-4.1-mini, workers gpt-4.1-mini, composer gpt-4.1)
# PLANNER_MODEL=
# WORKER_MODEL=
# COMPOSER_MODEL=

# LangSmith (tracing & observability)
LANGSMITH_TRACING=true
LANGSMITH_ENDPOINT=https://api.smith.langchain.com
LANGSMITH_API_KEY=your_langsmith_key
LANGSMITH_PROJECT=your_project_name

# Auth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=your_google_callback_url

# Web Search
TAVILY_API_KEY=your_tavily_key

# Maps & Geospatial
GEOAPIFY_API_KEY=your_geoapify_key
GOOGLE_PLACES_API_KEY=your_google_places_key

# Weather
TOMORROWIO_API_KEY=your_tomorrowio_key

# Notifications — Email
BREVO_API_KEY=your_brevo_key
EMAIL_FROM=your_sender_email

# Notifications — WhatsApp & SMS (Twilio)
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
WHATSAPP_FROM=your_whatsapp_number
```

```bash
npm run build          # Compile TypeScript
npm run start_server   # Start with nodemon
```

> Backend runs on `http://localhost:3000`

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

> Frontend runs on `http://localhost:5173`

---

## API Reference

### Authentication — `/api/auth`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/signup` | Register a new user |
| `POST` | `/login` | Login with email and password |
| `GET` | `/google` | Initiate Google OAuth flow |
| `GET` | `/logout` | Logout and clear session |

### Trips — `/api/trips`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/` | Create a new trip |
| `GET` | `/usertrips` | Get all trips for the authenticated user |
| `GET` | `/:tripId` | Get a specific trip by ID |
| `PATCH` | `/:tripId` | Update trip metadata |
| `PATCH` | `/:tripId/itinerary` | Update trip itinerary |
| `DELETE` | `/:tripId` | Delete a trip |

### Chat — `/api/chats`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/:tripId` | Get all chats by trip ID |
| `POST` | `/:tripId` | Append current conversation by trip ID |

### Temporal — `/api/temporal`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/sendQuery` | Send user query to the assistant workflow |
