import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  StatusBar,
  Vibration,
  Platform,
  PermissionsAndroid,
  NativeModules,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WebView } from 'react-native-webview';
import { CRM_URL, SUPABASE_URL, SUPABASE_ANON_KEY } from './src/config/constants';
import { voiceHtml } from './src/voiceHtml';

type Screen = 'loading' | 'login' | 'home' | 'incoming' | 'active';

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState<any>(null);
  const [voiceStatus, setVoiceStatus] = useState('Initializing...');
  const [callerInfo, setCallerInfo] = useState('Unknown');
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const webViewRef = useRef<WebView>(null);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    checkExistingSession();
  }, []);

  useEffect(() => {
    if (screen === 'active') {
      timerRef.current = setInterval(() => {
        setCallDuration(d => d + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setCallDuration(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [screen]);

  async function checkExistingSession() {
    try {
      const stored = await AsyncStorage.getItem('supabase_session');
      if (stored) {
        const parsed = JSON.parse(stored);
        setSession(parsed);
        setScreen('home');
      } else {
        setScreen('login');
      }
    } catch {
      setScreen('login');
    }
  }

  async function handleLogin() {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter email and password');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        Alert.alert('Login Failed', data.error_description || data.msg || 'Invalid credentials');
        return;
      }

      await AsyncStorage.setItem('supabase_session', JSON.stringify(data));
      setSession(data);
      setScreen('home');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Network error');
    } finally {
      setLoading(false);
    }
  }

  async function startBackgroundService() {
    try {
      // Request notification permission on Android 13+
      if (Platform.OS === 'android' && Platform.Version >= 33) {
        const granted = await PermissionsAndroid.request(
          'android.permission.POST_NOTIFICATIONS' as any,
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          // Permission denied — skip service but don't crash
          return;
        }
      }
      // Small delay to ensure everything is stable
      setTimeout(() => {
        try { NativeModules.CallServiceModule?.startService(); } catch (e) {}
      }, 1000);
    } catch (e) {
      // Silently fail — foreground service is non-critical for basic functionality
    }
  }

  async function handleLogout() {
    sendToWebView({ command: 'hangup' });
    try { NativeModules.CallServiceModule?.stopService(); } catch (e) {}
    await AsyncStorage.removeItem('supabase_session');
    setSession(null);
    setVoiceStatus('Initializing...');
    setScreen('login');
  }

  function sendToWebView(msg: object) {
    webViewRef.current?.postMessage(JSON.stringify(msg));
  }

  async function registerVoice() {
    if (!session?.access_token) return;
    setVoiceStatus('Fetching token...');
    try {
      const tokenRes = await fetch(`${CRM_URL}/api/voice/token`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ platform: 'android' }),
      });
      if (!tokenRes.ok) {
        setVoiceStatus(`Token error: ${tokenRes.status}`);
        return;
      }
      const { token } = await tokenRes.json();
      setVoiceStatus('Registering with Twilio...');
      sendToWebView({ command: 'setup', token });
    } catch (error: any) {
      setVoiceStatus(`Error: ${error.message}`);
    }
  }

  function handleWebViewMessage(event: any) {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      switch (msg.type) {
        case 'status':
          setVoiceStatus(msg.data.message);
          if (msg.data.state === 'loaded' && session?.access_token) {
            // Auto-register when WebView is ready
            setTimeout(() => registerVoice(), 500);
          }
          if (msg.data.state === 'ready') {
            // Start foreground service to keep connection alive when locked
            startBackgroundService();
          }
          break;
        case 'incoming':
          setCallerInfo(msg.data.from);
          setScreen('incoming');
          Vibration.vibrate([0, 500, 200, 500, 200, 500, 200, 500], true);
          break;
        case 'callState':
          if (msg.data.state === 'connected') {
            Vibration.cancel();
            setScreen('active');
          } else if (msg.data.state === 'disconnected' || msg.data.state === 'cancelled') {
            Vibration.cancel();
            setIsMuted(false);
            setScreen('home');
          }
          break;
      }
    } catch (e) {
      // ignore
    }
  }

  function handleAccept() {
    Vibration.cancel();
    sendToWebView({ command: 'accept' });
  }

  function handleReject() {
    Vibration.cancel();
    sendToWebView({ command: 'reject' });
    setScreen('home');
  }

  function handleHangup() {
    sendToWebView({ command: 'hangup' });
    setIsMuted(false);
    setScreen('home');
  }

  function handleToggleMute() {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    sendToWebView({ command: 'mute', muted: newMuted });
  }

  function formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  // Hidden WebView for Twilio Voice JS SDK
  const voiceWebView = session ? (
    <WebView
      ref={webViewRef}
      source={{ html: voiceHtml, baseUrl: 'https://sdk.twilio.com' }}
      onMessage={handleWebViewMessage}
      javaScriptEnabled={true}
      domStorageEnabled={true}
      mediaPlaybackRequiresUserAction={false}
      allowsInlineMediaPlayback={true}
      style={{ width: 0, height: 0, position: 'absolute', opacity: 0 }}
    />
  ) : null;

  if (screen === 'loading') {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />
        <ActivityIndicator size="large" color="#4fc3f7" />
      </View>
    );
  }

  if (screen === 'login') {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />
        <Text style={styles.title}>XRP Roofing</Text>
        <Text style={styles.subtitle}>Mobile Voice Client</Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#888"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#888"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Login</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  }

  if (screen === 'incoming') {
    return (
      <View style={styles.incomingContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />
        {voiceWebView}
        <Text style={styles.incomingLabel}>Incoming Call</Text>
        <Text style={styles.callerName}>{callerInfo}</Text>
        <View style={styles.callActions}>
          <TouchableOpacity style={styles.rejectButton} onPress={handleReject}>
            <Text style={styles.callButtonText}>Decline</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.acceptButton} onPress={handleAccept}>
            <Text style={styles.callButtonText}>Answer</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (screen === 'active') {
    return (
      <View style={styles.activeContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />
        {voiceWebView}
        <Text style={styles.activeLabel}>On Call</Text>
        <Text style={styles.callerName}>{callerInfo}</Text>
        <Text style={styles.duration}>{formatDuration(callDuration)}</Text>
        <View style={styles.callActions}>
          <TouchableOpacity
            style={[styles.muteButton, isMuted && styles.muteActive]}
            onPress={handleToggleMute}>
            <Text style={styles.callButtonText}>{isMuted ? 'Unmute' : 'Mute'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.hangupButton} onPress={handleHangup}>
            <Text style={styles.callButtonText}>End Call</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Home screen
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />
      {voiceWebView}
      <Text style={styles.title}>XRP Roofing</Text>
      <Text style={styles.subtitle}>Mobile Voice Client</Text>

      <View style={styles.statusCard}>
        <Text style={styles.statusLabel}>Logged in as:</Text>
        <Text style={styles.statusValue}>{session?.user?.email || 'Unknown'}</Text>
      </View>

      <View style={styles.statusCard}>
        <Text style={styles.statusLabel}>Voice Status:</Text>
        <Text style={[
          styles.statusValue,
          voiceStatus.includes('Ready') && styles.statusReady,
          voiceStatus.includes('Error') && styles.statusError,
        ]}>{voiceStatus}</Text>
      </View>

      <TouchableOpacity style={styles.button} onPress={registerVoice}>
        <Text style={styles.buttonText}>Register for Calls</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.button, styles.logoutButton]} onPress={handleLogout}>
        <Text style={styles.buttonText}>Logout</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#aaa',
    marginBottom: 32,
  },
  input: {
    width: '100%',
    backgroundColor: '#16213e',
    borderRadius: 8,
    padding: 14,
    marginBottom: 12,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  button: {
    width: '100%',
    backgroundColor: '#4fc3f7',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  logoutButton: {
    backgroundColor: '#e74c3c',
    marginTop: 24,
  },
  statusCard: {
    width: '100%',
    backgroundColor: '#16213e',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  statusLabel: {
    color: '#888',
    fontSize: 12,
    marginBottom: 4,
  },
  statusValue: {
    color: '#4fc3f7',
    fontSize: 16,
    fontWeight: '500',
  },
  statusReady: {
    color: '#4caf50',
  },
  statusError: {
    color: '#e74c3c',
  },
  // Incoming call screen
  incomingContainer: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  incomingLabel: {
    fontSize: 18,
    color: '#aaa',
    marginBottom: 16,
  },
  callerName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 48,
    textAlign: 'center',
  },
  callActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
  },
  acceptButton: {
    backgroundColor: '#4caf50',
    borderRadius: 40,
    paddingVertical: 18,
    paddingHorizontal: 32,
    minWidth: 120,
    alignItems: 'center',
  },
  rejectButton: {
    backgroundColor: '#e74c3c',
    borderRadius: 40,
    paddingVertical: 18,
    paddingHorizontal: 32,
    minWidth: 120,
    alignItems: 'center',
  },
  callButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  // Active call screen
  activeContainer: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  activeLabel: {
    fontSize: 18,
    color: '#4caf50',
    marginBottom: 16,
  },
  duration: {
    fontSize: 36,
    color: '#fff',
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier',
    marginBottom: 48,
  },
  muteButton: {
    backgroundColor: '#555',
    borderRadius: 40,
    paddingVertical: 18,
    paddingHorizontal: 32,
    minWidth: 120,
    alignItems: 'center',
  },
  muteActive: {
    backgroundColor: '#ff9800',
  },
  hangupButton: {
    backgroundColor: '#e74c3c',
    borderRadius: 40,
    paddingVertical: 18,
    paddingHorizontal: 32,
    minWidth: 120,
    alignItems: 'center',
  },
});
