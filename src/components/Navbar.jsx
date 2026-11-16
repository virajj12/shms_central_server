import React, { useCallback, useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Inbox,
  LogOut,
  RefreshCw,
  ShieldCheck,
  UserCheck,
  XCircle,
} from 'lucide-react';
import { api } from '../services/api';

export default function Navbar({ overview, user, onLogout }) {
  const [clock, setClock] = useState('');
  const [ownerInfo, setOwnerInfo] = useState(null);
  const [pending, setPending] = useState([]);
  const [showPending, setShowPending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loadingPending, setLoadingPending] = useState(false);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setClock(now.toLocaleTimeString('en-US', { hour12: false }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const loadOwnerData = useCallback(async () => {
    if (!user) return;
    try {
      const [info, enrollment] = await Promise.all([
        api.getOwnerInfo(),
        api.getPendingEnrollments(),
      ]);
      setOwnerInfo(info);
      const rawEdges = Array.isArray(enrollment) ? enrollment : (enrollment?.edges || []);
      setPending(rawEdges);
    } catch (error) {
      console.error('Owner data load failed', error);
    }
  }, [user]);

  useEffect(() => {
    loadOwnerData();
    const interval = setInterval(loadOwnerData, 10000);
    return () => clearInterval(interval);
  }, [loadOwnerData]);

  const total = overview?.total_nodes || 0;
  const online = overview?.online_nodes || 0;
  const ownerId = ownerInfo?.owner_id || user?.owner_id || 'OWN-DEFAULT-SYSTEM';
  const companyName = ownerInfo?.owner?.company_name || 'Default Hotel Management';

  const copyOwnerId = async () => {
    try {
      await navigator.clipboard.writeText(ownerId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      console.error('Copy owner ID failed', error);
    }
  };

  const refreshPending = async () => {
    setLoadingPending(true);
    try {
      await loadOwnerData();
    } finally {
      setLoadingPending(false);
    }
  };

  const approveEnrollment = async (requestId) => {
    try {
      await api.approveEnrollment(requestId);
      await loadOwnerData();
    } catch (error) {
      alert(error.message);
    }
  };

  const rejectEnrollment = async (requestId) => {
    const reason = window.prompt('Reason for rejecting this enrollment:', 'Rejected by owner');
    if (reason === null) return;
    try {
      await api.rejectEnrollment(requestId, reason);
      await loadOwnerData();
    } catch (error) {
      alert(error.message);
    }
  };

  return (
    <>
      <header className="h-14 border-b border-zinc-800 bg-[#18181c]/90 backdrop-blur sticky top-0 z-40 px-4 sm:px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-zinc-900 border border-zinc-700 flex items-center justify-center">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white tracking-tight">SHMS Central Fleet</span>
              <span className="px-1.5 py-0.2 text-[9px] font-mono bg-zinc-800 text-zinc-300 rounded border border-zinc-700">ENTERPRISE REACT</span>
            </div>
            <div className="text-[10px] text-zinc-400">Multi-Edge Hotel CCTV Surveillance & Compliance Hub</div>
          </div>
        </div>

        {/* Center Fleet Health Pill */}
        <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-xs">
          <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] pulse-emerald" />
          <span className="text-zinc-300 font-medium">
            {online} of {total} Edge{total === 1 ? '' : 's'} Online
          </span>
          <span className="text-zinc-600">&bull;</span>
          <span className="font-mono text-zinc-400 text-[11px]">{clock}</span>
        </div>

        {/* Right User Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={copyOwnerId}
            className="hidden lg:flex items-center gap-2 h-8 px-2.5 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-left transition-colors"
            title={`Copy owner ID: ${ownerId}`}
          >
            <div className="min-w-0">
              <div className="text-[9px] text-zinc-400 font-semibold truncate max-w-[170px]">{companyName}</div>
              <div className="text-[10px] font-mono text-zinc-200 truncate max-w-[170px]">{ownerId}</div>
            </div>
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <Copy className="h-3.5 w-3.5 text-zinc-500" />
            )}
          </button>

          <button
            onClick={() => setShowPending(true)}
            className="relative h-8 px-2.5 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
            title="Review pending edge enrollments"
          >
            <Inbox className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Approvals</span>
            {pending.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-4 h-4 px-1 rounded-full bg-amber-400 text-zinc-950 text-[10px] font-bold flex items-center justify-center">
                {pending.length}
              </span>
            )}
          </button>

          <div className="hidden sm:flex items-center gap-2 text-xs text-zinc-400">
            <UserCheck className="h-3.5 w-3.5 text-zinc-300" />
            <span className="font-semibold text-zinc-200">{user?.username || user?.user || 'Admin'}</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-800 text-zinc-400">
              {user?.is_superadmin ? 'SUPERADMIN' : 'ADMIN'}
            </span>
          </div>

          <button
            onClick={onLogout}
            className="h-8 px-3 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
            title="Sign out of Central Console"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      {showPending && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-end"
          onClick={() => setShowPending(false)}
        >
          <aside
            className="h-full w-full max-w-md bg-[#18181c] border-l border-zinc-800 shadow-2xl flex flex-col"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <div>
                <div className="text-sm font-bold text-white">Pending Edge Enrollments</div>
                <div className="text-[11px] text-zinc-500">{companyName}</div>
              </div>
              <button
                onClick={refreshPending}
                className="h-8 w-8 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 flex items-center justify-center"
                title="Refresh"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loadingPending ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {pending.length === 0 ? (
                <div className="text-center py-12 text-zinc-500 text-xs">
                  No pending enrollment requests.
                </div>
              ) : (
                pending.map((edge) => (
                  <div key={edge.request_id || edge.id} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-bold text-white">{edge.name || edge.kitchen_name}</div>
                        <div className="text-[11px] text-zinc-400">{edge.hotel_name} &bull; {edge.location || 'Unknown location'}</div>
                      </div>
                      <span className="px-1.5 py-0.5 rounded bg-amber-400/10 border border-amber-400/30 text-[10px] font-mono text-amber-300">
                        PENDING
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-zinc-400">
                      <div>ID: {edge.id}</div>
                      <div>PIN: {edge.pairing_pin || '—'}</div>
                      <div className="col-span-2 truncate">Request: {edge.request_id || edge.id}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => approveEnrollment(edge.request_id || edge.id)}
                        className="h-8 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-bold"
                      >
                        Approve &amp; Connect
                      </button>
                      <button
                        onClick={() => rejectEnrollment(edge.request_id || edge.id)}
                        className="h-8 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center justify-center gap-1"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Reject
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
