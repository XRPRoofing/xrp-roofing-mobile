import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

interface Props {
  callerName: string;
  onAnswer: () => void;
  onDecline: () => void;
}

export default function IncomingCallScreen({ callerName, onAnswer, onDecline }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.callerSection}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {callerName.charAt(0).toUpperCase() || "?"}
          </Text>
        </View>
        <Text style={styles.callerName}>{callerName}</Text>
        <Text style={styles.callLabel}>Incoming Call</Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.declineButton} onPress={onDecline}>
          <Text style={styles.buttonIcon}>✕</Text>
          <Text style={styles.buttonLabel}>Decline</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.answerButton} onPress={onAnswer}>
          <Text style={styles.buttonIcon}>✓</Text>
          <Text style={styles.buttonLabel}>Answer</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
    justifyContent: "space-between",
    padding: 24,
  },
  callerSection: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#1e293b",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
    borderWidth: 2,
    borderColor: "#334155",
  },
  avatarText: {
    fontSize: 40,
    color: "#fff",
    fontWeight: "700",
  },
  callerName: {
    fontSize: 28,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 8,
    textAlign: "center",
  },
  callLabel: {
    fontSize: 16,
    color: "#94a3b8",
  },
  actions: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingBottom: 60,
  },
  declineButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#dc2626",
    justifyContent: "center",
    alignItems: "center",
  },
  answerButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#16a34a",
    justifyContent: "center",
    alignItems: "center",
  },
  buttonIcon: {
    fontSize: 28,
    color: "#fff",
    fontWeight: "700",
  },
  buttonLabel: {
    color: "#fff",
    fontSize: 11,
    marginTop: 2,
  },
});
