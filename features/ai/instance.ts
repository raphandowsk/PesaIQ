import { supabaseAiReader } from '../../services/supabase/aiApi';

/** AI reading for the app: null in a build without Supabase settings. */
export const aiReader = supabaseAiReader();
