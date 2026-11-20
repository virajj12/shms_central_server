import React, { useState } from 'react';
import {
  ShieldAlert,
  User,
  Lock,
  LogIn,
  AlertCircle,
  Loader2,
  ArrowLeft,
} from 'lucide-react';
import { api } from '../services/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from '@/components/ui/sonner';

export default function AdminLoginView({ onLoginSuccess }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await api.login(username, password);
      if (!res.is_superadmin) {
        throw new Error('This console is restricted to Service Provider Platform Administrators.');
      }
      toast.success('Platform Administrator authenticated');
      onLoginSuccess(res);
    } catch (err) {
      const msg = err.message || 'Authentication failed. Please check administrator credentials.';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-zinc-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl mb-3">
            <ShieldAlert className="h-7 w-7 text-zinc-200" />
          </div>

          <div className="mb-2">
            <Badge variant="outline" className="text-zinc-300">
              SERVICE PROVIDER OPERATOR
            </Badge>
          </div>

          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
            Platform Operator Console
          </h1>
          <p className="text-xs text-zinc-400 mt-1 font-medium">
            Central endpoint provisioning &amp; hotel tenant management
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
              <Label htmlFor="admin-username">
                Operator Username
              </Label>
              <div className="relative">
                <User className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500 pointer-events-none" />
                <Input
                  id="admin-username"
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  className="pl-9 font-mono"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="admin-password">
                Operator Master Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500 pointer-events-none" />
                <Input
                  id="admin-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pl-9 font-mono"
                />
              </div>
            </div>

            <Button
              type="submit"
              variant="default"
              disabled={loading}
              className="w-full mt-2 font-bold"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogIn className="h-4 w-4" />
              )}
              <span>{loading ? 'Authenticating...' : 'Sign In as Operator'}</span>
            </Button>
          </form>

          <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between text-[11px] text-zinc-500">
            <a
              href="/"
              className="hover:text-zinc-300 flex items-center gap-1 transition-colors"
            >
              <ArrowLeft className="h-3 w-3" />
              <span>Hotel Owners Portal</span>
            </a>
            <span className="font-mono">SHMS Core</span>
          </div>
        </Card>
      </div>
    </div>
  );
}
