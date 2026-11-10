// Google Sign-In is Android-only. Leaving the iOS pod out keeps the
// TestFlight binary free of the Google SDK and its URL scheme.
module.exports = {
  dependencies: {
    '@react-native-google-signin/google-signin': {
      platforms: {
        ios: null,
      },
    },
  },
};
