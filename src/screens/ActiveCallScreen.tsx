import React, { useState, useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

interface Props {
  callerName: string;
  isMuted: boolean;
  onMute: () => void;
  onHangup: () => void;
}

export default function ActiveCallScreen({ callerName, isMuted, onMute, onHangup }: Props) {
  const [duration, setDuration] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setDuration((d) => d + 1);
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <View style={styles.container}>
      <View style={styles.callerSection}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {callerName.charAt(0).toUpperCase() || "?"}
          </Text>
        </View>
        <Text style={styles.callerName}>{callerName}</Text>
        <Text style={styles.duration}>{formatDuration(duration)}</Text>
        <Text style={styles.callLabel}>Connected</Text>
      </View>

      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.controlButton, isMuted && styles.controlActive]}
          onPress={onMute}
        >
          <Text style={styles.controlIcon}>{isMuted ? "🔇" : "🔊"}</Text>
          <Text style={styles.controlLabel}>{isMuted ? "Unmute" : "Mute"}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.hangupSection}>
        <TouchableOpacity style={styles.hangupButton} onPress={onHangup}>
          <Text style={styles.hangupIcon}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.hangupLabel}>End Call</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
    padding: 24,
    justifyContent: "space-between",
  },
  callerSection: {
    alignItems: "center",
    marginTop: 80,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#1e293b",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 2,
    borderColor: "#22c55e",
  },
  avatarText: {
    fontSize: 32,
    color: "#fff",
    fontWeight: "700",
  },
  callerName: {
    fontSize: 24,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 8,
  },
  duration: {
    fontSize: 18,
    color: "#22c55e",
    fontWeight: "600",
    marginBottom: 4,
  },
  callLabel: {
    fontSize: 14,
    color: "#94a3b8",
  },
  controls: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 24,
  },
  controlButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#1e293b",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#334155",
  },
  controlActive: {
    backgroundColor: "#334155",
    borderColor: "#60a5fa",
  },
  controlIcon: {
    fontSize: 24,
  },
  controlLabel: {
    color: "#94a3b8",
    fontSize: 11,
    marginTop: 4,
  },
  hangupSection: {
    alignItems: "center",
    paddingBottom: 60,
  },
  hangupButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#dc2626",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  hangupIcon: {
    fontSize: 28,
    color: "#fff",
    fontWeight: "700",
  },
  hangupLabel: {
    color: "#94a3b8",
    fontSize: 13,
  },
});
