import { Platform } from 'react-native';

if (Platform.OS !== 'web') {
  const { install } = require('react-native-quick-crypto');
  install();
}
