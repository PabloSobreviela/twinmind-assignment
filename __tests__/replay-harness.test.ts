/**
 * __tests__/replay-harness.test.ts
 *
 * Replay harness: validates each fixture's hand-authored expected output
 * passes the rubric. Default mode requires no Groq access.
 *
 * LIVE mode: when LIVE=1 with GROQ_API_KEY set, also calls real runBatch
 * and asserts the live output passes the same rubric. Round-5a ships
 * one fixture as proof-of-pattern; round-5b extends to all five.
 *
 * 8 new test cases (4 single-batch fixtures + 4 segments of fixture 5).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  hasSpecific,
  noFabricatedNumbers,
  isValidMix,
  hasValidTuple,
  isPreviewLengthValid,
} from './lib/rubric';
import { resolveMix } from '../lib/routing/suggestionMix';
import { runBatch, type Card, type PipelineState } from '../lib/api/pipeline';
import type {
  ClassifierOutput,
  TranscriptChunk,
} from '../lib/format/promptInputs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURES_DIR = join(__dirname, 'fixtures');

const LIVE = process.env.LIVE === '1';

type FixtureSettings = {
  rollingWindowSeconds: number;
  antiRepetitionBatchCount: number;
  fullSessionCharLimit: number;
};

type SingleBatchFixture = {
  name: string;
  description: string;
  input: { transcript: TranscriptChunk[]; settings: FixtureSettings };
  expected: { classifier: ClassifierOutput; cards: Card[] };
};

type MultiSegmentFixture = {
  name: string;
  description: string;
  segments: Array<{
    label: string;
    input: { transcript: TranscriptChunk[]; settings: FixtureSettings };
    expected: { classifier: ClassifierOutput; cards: Card[] };
  }>;
};

function loadFixture<T>(filename: string): T {
  const path = join(FIXTURES_DIR, filename);
  try {
    const content = readFileSync(path, 'utf-8');
    return JSON.parse(content) as T;
  } catch (err) {
    throw new Error(
      `Failed to load fixture ${filename}: ${(err as Error).message}`,
    );
  }
}

function transcriptText(transcript: TranscriptChunk[]): string {
  return transcript.map((c) => c.chunk).join(' ');
}

function assertBatchPassesRubric(
  cards: Card[],
  classifier: ClassifierOutput,
  transcript: TranscriptChunk[],
  label: string,
): void {
  expect(
    isValidMix(cards, classifier.conversation_state),
    `${label}: isValidMix (3 cards, ≥2 distinct types unless lull)`,
  ).toBe(true);

  const cardTypes = cards.map((c) => c.type).slice().sort();
  const expectedMix = resolveMix(classifier).slice().sort();
  expect(
    cardTypes,
    `${label}: card types must match resolveMix(${classifier.conversation_state})`,
  ).toEqual(expectedMix);

  const text = transcriptText(transcript);

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const cardLabel = `${label}: card[${i}] type=${card.type}`;

    expect(hasValidTuple(card), `${cardLabel}: hasValidTuple`).toBe(true);
    expect(
      isPreviewLengthValid(card),
      `${cardLabel}: isPreviewLengthValid (≤160 chars)`,
    ).toBe(true);

    // noFabricatedNumbers ONLY for question + answer types.
    if (card.type === 'question' || card.type === 'answer') {
      expect(
        noFabricatedNumbers(card, text),
        `${cardLabel}: noFabricatedNumbers (numeric tokens must appear in transcript)`,
      ).toBe(true);
    }

    // hasSpecific applies in non-lull states only.
    if (classifier.conversation_state !== 'lull') {
      expect(
        hasSpecific(card),
        `${cardLabel}: hasSpecific (digit, status word, or entity word)`,
      ).toBe(true);
    }
  }
}

describe('replay harness — fixture quality bar', () => {
  describe('01 technical pitch (claim_made)', () => {
    const fixture = loadFixture<SingleBatchFixture>('01-technical-pitch.json');
    it('expected output passes rubric', () => {
      assertBatchPassesRubric(
        fixture.expected.cards,
        fixture.expected.classifier,
        fixture.input.transcript,
        fixture.name,
      );
    });
  });

  describe('02 decision meeting (decision_point)', () => {
    const fixture = loadFixture<SingleBatchFixture>('02-decision-meeting.json');
    it('expected output passes rubric', () => {
      assertBatchPassesRubric(
        fixture.expected.cards,
        fixture.expected.classifier,
        fixture.input.transcript,
        fixture.name,
      );
    });
  });

  describe('03 qa open question (question_asked)', () => {
    const fixture = loadFixture<SingleBatchFixture>('03-qa-open-question.json');
    it('expected output passes rubric', () => {
      assertBatchPassesRubric(
        fixture.expected.cards,
        fixture.expected.classifier,
        fixture.input.transcript,
        fixture.name,
      );
    });
  });

  describe('04 pure lull (fabrication suppression)', () => {
    const fixture = loadFixture<SingleBatchFixture>('04-pure-lull.json');
    it('expected output passes rubric', () => {
      assertBatchPassesRubric(
        fixture.expected.cards,
        fixture.expected.classifier,
        fixture.input.transcript,
        fixture.name,
      );
    });
  });

  describe('05 state transitions (multi-segment)', () => {
    const fixture = loadFixture<MultiSegmentFixture>(
      '05-state-transitions.json',
    );
    for (const segment of fixture.segments) {
      it(`segment ${segment.label} passes rubric`, () => {
        assertBatchPassesRubric(
          segment.expected.cards,
          segment.expected.classifier,
          segment.input.transcript,
          `${fixture.name}/${segment.label}`,
        );
      });
    }
  });
});

if (LIVE) {
  describe('replay harness — LIVE mode (Groq)', () => {
    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      it('LIVE=1 requires GROQ_API_KEY env var', () => {
        throw new Error('LIVE mode enabled but GROQ_API_KEY env var is not set.');
      });
      return;
    }

    it(
      '01 technical pitch: live runBatch output passes rubric',
      { timeout: 60_000 },
      async () => {
        const fixture = loadFixture<SingleBatchFixture>('01-technical-pitch.json');
        const state: PipelineState = {
          apiKey,
          transcript: fixture.input.transcript,
          entityPool: [],
          batches: [],
          chatHistory: [],
          settings: fixture.input.settings,
        };
        const batch = await runBatch(state, Math.floor(Date.now() / 1000));
        assertBatchPassesRubric(
          batch.cards as unknown as Card[],
          batch.classifier as ClassifierOutput,
          fixture.input.transcript,
          `${fixture.name} (live)`,
        );
      },
    );
  });
}
