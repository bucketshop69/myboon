import bs58 from 'bs58'
import { MeteoraClientError } from './errors.js'

export function assertSolanaAddress(value: string, field: string): void {
  try {
    if (bs58.decode(value).length !== 32) throw new Error('invalid public key length')
  } catch (cause) {
    throw new MeteoraClientError('INVALID_ADDRESS', `${field} is not a valid Solana address`, null, cause)
  }
}
