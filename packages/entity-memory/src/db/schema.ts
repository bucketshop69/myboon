// This package currently ships SQL migrations as source-of-truth.
// This file exists as a future Drizzle/Kysely schema entry point.
export const schema = {
  entities: 'entities',
  representations: 'representations',
  entityEvents: 'entity_events',
  entityResearch: 'entity_research'
} as const;
