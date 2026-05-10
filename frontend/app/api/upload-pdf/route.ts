import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    // Forward the multipart form to the FastAPI backend server-side
    // (avoids mixed-content browser block: HTTPS page → HTTP EC2)
    const res = await fetch(`${BACKEND_URL}/upload-pdf`, {
      method: "POST",
      body: form,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return NextResponse.json(
        { detail: body.detail ?? `Backend error ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error("Upload proxy failed:", err);
    return NextResponse.json(
      { detail: "Could not reach backend. Is it running?" },
      { status: 503 }
    );
  }
}
