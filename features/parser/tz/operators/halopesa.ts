import { HALOPESA_PATTERNS } from '../patterns';
import { createOperatorParser } from './base';

/** HaloPesa: the modern structured transfer and the shared send layout (§19-§21). */
export const halopesaParser = createOperatorParser(HALOPESA_PATTERNS);
