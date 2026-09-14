import { supabaseImportApi } from '../../services/supabase/importApi';
import { createImportStore } from './store';

/** The account's one bulk import. */
export const useImportStore = createImportStore(supabaseImportApi());
