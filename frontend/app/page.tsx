"use client";

import { useCallback, useRef, useState } from "react";
import { Room, RoomEvent, Track, Participant, TranscriptionSegment } from "livekit-client";
import CallControls, { CallState } from "./components/CallControls";
import Transcript, { Message } from "./components/Transcript";

export default function Home() {
  const [callState, setCallState] = useState<CallState>("idle");
  const [messages, setMessages] = useState<Message[]>([]);
  const [pendingAgentText, setPendingAgentText] = useState("");
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
  const roomRef = useRef<Room | null>(null);
  // Container to hold <audio> elements injected by LiveKit
  const audioContainerRef = useRef<HTMLDivElement>(null);
  // Buffer user speech fragments so pauses don't create separate bubbles
  const userSegmentBufferRef = useRef<string>("");
  const userSegmentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const addMessage = useCallback((role: "user" | "agent" | "divider", text: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `${role}-${Date.now()}-${Math.random()}`,
        role,
        text: text.trim(),
        timestamp: new Date(),
      },
    ]);
  }, []);

  const handleRoomConnected = useCallback(
    (room: Room) => {
      roomRef.current = room;

      // Insert a session divider whenever a new call starts (not on the very first)
      setMessages((prev) => {
        if (prev.length === 0) return prev;
        return [
          ...prev,
          {
            id: `divider-${Date.now()}`,
            role: "divider" as const,
            text: "New conversation",
            timestamp: new Date(),
          },
        ];
      });

      // Attach incoming remote audio tracks to real <audio> elements so they play
      room.on(RoomEvent.TrackSubscribed, (track, _pub, _participant) => {
        if (track.kind === Track.Kind.Audio) {
          const el = track.attach();
          el.style.display = "none";
          audioContainerRef.current?.appendChild(el);
        }
      });

      // Clean up audio elements when a track is unsubscribed
      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        if (track.kind === Track.Kind.Audio) {
          track.detach().forEach((el) => el.remove());
        }
      });

      // Track active speakers to drive the speaking indicator
      room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
        const agentSpeaking = speakers.some((p) => !p.isLocal);
        setIsAgentSpeaking(agentSpeaking);
      });

      room.on(
        RoomEvent.TranscriptionReceived,
        (segments: TranscriptionSegment[], participant?: Participant) => {
          const isSelf = participant?.isLocal ?? false;
          const nonFinalText = segments.filter((s) => !s.final).map((s) => s.text).join(" ").trim();
          const finalText = segments.filter((s) => s.final).map((s) => s.text).join(" ").trim();

          if (!isSelf) {
            // Show streaming text immediately as it arrives
            if (nonFinalText) setPendingAgentText(nonFinalText);
            if (finalText) {
              addMessage("agent", finalText);
              setPendingAgentText("");
              setIsAgentSpeaking(false); // don't let audio lag cause a stale dot flash
            }
          } else {
            // User speech: buffer final segments and merge within a 1.5s window
            // so natural pauses don't split one thought into multiple bubbles
            if (finalText) {
              userSegmentBufferRef.current = userSegmentBufferRef.current
                ? userSegmentBufferRef.current + " " + finalText
                : finalText;

              if (userSegmentTimerRef.current) clearTimeout(userSegmentTimerRef.current);
              userSegmentTimerRef.current = setTimeout(() => {
                if (userSegmentBufferRef.current) {
                  addMessage("user", userSegmentBufferRef.current);
                  userSegmentBufferRef.current = "";
                }
                userSegmentTimerRef.current = null;
              }, 1500);
            }
          }
        }
      );
    },
    [addMessage]
  );

  const handleRoomDisconnected = useCallback(() => {
    roomRef.current = null;
    setIsAgentSpeaking(false);
    setPendingAgentText("");
    if (userSegmentTimerRef.current) clearTimeout(userSegmentTimerRef.current);
    userSegmentBufferRef.current = "";
    if (audioContainerRef.current) {
      audioContainerRef.current.innerHTML = "";
    }
  }, []);

  return (
    <main className="min-h-screen flex flex-col items-center bg-[#0f0f0f]">
      {/* Hidden container for LiveKit audio elements */}
      <div ref={audioContainerRef} aria-hidden="true" />
      {/* Header */}
      <header className="w-full max-w-2xl px-4 pt-10 pb-6 flex flex-col items-center gap-2">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🍳</span>
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Fridge Chef
          </h1>
        </div>
        <p className="text-zinc-400 text-sm text-center">
          Tell Chef Marco what&rsquo;s in your fridge — he&rsquo;ll figure out what to cook.
        </p>
        {callState === "connected" && (
          <span className="mt-1 flex items-center gap-1.5 text-xs text-green-400 font-medium">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            Live
          </span>
        )}
      </header>

      {/* Transcript area */}
      <section className="w-full max-w-2xl flex-1 px-4 pb-4">
        <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800 h-[68vh] overflow-y-auto p-4 shadow-inner">
          <Transcript
            messages={messages}
            pendingAgentText={pendingAgentText}
            isAgentSpeaking={isAgentSpeaking}
          />
        </div>
      </section>

      {/* Controls */}
      <footer className="w-full max-w-2xl px-4 pb-10 flex flex-col items-center gap-6">
        <CallControls
          callState={callState}
          setCallState={setCallState}
          onRoomConnected={handleRoomConnected}
          onRoomDisconnected={handleRoomDisconnected}
        />
        <p className="text-zinc-600 text-xs text-center">
          Powered by LiveKit · ElevenLabs · GPT-4o mini
        </p>
      </footer>
    </main>
  );
}
