/**
 * The one Supabase client.
 *
 * Its address and publishable key come from `.env` (EXPO_PUBLIC_*, inlined
 * when the app is bundled; see .env.example). The publishable key is meant to
 * ship: row-level security decides what it reaches. A build without them has
 * no client, and sign-in reports itself unavailable instead of failing later.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform } from 'react-native';

import { chunkedStorage } from '../../features/auth/chunkedStorage';

let client: SupabaseClient | null | undefined;

export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;

  // Written out in full so Expo can inline them at bundle time.
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    client = null;
    return client;
  }

  const native = Platform.OS !== 'web';
  const created = createClient(url, key, {
    auth: {
      // The phone's secure storage; the web preview keeps the default (the browser).
      ...(native ? { storage: chunkedStorage(SecureStore) } : {}),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });

  // Refresh the session only while the app is in front, as Supabase advises
  // for React Native.
  if (native) {
    AppState.addEventListener('change', (state) => {
      if (state === 'active') void created.auth.startAutoRefresh();
      else void created.auth.stopAutoRefresh();
    });
  }

  client = created;
  return client;
}
