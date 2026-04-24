/**
 * lib/routing/suggestionMix.ts
 *
 * Deterministic conversation_state → 3-generator mix. This is our
 * prompt-engineering thesis encoded as code: the model classifies,
 * the table routes. The classifier's own classifier_recommended_mix
 * is logged in the export for post-hoc analysis vs this table's
 * output but does not control flow.
 *
 * One branch on classifier output beyond state: if state=question_asked
 * AND there are 2+ open questions, devote 2 slots to answers instead of
 * the default [answer, talking, fact]. This is the "multi-part question"
 * case flagged in the original PLAN.
 *
 * Adding a new branch here is cheap. Adding a new conversation_state
 * requires updating the classifier prompt enum, this table, and any
 * downstream consumers. Treat the enum as closed without a strategist
 * review.
 */

import type { ConversationState, SuggestionType } from '../types';

type ResolveMixInput = {
  conversation_state: ConversationState;
  open_questions: string[];
};

export type Mix = [SuggestionType, SuggestionType, SuggestionType];

export function resolveMix(classifier: ResolveMixInput): Mix {
  const state = classifier.conversation_state;

  // Multi-part branch: two unanswered questions in one window → 2 answer slots.
  if (state === 'question_asked' && classifier.open_questions.length >= 2) {
    return ['answer', 'answer', 'question'];
  }

  switch (state) {
    case 'question_asked':  return ['answer', 'talking', 'fact'];
    case 'claim_made':      return ['fact', 'talking', 'question'];
    case 'decision_point':  return ['question', 'talking', 'answer'];
    case 'topic_intro':     return ['talking', 'question', 'fact'];
    case 'deep_discussion': return ['talking', 'fact', 'question'];
    case 'lull':            return ['question', 'question', 'question'];
  }
}
