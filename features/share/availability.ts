import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';

/**
 * Whether another app can share a message to PesaIQ. Android's share sheet
 * needs native code that only an installed build carries (expo-share-intent);
 * Expo Go and the web can't, and there the app works as before, pasting only.
 * iOS is not set up yet.
 */
export const SHARE_AVAILABLE = Platform.OS === 'android' && !isRunningInExpoGo();
