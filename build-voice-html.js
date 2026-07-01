const fs = require('fs');
const sdk = fs.readFileSync('./src/assets/twilio-voice-sdk.js', 'utf8');

const voiceLogic = `
  var device = null;
  var currentConnection = null;

  function sendToRN(type, data) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: type, data: data }));
  }

  function setupDevice(token) {
    try {
      if (typeof Twilio === 'undefined') {
        sendToRN('status', { state: 'error', message: 'Twilio SDK failed to initialize' });
        return;
      }
      device = new Twilio.Device(token, {
        codecPreferences: ['opus', 'pcmu'],
        enableRingingState: true,
      });

      device.on('registered', function() {
        sendToRN('status', { state: 'ready', message: 'Ready to receive calls' });
      });

      device.on('error', function(error) {
        sendToRN('status', { state: 'error', message: 'Twilio: ' + (error.message || error.toString()) });
      });

      device.on('incoming', function(call) {
        currentConnection = call;
        var from = call.parameters.From || 'Unknown';
        sendToRN('incoming', { from: from });

        call.on('accept', function() {
          sendToRN('callState', { state: 'connected' });
        });

        call.on('disconnect', function() {
          currentConnection = null;
          sendToRN('callState', { state: 'disconnected' });
        });

        call.on('cancel', function() {
          currentConnection = null;
          sendToRN('callState', { state: 'cancelled' });
        });
      });

      device.register();
      sendToRN('status', { state: 'connecting', message: 'Registering with Twilio...' });
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
const tsContent = `// Auto-generated - do not edit manually\n// Contains embedded Twilio Voice SDK + bridge logic\nexport const voiceHtml = ${JSON.stringify(html)};\n`;
fs.writeFileSync('./src/voiceHtml.ts', tsContent);
console.log('voiceHtml.ts generated:', (tsContent.length / 1024).toFixed(0) + 'KB');
