import React, { useState, useEffect, useCallback } from 'react';
import {
  Server,
  Image as ImageIcon,
  BarChart3,
  Settings,
  ServerOff,
  FileSpreadsheet,
  Building2,
  AlertTriangle,
  ArrowLeft,
  LogOut,
} from 'lucide-react';
import Navbar from './components/Navbar';
import KpiStrip from './components/KpiStrip';
import NodeCard from './components/NodeCard';
import LiveSnapshotModal from './components/LiveSnapshotModal';
import RemoteConfigModal from './components/RemoteConfigModal';
import EvidenceVault from './components/EvidenceVault';
import AnalyticsView from './components/AnalyticsView';
import SettingsView from './components/SettingsView';
import LoginView from './components/LoginView';
import HotelsManagerView from './components/HotelsManagerView';
import { api } from './services/api';

const RESERVED_PATHS = new Set(['', 'login', 'admin', 'evidence', 'analytics', 'settings', 'nodes']);

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);

  // Multi-Tenancy & Vanity URL State
  const [currentHotelPortal, setCurrentHotelPortal] = useState(null);
  const [hotelNotFound, setHotelNotFound] = useState(false);
  const [hotels, setHotels] = useState([]);
  const [selectedHotelId, setSelectedHotelId] = useState('all');

  // Navigation tab
  const [activeTab, setActiveTab] = useState('nodes');

  // Dashboard Data
  const [overview, setOverview] = useState({});
  const [nodes, setNodes] = useState([]);
  const [analytics, setAnalytics] = useState({});

  // Modals
  const [snapshotNode, setSnapshotNode] = useState(null);
  const [configNode, setConfigNode] = useState(null);

  // Detect vanity URL (e.g. /grand-hotel)
  const resolveVanityRoute = useCallback(async () => {
    const rawPath = window.location.pathname.replace(/^\/+|\/+$/g, '');
    if (rawPath && !RESERVED_PATHS.has(rawPath.toLowerCase())) {
      try {
        const res = await api.getPublicHotel(rawPath);
        if (res.exists && res.hotel) {
          setCurrentHotelPortal(res.hotel);
          setSelectedHotelId(res.hotel.id);
          setHotelNotFound(false);
          return res.hotel;
        } else {
          setHotelNotFound(true);
        }
      } catch {
        setHotelNotFound(true);
      }
    } else {
      setCurrentHotelPortal(null);
      setHotelNotFound(false);
    }
    return null;
  }, []);

  // Check auth session & vanity route on load
  useEffect(() => {
    const init = async () => {
      try {
        const [me, portal] = await Promise.all([
          api.getMe().catch(() => null),
          resolveVanityRoute(),
        ]);

        if (me && me.user) {
          setCurrentUser(me);
          if (me.is_superadmin) {
            // If superadmin visits root, default to hotels management
            if (!portal) {
              setActiveTab('hotels');
            }
          }
        }
      } finally {
        setAuthChecking(false);
      }
    };
    init();

    const handlePopState = () => resolveVanityRoute();
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [resolveVanityRoute]);

  // Load list of hotels for Superadmin
  const loadHotels = useCallback(async () => {
    if (!currentUser?.is_superadmin) return;
    try {
      const data = await api.getHotels();
      setHotels(data || []);
    } catch (e) {
      console.error('Failed to load hotels list', e);
    }
  }, [currentUser]);

  useEffect(() => {
    if (currentUser?.is_superadmin) {
      loadHotels();
    }
  }, [currentUser, loadHotels]);

  // Determine effective owner_id filter for queries
  const getEffectiveOwnerId = useCallback(() => {
    if (currentHotelPortal) {
      return currentHotelPortal.id;
    }
    if (currentUser?.is_superadmin) {
      return selectedHotelId && selectedHotelId !== 'all' ? selectedHotelId : null;
    }
    return currentUser?.owner_id || null;
  }, [currentHotelPortal, currentUser, selectedHotelId]);

  // Fetch dashboard data based on current scope
  const refreshData = useCallback(async () => {
    if (!currentUser) return;
    try {
      const effectiveOwner = getEffectiveOwnerId();
      const [ov, nd] = await Promise.all([
        api.getOverview(effectiveOwner),
        api.getNodes(effectiveOwner),
      ]);
      setOverview(ov || {});
      setNodes(nd || []);
    } catch (e) {
      console.error('Data poll error', e);
    }
  }, [currentUser, getEffectiveOwnerId]);

  useEffect(() => {
    if (!currentUser) return;
    refreshData();
    const effectiveOwner = getEffectiveOwnerId();
    api.getAnalytics(effectiveOwner).then(setAnalytics).catch(console.error);

    const interval = setInterval(refreshData, 5000);
    return () => clearInterval(interval);
  }, [currentUser, refreshData, getEffectiveOwnerId]);

  const handleLogout = async () => {
    try {
      await api.logout();
    } finally {
      setCurrentUser(null);
    }
  };

  const handleDeleteNode = async (edgeId) => {
    if (!window.confirm(`Are you sure you want to deregister node ${edgeId}?`)) return;
    try {
      await api.deleteNode(edgeId);
      refreshData();
      if (currentUser?.is_superadmin) loadHotels();
    } catch (e) {
      alert(e.message);
    }
  };

  const handleApproveNode = async (identifier) => {
    try {
      await api.approveEnrollment(identifier);
      refreshData();
      if (currentUser?.is_superadmin) loadHotels();
    } catch (e) {
      alert(`Approval error: ${e.message}`);
    }
  };

  const handleTriggerSync = async (node) => {
    try {
      const result = await api.triggerSync(node.id);
      alert(result.message || 'Sync requested');
      refreshData();
    } catch (e) {
      alert(e.message);
    }
  };

  if (authChecking) {
    return (
      <div className="min-h-screen bg-[#0f0f12] flex items-center justify-center text-zinc-500 text-xs font-mono">
        Authenticating Central Session...
      </div>
    );
  }

  // 404: Vanity hotel URL not found
  if (hotelNotFound) {
    return (
      <div className="min-h-screen bg-[#0f0f12] text-zinc-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-[#18181c] border border-zinc-800 rounded-2xl p-8 text-center space-y-4 shadow-2xl">
          <div className="h-12 w-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto text-amber-400">
            <Building2 className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold text-white">Hotel Portal Not Found</h1>
          <p className="text-xs text-zinc-400 leading-relaxed">
            The hotel vanity link <code className="text-emerald-400">{window.location.pathname}</code> does not match any registered hotel organization.
          </p>
          <div className="pt-2">
            <a
              href="/"
              className="inline-flex items-center gap-2 py-2 px-4 bg-white hover:bg-zinc-200 text-zinc-950 font-bold text-xs rounded-lg transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Go to Central Portal</span>
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Not logged in -> Show login view (branded for vanity hotel if present)
  if (!currentUser) {
    return (
      <LoginView
        hotel={currentHotelPortal}
        onLoginSuccess={(res) => {
          setCurrentUser(res);
          if (res.is_superadmin && !currentHotelPortal) {
            setActiveTab('hotels');
          }
        }}
        onClearHotel={() => {
          window.history.pushState({}, '', '/');
          setCurrentHotelPortal(null);
        }}
      />
    );
  }

  // Check unauthorized access if user is logged in to a DIFFERENT hotel than the vanity URL
  const isUnauthorizedTenant =
    currentHotelPortal &&
    !currentUser.is_superadmin &&
    currentUser.owner_id !== currentHotelPortal.id;

  if (isUnauthorizedTenant) {
    return (
      <div className="min-h-screen bg-[#0f0f12] text-zinc-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-[#18181c] border border-zinc-800 rounded-2xl p-8 text-center space-y-4 shadow-2xl">
          <div className="h-12 w-12 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mx-auto text-rose-400">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-bold text-white">Access Denied for this Hotel</h1>
          <p className="text-xs text-zinc-400 leading-relaxed">
            You are signed in as <code className="text-emerald-400">{currentUser.user}</code>, which belongs to another organization. You do not have permission to manage <strong className="text-white">{currentHotelPortal.name}</strong>.
          </p>
          <div className="pt-2 flex items-center justify-center gap-2">
            <button
              onClick={handleLogout}
              className="py-2 px-4 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold text-xs rounded-lg transition-colors flex items-center gap-1.5"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Sign Out &amp; Switch Account</span>
            </button>
            <a
              href="/"
              className="py-2 px-4 bg-white hover:bg-zinc-200 text-zinc-950 font-bold text-xs rounded-lg transition-colors"
            >
              My Dashboard
            </a>
          </div>
        </div>
      </div>
    );
  }

  const hotelNames = Array.from(new Set(nodes.map((n) => n.hotel_name).filter(Boolean)));

  return (
    <div className="bg-[#0f0f12] text-zinc-100 min-h-screen flex flex-col selection:bg-white selection:text-black">
      {/* Superadmin Impersonation / Vanity Header Alert */}
      {currentHotelPortal && currentUser.is_superadmin && (
        <div className="bg-emerald-500/10 border-b border-emerald-500/20 px-4 py-1.5 text-xs text-emerald-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span>
              Viewing as Superadmin: <strong>{currentHotelPortal.name}</strong> Portal (<code className="font-mono font-semibold">/{currentHotelPortal.slug}</code>)
            </span>
          </div>
          <button
            onClick={() => {
              window.history.pushState({}, '', '/');
              setCurrentHotelPortal(null);
              setSelectedHotelId('all');
              setActiveTab('hotels');
            }}
            className="text-[11px] font-semibold text-emerald-400 hover:text-white underline"
          >
            Return to Master Directory
          </button>
        </div>
      )}

      {/* Main Navbar */}
      <Navbar
        overview={overview}
        user={currentUser}
        onLogout={handleLogout}
        hotels={hotels}
        selectedHotelId={selectedHotelId}
        onSelectHotel={(hId) => {
          setSelectedHotelId(hId);
          if (hId !== 'all') {
            setActiveTab('nodes');
          }
        }}
        currentHotel={currentHotelPortal}
      />

      {/* Secondary Tab Bar */}
      <div className="border-b border-zinc-800/80 bg-[#141418] px-4 sm:px-6 py-2 flex items-center justify-between">
        <div className="flex items-center gap-1 overflow-x-auto">
          {/* Superadmin Hotels Directory Tab */}
          {currentUser.is_superadmin && !currentHotelPortal && (
            <button
              onClick={() => setActiveTab('hotels')}
              className={`flex items-center gap-2 py-1.5 px-3 rounded-lg text-xs font-bold transition-all shrink-0 ${
                activeTab === 'hotels'
                  ? 'bg-white text-zinc-950 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
              }`}
            >
              <Building2 className="h-3.5 w-3.5" />
              <span>Hotels Directory</span>
            </button>
          )}

          <button
            onClick={() => setActiveTab('nodes')}
            className={`flex items-center gap-2 py-1.5 px-3 rounded-lg text-xs font-bold transition-all shrink-0 ${
              activeTab === 'nodes'
                ? 'bg-white text-zinc-950 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            <Server className="h-3.5 w-3.5" />
            <span>
              {currentHotelPortal ? `${currentHotelPortal.name} Branches` : 'Edge Fleet Nodes'}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('evidence')}
            className={`flex items-center gap-2 py-1.5 px-3 rounded-lg text-xs font-bold transition-all shrink-0 ${
              activeTab === 'evidence'
                ? 'bg-white text-zinc-950 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            <ImageIcon className="h-3.5 w-3.5" />
            <span>Evidence Vault</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('analytics');
              const effOwner = getEffectiveOwnerId();
              api.getAnalytics(effOwner).then(setAnalytics).catch(console.error);
            }}
            className={`flex items-center gap-2 py-1.5 px-3 rounded-lg text-xs font-bold transition-all shrink-0 ${
              activeTab === 'analytics'
                ? 'bg-white text-zinc-950 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            <span>Compliance &amp; Analytics</span>
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-2 py-1.5 px-3 rounded-lg text-xs font-bold transition-all shrink-0 ${
              activeTab === 'settings'
                ? 'bg-white text-zinc-950 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            <Settings className="h-3.5 w-3.5" />
            <span>System Settings</span>
          </button>
        </div>

        <div>
          <a
            href="/api/fleet/export/csv"
            download
            className="py-1 px-2.5 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-zinc-400" />
            <span className="hidden sm:inline">Export Fleet CSV</span>
          </a>
        </div>
      </div>

      {/* KPI Metric Strip */}
      <KpiStrip overview={overview} />

      {/* Main Tab Content */}
      <main className="flex-1 p-4 sm:p-6 overflow-y-auto">
        {/* Superadmin Hotels Directory */}
        {activeTab === 'hotels' && currentUser.is_superadmin && !currentHotelPortal && (
          <HotelsManagerView
            hotels={hotels}
            onRefresh={loadHotels}
            onSelectHotel={(hId) => {
              setSelectedHotelId(hId);
              setActiveTab('nodes');
            }}
          />
        )}

        {/* Nodes Grid */}
        {activeTab === 'nodes' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-white">
                  {currentHotelPortal
                    ? `${currentHotelPortal.name} — Deployed Kitchen Branches`
                    : 'Deployed Hotel Edge Devices'}
                </h2>
                <p className="text-xs text-zinc-400">
                  {currentHotelPortal
                    ? `Live camera feeds, AI telemetry, and remote management for ${currentHotelPortal.name}`
                    : 'Live health, AI telemetry, and remote management across all hotel kitchens'}
                </p>
              </div>

              {selectedHotelId && selectedHotelId !== 'all' && currentUser.is_superadmin && (
                <button
                  onClick={() => setSelectedHotelId('all')}
                  className="text-xs text-emerald-400 hover:text-white font-semibold"
                >
                  Clear Hotel Filter (Show All)
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {nodes.length === 0 ? (
                <div className="col-span-full py-20 text-center text-zinc-500 border border-dashed border-zinc-800 rounded-2xl p-8">
                  <ServerOff className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
                  <div className="text-sm font-semibold text-zinc-300">
                    No Edge Devices Registered Yet
                  </div>
                  <div className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">
                    When you run the Smart Hotel Monitoring edge system with this hotel's connection, it will automatically appear here.
                  </div>
                </div>
              ) : (
                nodes.map((node) => (
                  <NodeCard
                    key={node.id}
                    node={node}
                    onApprove={handleApproveNode}
                    onRequestSnapshot={(n) => setSnapshotNode(n)}
                    onTriggerSync={handleTriggerSync}
                    onOpenConfig={(n) => setConfigNode(n)}
                    onDelete={handleDeleteNode}
                  />
                ))
              )}
            </div>
          </div>
        )}

        {/* Evidence Vault */}
        {activeTab === 'evidence' && (
          <EvidenceVault
            hotels={hotelNames}
            onViolationsChanged={refreshData}
            ownerId={getEffectiveOwnerId()}
          />
        )}

        {/* Analytics */}
        {activeTab === 'analytics' && (
          <AnalyticsView analytics={analytics} />
        )}

        {/* Settings */}
        {activeTab === 'settings' && (
          <SettingsView />
        )}
      </main>

      {/* Modals */}
      <LiveSnapshotModal
        isOpen={Boolean(snapshotNode)}
        node={snapshotNode}
        onClose={() => setSnapshotNode(null)}
      />

      <RemoteConfigModal
        isOpen={Boolean(configNode)}
        node={configNode}
        onClose={() => setConfigNode(null)}
        onSuccess={refreshData}
      />
    </div>
  );
}
