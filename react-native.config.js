module.exports = {
  dependencies: {
    '@twilio/voice-react-native-sdk': {
      platforms: {
        android: null, // Disable auto-linking - we handle it manually in MainApplication
      },
    },
  },
};
