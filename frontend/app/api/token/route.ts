import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";
const LIVEKIT_URL = process.env.LIVEKIT_URL ?? "";

export async function GET() {
  try {
    // Generate a random room name and participant name for this session
    const roomName = `fridge-chef-${Math.random().toString(36).slice(2, 8)}`;
    const participantName = `guest-${Math.random().toString(36).slice(2, 6)}`;

    const res = await fetch(`${BACKEND_URL}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room_name: roomName, participant_name: participantName }),
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `Backend error: ${text}` },
        { status: res.status }
      );
    }

    const { token } = await res.json();

    // Include the LiveKit server URL so the frontend can connect
    return NextResponse.json({ token, url: LIVEKIT_URL, roomName });
  } catch (err) {
    console.error("Token fetch failed:", err);
    return NextResponse.json(
      { error: "Could not reach backend. Is it running?" },
      { status: 503 }
    );
  }
}
