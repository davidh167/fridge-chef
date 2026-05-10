import logging
import os
import shutil
import tempfile

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from livekit import api as lkapi
from livekit.api import AccessToken, VideoGrants
from pydantic import BaseModel

import rag

logger = logging.getLogger(__name__)

# Load .env from backend/ first, then fall back to repo root
load_dotenv()
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"), override=False)

app = FastAPI(title="Fridge Chef API")

# Allow the Next.js frontend (any origin in dev; tighten for prod)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# /token  — LiveKit room access token
# ---------------------------------------------------------------------------

class TokenRequest(BaseModel):
    room_name: str
    participant_name: str


@app.post("/token")
async def create_token(body: TokenRequest) -> dict:
    api_key = os.environ.get("LIVEKIT_API_KEY")
    api_secret = os.environ.get("LIVEKIT_API_SECRET")

    if not api_key or not api_secret:
        raise HTTPException(
            status_code=500,
            detail="LIVEKIT_API_KEY or LIVEKIT_API_SECRET not configured",
        )

    # Grant the participant permission to join (and publish audio in) the room
    grants = VideoGrants(
        room_join=True,
        room=body.room_name,
    )

    token = (
        AccessToken(api_key=api_key, api_secret=api_secret)
        .with_identity(body.participant_name)
        .with_name(body.participant_name)
        .with_grants(grants)
        .to_jwt()
    )

    # Dispatch the named agent to the room so it joins automatically
    lk_url = os.environ.get("LIVEKIT_URL", "")
    if lk_url:
        try:
            lk = lkapi.LiveKitAPI(url=lk_url, api_key=api_key, api_secret=api_secret)
            await lk.agent_dispatch.create_dispatch(
                lkapi.CreateAgentDispatchRequest(
                    agent_name="fridge-chef",
                    room=body.room_name,
                )
            )
            await lk.aclose()
        except Exception as exc:
            # Non-fatal: log and continue — token is still valid
            logger.warning("Agent dispatch failed (agent may still connect): %s", exc)

    return {"token": token}


# ---------------------------------------------------------------------------
# /upload-pdf  — receive a PDF and ingest it into the RAG vector store
# ---------------------------------------------------------------------------

@app.post("/upload-pdf")
async def upload_pdf(file: UploadFile = File(...)) -> dict:
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    # Write to a temp file so LlamaIndex can read it from disk
    suffix = f"_{file.filename}"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name

    try:
        rag.ingest_pdf(tmp_path)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"PDF ingestion failed: {exc}",
        ) from exc
    finally:
        # Clean up the temp file regardless of success or failure
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

    return {"status": "ingested", "filename": file.filename}
