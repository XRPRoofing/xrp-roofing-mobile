import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAuth } from "../hooks/useAuth";
import { useVoice } from "../hooks/useVoice";
import LoginScreen from "../screens/LoginScreen";
import HomeScreen from "../screens/HomeScreen";
import IncomingCallScreen from "../screens/IncomingCallScreen";
import ActiveCallScreen from "../screens/ActiveCallScreen";
import { View, ActivityIndicator, StyleSheet } from "react-native";

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  const { session, loading } = useAuth();
  const { callState, callerName, isMuted, answer, decline, hangup, mute } = useVoice();

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  // Show call screens as overlays regardless of auth state
  if (callState === "ringing") {
    return (
      <IncomingCallScreen
        callerName={callerName}
        onAnswer={answer}
        onDecline={decline}
      />
    );
  }

  if (callState === "connected") {
    return (
      <ActiveCallScreen
        callerName={callerName}
        isMuted={isMuted}
        onMute={mute}
        onHangup={hangup}
      />
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!session ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : (
          <Stack.Screen name="Home" component={HomeScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0f172a",
  },
});
