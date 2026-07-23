export type SpotErrorCode =
  | 'INVALID_ADDRESS'
  | 'UPSTREAM_RATE_LIMITED'
  | 'UPSTREAM_UNAVAILABLE'
  | 'UPSTREAM_RESPONSE_INVALID'

export class SpotClientError extends Error {
  constructor(
    public readonly code: SpotErrorCode,
    message: string,
    public readonly status: number | null = null,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'SpotClientError'
  }
}
