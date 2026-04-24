/**
 * Tests for the session-entity delta-applier.
 * Verifies the round-1 contract: attributed_to overwrites on update,
 * numeric_values accumulates on update.
 */

import { describe, it, expect } from 'vitest';
import { applyEntityDelta } from '../lib/state/entityPool';
import type { SessionEntity, ClassifierOutput } from '../lib/format/promptInputs';

describe('applyEntityDelta', () => {
  it('adds a new entity with first_seen and last_referenced = nowTs', () => {
    const pool: SessionEntity[] = [];
    const delta: ClassifierOutput['session_entities_delta'] = [
      { entity: 'MSK', op: 'add', attributed_to: null, numeric_values: null },
    ];
    applyEntityDelta(pool, delta, 525);
    expect(pool).toEqual([
      { entity: 'MSK', first_seen_ts: 525, last_referenced_ts: 525, attributed_to: null, numeric_values: null },
    ]);
  });

  it('updates existing: attributed_to overwrites, last_referenced_ts advances', () => {
    const pool: SessionEntity[] = [
      { entity: 'Kafka', first_seen_ts: 100, last_referenced_ts: 200, attributed_to: null, numeric_values: null },
    ];
    const delta: ClassifierOutput['session_entities_delta'] = [
      { entity: 'Kafka', op: 'update', attributed_to: 'Ravi', numeric_values: null },
    ];
    applyEntityDelta(pool, delta, 500);
    expect(pool[0]).toEqual({
      entity: 'Kafka',
      first_seen_ts: 100,
      last_referenced_ts: 500,
      attributed_to: 'Ravi',
      numeric_values: null,
    });
  });

  it('updates existing: numeric_values accumulates across deltas', () => {
    const pool: SessionEntity[] = [
      { entity: 'Kafka', first_seen_ts: 100, last_referenced_ts: 200, attributed_to: null, numeric_values: ['400k events/sec'] },
    ];
    const delta: ClassifierOutput['session_entities_delta'] = [
      { entity: 'Kafka', op: 'update', attributed_to: null, numeric_values: ['1M events/sec ceiling'] },
    ];
    applyEntityDelta(pool, delta, 500);
    expect(pool[0].numeric_values).toEqual(['400k events/sec', '1M events/sec ceiling']);
  });

  it('falls back to add when op=update targets an entity not in the pool', () => {
    const pool: SessionEntity[] = [];
    const delta: ClassifierOutput['session_entities_delta'] = [
      { entity: 'Mystery', op: 'update', attributed_to: 'someone', numeric_values: ['42%'] },
    ];
    applyEntityDelta(pool, delta, 800);
    expect(pool).toEqual([
      { entity: 'Mystery', first_seen_ts: 800, last_referenced_ts: 800, attributed_to: 'someone', numeric_values: ['42%'] },
    ]);
  });
});
