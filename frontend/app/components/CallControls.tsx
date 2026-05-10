"use client";

import { useCallback, useState } from "react";
import { Room, RoomEvent } from "livekit-client";

export type CallState = "idle" | "connecting" | "connected" | "error";

interface CallControlsProps {
  onRoomConnected: (room: Room) => void;
  onRoomDisconnected: () => void;
  callState: CallState;
  setCallState: (state: CallState) => void;
}

export default function CallControls({
  onRoomConnected,
  onRoomDisconnected,
  callState,
  setCallState,
}: CallControlsProps) {
  const [room, setRoom] = useState<Room | null>(null);

  const startCall = useCallback(async () => {
    setCallState("connecting");
    try {
      const res = await fetch("/api/token");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Token fetch failed");

      const { token, url } = data;
      const newRoom = new Room();

      newRoom.on(RoomEvent.Disconnected, () => {
        // Release the mic track in case the room closed unexpectedly
        newRoom.localParticipant.audioTrackPublications.forEach((pub) => {
          pub.track?.mediaStreamTrack?.stop();
        });
        setCallState("idle");
        setRoom(null);
        onRoomDisconnected();
      });

      // Microphone requires a secure context (https or localhost)
      if (!navigator.mediaDevices) {
        await newRoom.disconnect();
        throw new Error(
          "Microphone unavailable. Open the app on localhost or over HTTPS."
        );
      }

      await newRoom.connect(url, token);

      // Unlock browser audio playback (required by autoplay policy)
      await newRoom.startAudio();

      // Enable microphone — this triggers the browser permission prompt
      await newRoom.localParticipant.setMicrophoneEnabled(true);

      setRoom(newRoom);
      setCallState("connected");
      onRoomConnected(newRoom);
    } catch (err) {
      console.error(err);
      setCallState("error");
    }
  }, [onRoomConnected, onRoomDisconnected, setCallState]);

  const endCall = useCallback(async () => {
    if (room) {
      // Explicitly stop the underlying MediaStreamTrack so the browser
      // releases the mic and macOS clears the recording indicator
      room.localParticipant.audioTrackPublications.forEach((pub) => {
        pub.track?.mediaStreamTrack?.stop();
      });
      await room.disconnect();
      setRoom(null);
    }
    setCallState("idle");
    onRoomDisconnected();
  }, [room, setCallState, onRoomDisconnected]);

  const isIdle = callState === "idle" || callState === "error";

  return (
    <div className="flex flex-col items-center gap-4">
      {isIdle ? (
        <button
          onClick={startCall}
          className="group flex items-center gap-3 rounded-full bg-brand-500 hover:bg-brand-400 active:scale-95 px-8 py-4 text-white font-semibold text-lg shadow-lg shadow-brand-900/40 transition-all duration-200"
        >
          <MicIcon className="w-5 h-5" />
          Talk to Chef Marco
        </button>
      ) : callState === "connecting" ? (
        <button
          disabled
          className="flex items-center gap-3 rounded-full bg-zinc-700 px-8 py-4 text-zinc-400 font-semibold text-lg cursor-not-allowed"
        >
          <SpinnerIcon className="w-5 h-5 animate-spin" />
          Connecting…
        </button>
      ) : (
        <button
          onClick={endCall}
          className="flex items-center gap-3 rounded-full bg-red-600 hover:bg-red-500 active:scale-95 px-8 py-4 text-white font-semibold text-lg shadow-lg shadow-red-900/40 transition-all duration-200"
        >
          <PhoneOffIcon className="w-5 h-5" />
          End Call
        </button>
      )}
      {callState === "error" && (
        <p className="text-red-400 text-sm">Connection failed. Check backend and try again.</p>
      )}
    </div>
  );
}

function MicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" />
    </svg>
  );
}

function PhoneOffIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A2 2 0 0 1 3 20.68" />
      <line x1="23" y1="1" x2="1" y2="23" />
    </svg>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}
