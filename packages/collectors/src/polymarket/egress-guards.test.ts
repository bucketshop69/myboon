import assert from 'node:assert/strict'
import test from 'node:test'
import { POLYMARKET_ENTITY_MANAGER_RESEARCH_SELECT } from '../entity-manager/run-polymarket'
import { POLYMARKET_EDITOR_PENDING_RESEARCH_SELECT } from './editor'
import { POLYMARKET_PUBLISHER_RESEARCH_SELECT } from './publisher'
import { POLYMARKET_RESEARCHER_PRIOR_RESEARCH_SELECT } from './researcher'

const HOT_RESEARCH_SELECTS = [
  ['editor pending research', POLYMARKET_EDITOR_PENDING_RESEARCH_SELECT],
  ['publisher linked research', POLYMARKET_PUBLISHER_RESEARCH_SELECT],
  ['entity manager pending research', POLYMARKET_ENTITY_MANAGER_RESEARCH_SELECT],
  ['researcher prior research', POLYMARKET_RESEARCHER_PRIOR_RESEARCH_SELECT],
] as const

test('hot polymarket worker research selectors do not fetch related_context', () => {
  for (const [label, select] of HOT_RESEARCH_SELECTS) {
    assert.doesNotMatch(select, /\brelated_context\b/, label)
  }
})
