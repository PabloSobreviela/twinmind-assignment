/**
 * lib/types.ts
 *
 * Types shared across rendering, routing, state, and export.
 *
 * Round-1 origin: ConversationState + SuggestionType (extracted when the
 * routing layer landed).
 *
 * Round-4a additions: ChatTurn (export audit type for chat side; the
 * round-5 replay harness consumes this) and SessionMeta. Round-3's Batch
 * type already covers the suggestion-side audit comprehensively.
 *
 * SessionEntity, TranscriptChunk, Tuple, Batch, ClassifierOutput remain
 * co-located in promptInputs.ts. They will likely move here in a future
 * round when the replay harness imports them too — deferred until that
 * trigger fires.
 */

export type ConversationState =
  | 'question_asked'
  | 'claim_made'
  | 'decision_point'
  | 'topic_intro'
  | 'deep_discussion'
  | 'lull';

export type SuggestionType = 'question' | 'talking' | 'answer' | 'fact';

/**
 * Single turn in the chat audit trail. Discriminated on `role`.
 *
 * User turns carry source metadata so the replay harness can correlate
 * card-click chats back to the originating card. source_card_id is
 * optional on the user variant — required by convention when source
 * is 'card_click'; the orchestrator hook (round 4b) is responsible for
 * always setting it when source === 'card_click'. TypeScript does not
 * enforce that constraint at this level (a 3-variant union would, at
 * the cost of an extra branch — deferred).
 *
 * Assistant turns carry timing data — first-token latency is the
 * perceived chat-quality metric (scoring axis #6). Both timing fields
 * are required-by-construction via the discriminated union, so the
 * orchestrator append site cannot forget them.
 */
export type ChatTurn =
  | {
      ts: number;
      role: 'user';
      content: string;
      source: 'card_click' | 'user_question';
      source_card_id?: string;
    }
  | {
      ts: number;
      role: 'assistant';
      content: string;
      latency_to_first_token_ms: number;
      total_stream_duration_ms: number;
    };

export type SessionMeta = {
  session_id: string;
  started_at: string; // ISO 8601
};
