import { supabaseAuthApi } from '../../services/supabase/authApi';
import { createAuthStore } from './store';

/** The app's sign-in state. Null API (no Supabase settings) makes it "unavailable". */
export const useAuthStore = createAuthStore(supabaseAuthApi());

export { accessFor, afterIntro, landingFor } from './routing';
export { formatTzMobile, normalizeTzMobile, phoneProblem, toE164 } from './phone';
export { formatWait, resendWait, RESEND_AFTER_S } from './timing';
export type { AuthResult, AuthSession, AuthStatus } from './store';
