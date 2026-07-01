import React, { useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useAuth } from "../hooks/useAuth";
import { useVoice } from "../hooks/useVoice";

export default function HomeScreen() {
  const { user, signOut } = useAuth();
  const { registered, error, register, callState } = useVoice();

  useEffect(() => {
    if (!registered) {
      register();
    }
  }, [registered, register]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>XRP Roofing</Text>
        <Text style={styles.subtitle}>Mobile Phone</Text>
      </View>

      <View style={styles.statusCard}>
        <View style={[styles.statusDot, registered ? styles.dotGreen : styles.dotRed]} />
        <Text style={styles.statusText}>
          {registered ? "Ready to receive calls" : "Connecting..."}
        </Text>
      </View>

      {error && (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={register}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {callState !== "idle" && (
        <View style={styles.callBanner}>
          <Text style={styles.callBannerText}>
            {callState === "ringing" ? "Incoming Call..." : "On Call"}
          </Text>
        </View>
      )}

      <View style={styles.infoSection}>
        <Text style={styles.infoLabel}>Logged in as</Text>
        <Text style={styles.infoValue}>{user?.email || "Unknown"}</Text>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.signOutButton} onPress={signOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
    padding: 24,
  },
  header: {
    alignItems: "center",
    marginTop: 60,
    marginBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#fff",
  },
  subtitle: {
    fontSize: 14,
    color: "#94a3b8",
    marginTop: 4,
  },
  statusCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1e293b",
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  dotGreen: {
    backgroundColor: "#22c55e",
  },
  dotRed: {
    backgroundColor: "#ef4444",
  },
  statusText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "500",
  },
  errorCard: {
    backgroundColor: "#451a1a",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  errorText: {
    color: "#fca5a5",
    fontSize: 14,
    marginBottom: 8,
  },
  retryButton: {
    alignSelf: "flex-start",
    backgroundColor: "#dc2626",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  retryText: {
    color: "#fff",
    fontWeight: "600",
  },
  callBanner: {
    backgroundColor: "#166534",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    alignItems: "center",
  },
  callBannerText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  infoSection: {
    backgroundColor: "#1e293b",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  infoLabel: {
    color: "#94a3b8",
    fontSize: 12,
    marginBottom: 4,
  },
  infoValue: {
    color: "#fff",
    fontSize: 16,
  },
  footer: {
    flex: 1,
    justifyContent: "flex-end",
  },
  signOutButton: {
    backgroundColor: "#1e293b",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#334155",
  },
  signOutText: {
    color: "#94a3b8",
    fontSize: 16,
  },
});
