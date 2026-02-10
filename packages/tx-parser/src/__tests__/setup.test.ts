import { describe, expect, it } from 'vitest';

import { VERIFIED_PROGRAM_IDS } from '../constants/programIds.js';

describe('tx-parser setup', () => {
  it('contains verified protocol IDs', () => {
    expect(VERIFIED_PROGRAM_IDS.JUPITER_V6).toBeDefined();
    expect(VERIFIED_PROGRAM_IDS.METEORA_DLMM).toBeDefined();
  });
});
