// Web: browser crypto is already available — no polyfill needed.

// Some Solana SDK dependencies (e.g. @solana/spl-token-metadata, pulled in by
// Meteora's @meteora-ag/dlmm) reference the bare Node global `Buffer` without
// importing it themselves. Native gets this via React Native's environment;
// web does not, so it must be installed globally before those modules load.
import { Buffer } from 'buffer';

if (typeof global.Buffer === 'undefined') {
  global.Buffer = Buffer;
}
