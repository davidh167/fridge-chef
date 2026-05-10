# Fridge Chef

## What It Does

You open the fridge, stare at eggs, leftover rice, and half a lime, and every recipe online assumes you have 12 more ingredients. Fridge Chef fixes that. You talk to Chef Marco — a confident, opinionated LA home cook — and he tells you exactly what to make with what you have. He draws from Samin Nosrat's *Salt, Fat, Acid, Heat* via RAG for technique questions, and hits the Spoonacular API for real recipe ideas when you list your ingredients.

## System Architecture

```
Browser (Next.js on Vercel)
  │
  ├─► GET /api/token  (Next.js server route)
  │       └─► POST /token  (FastAPI on EC2)
  │               └─► LiveKit API: mint JWT + dispatch "fridge-chef" agent to room
  │
  ├─► POST /api/upload-pdf  (Next.js server route)
  │       └─► POST /upload-pdf  (FastAPI on EC2) ──► LlamaIndex ingest ──► ChromaDB
  │
  └─► WebRTC audio ──► LiveKit Cloud ──► agent.py  (Python worker on EC2)
                                              │
                                    ┌─────────┼─────────┐
                                    ▼         ▼         ▼
                               Silero VAD  Deepgram  ElevenLabs
                               (end-of-    (STT)     (TTS)
                                turn)       │
                                            ▼
                                       GPT-4o-mini
                                       ┌────┴────┐
                                       ▼         ▼
                                  RAG query   Spoonacular
                                  (ChromaDB)  tool call
```

## RAG Integration

- **PDF source:** *Salt, Fat, Acid, Heat* by Samin Nosrat — teaches cooking principles and technique, not just recipes, which is what a voice cooking assistant actually needs
- **Framework:** LlamaIndex `SimpleDirectoryReader` → `VectorStoreIndex` backed by ChromaDB
- **Chunking strategy:** 512 tokens, 50-token overlap — large enough to capture full paragraphs of technique explanation without losing context at chunk boundaries
- **Embedding model:** OpenAI `text-embedding-3-small` — accurate and cost-efficient
- **Vector store:** ChromaDB (local persistent) — zero infrastructure needed for a demo; production would use Pinecone or pgvector on Supabase
- **Retrieval hook:** top-3 chunks injected as a `system` message in `on_user_turn_completed` before the LLM responds; the prompt instructs Marco to reference the book naturally if relevant and ignore it if not

## Tool Call

- **Function:** `find_recipes_by_ingredients`
- **Triggers when:** the user lists ingredients or asks what they can cook with what they have
- **API:** Spoonacular `/findByIngredients` — returns recipes ranked by how many of the user's ingredients they use
- **Output:** top 3 recipe names with ingredient match counts, formatted as natural speech for TTS
- **Fallback:** if the Spoonacular API is unavailable, returns a graceful fallback string so Marco can still respond helpfully

## Tech Stack

| Layer | Tools |
|-------|-------|
| Voice agent | LiveKit Agents SDK (Python v1.5.8), Silero VAD, Deepgram STT (nova-3), ElevenLabs TTS, GPT-4o-mini |
| RAG | LlamaIndex, ChromaDB, OpenAI `text-embedding-3-small` |
| Tool call | Spoonacular API |
| Backend HTTP | FastAPI + uvicorn |
| Frontend | Next.js 16 (App Router), TypeScript, Tailwind CSS, LiveKit JS SDK, react-markdown |
| Hosting | Vercel (frontend), AWS EC2 t3.small (backend + agent), LiveKit Cloud (WebRTC rooms) |

## Design Decisions & Trade-offs

- **ElevenLabs over Cartesia:** better voice personality for a demo; Cartesia is the production choice for lower latency
- **ChromaDB over Pinecone:** no infrastructure overhead for a single-user demo; production would use a managed vector DB
- **Synchronous PDF ingestion:** simple and sufficient for one user; production would use an async job queue (SQS + worker)
- **Single EC2 instance:** runs both FastAPI and the agent worker as `nohup` processes; production would use systemd services, a LiveKit worker pool, and an Auto Scaling Group for concurrent sessions
- **Named agent dispatch:** the agent is registered as `fridge-chef` and the FastAPI `/token` endpoint dispatches it explicitly to each new room via the LiveKit API — cleaner than auto-dispatch and works correctly with the LiveKit Agent Console
- **Silero VAD `min_silence_duration=0.8s`:** the default (~300ms) was too sensitive and cut off natural mid-sentence pauses; 800ms feels like a real conversation

## Setup Instructions (Local)

### Prerequisites
- Python 3.11+, Poetry
- Node.js 18+, npm
- Accounts with: LiveKit Cloud, OpenAI, Deepgram, ElevenLabs, Spoonacular

### Backend

```bash
# 1. Clone and enter the repo
git clone https://github.com/your-username/fridge-chef.git
cd fridge-chef

# 2. Copy and fill in environment variables
cp .env.example .env
# Edit .env with your keys

# 3. Install Python dependencies
cd backend
poetry install

# 4. Ingest the default PDF into ChromaDB
poetry run python rag.py

# 5. Run the FastAPI token server (terminal 1)
poetry run uvicorn server:app --port 8000

# 6. Run the LiveKit voice agent (terminal 2)
poetry run python agent.py start
```

### Frontend

```bash
cd frontend

# Copy and fill in frontend env vars
cp .env.local.example .env.local
# Set BACKEND_URL and LIVEKIT_URL

npm install
npm run dev
# Open http://localhost:3000
```

## Deployment

- **Frontend:** https://fridge-chef-theta.vercel.app/
- **Backend:** AWS EC2 t3.small running FastAPI on port 8000 and the agent worker

### EC2 Setup (Amazon Linux 2 or Amazon Linux 2023)

Launch a t3.small (or larger — t2.micro OOMs during PDF ingestion), open inbound TCP port 8000 in the Security Group, then:

```bash
# 1. SSH in and clone the repo
ssh -i ~/your-key.pem ec2-user@<EC2_PUBLIC_IP>
git clone https://github.com/your-username/fridge-chef.git
cd fridge-chef

# 2. Copy your .env to the server (run from your local machine)
scp -i ~/your-key.pem backend/.env ec2-user@<EC2_PUBLIC_IP>:~/fridge-chef/backend/.env

# 3. Run the setup script — handles package install, Poetry, PDF ingestion, and starts both processes
chmod +x backend/setup_ec2.sh
bash backend/setup_ec2.sh
```

The script works on both Amazon Linux 2 (`yum`) and Amazon Linux 2023 (`dnf`) — it detects which package manager is available.

After it runs, check logs with:
```bash
tail -f /tmp/fridge-chef-server.log   # FastAPI
tail -f /tmp/fridge-chef-agent.log    # LiveKit agent
```

## Known Limitations

- Single EC2 instance handles one agent session at a time
- ChromaDB is local to the EC2 instance — not shared across restarts if the instance is replaced
- PDF ingestion is synchronous and blocks the server briefly
- Free ElevenLabs tier requires using pre-made voices (no custom voice cloning)
- Agent and FastAPI run as `nohup` jobs — not auto-restarted on crash in this setup
- **No per-user data isolation** — there is one shared ChromaDB collection for all users. A PDF uploaded by any user updates Marco's knowledge for everyone, and re-ingesting replaces the previous collection entirely. In production, you would namespace collections by user ID (Pinecone namespaces, pgvector row-level filtering, etc.) and add authentication to the upload endpoint
