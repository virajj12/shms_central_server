import React, { useState, useEffect } from 'react';
import { api } from '../services/api';

export default function SettingsView() {
  const [email, setEmail] = useState('');
  const [webhook, setWebhook] = useState('');
  const [timeout, setTimeout] = useState(30);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    api.getSettings().then((data) => {
      setEmail(data.central_email || '');
      setWebhook(data.webhook_url || '');
      setTimeout(data.heartbeat_timeout || 30);
    }).catch(console.error);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      await api.saveSettings({
        central_email: email,
        webhook_url: webhook,
        heartbeat_timeout: timeout,
      });
      setMessage('Settings saved successfully.');
    } catch (err) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-base font-bold text-white">Central System Settings</h2>
        <p className="text-xs text-zinc-400">Configure global fleet notifications and central management parameters</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-[#18181c] border border-zinc-800 rounded-2xl p-6 space-y-4 shadow-lg">
        {message && (
          <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs">
            {message}
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-zinc-300">Central Supervisor Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="central-alerts@smart-hotel.com"
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-white focus:outline-none focus:border-zinc-500"
          />
          <p className="text-[10px] text-zinc-500">Receives enterprise-wide critical pest and hygiene alert summaries.</p>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-zinc-300">Corporate Webhook URL (Slack / Teams / Discord)</label>
          <input
            type="url"
            value={webhook}
            onChange={(e) => setWebhook(e.target.value)}
            placeholder="https://hooks.slack.com/services/..."
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-white font-mono focus:outline-none focus:border-zinc-500"
          />
          <p className="text-[10px] text-zinc-500">Live JSON payload broadcast for confirmed fleet violations.</p>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-zinc-300">Edge Node Heartbeat Timeout (Seconds)</label>
          <input
            type="number"
            value={timeout}
            onChange={(e) => setTimeout(e.target.value)}
            min="10"
            max="300"
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-white font-mono focus:outline-none focus:border-zinc-500"
          />
          <p className="text-[10px] text-zinc-500">Mark an edge device offline if no heartbeat is received within this window.</p>
        </div>

        <div className="pt-3 border-t border-zinc-800">
          <button
            type="submit"
            disabled={saving}
            className="py-2 px-4 bg-white hover:bg-zinc-200 text-zinc-950 text-xs font-bold rounded-lg transition-colors shadow-sm"
          >
            {saving ? 'Saving...' : 'Save Central Settings'}
          </button>
        </div>
      </form>
    </div>
  );
}

