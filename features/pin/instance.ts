import { getRandomBytes } from 'expo-crypto';

import { localKeys } from '../../services/keyStore';
import { supabasePinApi } from '../../services/supabase/pinApi';
import { createPinStore } from './store';

/** The PIN and account key for the signed-in account. */
export const usePinStore = createPinStore(supabasePinApi(), localKeys, getRandomBytes);
