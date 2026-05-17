<div align="center">

<img src="https://readme-typing-svg.herokuapp.com?font=Fira+Code&size=32&duration=2800&pause=2000&color=6366F1&center=true&vCenter=true&width=600&lines=Wandr;AI-Powered+Trip+Planner" alt="Wandr" />

<p align="center">
  <strong>Plan smarter. Explore deeper. Travel with AI.</strong><br/>
  A full-stack intelligent travel assistant powered by a multi-agent LangGraph pipeline —<br/>
  real-time flights, live maps, web intelligence, persistent trip memory, and durable background workflows. All in one place.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/LangGraph-Agents-FF6B6B?style=for-the-badge&logo=langchain&logoColor=white" />
  <img src="https://img.shields.io/badge/Temporal-Workflows-000000?style=for-the-badge" />
  <img src="https://img.shields.io/badge/OpenAI-GPT--4o-412991?style=for-the-badge&logo=openai&logoColor=white" />
  <img src="https://img.shields.io/badge/Node.js-Express_5-339933?style=for-the-badge&logo=node.js&logoColor=white" />
  <img src="https://img.shields.io/badge/MongoDB-Mongoose-47A248?style=for-the-badge&logo=mongodb&logoColor=white" />
  <img src="https://img.shields.io/badge/Milvus-Vector_DB-00A1EA?style=for-the-badge" />
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

<!-- Replace YOUR_VIDEO_URL_HERE with your YouTube / Loom link -->
[![Watch Demo](https://img.shields.io/badge/Watch_Full_Demo-FF0000?style=for-the-badge&logo=youtube&logoColor=white)](YOUR_VIDEO_URL_HERE)

</div>

## How It Works

Wandr runs a multi-node LangGraph pipeline on every user message. Each node is a purpose-built AI agent. Every fact in the response comes from a live tool call — no hallucinations by design.

<div align="center">
  <img width="549" height="552" alt="Wandr LangGraph Pipeline" src="https://github.com/user-attachments/assets/03f5f275-8777-4593-8452-5908c8184934" />
</div>

### Pipeline Walkthrough

| Step | Node | Description |
|------|------|-------------|
| 1 | `generateRoutingQuery` | Rewrites the raw user message into a clean, normalized search query |
| 2 | `retrieve` | Runs vector store retrieval against Milvus for semantic context |
| 3 | `route` | Classifies the query and selects which MCP servers to invoke |
| 4 | `handleMcpServers` | Pops the next server from the queue; loops until all servers are processed |
| 5 | `mcpOrchestrator` | LLM decides which specific tool to call on the current server |
| 6 | `refineToolCall` | Validates and refines all tool arguments before execution |
| 7 | `mcpToolCall` | Executes the tool via live MCP session; loops back if more tools are needed |
| 8 | `responseComposer` | Synthesizes all tool results into a final grounded answer |
| 9 | `extractConversation` | Cleans up state and emits the chat log entry |

### MCP Servers

| Server | Data Source | Responsibilities |
|--------|-------------|-----------------|
| `flights` | RapidAPI Air Scanner (remote MCP) | Live fares, flight status, airport lookup, route comparison |
| `places` | Google Places (custom MCP) | POI discovery, geocoding, routing, proximity search |
| `tavily` | Live web (remote MCP) | Reviews, visa requirements, safety advisories, travel tips |
| `db` | MongoDB (custom MCP) | Read-only access to user trips and itineraries during AI conversations |

---


## Temporal Workflows
 
Two long-running durable workflows run independently of the LangGraph pipeline, managed by Temporal.
 
### Assistant Workflow
 
Wraps the full LangGraph pipeline execution inside a durable Temporal workflow. This ensures that even long-running AI conversations — involving multiple MCP tool calls, retries, and sequential agent nodes — survive server crashes, timeouts, and process restarts without losing state.
 
```
User sends message
       │
       ▼
┌─────────────────────────────────┐
│  Temporal: assistantWorkflow    │
│                                 │
│  Activity: runLangGraphPipeline │
│  ├── generateRoutingQuery       │
│  ├── retrieve                   │
│  ├── route                      │
│  ├── handleMcpServers (loop)    │
│  │   ├── mcpOrchestrator        │
│  │   ├── refineToolCall         │
│  │   └── mcpToolCall (loop)     │
│  ├── responseComposer           │
│  └── extractConversation        │
│                                 │
│  Retry policy: automatic        │
│  State: durable across restarts │
└─────────────────────────────────┘
       │
       ▼
  Response to user
```
 
### Weather Monitoring Workflow
 
A scheduled, long-running workflow that continuously monitors weather conditions at a user's trip destination via Tomorrow.io and delivers alerts over WhatsApp and email when severe changes are detected.
 
```
Trip created / updated
       │
       ▼
┌──────────────────────────────────────┐
│  Temporal: weatherMonitoringWorkflow │
│                                      │
│  Activity: fetchWeather              │
│  └── Poll Tomorrow.io API            │
│       for destination conditions     │
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
│  State: durable, survives restarts   │
└──────────────────────────────────────┘
       │
       ▼
  Loop until trip ends
```
 
| Property | Assistant Workflow | Weather Monitoring Workflow |
|----------|-------------------|----------------------------|
| Trigger | Incoming chat message | Trip created or updated |
| Duration | Single request lifecycle | Trip start date → trip end date |
| Activities | LangGraph pipeline execution | Weather fetch, condition evaluation, alert dispatch |
| Data sources | All MCP servers | Tomorrow.io |
| Notification | None | WhatsApp (Twilio) + Email (Brevo) |
| Retry policy | Automatic on activity failure | Automatic on fetch or send failure |
 
---

## Features

### Core

| Feature | Description |
|---------|-------------|
| **Multi-Agent AI Pipeline** | A LangGraph graph of nine specialized nodes — query normalization, vector retrieval, MCP routing, orchestration, argument refinement, tool execution, and response composition — processes every user message end-to-end |
| **Real-Time Flight Search** | Live fares, schedules, and flight status retrieved on demand via the RapidAPI Air Scanner remote MCP server; no cached or stale data |
| **Live Web Intelligence** | Current destination reviews, visa requirements, entry restrictions, and safety advisories fetched in real time via Tavily |
| **Geospatial POI Search** | Points of interest, proximity discovery, routing, and geocoding via a custom Google Places MCP server |

### Enhanced

| Feature | Description |
|---------|-------------|
| **Trip Memory** | Users manage trips and itineraries via the REST API; the AI agent has read-only access to retrieve and reference saved trips during conversations |
| **Weather Monitoring** | Temporal durable workflows continuously poll destination weather conditions and deliver alerts via email and SMS when severe changes are detected before or during a trip |
| **Interactive Maps** | Leaflet-powered maps render destination pins, multi-stop routes, and trip overlays directly in the UI |
| **Durable Background Workflows** | Temporal manages all long-running tasks — weather polling, notification dispatch, and scheduled checks — ensuring they survive server restarts and process failures |

### Infrastructure

| Feature | Description |
|---------|-------------|
| **Semantic Retrieval** | User trip context and preferences are stored as vector embeddings in Milvus and retrieved at inference time to ground agent responses |
| **Notifications** | Email delivery via Brevo and Nodemailer; SMS delivery via Twilio — used by weather monitoring and trip update workflows |
| **Authentication** | Google OAuth 2.0 and JWT cookie sessions managed by Passport.js |

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
| LangGraph + LangChain | latest | Multi-agent AI orchestration |
| Temporal | 1.14 | Durable background workflows |
| OpenAI | via LangChain | LLM backbone (GPT-4o) |
| Milvus (Zilliz) | latest | Vector database |
| Node.js + Express | 5 | REST API server |
| TypeScript | 5.9 | Type safety |
| MongoDB + Mongoose | 9 | Primary database |
| Passport.js | latest | Authentication middleware |
| Brevo + Nodemailer | latest | Email notifications |
| Twilio | 6 | SMS notifications |
| RapidAPI Air Scanner | remote MCP | Flight data |
| Zod | 3 | Runtime schema validation |

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
        │   ├── assistant_graph.ts        # Main LangGraph agent graph
        │   ├── build_router_graph.ts     # Router sub-graph
        │   ├── prompts.ts                # All agent system prompts
        │   ├── state.ts                  # Graph state schema
        │   ├── mcpWrapper.ts             # MCP client wrapper
        │   ├── retriever.ts              # Milvus vector search
        │   └── configuration.ts
        │
        ├── mcp-servers/
        │   ├── database-mcp-server/      # Read-only trip access MCP server
        │   └── places-mcp-server/        # Geospatial MCP server
        │
        ├── controllers/                  # Express route handlers
        ├── routes/                       # API route definitions
        ├── models/                       # Mongoose schemas
        ├── services/                     # Business logic layer
        ├── temporal-workflow/            # Durable workflow definitions
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
- Milvus — local or [Zilliz Cloud](https://zilliz.com)
- Temporal — run locally with `temporal server start-dev`
- API keys for: OpenAI · Google OAuth · RapidAPI · Tavily · Brevo · Twilio

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
 
# LangSmith (tracing & observability)
LANGSMITH_TRACING=true
LANGSMITH_ENDPOINT=https://api.smith.langchain.com
LANGSMITH_API_KEY=your_langsmith_key
LANGSMITH_PROJECT=your_project_name
 
# Auth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=your_google_callback_url
 
# Flights
RAPID_API=your_rapidapi_key
 
# Web Search
TAVILY_API_KEY=your_tavily_key
 
# Maps & Geospatial
GEOAPIFY_API_KEY=your_geoapify_key
GOOGLE_PLACES_API_KEY=your_google_places_key
 
# Weather
TOMORROWIO_API_KEY=your_tomorrowio_key
 
# Vector DB
MILVUS_DB=your_milvus_db
MILVUS_TOKEN=your_milvus_token
 
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
| `GET` | `/:tripId` | get all chats by trip ID |
| `POST` | `/:tripId` | append current conversation by trip ID |

### Temporal — `/api/temporal`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/sendQuery` | Send user query to Agent |


</div>
