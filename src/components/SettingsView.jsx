import React, { useState, useEffect } from 'react';
import { Mail, Check, AlertCircle, Loader2, Send, ShieldCheck } from 'lucide-react';
import { api } from '../services/api';

export default function SettingsView() {
  const [email, setEmail] = useState('');
  const [webhook, setWebhook] = useState('');
  const [timeout, setTimeoutVal] = useState(30);

  // Email SMTP App Password Settings
  const [smtpHost, setSmtpHost] = useState('smtp.gmail.com');
  const [smtpPort, setSmtpPort] = useState('465');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [smtpFromName, setSmtpFromName] = useState('SHMS Hotel Cloud Platform');

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [testingEmail, setTestingEmail] = useState(false);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    api.getSettings().then((data) => {
      setEmail(data.central_email || '');
      setWebhook(data.webhook_url || '');
      setTimeoutVal(data.heartbeat_timeout || 30);
      setSmtpHost(data.smtp_host || 'smtp.gmail.com');
      setSmtpPort(data.smtp_port || '465');
      setSmtpUser(data.smtp_user || '');
      setSmtpPass(data.smtp_app_password || '');
      setSmtpFromName(data.smtp_from_name || 'SHMS Hotel Cloud Platform');
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
        smtp_host: smtpHost,
        smtp_port: smtpPort,
        smtp_user: smtpUser,
        smtp_app_password: smtpPass,
        smtp_from_name: smtpFromName,
      });
      setMessage('System and Email settings saved successfully.');
    } catch (err) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleTestEmail = async () => {
    setTestingEmail(true);
    setTestResult(null);
    try {
      const res = await api.testSmtpEmail(smtpUser);
      setTestResult(res);
    } catch (err) {
      setTestResult({ sent: false, error: err.message });
    } finally {
      setTestingEmail(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-base font-bold text-white">Central System Settings</h2>
        <p className="text-xs text-zinc-400">Configure global fleet parameters, notification webhooks, and App Password email delivery</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {message && (
          <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs">
            {message}
          </div>
        )}

        {/* Global Monitoring Section */}
        <div className="bg-[#18181c] border border-zinc-800 rounded-2xl p-6 space-y-4 shadow-lg">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            <span>Fleet Alerts &amp; Heartbeat Thresholds</span>
          </h3>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-300">Central Supervisor Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="central-alerts@smart-hotel.com"
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-white focus:outline-none focus:border-zinc-500 font-mono"
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
              onChange={(e) => setTimeoutVal(e.target.value)}
              min="10"
              max="300"
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-white font-mono focus:outline-none focus:border-zinc-500"
            />
            <p className="text-[10px] text-zinc-500">Mark an edge device offline if no heartbeat is received within this window.</p>
          </div>
        </div>

        {/* SMTP App Password Email Service Section */}
        <div className="bg-[#18181c] border border-zinc-800 rounded-2xl p-6 space-y-4 shadow-lg">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Mail className="h-4 w-4 text-emerald-400" />
              <span>Email Service &amp; Google App Password (SMTP)</span>
            </h3>
            <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 font-mono">
              For Hotel "Forgot Password" OTPs
            </span>
          </div>

          <p className="text-xs text-zinc-400 leading-relaxed">
            Configure your service provider email and App Password (e.g., Google 16-character App Password). Hotel owners will receive password reset verification OTPs from this sender.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="text-zinc-300 font-semibold block mb-1">SMTP Host</label>
              <input
                type="text"
                value={smtpHost}
                onChange={(e) => setSmtpHost(e.target.value)}
                placeholder="smtp.gmail.com"
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-white font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="text-zinc-300 font-semibold block mb-1">SMTP Port (465 = SSL)</label>
              <input
                type="text"
                value={smtpPort}
                onChange={(e) => setSmtpPort(e.target.value)}
                placeholder="465"
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-white font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="text-zinc-300 font-semibold block mb-1">Service Email Address</label>
              <input
                type="email"
                value={smtpUser}
                onChange={(e) => setSmtpUser(e.target.value)}
                placeholder="company.service@gmail.com"
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-white font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="text-zinc-300 font-semibold block mb-1">Google App Password (16-char)</label>
              <input
                type="password"
                value={smtpPass}
                onChange={(e) => setSmtpPass(e.target.value)}
                placeholder="abcd efgh ijkl mnop"
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-white font-mono focus:outline-none focus:border-emerald-500"
              />
              <span className="text-[10px] text-zinc-500 mt-0.5 block">
                Generated under Google Account &rarr; Security &rarr; App Passwords.
              </span>
            </div>
          </div>

          <div>
            <label className="text-xs text-zinc-300 font-semibold block mb-1">Sender Display Name</label>
            <input
              type="text"
              value={smtpFromName}
              onChange={(e) => setSmtpFromName(e.target.value)}
              placeholder="SHMS Hotel Cloud Platform"
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          {testResult && (
            <div className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
              testResult.sent
                ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                : 'bg-rose-500/10 border border-rose-500/30 text-rose-400'
            }`}>
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>
                {testResult.sent
                  ? `Test email sent successfully! (Message ID: ${testResult.messageId})`
                  : `Email delivery check: ${testResult.error || testResult.reason || 'Failed'}`}
              </span>
            </div>
          )}

          <div className="pt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={handleTestEmail}
              disabled={testingEmail || !smtpUser}
              className="py-1.5 px-3 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-40"
            >
              {testingEmail ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
              <span>{testingEmail ? 'Sending Test...' : 'Send Test Email'}</span>
            </button>
          </div>
        </div>

        {/* Save Button */}
        <div>
          <button
            type="submit"
            disabled={saving}
            className="py-2.5 px-5 bg-white hover:bg-zinc-200 text-zinc-950 text-xs font-bold rounded-lg transition-colors shadow-sm"
          >
            {saving ? 'Saving...' : 'Save All Settings'}
          </button>
        </div>
      </form>
    </div>
  );
}
