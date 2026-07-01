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
      // Check what's available on Twilio global
      if (typeof Twilio === 'undefined') {
        sendToRN('status', { state: 'error', message: 'Twilio global not found' });
        return;
      }

      var DeviceClass = Twilio.Device;
      if (!DeviceClass) {
        sendToRN('status', { state: 'error', message: 'Twilio.Device not found' });
        return;
      }

      // Voice SDK 2.x constructor
      device = new DeviceClass(token, {
        logLevel: 1,
        allowIncomingWhileBusy: true,
      });

      device.on('registered', function() {
        sendToRN('status', { state: 'ready', message: 'Ready to receive calls' });
      });

      device.on('registering', function() {
        sendToRN('status', { state: 'connecting', message: 'Registering...' });
      });

      device.on('unregistered', function() {
        sendToRN('status', { state: 'error', message: 'Unregistered from Twilio' });
      });

      device.on('error', function(twilioError) {
        var msg = 'Unknown error';
        if (twilioError && twilioError.message) {
          msg = twilioError.message;
        } else if (twilioError && twilioError.originalError) {
          msg = twilioError.originalError.message || String(twilioError.originalError);
        } else if (typeof twilioError === 'string') {
          msg = twilioError;
        }
        sendToRN('status', { state: 'error', message: 'Error: ' + msg });
      });

      device.on('incoming', function(call) {
        currentConnection = call;
        var from = call.parameters ? (call.parameters.From || 'Unknown') : 'Unknown';
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

        call.on('reject', function() {
          currentConnection = null;
          sendToRN('callState', { state: 'disconnected' });
        });
      });

      // Register for incoming calls - returns a Promise in v2.x
      sendToRN('status', { state: 'connecting', message: 'Registering with Twilio...' });
      
      var registerPromise = device.register();
      if (registerPromise && typeof registerPromise.then === 'function') {
        registerPromise.then(function() {
          // registered event will fire
        }).catch(function(err) {
          sendToRN('status', { state: 'error', message: 'Register failed: ' + (err.message || err) });
        });
      }

      // Timeout: if not registered after 15 seconds, report
      setTimeout(function() {
        if (device && device.state !== 'registered') {
          sendToRN('status', { state: 'error', message: 'Registration timeout - state: ' + (device.state || 'unknown') });
        }
      }, 15000);

    } catch (e) {
      sendToRN('status', { state: 'error', message: 'Setup error: ' + e.message + ' | stack: ' + (e.stack || '').substring(0, 200) });
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
