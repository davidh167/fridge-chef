"use client";

import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";

export interface Message {
  id: string;
  role: "user" | "agent" | "divider";
  text: string;
  timestamp: Date;
}

interface TranscriptProps {
  messages: Message[];
  pendingAgentText?: string;   // streaming (non-final) agent text
  isAgentSpeaking?: boolean;   // true while Marco is actively speaking
}

export default function Transcript({ messages, pendingAgentText, isAgentSpeaking }: TranscriptProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pendingAgentText]);

  const isEmpty = messages.length === 0 && !pendingAgentText;

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-3 py-12">
        <ChefHatIcon className="w-12 h-12 opacity-30" />
        <p className="text-sm">Your conversation will appear here</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 px-1 py-2">
      {messages.map((msg) => {
        if (msg.role === "divider") {
          return (
            <div key={msg.id} className="flex items-center gap-3 py-1">
              <div className="flex-1 h-px bg-zinc-700/60" />
              <span className="text-xs text-zinc-500 whitespace-nowrap">{msg.text}</span>
              <div className="flex-1 h-px bg-zinc-700/60" />
            </div>
          );
        }

        return (
          <div
            key={msg.id}
            className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
          >
            <Avatar role={msg.role} />
            <div className={bubbleClass(msg.role)}>
              <div className="prose prose-sm prose-invert max-w-none text-inherit">
                <ReactMarkdown>{msg.text}</ReactMarkdown>
              </div>
              <p className={`text-xs mt-1 ${msg.role === "agent" ? "text-zinc-500" : "text-brand-200"}`}>
                {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </div>
        );
      })}

      {/* Streaming pending message — appears while Marco is still speaking */}
      {pendingAgentText && (
        <div className="flex gap-3">
          <Avatar role="agent" speaking={isAgentSpeaking} />
          <div className={bubbleClass("agent") + " opacity-90"}>
            <div className="prose prose-sm prose-invert max-w-none text-inherit">
              <ReactMarkdown>{pendingAgentText}</ReactMarkdown>
            </div>
            {/* Blinking cursor to signal streaming */}
            <span className="inline-block w-1.5 h-3.5 bg-zinc-400 ml-1 align-middle animate-pulse rounded-sm" />
          </div>
        </div>
      )}

      {/* Speaking orb — show when Marco is speaking but no text yet */}
      {isAgentSpeaking && !pendingAgentText && (
        <div className="flex gap-3 items-center">
          <Avatar role="agent" speaking />
          <div className="flex items-center gap-1.5 bg-zinc-800 rounded-2xl rounded-tl-sm px-4 py-3">
            <span className="w-2 h-2 rounded-full bg-brand-400 animate-bounce [animation-delay:0ms]" />
            <span className="w-2 h-2 rounded-full bg-brand-400 animate-bounce [animation-delay:150ms]" />
            <span className="w-2 h-2 rounded-full bg-brand-400 animate-bounce [animation-delay:300ms]" />
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}

function bubbleClass(role: "user" | "agent") {
  return `max-w-[78%] rounded-2xl px-4 py-3 shadow-sm text-sm leading-relaxed ${
    role === "agent"
      ? "bg-zinc-800 text-zinc-100 rounded-tl-sm"
      : "bg-brand-600 text-white rounded-tr-sm"
  }`;
}

function Avatar({ role, speaking }: { role: "user" | "agent"; speaking?: boolean }) {
  return (
    <div className="relative flex-shrink-0">
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow
          ${role === "agent" ? "bg-brand-500 text-white" : "bg-zinc-700 text-zinc-300"}`}
      >
        {role === "agent" ? "M" : "You"}
      </div>
      {speaking && (
        <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-400 border-2 border-zinc-900 animate-pulse" />
      )}
    </div>
  );
}

function ChefHatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M6 13.5V18a1 1 0 001 1h10a1 1 0 001-1v-4.5M6 13.5A4.5 4.5 0 0110.5 9a4.5 4.5 0 014.5 4.5M6 13.5A4.5 4.5 0 019 9.27M18 13.5A4.5 4.5 0 0015 9.27M9 6a3 3 0 016 0" />
    </svg>
  );
}
