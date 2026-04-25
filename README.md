# TwinMind — Live Suggestions

Web app that listens to live mic audio and surfaces 3 useful suggestions every 30 seconds based on what's being said. Click a suggestion to stream a detailed answer in a chat panel. Built for the TwinMind take-home assignment.

## Demo

Live: <https://twinmind-assignment-eight.vercel.app>

## Setup

```bash
git clone <repo-url>
cd TwinMindAssignment
npm install
npm run dev          # http://localhost:3000
npm test             # 37 tests, no Groq access required
LIVE=1 GROQ_API_KEY=gsk_... npm test  # replay harness against live API
```

In the browser, click the gear icon (top right) and paste your Groq API key. Get one at [console.groq.com/keys](https://console.groq.com/keys). The key lives only in your browser's localStorage; nothing is sent to any server other than Groq.

To deploy your own copy: `vercel deploy --prod`. No env vars needed.

## Stack

- **Next.js 15** App Router, TypeScript strict
- **Tailwind v3.4** with a custom cream-base editorial palette (token-driven, light wholesale, no theme toggle)
- **Geist Sans** via `next/font` (free-license stand-in for Klim's Styrene B; see Tradeoffs)
- **Zustand** with `immer` + nested `persist` (separate localStorage namespaces: `twinmind:apiKey` and `twinmind:settings`)
- **Framer Motion** for three scoped animations: mic pulse, batch fade-in, batch demote
- **OpenAI SDK** as a Groq client (Groq supports OpenAI-compatible endpoints)
- **Vitest** for unit tests + replay harness
- **Whisper Large V3** for transcription, **GPT-OSS 120B** for classifier + 4 generators + chat

## Prompt Strategy

The pipeline is a **classifier-then-generator router**. A classifier reads the rolling-window transcript (default 180s) and emits one of six conversation states — `topic_intro`, `claim_made`, `decision_point`, `question_asked`, `deep_discussion`, `lull`. A routing table (`lib/routing/suggestionMix.ts`) maps the state to a fixed mix of three card types drawn from `{question, talking, answer, fact}`. Three generators then run in parallel to fill the mix.

The split matters because **what makes a good suggestion is not just what it says, but whether it's the right kind of suggestion to surface right now.** A `question_asked` state with two open questions in flight wants three answer-shaped cards, not three more questions. A `claim_made` state with concrete numbers wants a fact-check that engages with those numbers, plus a talking point that adds context, plus a question that sharpens the next move. The router decides; the generators serve.

Each card carries a `tuple` of `(entity, action, core_claim)` that feeds back as anti-repetition context for the next two batches. This stops the most common failure mode of always-on suggestion systems: looping on the same observation across batches.

The anti-fabrication discipline is encoded in `__tests__/lib/rubric.ts` and demonstrated by `__tests__/fixtures/04-pure-lull.json`. The pure-lull fixture is sparse filler — `"um... yeah."`, `"(pause)"`, `"OK so... where were we."` In dev we observed the lull-mode prompt invent fictional content under this input pressure (a "95% uptime target" cascade where the model hallucinated specific numbers from sparse audio). The rubric and fixture 04 codify the suppressed version: the lull-mode generator produces three thread-restart questions instead — where did the conversation last leave off, what's the most important decision needed today, what context would help framing the next move. The rubric's `noFabricatedNumbers` rejects any numeric token in question/answer cards that doesn't appear verbatim in the transcript; the routing table's lull-allows-triple-question lets all three cards be questions when the conversation has stalled.

The replay harness runs every fixture through the rubric on every test run. Hand-authored expected outputs are the documented quality target — they encode what we think good output looks like, and the harness keeps the implementation honest against that target. With `LIVE=1` and a Groq key, the harness also runs real `runBatch` calls against the same rubric.

## Tradeoffs

**Paid-tier design.** The architecture runs the classifier + 3 generators on every batch (roughly 15-20K TPM at the 30s cadence) plus chat on demand. Groq's free tier caps at 8K TPM, which throttles the experience hard. We assume a paid tier for evaluation. Reviewers using free-tier keys will see the rate-limit banner trigger after roughly 60 seconds of continuous suggestion generation; the app continues to function and the banner clears automatically. A free-tier-targeted variant would cache the classifier result across a 60s window and use a smaller-cheaper model for it — separate product surface, not folded in here.

**Geist Sans as Styrene B stand-in.** Anthropic's product font is Klim Type Foundry's Styrene B, which is commercial. Geist (Vercel, OFL-licensed) is the closest free editorial sans we identified — humanist, slightly distinctive, fits the cream-paper aesthetic. The cream + oxblood + gold + ink palette derived from there.

**TwinMind extension as reference point.** The TwinMind Chrome extension was our live-suggestions UX reference. The most visible structural choice in our submission is batch-stacking-with-demote-opacity — older batches stay visible at 0.55 opacity rather than scrolling out, so participants can scan recent context while the freshest batch anchors as "right now."

## What I'd do with more time

- **Playwright e2e tests** with fake `getUserMedia` for full-session validation through the browser, not just the unit-test layer.
- **Prompt tightening from replay-harness output.** The `LIVE=1` mode runs real generations against all 5 fixtures and produces a diff against expected. Tightening loop: run live, identify rubric failures, edit prompt in `lib/prompts/`, re-run, repeat. Currently only fixture 01 is wired in LIVE mode; extending to all 5 is mechanical.
- **Lull-mode collision-deduplication.** The three lull-state questions can sometimes phrase the same thread-restart in three different ways. An intra-batch tuple comparison + regenerate-on-collision pass would harden this without changing the routing table.

## Repository structure

```
app/
  components/   Three columns + SettingsModal (3 tabs)
  hooks/        useSession orchestrator (calls store actions exclusively)
  page.tsx, layout.tsx, globals.css
lib/
  api/          Groq client, pipeline, schemas, whisper
  audio/        MediaRecorder wrapper (chunked WebM)
  format/       Prompt-input renderers (byte-equivalence tested)
  prompts/      Six system prompts (classifier + 4 generators + chat)
  routing/      State → mix routing table
  state/        Zustand store + session-id helper
  export.ts     Session export to JSON
__tests__/
  lib/rubric.ts          Five executable quality rules
  fixtures/              Five hand-authored fixtures
  replay-harness.test.ts Runs fixtures through rubric (default + LIVE)
  store.test.ts          Action-level tests
  promptInputs.test.ts, entityPool.test.ts, export.test.ts
```
