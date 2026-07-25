import { SealService, parseSealRing } from '@docflow/crypto';
import type { Provider } from '@nestjs/common';
import { env } from '../config/env.js';

/**
 * SealService as a Nest singleton, built from the validated env ring. Deep
 * validation (exactly one active key, unique kids, parseable PEM) happens in
 * parseSealRing at boot, so a bad ring fails the process on startup, never at
 * signing time.
 */
export const SealProvider: Provider = {
  provide: SealService,
  useFactory: () => new SealService(parseSealRing(env.ESIGN_SEAL_KEYS)),
};
