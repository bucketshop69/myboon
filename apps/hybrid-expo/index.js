// Privy required polyfills (must be imported before anything else)
import 'fast-text-encoding';
import 'react-native-get-random-values';
import '@ethersproject/shims';

// Existing polyfill (react-native-quick-crypto)
import './polyfill';

import 'expo-router/entry';
