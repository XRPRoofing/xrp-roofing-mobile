import { useState, useEffect, useCallback, useRef } from "react";
import type { Call, CallInvite } from "@twilio/voice-react-native-sdk";
import {
  getVoice,
  getVoiceEvents,
  getCallEvents,
  registerForCalls,
  acceptCall,
  rejectCall,
  disconnectCall,
  toggleMute,
  setCurrentCall,
} from "../services/voice";
import { getVoiceToken } from "../services/auth";

export type CallState = "idle" | "ringing" | "connected" | "disconnected";

export function useVoice() {
  const [callState, setCallState] = useState<CallState>("idle");
  const [callInvite, setCallInvite] = useState<CallInvite | null>(null);
  const [activeCall, setActiveCall] = useState<Call | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [callerName, setCallerName] = useState<string>("");
  const [registered, setRegistered] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);

  const register = useCallback(async () => {
    try {
      setError(null);
      const { token } = await getVoiceToken("android");
      tokenRef.current = token;
      await registerForCalls(token);
      setRegistered(true);
      console.log("[useVoice] Registered successfully");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      console.error("[useVoice] Registration failed:", msg);
    }
  }, []);

  useEffect(() => {
    try {
      const voice = getVoice();
      if (!voice) {
        setError("Voice SDK not available on this device");
        return;
      }

      const events = getVoiceEvents();
      if (!events.CallInvite) return;

      const handleCallInvite = (invite: CallInvite) => {
        console.log("[useVoice] Incoming call from:", invite.from);
        setCallInvite(invite);
        setCallerName(invite.from || "Unknown");
        setCallState("ringing");
      };

      const handleCancelledCallInvite = () => {
        console.log("[useVoice] Call invite cancelled");
        setCallInvite(null);
        setCallState("idle");
        setCallerName("");
      };

      voice.on(events.CallInvite, handleCallInvite);
      voice.on(events.CancelledCallInvite, handleCancelledCallInvite);

      return () => {
        voice.removeListener(events.CallInvite, handleCallInvite);
        voice.removeListener(events.CancelledCallInvite, handleCancelledCallInvite);
      };
    } catch (err) {
      console.error("[useVoice] Setup error:", err);
      setError("Failed to initialize voice");
    }
  }, []);

  const answer = useCallback(async () => {
    if (!callInvite) return;
    try {
      const call = await acceptCall(callInvite);
      setActiveCall(call);
      setCallState("connected");
      setCallInvite(null);

      const callEvents = getCallEvents();
      if (callEvents.Disconnected) {
        call.on(callEvents.Disconnected, () => {
          setCallState("idle");
          setActiveCall(null);
          setCurrentCall(null);
          setCallerName("");
          setIsMuted(false);
        });
      }
    } catch (err) {
      console.error("[useVoice] Accept failed:", err);
      setCallState("idle");
    }
  }, [callInvite]);

  const decline = useCallback(async () => {
    if (!callInvite) return;
    await rejectCall(callInvite);
    setCallInvite(null);
    setCallState("idle");
    setCallerName("");
  }, [callInvite]);

  const hangup = useCallback(async () => {
    await disconnectCall();
    setCallState("idle");
    setActiveCall(null);
    setCallerName("");
    setIsMuted(false);
  }, []);

  const mute = useCallback(async () => {
    const newMuted = !isMuted;
    await toggleMute(newMuted);
    setIsMuted(newMuted);
  }, [isMuted]);

  return {
    callState,
    callerName,
    isMuted,
    registered,
    error,
    register,
    answer,
    decline,
    hangup,
    mute,
    activeCall,
  };
}
