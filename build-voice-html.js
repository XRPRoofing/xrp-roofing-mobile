const fs = require('fs');
const sdk = fs.readFileSync('./src/assets/twilio-voice-sdk.js', 'utf8');

const voiceLogic = `
  var device = null;
  var currentConnection = null;

  function sendToRN(type, data) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: type, data: data }));
  }

  // Catch all unhandled errors
  window.onerror = function(msg, url, line) {
    sendToRN('status', { state: 'error', message: 'JS Error: ' + msg });
  };
  window.addEventListener('unhandledrejection', function(event) {
    sendToRN('status', { state: 'error', message: 'Async Error: ' + (event.reason ? event.reason.message || event.reason : 'unknown') });
  });

  function setupDevice(token) {
    try {
      if (typeof Twilio === 'undefined' || !Twilio.Device) {
        sendToRN('status', { state: 'error', message: 'Twilio SDK not available' });
        return;
      }

      // Twilio Client SDK 1.x API
      device = new Twilio.Device(token, {
        codecPreferences: ['opus', 'pcmu'],
        enableRingingState: true,
      });

      device.on('ready', function() {
        sendToRN('status', { state: 'ready', message: 'Ready to receive calls' });
      });

      device.on('error', function(error) {
        var msg = error.message || error.code || String(error);
        sendToRN('status', { state: 'error', message: 'Twilio: ' + msg });
      });

      device.on('incoming', function(connection) {
        currentConnection = connection;
        var from = connection.parameters.From || 'Unknown';
        sendToRN('incoming', { from: from, callSid: connection.parameters.CallSid });

        connection.on('accept', function() {
          sendToRN('callState', { state: 'connected' });
        });

        connection.on('disconnect', function() {
          currentConnection = null;
          sendToRN('callState', { state: 'disconnected' });
        });

        connection.on('cancel', function() {
          currentConnection = null;
          sendToRN('callState', { state: 'cancelled' });
        });
      });

      device.on('disconnect', function() {
        currentConnection = null;
        sendToRN('callState', { state: 'disconnected' });
      });

      device.on('offline', function() {
        sendToRN('status', { state: 'error', message: 'Device went offline' });
      });

      sendToRN('status', { state: 'connecting', message: 'Registering with Twilio...' });

      // Timeout: if not ready after 20 seconds, report
      setTimeout(function() {
        if (device && device.status() !== 'ready') {
          sendToRN('status', { state: 'error', message: 'Registration timeout - status: ' + (device.status ? device.status() : 'unknown') });
        }
      }, 20000);

    } catch (e) {
      sendToRN('status', { state: 'error', message: 'Setup error: ' + e.message });
    }
  }

  function acceptCall() {
    if (currentConnection) { currentConnection.accept(); }
  }

  function rejectCall() {
    if (currentConnection) { currentConnection.reject(); currentConnection = null; }
  }

  function hangupCall() {
    if (currentConnection) { currentConnection.disconnect(); currentConnection = null; }
    if (device) { device.disconnectAll(); }
  }

  function toggleMute(muted) {
    if (currentConnection) { currentConnection.mute(muted); }
  }

  function handleCommand(msg) {
    switch (msg.command) {
      case 'setup': setupDevice(msg.token); break;
      case 'accept': acceptCall(); break;
      case 'reject': rejectCall(); break;
      case 'hangup': hangupCall(); break;
      case 'mute': toggleMute(msg.muted); break;
    }
  }

  document.addEventListener('message', function(event) {
    try { handleCommand(JSON.parse(event.data)); } catch(e) {}
  });
  window.addEventListener('message', function(event) {
    try { handleCommand(JSON.parse(event.data)); } catch(e) {}
  });

  sendToRN('status', { state: 'loaded', message: 'Voice bridge ready' });
`;

const html = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><script>${sdk}</script><script>${voiceLogic}</script></body></html>`;

// Write as a TS module
const tsContent = `// Auto-generated - do not edit manually\n// Contains embedded Twilio Client SDK 1.14.0 + bridge logic\nexport const voiceHtml = ${JSON.stringify(html)};\n`;
fs.writeFileSync('./src/voiceHtml.ts', tsContent);
console.log('voiceHtml.ts generated:', (tsContent.length / 1024).toFixed(0) + 'KB');
