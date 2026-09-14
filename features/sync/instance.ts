import { getRandomBytes, randomUUID } from 'expo-crypto';

import { supabaseRecordsRemote } from '../../services/supabase/recordsApi';
import { createSyncStore } from './store';

/** Sync for the signed-in account. */
export const useSyncStore = createSyncStore({
  remote: supabaseRecordsRemote(),
  newId: randomUUID,
  random: getRandomBytes,
});
