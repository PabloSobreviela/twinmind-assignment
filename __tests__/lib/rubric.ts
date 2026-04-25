/**
 * __tests__/lib/rubric.ts
 *
 * The executable quality bar for live suggestions. Each function targets
 * a specific failure mode observed in development or required by the
 * round-2 specificity contract. Consumed by the replay harness to
 * validate hand-authored expected outputs (always) and live runBatch
 * outputs (when LIVE=1).
 *
 * SCOPING DISCIPLINE
 * Some rubrics apply universally; others are scoped to specific card
 * types or conversation states. Each function's JSDoc states its scope
 * and the failure mode it targets. The harness's assertBatchPassesRubric
 * applies them with the correct gating.
 */

import type { Card } from '@/lib/api/pipeline';
import type { ConversationState } from '@/lib/types';

/**
 * Specificity rubric. Encodes the round-2 specificity contract: every
 * preview must carry a concrete grounding signal — a digit, a controlled
 * status word from the fact generator's vocabulary, or a multi-character
 * word from the card's tuple.entity (lowercase match into preview).
 *
 * SCOPE: all card types in NON-LULL states. Lull cards are generic by
 * design; applying specificity to them would force fabrication.
 *
 * CATCHES: vague advice that could apply to any meeting.
 */
export function hasSpecific(card: Card): boolean {
  const preview = card.preview;
  if (/\d/.test(preview)) return true;
  if (/\b(Verified|Disputed|Needs caveat|Unclear)\b/i.test(preview)) return true;
  const entity = card.tuple?.entity;
  if (typeof entity === 'string' && entity.length > 0) {
    const entityWords = entity
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length >= 4);
    const previewLower = preview.toLowerCase();
    if (entityWords.some((w) => previewLower.includes(w))) return true;
  }
  return false;
}

/**
 * Anti-fabrication rubric. Numeric tokens in card preview must appear
 * verbatim in the rolling-window transcript text. Catches the "95%
 * uptime" cascade observed in dev: lull-mode prompt under sparse input
 * pressure invented fictional uptime claims.
 *
 * SCOPE: applied at call site to question + answer card types ONLY.
 * Talking and fact cards' VALUE is precisely surfacing numbers from
 * outside the transcript per the round-2 contract — applying this to
 * them would reject cards doing their job.
 *
 * The harness handles the type gate; the rubric function itself is
 * type-agnostic.
 *
 * CATCHES: fabricated digits, percentages, dollar amounts, kKMB suffixes.
 * MISSES: fabricated proper nouns and made-up product names.
 */
export function noFabricatedNumbers(card: Card, transcriptText: string): boolean {
  const tokens = card.preview.match(/\$?\d+(?:[.,]\d+)?[%kKMBmsx]?/g);
  if (!tokens) return true;
  return tokens.every((token) => transcriptText.includes(token));
}

/**
 * Mix-shape rubric. Exactly 3 cards. Non-lull requires ≥2 distinct types.
 * Lull explicitly allows [question, question, question] per round-2
 * routing.
 *
 * SCOPE: universal. Pairs with the harness's resolveMix sanity check.
 *
 * CATCHES: schema-drift in batch shape, accidental triple-same outside lull.
 */
export function isValidMix(cards: Card[], state: ConversationState): boolean {
  if (cards.length !== 3) return false;
  if (state === 'lull') return true;
  const distinctTypes = new Set(cards.map((c) => c.type));
  return distinctTypes.size >= 2;
}

/**
 * Tuple-validity rubric. Non-empty entity and core_claim strings.
 *
 * SCOPE: universal.
 *
 * CATCHES: generator output that satisfies JSON shape but provides
 * empty tuple fields (which would silently break anti-repetition feed).
 */
export function hasValidTuple(card: Card): boolean {
  return (
    typeof card.tuple === 'object' &&
    card.tuple !== null &&
    typeof card.tuple.entity === 'string' &&
    card.tuple.entity.trim().length > 0 &&
    typeof card.tuple.core_claim === 'string' &&
    card.tuple.core_claim.trim().length > 0
  );
}

/**
 * Preview-length rubric. ≤160 chars per round-2 spec.
 *
 * SCOPE: universal.
 *
 * CATCHES: previews that grow past visual budget, signaling generator
 * is producing full_context content in the preview slot.
 */
export function isPreviewLengthValid(card: Card): boolean {
  return typeof card.preview === 'string' && card.preview.length <= 160;
}
