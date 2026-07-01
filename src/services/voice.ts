import type { Call, CallInvite } from "@twilio/voice-react-native-sdk";

let voiceInstance: any = null;
let currentCall: Call | null = null;
let VoiceClass: any = null;

function loadVoiceSDK() {
  if (!VoiceClass) {
    try {
      const sdk = require("@twilio/voice-react-native-sdk");
      VoiceClass = sdk.Voice;
    } catch (err) {
      console.error("[Voice] Failed to load SDK:", err);
    }
  }
  return VoiceClass;
}

export function getVoice(): any {
  if (!voiceInstance) {
    const Voice = loadVoiceSDK();
    if (Voice) {
      voiceInstance = new Voice();
    }
  }
  return voiceInstance;
}

export function getVoiceEvents() {
  const Voice = loadVoiceSDK();
  return Voice?.Event || {};
}

export function getCallEvents() {
  try {
    const sdk = require("@twilio/voice-react-native-sdk");
    return sdk.Call?.Event || {};
  } catch {
    return {};
  }
}

export async function registerForCalls(token: string): Promise<void> {
  const voice = getVoice();
  if (!voice) throw new Error("Voice SDK not available");
  await voice.register(token);
  console.log("[Voice] Registered for incoming calls");
}

export async function unregisterFromCalls(token: string): Promise<void> {
  const voice = getVoice();
  if (!voice) return;
  await voice.unregister(token);
  console.log("[Voice] Unregistered from incoming calls");
}

export async function acceptCall(callInvite: CallInvite): Promise<Call> {
  const call = await callInvite.accept();
  currentCall = call;
  return call;
}

export async function rejectCall(callInvite: CallInvite): Promise<void> {
  await callInvite.reject();
}

export function getCurrentCall(): Call | null {
  return currentCall;
}

export function setCurrentCall(call: Call | null): void {
  currentCall = call;
}

export async function disconnectCall(): Promise<void> {
  if (currentCall) {
    await currentCall.disconnect();
    currentCall = null;
  }
}

export async function toggleMute(muted: boolean): Promise<void> {
  if (currentCall) {
    await currentCall.mute(muted);
  }
}

export async function makeOutboundCall(
  token: string,
  to: string
): Promise<Call> {
  const voice = getVoice();
  if (!voice) throw new Error("Voice SDK not available");
  const call = await voice.connect(token, { params: { To: to } });
  currentCall = call;
  return call;
}
