import { Voice } from "@twilio/voice-react-native-sdk";
import type { Call, CallInvite } from "@twilio/voice-react-native-sdk";

let voiceInstance: Voice | null = null;
let currentCall: Call | null = null;

export function getVoice(): Voice {
  if (!voiceInstance) {
    voiceInstance = new Voice();
  }
  return voiceInstance;
}

export async function registerForCalls(token: string): Promise<void> {
  const voice = getVoice();
  await voice.register(token);
  console.log("[Voice] Registered for incoming calls");
}

export async function unregisterFromCalls(token: string): Promise<void> {
  const voice = getVoice();
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
  const call = await voice.connect(token, { params: { To: to } });
  currentCall = call;
  return call;
}
