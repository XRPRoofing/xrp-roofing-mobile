import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  StatusBar,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CRM_URL, SUPABASE_URL, SUPABASE_ANON_KEY } from './src/config/constants';

type Screen = 'loading' | 'login' | 'home';

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState<any>(null);
  const [voiceStatus, setVoiceStatus] = useState('SDK not loaded');

  useEffect(() => {
    checkExistingSession();
  }, []);

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

  async function handleLogout() {
    await AsyncStorage.removeItem('supabase_session');
    setSession(null);
    setScreen('login');
  }

  async function registerVoice() {
    if (!session?.access_token) return;
    setVoiceStatus('Registering...');
    try {
      const tokenRes = await fetch(`${CRM_URL}/api/voice/token`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!tokenRes.ok) {
        const err = await tokenRes.text();
        setVoiceStatus(`Token error: ${tokenRes.status}`);
        return;
      }
      const { token } = await tokenRes.json();
      setVoiceStatus('Token received - SDK not yet available');
    } catch (error: any) {
      setVoiceStatus(`Error: ${error.message}`);
    }
  }

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

  // Home screen
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />
      <Text style={styles.title}>XRP Roofing</Text>
      <Text style={styles.subtitle}>Mobile Voice Client</Text>

      <View style={styles.statusCard}>
        <Text style={styles.statusLabel}>Logged in as:</Text>
        <Text style={styles.statusValue}>{session?.user?.email || 'Unknown'}</Text>
      </View>

      <View style={styles.statusCard}>
        <Text style={styles.statusLabel}>Voice Status:</Text>
        <Text style={styles.statusValue}>{voiceStatus}</Text>
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
});
