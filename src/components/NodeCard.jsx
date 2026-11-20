import React, { useState } from 'react';
import { Camera, RefreshCw, Sliders, Trash2, CheckCircle, Copy, Check } from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/sonner';

export default function NodeCard({
  node,
  onApprove,
  onRequestSnapshot,
  onTriggerSync,
  onOpenConfig,
  onDelete,
}) {
  const [copiedId, setCopiedId] = useState(false);
  const isOnline = node.status === 'online';
  const duplexConnected = Boolean(node.duplex_connected);
  const isPending = node.status === 'pending' || node.enrollment_status === 'pending';
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
    <Card className={`justify-between hover:border-zinc-700 transition-all ${
      isOnline ? 'border-zinc-800' : 'border-zinc-800/80 bg-zinc-950/20'
    }`}>
      <div>
        {/* Header */}
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full shrink-0 ${isOnline ? 'bg-emerald-500' : 'bg-zinc-600'}`} />
              <CardTitle className="text-sm font-bold text-white truncate" title={node.name}>
                {node.name}
              </CardTitle>
            </div>
            <CardDescription className="text-xs text-zinc-400 mt-0.5 truncate">
              {node.hotel_name} &bull; <span>{node.location}</span>
            </CardDescription>
          </div>

          <CardAction className="m-0 shrink-0">
            <Badge variant={isOnline ? 'outline' : 'destructive'} className={isOnline ? 'text-zinc-300' : ''}>
              {node.status}
            </Badge>
          </CardAction>
        </CardHeader>

        <CardContent className="p-0 pt-4">
          {/* Telemetry Row */}
          <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800/80 text-[11px]">
            <div>
              <span className="text-zinc-500 text-[10px] block">Kitchen Session ID</span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="font-mono text-zinc-200 font-semibold truncate block" title={node.id}>
                  {node.id}
                </span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(node.id);
                    toast.success(`Kitchen session ID ${node.id} copied`);
                    setCopiedId(true);
                    setTimeout(() => setCopiedId(false), 2000);
                  }}
                  title="Copy Kitchen Session ID"
                >
                  {copiedId ? (
                    <Check className="h-3 w-3 text-zinc-200" />
                  ) : (
                    <Copy className="h-3 w-3 text-zinc-500 hover:text-zinc-200" />
                  )}
                </Button>
              </div>
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
            <Badge variant="outline" className="text-zinc-300">
              <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-zinc-600'}`} />
              {isOnline ? 'Duplex linked' : 'Offline'}
            </Badge>
            {unsynced > 0 && (
              <Badge variant="warning">
                {unsynced} unsynced
              </Badge>
            )}
            <Badge variant="outline" className="text-zinc-400">
              Last sync {lastSync}
            </Badge>
            {telemetry.cpu_percent != null && (
              <Badge variant="outline" className="text-zinc-500">
                CPU {Math.round(telemetry.cpu_percent)}%
              </Badge>
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
                  <Badge key={c.id || c.name} variant="outline" className="text-zinc-300 gap-1.5 font-normal">
                    <span className={`h-1.5 w-1.5 rounded-full ${c.connected ? 'bg-emerald-500' : 'bg-zinc-600'}`} />
                    <span>{c.name}</span>
                    {c.fps != null && <span className="text-zinc-500">{c.fps}fps</span>}
                  </Badge>
                ))
              )}
            </div>
          </div>
        </CardContent>
      </div>

      {/* Action Toolbar */}
      <CardFooter className="p-0 mt-5 pt-4 border-t border-zinc-800/80 flex items-center justify-between gap-2">
        {isPending ? (
          <Button
            variant="default"
            className="flex-1 font-bold"
            onClick={() => onApprove && onApprove(node.request_id || node.id)}
            title="Approve this kitchen node to grant cloud access"
          >
            <CheckCircle className="h-4 w-4" />
            <span>Approve & Connect Node</span>
          </Button>
        ) : (
          <>
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => onRequestSnapshot(node)}
              disabled={!isOnline}
              title={isOnline ? "Capture a live JPEG snapshot from the edge camera" : "Edge appliance is offline"}
            >
              <Camera className="h-3.5 w-3.5 text-zinc-300" />
              <span>Live Snapshot</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => onTriggerSync(node)}
              disabled={!isOnline}
              title={isOnline ? "Ask the edge to sync pending incidents now" : "Edge appliance is offline"}
            >
              <RefreshCw className="h-3.5 w-3.5 text-zinc-300" />
              <span>Sync</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenConfig(node)}
              title="Remote Edge Settings & AMFV"
            >
              <Sliders className="h-3.5 w-3.5 text-zinc-300" />
              <span>Config</span>
            </Button>
          </>
        )}

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onDelete(node.id)}
          className="text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10"
          title="Deregister Node"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </CardFooter>
    </Card>
  );
}
