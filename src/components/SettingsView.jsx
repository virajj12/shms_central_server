import React, { useState, useEffect } from 'react';
import { Mail, Check, AlertCircle, Loader2, Send, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { api } from '../services/api';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from '@/components/ui/sonner';

export default function SettingsView() {
  const [email, setEmail] = useState('');
  const [webhook, setWebhook] = useState('');
  const [timeoutVal, setTimeoutVal] = useState(30);

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
        heartbeat_timeout: timeoutVal,
        smtp_host: smtpHost,
        smtp_port: smtpPort,
        smtp_user: smtpUser,
        smtp_app_password: smtpPass,
        smtp_from_name: smtpFromName,
      });
      setMessage('System and Email settings saved successfully.');
      toast.success('System and email configuration saved successfully');
    } catch (err) {
      setMessage(`Error: ${err.message}`);
      toast.error(`Error saving settings: ${err.message}`);
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
      if (res.sent) {
        toast.success('Test email delivered successfully!', {
          description: `Message ID: ${res.messageId}`,
        });
      } else {
        toast.error(`Email delivery check failed: ${res.error || res.reason || 'Failed'}`);
      }
    } catch (err) {
      setTestResult({ sent: false, error: err.message });
      toast.error(`Test email failed: ${err.message}`);
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
          <Alert variant={message.startsWith('Error') ? 'destructive' : 'success'}>
            {message.startsWith('Error') ? (
              <AlertCircle className="h-4 w-4" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}

        {/* Global Monitoring Section */}
        <Card className="p-6 space-y-4">
          <CardHeader className="p-0 space-y-1">
            <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-zinc-300" />
              <span>Fleet Alerts &amp; Heartbeat Thresholds</span>
            </CardTitle>
            <CardDescription className="text-xs text-zinc-400">
              Control edge device connectivity timeouts and notification channels
            </CardDescription>
          </CardHeader>

          <CardContent className="p-0 space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="central-email">Central Supervisor Email</Label>
              <Input
                id="central-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="central-alerts@smart-hotel.com"
                className="font-mono"
              />
              <p className="text-[10px] text-zinc-500">Receives enterprise-wide critical pest and hygiene alert summaries.</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="webhook-url">Corporate Webhook URL (Slack / Teams / Discord)</Label>
              <Input
                id="webhook-url"
                type="url"
                value={webhook}
                onChange={(e) => setWebhook(e.target.value)}
                placeholder="https://hooks.slack.com/services/..."
                className="font-mono"
              />
              <p className="text-[10px] text-zinc-500">Live JSON payload broadcast for confirmed fleet violations.</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="timeout-val">Edge Node Heartbeat Timeout (Seconds)</Label>
              <Input
                id="timeout-val"
                type="number"
                value={timeoutVal}
                onChange={(e) => setTimeoutVal(e.target.value)}
                min="10"
                max="300"
                className="font-mono"
              />
              <p className="text-[10px] text-zinc-500">Mark an edge device offline if no heartbeat is received within this window.</p>
            </div>
          </CardContent>
        </Card>

        {/* SMTP App Password Email Service Section */}
        <Card className="p-6 space-y-4">
          <CardHeader className="p-0 space-y-1">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                <Mail className="h-4 w-4 text-zinc-300" />
                <span>Email Service &amp; Google App Password (SMTP)</span>
              </CardTitle>
              <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 font-mono">
                For Hotel "Forgot Password" OTPs
              </span>
            </div>
            <CardDescription className="text-xs text-zinc-400 leading-relaxed">
              Configure your service provider email and App Password (e.g., Google 16-character App Password). Hotel owners will receive password reset verification OTPs from this sender.
            </CardDescription>
          </CardHeader>

          <CardContent className="p-0 space-y-4 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="smtp-host">SMTP Host</Label>
                <Input
                  id="smtp-host"
                  type="text"
                  value={smtpHost}
                  onChange={(e) => setSmtpHost(e.target.value)}
                  placeholder="smtp.gmail.com"
                  className="font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="smtp-port">SMTP Port (465 = SSL)</Label>
                <Input
                  id="smtp-port"
                  type="text"
                  value={smtpPort}
                  onChange={(e) => setSmtpPort(e.target.value)}
                  placeholder="465"
                  className="font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="smtp-user">Service Email Address</Label>
                <Input
                  id="smtp-user"
                  type="email"
                  value={smtpUser}
                  onChange={(e) => setSmtpUser(e.target.value)}
                  placeholder="company.service@gmail.com"
                  className="font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="smtp-pass">Google App Password (16-char)</Label>
                <Input
                  id="smtp-pass"
                  type="password"
                  value={smtpPass}
                  onChange={(e) => setSmtpPass(e.target.value)}
                  placeholder="abcd efgh ijkl mnop"
                  className="font-mono"
                />
                <span className="text-[10px] text-zinc-500 mt-0.5 block">
                  Generated under Google Account &rarr; Security &rarr; App Passwords.
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="smtp-from">Sender Display Name</Label>
              <Input
                id="smtp-from"
                type="text"
                value={smtpFromName}
                onChange={(e) => setSmtpFromName(e.target.value)}
                placeholder="SHMS Hotel Cloud Platform"
              />
            </div>

            {testResult && (
              <Alert variant={testResult.sent ? 'success' : 'destructive'}>
                {testResult.sent ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <AlertCircle className="h-4 w-4" />
                )}
                <AlertDescription>
                  {testResult.sent
                    ? `Test email sent successfully! (Message ID: ${testResult.messageId})`
                    : `Email delivery check: ${testResult.error || testResult.reason || 'Failed'}`}
                </AlertDescription>
              </Alert>
            )}

            <div className="pt-2 flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleTestEmail}
                disabled={testingEmail || !smtpUser}
                className="gap-1.5"
              >
                {testingEmail ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                <span>{testingEmail ? 'Sending Test...' : 'Send Test Email'}</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Save Button */}
        <div>
          <Button
            type="submit"
            disabled={saving}
            size="default"
            className="bg-white hover:bg-zinc-200 text-zinc-950 font-bold"
          >
            {saving ? 'Saving...' : 'Save All Settings'}
          </Button>
        </div>
      </form>
    </div>
  );
}
