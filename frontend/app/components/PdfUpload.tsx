"use client";

import { useRef, useState } from "react";

type UploadState = "idle" | "uploading" | "success" | "error";

export default function PdfUpload() {
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setUploadState("error");
      setMessage("Only PDF files are accepted.");
      return;
    }

    setUploadState("uploading");
    setMessage("");

    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch(`${apiUrl}/upload-pdf`, {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? `Server error ${res.status}`);
      }

      const data = await res.json();
      setUploadState("success");
      setMessage(`"${data.filename}" added to Marco's cookbook.`);

      // Reset after 4 seconds so the user can upload another
      setTimeout(() => {
        setUploadState("idle");
        setMessage("");
        if (inputRef.current) inputRef.current.value = "";
      }, 4000);
    } catch (err: unknown) {
      setUploadState("error");
      setMessage(err instanceof Error ? err.message : "Upload failed.");
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const isUploading = uploadState === "uploading";

  return (
    <div className="w-full flex flex-col items-center gap-2">
      <label
        htmlFor="pdf-upload"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className={`
          w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed
          text-sm font-medium cursor-pointer transition-colors
          ${isUploading
            ? "border-amber-500/40 text-amber-400/60 cursor-not-allowed"
            : uploadState === "success"
            ? "border-green-600/40 text-green-400"
            : uploadState === "error"
            ? "border-red-600/40 text-red-400"
            : "border-zinc-700 text-zinc-400 hover:border-amber-500/50 hover:text-amber-400"
          }
        `}
      >
        {isUploading ? (
          <>
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            Ingesting cookbook…
          </>
        ) : uploadState === "success" ? (
          <>✓ {message}</>
        ) : uploadState === "error" ? (
          <>✗ {message}</>
        ) : (
          <>
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            Add a cookbook PDF
          </>
        )}
      </label>
      <input
        ref={inputRef}
        id="pdf-upload"
        type="file"
        accept=".pdf,application/pdf"
        className="sr-only"
        onChange={handleChange}
        disabled={isUploading}
      />
    </div>
  );
}
