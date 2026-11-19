import React, { useState } from 'react';
import {
  ShieldCheck,
  Building2,
  User,
  Lock,
  LogIn,
  AlertCircle,
  Loader2,
  ExternalLink,
  ArrowLeft,
} from 'lucide-react';
import { api } from '../services/api';

export default function LoginView({ hotel = null, onLoginSuccess, onClearHotel }) {
  const [username, setUsername] = useState(hotel ? `${hotel.slug}_admin` : 'admin');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await api.login(username, password);
      // res returns { success: true, user, role, owner_id, is_superadmin }
      onLoginSuccess(res);
    } catch (err) {
      setError(err.message || 'Authentication failed. Please check credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f0f12] text-zinc-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl mb-3">
            {hotel ? (
              <Building2 className="h-7 w-7 text-emerald-400" />
            ) : (
              <ShieldCheck className="h-7 w-7 text-emerald-400" />
            )}
          </div>

          {hotel ? (
            <>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[11px] font-mono font-semibold mb-2">
                <span>/{hotel.slug}</span>
                <span className="text-emerald-600">&bull;</span>
                <span>Hotel Portal</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                {hotel.name}
              </h1>
              <p className="text-xs text-zinc-400 mt-1 font-medium">
                Hotel Kitchens Surveillance & Fleet Operations Hub
              </p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold tracking-tight text-white">
                SHMS Central Fleet Portal
              </h1>
              <p className="text-xs text-zinc-400 mt-1.5 font-medium">
                Enterprise Multi-Tenant CCTV & Kitchen Compliance Hub
              </p>
            </>
          )}
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
                {hotel ? 'Hotel Admin Username' : 'Administrator Username'}
              </label>
              <div className="relative">
                <User className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={hotel ? `${hotel.slug}_admin` : 'admin'}
                  className="w-full pl-9 pr-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors font-mono"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-300">
                {hotel ? 'Hotel Access Password' : 'Master Access Password'}
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors font-mono"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-2.5 px-4 bg-white hover:bg-zinc-200 text-zinc-950 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogIn className="h-4 w-4" />
              )}
              <span>
                {loading
                  ? 'Authenticating...'
                  : hotel
                  ? `Sign In to ${hotel.name}`
                  : 'Sign In to Central Console'}
              </span>
            </button>
          </form>

          {hotel ? (
            <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between text-[11px] text-zinc-500">
              <button
                type="button"
                onClick={() => {
                  if (onClearHotel) onClearHotel();
                  else window.location.href = '/';
                }}
                className="hover:text-zinc-300 flex items-center gap-1 transition-colors"
              >
                <ArrowLeft className="h-3 w-3" />
                <span>Go to Master Central Portal</span>
              </button>
              <span className="font-mono">SHMS v2.0</span>
            </div>
          ) : (
            <div className="pt-3 border-t border-zinc-800/80 text-center">
              <span className="text-[11px] text-zinc-500 font-mono">
                System Superadmin: admin / admin123
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
