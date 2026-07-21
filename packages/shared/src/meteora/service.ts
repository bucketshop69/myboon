import { MeteoraDataApiClient } from './data-api.js'
import { MeteoraSdkClient } from './sdk-client.js'
import type { MeteoraClientConfig } from './types.js'

export class MeteoraClient {
  readonly data: MeteoraDataApiClient
  readonly sdk: MeteoraSdkClient | null

  constructor(config: MeteoraClientConfig = {}) {
    this.data = new MeteoraDataApiClient(config)
    this.sdk = config.rpcUrl ? new MeteoraSdkClient(config) : null
  }

  clearCache(): void {
    this.data.clearCache()
    this.sdk?.clearPoolCache()
  }
}

