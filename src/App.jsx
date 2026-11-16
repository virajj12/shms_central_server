import React, { useState, useEffect } from 'react';
import { Server, Image as ImageIcon, BarChart3, Settings, ServerOff, FileSpreadsheet } from 'lucide-react';
import Navbar from './components/Navbar';
import KpiStrip from './components/KpiStrip';
import NodeCard from './components/NodeCard';
import LiveSnapshotModal from './components/LiveSnapshotModal';
import RemoteConfigModal from './components/RemoteConfigModal';
import EvidenceVault from './components/EvidenceVault';
import AnalyticsView from './components/AnalyticsView';
import SettingsView from './components/SettingsView';
import LoginView from './components/LoginView';
import { api } from './services/api';

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [activeTab, setActiveTab] = useState('nodes');

  const [overview, setOverview] = useState({});
  const [nodes, setNodes] = useState([]);
  const [analytics, setAnalytics] = useState({});

  const [snapshotNode, setSnapshotNode] = useState(null);
  const [configNode, setConfigNode] = useState(null);

  // Check existing session
  useEffect(() => {
    api.getMe()
      .then((res) => {
        if (res && res.user) setCurrentUser(res.user);
      })
      .catch(() => {
        setCurrentUser(null);
      })
      .finally(() => setAuthChecking(false));
  }, []);

  const refreshData = async () => {
    try {
      const [ov, nd] = await Promise.all([api.getOverview(), api.getNodes()]);
      setOverview(ov);
      setNodes(nd);
    } catch (e) {
      console.error('Data poll error', e);
    }
  };

  useEffect(() => {
    if (!currentUser) return;
    refreshData();
    api.getAnalytics().then(setAnalytics).catch(console.error);

    const interval = setInterval(refreshData, 5000);
    return () => clearInterval(interval);
  }, [currentUser]);

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
    } catch (e) {
      alert(e.message);
    }
  };

  const handleApproveNode = async (identifier) => {
    try {
      await api.approveEnrollment(identifier);
      refreshData();
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

  if (!currentUser) {
    return <LoginView onLoginSuccess={(u) => setCurrentUser(u)} />;
  }

  const hotels = Array.from(new Set(nodes.map((n) => n.hotel_name).filter(Boolean)));

  return (
    <div className="bg-[#0f0f12] text-zinc-100 min-h-screen flex flex-col selection:bg-white selection:text-black">
      {/* Navbar */}
      <Navbar overview={overview} user={currentUser} onLogout={handleLogout} />

      {/* Secondary Tab Bar */}
      <div className="border-b border-zinc-800/80 bg-[#141418] px-4 sm:px-6 py-2 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab('nodes')}
            className={`flex items-center gap-2 py-1.5 px-3 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'nodes' ? 'bg-white text-zinc-950 shadow-sm' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            <Server className="h-3.5 w-3.5" />
            <span>Edge Fleet Nodes</span>
          </button>

          <button
            onClick={() => setActiveTab('evidence')}
            className={`flex items-center gap-2 py-1.5 px-3 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'evidence' ? 'bg-white text-zinc-950 shadow-sm' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            <ImageIcon className="h-3.5 w-3.5" />
            <span>Global Evidence Vault</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('analytics');
              api.getAnalytics().then(setAnalytics).catch(console.error);
            }}
            className={`flex items-center gap-2 py-1.5 px-3 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'analytics' ? 'bg-white text-zinc-950 shadow-sm' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            <span>Compliance & Analytics</span>
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-2 py-1.5 px-3 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'settings' ? 'bg-white text-zinc-950 shadow-sm' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
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
            className="py-1 px-2.5 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-zinc-400" />
            <span>Export Fleet CSV</span>
          </a>
        </div>
      </div>

      {/* KPI Metric Strip */}
      <KpiStrip overview={overview} />

      {/* Main Tab Content */}
      <main className="flex-1 p-4 sm:p-6 overflow-y-auto">
        {activeTab === 'nodes' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-bold text-white">Deployed Hotel Edge Devices</h2>
              <p className="text-xs text-zinc-400">Live health, AI telemetry, and remote management across all hotel kitchens</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {nodes.length === 0 ? (
                <div className="col-span-full py-20 text-center text-zinc-500 border border-dashed border-zinc-800 rounded-2xl p-8">
                  <ServerOff className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
                  <div className="text-sm font-semibold text-zinc-300">No Edge Devices Registered Yet</div>
                  <div className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">
                    When you run the Smart Hotel Monitoring edge system with central sync enabled, it will automatically appear here.
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

        {activeTab === 'evidence' && (
          <EvidenceVault hotels={hotels} onViolationsChanged={refreshData} />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsView analytics={analytics} />
        )}

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

