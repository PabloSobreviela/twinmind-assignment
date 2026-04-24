/**
 * lib/types.ts
 *
 * Types shared across rendering and routing. Extracted from
 * promptInputs.ts when the routing layer landed — per the original
 * co-location rule ("extract when more than one other file imports
 * them"), that trigger hit this round.
 *
 * SessionEntity, TranscriptChunk, Tuple, Batch, ClassifierOutput remain
 * co-located in promptInputs.ts — they are primarily input types for
 * the renderers. When the Zustand store and replay harness land and
 * start importing them, move those too.
 */

export type ConversationState =
  | 'question_asked'
  | 'claim_made'
  | 'decision_point'
  | 'topic_intro'
  | 'deep_discussion'
  | 'lull';

export type SuggestionType = 'question' | 'talking' | 'answer' | 'fact';
