/**
 * lib/state/entityPool.ts
 *
 * Delta-applier for the session entity pool. Flagged in round 1 and
 * carried forward: "attributed_to overwrites on update, numeric_values
 * accumulates on update." This file implements that contract.
 *
 * Mutates the pool in place. Caller owns reference to state.entityPool.
 */

import type { SessionEntity, ClassifierOutput } from '../format/promptInputs';

export function applyEntityDelta(
  pool: SessionEntity[],
  delta: ClassifierOutput['session_entities_delta'],
  nowTs: number,
): void {
  for (const d of delta) {
    const existing = pool.find((e) => e.entity === d.entity);

    if (d.op === 'add' || !existing) {
      // Add path: either explicit add, or a defensive fallback when the
      // classifier produces an "update" for an entity not in the pool.
      pool.push({
        entity: d.entity,
        first_seen_ts: nowTs,
        last_referenced_ts: nowTs,
        attributed_to: d.attributed_to,
        numeric_values: d.numeric_values,
      });
      continue;
    }

    // Update path.
    existing.last_referenced_ts = nowTs;
    if (d.attributed_to !== null) {
      existing.attributed_to = d.attributed_to; // overwrite
    }
    if (d.numeric_values !== null) {
      existing.numeric_values = [
        ...(existing.numeric_values ?? []),
        ...d.numeric_values,
      ]; // accumulate
    }
  }
}
