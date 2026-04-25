'use client';

/**
 * app/components/SettingsModal.tsx — round 5b-ii
 *
 * Three-tab settings modal:
 *   - API Key — preserves the inline-save pattern (paste-in-progress
 *     shouldn't auto-persist; explicit Save key required)
 *   - Prompts — 6 textareas (classifier + 4 generators + chat) with
 *     per-field "Reset to default" visible only when overridden;
 *     persists immediately on edit
 *   - Behavior — 3 sliders for rollingWindowSeconds, antiRepetitionBatchCount,
 *     fullSessionCharLimit; persists immediately on change
 *
 * Footer "Done" closes the modal. Modal width max-w-2xl, max-h-[85vh]
 * with internal scroll for the prompts panel which can grow tall.
 */

import { useState, useEffect } from 'react';
import { useStore } from '@/lib/state/store';
import { CLASSIFIER_SYSTEM_PROMPT } from '@/lib/prompts/classifier';
import { QUESTION_SYSTEM_PROMPT } from '@/lib/prompts/generators/question';
import { TALKING_SYSTEM_PROMPT } from '@/lib/prompts/generators/talking';
import { ANSWER_SYSTEM_PROMPT } from '@/lib/prompts/generators/answer';
import { FACT_SYSTEM_PROMPT } from '@/lib/prompts/generators/fact';
import { CHAT_SYSTEM_PROMPT } from '@/lib/prompts/chat';

type Tab = 'api-key' | 'prompts' | 'behavior';

export function SettingsModal() {
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const [activeTab, setActiveTab] = useState<Tab>('api-key');

  return (
    <div
      className="fixed inset-0 bg-black/40 grid place-items-center z-50"
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
    >
      <div className="bg-panel border-2 border-border rounded-lg w-full max-w-2xl mx-4 shadow-[0_20px_60px_rgba(0,0,0,0.25)] flex flex-col max-h-[85vh]">
        <div className="px-6 pt-5 pb-2">
          <h2 className="text-base font-semibold text-text">Settings</h2>
        </div>

        <div className="flex border-b border-border px-6 gap-5">
          <TabButton active={activeTab === 'api-key'} onClick={() => setActiveTab('api-key')}>
            API Key
          </TabButton>
          <TabButton active={activeTab === 'prompts'} onClick={() => setActiveTab('prompts')}>
            Prompts
          </TabButton>
          <TabButton active={activeTab === 'behavior'} onClick={() => setActiveTab('behavior')}>
            Behavior
          </TabButton>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {activeTab === 'api-key' && <ApiKeyPanel />}
          {activeTab === 'prompts' && <PromptsPanel />}
          {activeTab === 'behavior' && <BehaviorPanel />}
        </div>

        <div className="border-t border-border px-6 py-3 flex justify-end">
          <button
            onClick={() => setSettingsOpen(false)}
            className="text-sm px-4 py-2 rounded bg-accent text-white font-medium hover:opacity-90 transition-opacity"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        'text-sm py-2.5 -mb-px transition-colors ' +
        (active
          ? 'border-b-2 border-accent text-text font-medium'
          : 'border-b-2 border-transparent text-muted hover:text-text')
      }
    >
      {children}
    </button>
  );
}

function ApiKeyPanel() {
  const apiKey = useStore((s) => s.apiKey);
  const setApiKey = useStore((s) => s.setApiKey);
  const [draft, setDraft] = useState(apiKey);

  useEffect(() => {
    setDraft(apiKey);
  }, [apiKey]);

  const dirty = draft.trim() !== apiKey;

  return (
    <div>
      <p className="text-xs text-muted mb-5 leading-relaxed">
        Paste your Groq API key to start. The key is stored only in your browser&apos;s
        local storage and is sent only to Groq&apos;s API — never to any other server.
      </p>

      <label
        htmlFor="apikey"
        className="block text-xs uppercase tracking-wider text-muted mb-1.5"
      >
        Groq API key
      </label>
      <input
        id="apikey"
        type="password"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="gsk_..."
        autoComplete="off"
        autoFocus
        className="w-full bg-panel-2 border border-border rounded px-3 py-2 text-sm font-mono text-text placeholder:text-muted focus:outline-none focus:border-accent transition-colors"
      />
      <p className="text-xs text-muted mt-2">
        Get a key at{' '}
        <a
          href="https://console.groq.com/keys"
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent hover:underline"
        >
          console.groq.com/keys
        </a>
        .
      </p>

      <div className="flex justify-between items-center gap-2 mt-5">
        <div>
          {apiKey && (
            <button
              onClick={() => {
                setApiKey('');
                setDraft('');
              }}
              className="text-sm px-3 py-2 text-muted hover:text-accent transition-colors"
            >
              Clear key
            </button>
          )}
        </div>
        {dirty && draft.trim() && (
          <button
            onClick={() => setApiKey(draft.trim())}
            className="text-sm px-4 py-2 rounded bg-accent text-white font-medium hover:opacity-90 transition-opacity"
          >
            Save key
          </button>
        )}
      </div>
    </div>
  );
}

function PromptsPanel() {
  const prompts = useStore((s) => s.prompts);
  const setPromptOverride = useStore((s) => s.setPromptOverride);
  const clearPromptOverride = useStore((s) => s.clearPromptOverride);

  return (
    <div className="space-y-5">
      <p className="text-xs text-muted leading-relaxed">
        Customize the system prompts the pipeline uses. Edits take effect on the next batch.
      </p>
      <PromptEditor
        label="Classifier"
        defaultValue={CLASSIFIER_SYSTEM_PROMPT}
        currentValue={prompts?.classifier}
        onChange={(v) => setPromptOverride('classifier', v)}
        onReset={() => clearPromptOverride('classifier')}
      />
      <PromptEditor
        label="Question generator"
        defaultValue={QUESTION_SYSTEM_PROMPT}
        currentValue={prompts?.question}
        onChange={(v) => setPromptOverride('question', v)}
        onReset={() => clearPromptOverride('question')}
      />
      <PromptEditor
        label="Talking-point generator"
        defaultValue={TALKING_SYSTEM_PROMPT}
        currentValue={prompts?.talking}
        onChange={(v) => setPromptOverride('talking', v)}
        onReset={() => clearPromptOverride('talking')}
      />
      <PromptEditor
        label="Answer generator"
        defaultValue={ANSWER_SYSTEM_PROMPT}
        currentValue={prompts?.answer}
        onChange={(v) => setPromptOverride('answer', v)}
        onReset={() => clearPromptOverride('answer')}
      />
      <PromptEditor
        label="Fact-check generator"
        defaultValue={FACT_SYSTEM_PROMPT}
        currentValue={prompts?.fact}
        onChange={(v) => setPromptOverride('fact', v)}
        onReset={() => clearPromptOverride('fact')}
      />
      <PromptEditor
        label="Chat (detailed answers)"
        defaultValue={CHAT_SYSTEM_PROMPT}
        currentValue={prompts?.chat}
        onChange={(v) => setPromptOverride('chat', v)}
        onReset={() => clearPromptOverride('chat')}
      />
    </div>
  );
}

function PromptEditor({
  label,
  defaultValue,
  currentValue,
  onChange,
  onReset,
}: {
  label: string;
  defaultValue: string;
  currentValue: string | undefined;
  onChange: (v: string) => void;
  onReset: () => void;
}) {
  const isOverridden = currentValue !== undefined;
  const value = currentValue ?? defaultValue;

  return (
    <div>
      <div className="flex justify-between items-baseline mb-1.5">
        <label className="text-xs uppercase tracking-wider text-muted">{label}</label>
        {isOverridden && (
          <button onClick={onReset} className="text-xs text-accent hover:underline">
            Reset to default
          </button>
        )}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={6}
        className="w-full bg-panel-2 border border-border rounded p-2 text-xs font-mono text-text leading-relaxed focus:outline-none focus:border-accent transition-colors resize-y"
      />
    </div>
  );
}

function BehaviorPanel() {
  const settings = useStore((s) => s.settings);
  const setRollingWindowSeconds = useStore((s) => s.setRollingWindowSeconds);
  const setAntiRepetitionBatchCount = useStore((s) => s.setAntiRepetitionBatchCount);
  const setFullSessionCharLimit = useStore((s) => s.setFullSessionCharLimit);

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted leading-relaxed">
        Tune how much context the pipeline considers and how it suppresses repetition across batches.
      </p>
      <SettingSlider
        label="Rolling window"
        description="How much recent transcript the classifier and generators see."
        min={60}
        max={300}
        step={30}
        value={settings.rollingWindowSeconds}
        onChange={setRollingWindowSeconds}
        formatValue={(v) => `${v}s`}
      />
      <SettingSlider
        label="Anti-repetition batch count"
        description="How many recent batches feed the previous-tuples context to suppress repeats."
        min={1}
        max={5}
        step={1}
        value={settings.antiRepetitionBatchCount}
        onChange={setAntiRepetitionBatchCount}
        formatValue={(v) => `${v} batch${v === 1 ? '' : 'es'}`}
      />
      <SettingSlider
        label="Chat context character limit"
        description="Maximum chat-context transcript size before truncation kicks in."
        min={10000}
        max={100000}
        step={5000}
        value={settings.fullSessionCharLimit}
        onChange={setFullSessionCharLimit}
        formatValue={(v) => `${(v / 1000).toFixed(0)}k chars`}
      />
    </div>
  );
}

function SettingSlider({
  label,
  description,
  min,
  max,
  step,
  value,
  onChange,
  formatValue,
}: {
  label: string;
  description: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  formatValue?: (v: number) => string;
}) {
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <label className="text-xs uppercase tracking-wider text-muted">{label}</label>
        <span className="text-sm text-text font-medium tabular-nums">
          {formatValue ? formatValue(value) : value}
        </span>
      </div>
      <p className="text-xs text-muted mb-2 leading-relaxed">{description}</p>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-accent"
      />
    </div>
  );
}
