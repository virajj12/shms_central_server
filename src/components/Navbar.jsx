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
  KeyRound,
  X,
} from 'lucide-react';
import { api } from '../services/api';

export default function Navbar({ overview, user, onLogout }) {
  const [clock, setClock] = useState('');
  const [ownerInfo, setOwnerInfo] = useState(null);
  const [pending, setPending] = useState([]);
  const [showPending, setShowPending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loadingPending, setLoadingPending] = useState(false);

  // Pairing PIN Modal State
  const [showPairingModal, setShowPairingModal] = useState(false);
  const [pairingHotel, setPairingHotel] = useState('Grand Hotel & Suites');
  const [pairingKitchen, setPairingKitchen] = useState('Main Prep Kitchen');
  const [generatedCode, setGeneratedCode] = useState(null);
  const [generatingPin, setGeneratingPin] = useState(false);
  const [copiedPin, setCopiedPin] = useState(false);

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

  const handleGeneratePairingCode = async (e) => {
    e?.preventDefault();
    setGeneratingPin(true);
    try {
      const result = await api.createPairingCode({
        hotel_name: pairingHotel || 'Grand Hotel & Suites',
        kitchen_name: pairingKitchen || 'Main Kitchen',
        ttl_minutes: 60,
      });
      setGeneratedCode(result);
    } catch (err) {
      alert(`Failed to generate pairing code: ${err.message}`);
    } finally {
      setGeneratingPin(false);
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
            onClick={() => {
              setShowPairingModal(true);
              if (!generatedCode) handleGeneratePairingCode();
            }}
            className="h-8 px-2.5 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
            title="Generate a Pairing Session Code for a kitchen edge server"
          >
            <KeyRound className="h-3.5 w-3.5 text-amber-400" />
            <span className="hidden sm:inline">Pairing PIN</span>
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
      {/* Pairing Session Code Modal */}
      {showPairingModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#18181c] border border-zinc-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-amber-400" />
                <h3 className="text-sm font-bold text-white">Kitchen Pairing Session PIN</h3>
              </div>
              <button
                onClick={() => setShowPairingModal(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              Generate a 6-digit session PIN to share with a kitchen edge computer. When entered in the Edge Server's connection modal, it immediately links and auto-approves.
            </p>

            {generatedCode ? (
              <div className="bg-zinc-900 border border-amber-500/30 rounded-xl p-4 text-center space-y-3">
                <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400/80">Active 6-Digit Pairing PIN</span>
                <div className="text-3xl font-mono font-bold tracking-widest text-amber-300">
                  {generatedCode.code}
                </div>
                <div className="text-[11px] text-zinc-400">
                  Valid for 60 minutes &bull; Hotel: <span className="text-zinc-200 font-semibold">{generatedCode.hotel_name}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(generatedCode.code);
                    setCopiedPin(true);
                    setTimeout(() => setCopiedPin(false), 2000);
                  }}
                  className="w-full py-2 bg-amber-400 hover:bg-amber-300 text-zinc-950 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                >
                  {copiedPin ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  <span>{copiedPin ? 'Copied PIN to Clipboard!' : 'Copy Pairing PIN'}</span>
                </button>
              </div>
            ) : null}

            <form onSubmit={handleGeneratePairingCode} className="space-y-3 pt-2">
              <div>
                <label className="text-[11px] font-semibold text-zinc-400 block mb-1">Hotel Branch</label>
                <input
                  type="text"
                  value={pairingHotel}
                  onChange={(e) => setPairingHotel(e.target.value)}
                  className="w-full h-8 px-2.5 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-zinc-200 focus:outline-none focus:border-white"
                  placeholder="e.g. Grand Hotel & Suites"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-zinc-400 block mb-1">Kitchen / Section Name</label>
                <input
                  type="text"
                  value={pairingKitchen}
                  onChange={(e) => setPairingKitchen(e.target.value)}
                  className="w-full h-8 px-2.5 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-zinc-200 focus:outline-none focus:border-white"
                  placeholder="e.g. Main Prep Kitchen"
                />
              </div>
              <button
                type="submit"
                disabled={generatingPin}
                className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${generatingPin ? 'animate-spin' : ''}`} />
                <span>{generatingPin ? 'Generating...' : 'Generate New PIN'}</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
