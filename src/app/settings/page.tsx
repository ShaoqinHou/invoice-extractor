'use client';

import { useEffect, useState } from 'react';

interface Settings {
  tier_concurrency: number;
  worker_idle_minutes: number;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({
    tier_concurrency: 2,
    worker_idle_minutes: 5,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/settings')
      .then((res) => res.json())
      .then((data: Settings) => {
        setSettings(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.errors?.join(', ') || 'Failed to save settings');
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-sm text-zinc-500">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Settings</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Configure processing pipeline concurrency and worker behavior.
        </p>
      </div>

      <div className="space-y-6 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">Pipeline</h2>

        {/* Tier Concurrency */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label htmlFor="tier_concurrency" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Max concurrent tier processes
            </label>
            <span className="text-sm font-mono text-zinc-900 dark:text-zinc-100">
              {settings.tier_concurrency}
            </span>
          </div>
          <input
            id="tier_concurrency"
            type="range"
            min={1}
            max={4}
            step={1}
            value={settings.tier_concurrency}
            onChange={(e) => setSettings({ ...settings, tier_concurrency: Number(e.target.value) })}
            className="w-full accent-blue-600"
          />
          <div className="flex justify-between text-xs text-zinc-400">
            <span>1 (sequential)</span>
            <span>4 (max parallel)</span>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            How many extraction/OCR processes can run at the same time. OCR is always max 1 regardless of this setting.
          </p>
        </div>

        {/* Worker Idle Timeout */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label htmlFor="worker_idle" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Worker idle timeout
            </label>
            <span className="text-sm font-mono text-zinc-900 dark:text-zinc-100">
              {settings.worker_idle_minutes} min
            </span>
          </div>
          <input
            id="worker_idle"
            type="range"
            min={1}
            max={30}
            step={1}
            value={settings.worker_idle_minutes}
            onChange={(e) => setSettings({ ...settings, worker_idle_minutes: Number(e.target.value) })}
            className="w-full accent-blue-600"
          />
          <div className="flex justify-between text-xs text-zinc-400">
            <span>1 min</span>
            <span>30 min</span>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            How long OCR/extraction models stay loaded in memory after last use. Longer = faster subsequent processing, but uses more RAM.
          </p>
        </div>
      </div>

      {/* Info box */}
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
        <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">How it works</h3>
        <ul className="mt-2 space-y-1 text-xs text-zinc-500 dark:text-zinc-400">
          <li>Tier 1 (pymupdf4llm): text-layer extraction, ~50MB RAM</li>
          <li>Tier 2 (Tesseract): fast OCR, ~200MB RAM</li>
          <li>Tier 3 (PaddleOCR): deep learning OCR, ~500MB+ RAM</li>
          <li>Workers stay alive between uploads — no repeated model loading</li>
          <li>OCR mutex ensures only 1 OCR process at a time to limit RAM usage</li>
        </ul>
      </div>

      {/* Save button */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>

        {saved && (
          <span className="text-sm text-green-600 dark:text-green-400">
            Settings saved and applied
          </span>
        )}

        {error && (
          <span className="text-sm text-red-600 dark:text-red-400">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
