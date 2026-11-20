import React, { useState } from 'react';
import {
  Building2,
  Lock,
  LogIn,
  AlertCircle,
  Loader2,
  KeyRound,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';
import { api } from '../services/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

export default function LoginView({ hotel = null, onLoginSuccess }) {
  const [username, setUsername] = useState(hotel ? hotel.slug : '');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Forgot Password State
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotStep, setForgotStep] = useState(1); // 1 = request, 2 = verify OTP
  const [forgotIdentifier, setForgotIdentifier] = useState(hotel ? hotel.slug : '');
  const [forgotOwnerId, setForgotOwnerId] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await api.login(username, password);
      onLoginSuccess(res);
    } catch (err) {
      setError(err.message || 'Authentication failed. Please check your hotel endpoint and password.');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestOtp = async (e) => {
    e.preventDefault();
    setForgotLoading(true);
    setForgotError('');
    setForgotSuccess('');

    try {
      const res = await api.requestPasswordReset(forgotIdentifier);
      setForgotOwnerId(res.owner_id);
      setMaskedEmail(res.masked_email);
      setForgotStep(2);
      setForgotSuccess(res.message);
    } catch (err) {
      setForgotError(err.message || 'Failed to request password reset code');
    } finally {
      setForgotLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setForgotLoading(true);
    setForgotError('');

    try {
      const res = await api.verifyPasswordReset(forgotOwnerId, otpCode, newPassword);
      setForgotSuccess(res.message);
      setTimeout(() => {
        setShowForgotModal(false);
        setForgotStep(1);
        setForgotError('');
        setForgotSuccess('');
        setOtpCode('');
        setNewPassword('');
      }, 2000);
    } catch (err) {
      setForgotError(err.message || 'Verification failed');
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f0f12] text-zinc-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl mb-3">
            <Building2 className="h-7 w-7 text-emerald-400" />
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-white">
            {hotel ? hotel.name : 'Hotel Fleet Portal'}
          </h1>
          <p className="text-xs text-zinc-400 mt-1 font-medium">
            Multi-branch CCTV hygiene &amp; compliance management service
          </p>
        </div>

        {/* Card */}
        <Card className="p-6 sm:p-8 space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="hotel-endpoint">
                Hotel Endpoint / Username
              </Label>
              <div className="relative">
                <Building2 className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500 pointer-events-none" />
                <Input
                  id="hotel-endpoint"
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter hotel endpoint (e.g. your-hotel)"
                  className="pl-9 font-mono focus-visible:border-emerald-500 focus-visible:ring-emerald-500"
                />
              </div>
              <span className="text-[10px] text-zinc-500 block">
                Your hotel endpoint handle provided by the platform service provider.
              </span>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="hotel-password">
                  Password
                </Label>
                <button
                  type="button"
                  onClick={() => {
                    setForgotIdentifier(username || (hotel ? hotel.slug : ''));
                    setForgotStep(1);
                    setForgotError('');
                    setForgotSuccess('');
                    setShowForgotModal(true);
                  }}
                  className="text-[11px] text-emerald-400 hover:text-emerald-300 hover:underline cursor-pointer"
                >
                  Forgot Password?
                </button>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500 pointer-events-none" />
                <Input
                  id="hotel-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pl-9 font-mono focus-visible:border-emerald-500 focus-visible:ring-emerald-500"
                />
              </div>
            </div>

            <Button
              type="submit"
              variant="emerald"
              disabled={loading}
              className="w-full mt-2"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogIn className="h-4 w-4" />
              )}
              <span>{loading ? 'Signing in...' : 'Sign In to Hotel Console'}</span>
            </Button>
          </form>

          {/* Footer Navigation */}
          <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between text-[11px] text-zinc-500">
            <span>Powered by SHMS SaaS</span>
            <a
              href="/admin/login"
              className="text-zinc-400 hover:text-amber-400 flex items-center gap-1 transition-colors"
              title="Access Platform Operator Admin Console"
            >
              <span>Service Operator Login</span>
              <ArrowRight className="h-3 w-3" />
            </a>
          </div>
        </Card>
      </div>

      {/* Forgot Password Modal (Via App Password SMTP - Dialog) */}
      <Dialog open={showForgotModal} onOpenChange={setShowForgotModal}>
        <DialogContent className="max-w-md">
          <DialogHeader className="pb-3 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-emerald-400" />
              <DialogTitle className="text-sm font-bold text-white">Reset Hotel Password</DialogTitle>
            </div>
            <DialogDescription className="text-xs text-zinc-400 pt-1">
              Recover your hotel management account credentials via registered security email.
            </DialogDescription>
          </DialogHeader>

          {forgotError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{forgotError}</AlertDescription>
            </Alert>
          )}

          {forgotSuccess && (
            <Alert variant="success">
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>{forgotSuccess}</AlertDescription>
            </Alert>
          )}

          {forgotStep === 1 ? (
            <form onSubmit={handleRequestOtp} className="space-y-3.5 text-xs">
              <p className="text-zinc-400 text-xs leading-relaxed">
                Enter your Hotel Endpoint handle or registered contact email. We will send a 6-digit verification code to your registered email address.
              </p>

              <div className="space-y-1">
                <Label htmlFor="forgot-identifier">
                  Hotel Endpoint or Email
                </Label>
                <Input
                  id="forgot-identifier"
                  type="text"
                  required
                  placeholder="e.g. your-hotel"
                  value={forgotIdentifier}
                  onChange={(e) => setForgotIdentifier(e.target.value)}
                  className="font-mono focus-visible:border-emerald-500 focus-visible:ring-emerald-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowForgotModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="emerald"
                  size="sm"
                  disabled={forgotLoading}
                >
                  {forgotLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>{forgotLoading ? 'Sending Code...' : 'Send Verification Code'}</span>
                </Button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-3.5 text-xs">
              <p className="text-zinc-400 text-xs leading-relaxed">
                Enter the 6-digit verification code sent to <strong className="text-white">{maskedEmail}</strong> along with your new password.
              </p>

              <div className="space-y-1">
                <Label htmlFor="otp-code">
                  6-Digit Verification Code
                </Label>
                <Input
                  id="otp-code"
                  type="text"
                  required
                  maxLength={6}
                  placeholder="123456"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/[^0-9]/g, ''))}
                  className="font-mono text-center tracking-widest text-base focus-visible:border-emerald-500 focus-visible:ring-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="new-password">
                  New Access Password
                </Label>
                <Input
                  id="new-password"
                  type="password"
                  required
                  placeholder="Minimum 5 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="font-mono focus-visible:border-emerald-500 focus-visible:ring-emerald-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-between">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setForgotStep(1)}
                  className="text-zinc-400 hover:text-white"
                >
                  &larr; Re-enter Endpoint
                </Button>
                <Button
                  type="submit"
                  variant="emerald"
                  size="sm"
                  disabled={forgotLoading}
                >
                  {forgotLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>{forgotLoading ? 'Verifying...' : 'Set New Password'}</span>
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
