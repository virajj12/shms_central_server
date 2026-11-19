import React, { useState } from 'react';
import {
  Building2,
  Lock,
  LogIn,
  AlertCircle,
  Loader2,
  KeyRound,
  CheckCircle2,
  Mail,
  ShieldAlert,
  ArrowRight,
  X,
} from 'lucide-react';
import { api } from '../services/api';

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
        <div className="bg-[#18181c] border border-zinc-800/90 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-300">
                Hotel Endpoint / Username
              </label>
              <div className="relative">
                <Building2 className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter hotel endpoint (e.g. your-hotel)"
                  className="w-full pl-9 pr-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500 transition-colors font-mono"
                />
              </div>
              <span className="text-[10px] text-zinc-500 block">
                Your hotel endpoint handle provided by the platform service provider.
              </span>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-zinc-300">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setForgotIdentifier(username || (hotel ? hotel.slug : ''));
                    setForgotStep(1);
                    setForgotError('');
                    setForgotSuccess('');
                    setShowForgotModal(true);
                  }}
                  className="text-[11px] text-emerald-400 hover:text-emerald-300 hover:underline"
                >
                  Forgot Password?
                </button>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500 transition-colors font-mono"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-2.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogIn className="h-4 w-4" />
              )}
              <span>{loading ? 'Signing in...' : 'Sign In to Hotel Console'}</span>
            </button>
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
        </div>
      </div>

      {/* Forgot Password Modal (Via App Password SMTP) */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#18181c] border border-zinc-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-emerald-400" />
                <h3 className="text-sm font-bold text-white">Reset Hotel Password</h3>
              </div>
              <button
                onClick={() => setShowForgotModal(false)}
                className="text-zinc-500 hover:text-white text-xs"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {forgotError && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{forgotError}</span>
              </div>
            )}

            {forgotSuccess && (
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>{forgotSuccess}</span>
              </div>
            )}

            {forgotStep === 1 ? (
              <form onSubmit={handleRequestOtp} className="space-y-3.5 text-xs">
                <p className="text-zinc-400 text-xs leading-relaxed">
                  Enter your Hotel Endpoint handle or registered contact email. We will send a 6-digit verification code to your registered email address.
                </p>

                <div>
                  <label className="text-zinc-300 font-semibold block mb-1">
                    Hotel Endpoint or Email
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. your-hotel"
                    value={forgotIdentifier}
                    onChange={(e) => setForgotIdentifier(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-white font-mono placeholder-zinc-600 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="pt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowForgotModal(false)}
                    className="py-2 px-3 rounded-lg border border-zinc-800 text-zinc-400 hover:bg-zinc-900"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={forgotLoading}
                    className="py-2 px-4 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold rounded-lg flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {forgotLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    <span>{forgotLoading ? 'Sending Code...' : 'Send Verification Code'}</span>
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} className="space-y-3.5 text-xs">
                <p className="text-zinc-400 text-xs leading-relaxed">
                  Enter the 6-digit verification code sent to <strong className="text-white">{maskedEmail}</strong> along with your new password.
                </p>

                <div>
                  <label className="text-zinc-300 font-semibold block mb-1">
                    6-Digit Verification Code
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    placeholder="123456"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/[^0-9]/g, ''))}
                    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-white font-mono text-center tracking-widest text-base focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-zinc-300 font-semibold block mb-1">
                    New Access Password
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="Minimum 5 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-white font-mono placeholder-zinc-600 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="pt-2 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setForgotStep(1)}
                    className="text-[11px] text-zinc-400 hover:text-white"
                  >
                    &larr; Re-enter Endpoint
                  </button>
                  <button
                    type="submit"
                    disabled={forgotLoading}
                    className="py-2 px-4 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold rounded-lg flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {forgotLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    <span>{forgotLoading ? 'Verifying...' : 'Set New Password'}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
