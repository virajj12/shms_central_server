import React from 'react';
import { Camera, RefreshCw, Sliders, Trash2 } from 'lucide-react';

export default function NodeCard({
  node,
  onRequestSnapshot,
  onTriggerSync,
  onOpenConfig,
  onDelete,
}) {
  const isOnline = node.status === 'online';
  const duplexConnected = Boolean(node.duplex_connected);
  const cameras = node.cameras || [];
  const telemetry = node.telemetry || {};
  const unsynced = Number(node.unsynced_count || 0);
  const lastSeen = node.last_heartbeat
    ? new Date(node.last_heartbeat).toLocaleTimeString()
    : 'N/A';
  const lastSync = node.last_hourly_sync
    ? new Date(node.last_hourly_sync).toLocaleTimeString()
    : 'Never';

  return (
    <div className={`bg-[#18181c] border ${isOnline ? 'border-zinc-800' : 'border-rose-950/40 bg-rose-950/5'} rounded-2xl p-5 shadow-lg flex flex-col justify-between hover:border-zinc-700 transition-all`}>
      <div>
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${isOnline ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] pulse-emerald' : 'bg-rose-500'}`} />
              <h3 className="text-sm font-bold text-white truncate" title={node.name}>{node.name}</h3>
            </div>
            <div className="text-xs text-zinc-400 mt-0.5 truncate">
              {node.hotel_name} &bull; <span>{node.location}</span>
            </div>
          </div>

          <span className={`px-2 py-0.5 text-[10px] font-mono uppercase font-bold rounded ${isOnline ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'}`}>
            {node.status}
          </span>
        </div>

        {/* Telemetry Row */}
        <div className="grid grid-cols-3 gap-2 mt-4 p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800/80 text-[11px]">
          <div>
            <span className="text-zinc-500 text-[10px] block">Kitchen ID</span>
            <span className="font-mono text-zinc-300 truncate block" title={node.id}>{node.id}</span>
          </div>
          <div>
            <span className="text-zinc-500 text-[10px] block">Cameras</span>
            <span className="font-mono text-white font-semibold block">{cameras.length} Active</span>
          </div>
          <div>
            <span className="text-zinc-500 text-[10px] block">Last Ping</span>
            <span className="font-mono text-zinc-400 block">{lastSeen}</span>
          </div>
        </div>

        {/* Duplex Sync Strip */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
          <span className={`px-2 py-0.5 rounded border ${duplexConnected ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-zinc-700 bg-zinc-900 text-zinc-500'}`}>
            <span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${duplexConnected ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
            Duplex {duplexConnected ? 'linked' : 'offline'}
          </span>
          <span className={`px-2 py-0.5 rounded border ${unsynced > 0 ? 'border-amber-700/40 bg-amber-500/10 text-amber-300' : 'border-zinc-700 bg-zinc-900 text-zinc-500'}`}>
            {unsynced} unsynced
          </span>
          <span className="px-2 py-0.5 rounded border border-zinc-700 bg-zinc-900 text-zinc-400">
            Last sync {lastSync}
          </span>
          {telemetry.cpu_percent != null && (
            <span className="px-2 py-0.5 rounded border border-zinc-800 bg-zinc-900/60 text-zinc-500">
              CPU {Math.round(telemetry.cpu_percent)}%
            </span>
          )}
        </div>

        {/* Active Cameras Badges */}
        <div className="mt-3">
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1.5">Monitored Feeds</span>
          <div className="flex flex-wrap gap-1.5">
            {cameras.length === 0 ? (
              <span className="text-xs text-zinc-600 italic">No cameras attached</span>
            ) : (
              cameras.map((c) => (
                <span key={c.id || c.name} className="px-2 py-1 rounded-md text-[10px] font-mono bg-zinc-900 border border-zinc-800 text-zinc-300 flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${c.connected ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                  <span>{c.name}</span>
                  {c.fps != null && <span className="text-zinc-500">{c.fps}fps</span>}
                </span>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Action Toolbar */}
      <div className="mt-5 pt-4 border-t border-zinc-800 flex items-center justify-between gap-2">
        <button
          onClick={() => onRequestSnapshot(node)}
          disabled={!isOnline || !duplexConnected || cameras.length === 0}
          title="Capture a live JPEG snapshot from the edge camera"
          className="flex-1 py-1.5 px-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 disabled:opacity-40 disabled:pointer-events-none text-zinc-200 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors"
        >
          <Camera className="h-3.5 w-3.5 text-emerald-400" />
          <span>Live Snapshot</span>
        </button>

        <button
          onClick={() => onTriggerSync(node)}
          disabled={!isOnline || !duplexConnected}
          title="Ask the edge to sync pending incidents now"
          className="py-1.5 px-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 disabled:opacity-40 disabled:pointer-events-none text-zinc-200 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5 text-sky-400" />
          <span>Sync</span>
        </button>

        <button
          onClick={() => onOpenConfig(node)}
          className="py-1.5 px-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-zinc-200 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors"
          title="Remote Edge Settings & AMFV"
        >
          <Sliders className="h-3.5 w-3.5 text-zinc-400" />
          <span>Config</span>
        </button>

        <button
          onClick={() => onDelete(node.id)}
          className="p-1.5 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
          title="Deregister Node"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
