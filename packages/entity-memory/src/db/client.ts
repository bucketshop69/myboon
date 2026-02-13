export interface DatabaseClient {
  // Placeholder DB client interface for future Postgres adapter.
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
}

export function createUnconfiguredClient(): DatabaseClient {
  throw new Error('Database client is not configured. Use repository/service layer for in-memory mode.');
}
