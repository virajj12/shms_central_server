import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { api } from '../services/api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export default function LiveSnapshotModal({ isOpen, onClose, node }) {
  const [selectedCamId, setSelectedCamId] = useState('');
  const [image, setImage] = useState('');
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const cameras = node?.cameras || [];

  const fetchSnapshot = useCallback(
    async (cameraId) => {
      if (!node) return;
      setLoading(true);
      setError('');
      setImage('');
      setMeta(null);
      try {
        const result = await api.requestSnapshot(node.id, cameraId || null);
        setImage(`data:image/jpeg;base64,${result.image_base64}`);
        setMeta(result);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [node]
  );

  useEffect(() => {
    if (!isOpen || !node) return;
    const firstCamera = node.cameras?.[0]?.id || '';
    setSelectedCamId(firstCamera);
    fetchSnapshot(firstCamera);
  }, [isOpen, node, fetchSnapshot]);

  if (!node) return null;

  const handleSelectCamera = (cameraId) => {
    setSelectedCamId(cameraId);
    fetchSnapshot(cameraId);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl p-0 gap-0 overflow-hidden border-zinc-800 bg-[#18181c]">
        <DialogHeader className="p-4 border-b border-zinc-800 text-left">
          <DialogTitle className="text-sm font-bold text-white flex items-center gap-2">
            <Camera className="h-4 w-4 text-zinc-300" />
            {node.name} &mdash; Live Snapshot
          </DialogTitle>
          <DialogDescription className="text-xs text-zinc-400">
            {node.hotel_name} &bull; {node.location}
          </DialogDescription>
        </DialogHeader>

        <div className="px-4 py-2 border-b border-zinc-800 bg-zinc-900/60 flex items-center gap-1.5 overflow-x-auto">
          {cameras.length === 0 ? (
            <span className="text-xs text-zinc-500 italic">No cameras attached</span>
          ) : (
            cameras.map((camera) => (
              <button
                key={camera.id}
                onClick={() => handleSelectCamera(camera.id)}
                disabled={loading}
                className={`px-3 py-1 rounded-md text-xs font-medium border transition-all disabled:opacity-50 ${
                  selectedCamId === camera.id
                    ? 'bg-white text-zinc-950 border-white shadow-sm'
                    : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white'
                }`}
              >
                {camera.name}
              </button>
            ))
          )}
        </div>

        <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden">
          {loading && (
            <div className="flex flex-col items-center gap-2 text-zinc-400">
              <Loader2 className="h-7 w-7 animate-spin text-emerald-400" />
              <span className="text-xs font-mono">Requesting snapshot from edge...</span>
            </div>
          )}

          {!loading && image && (
            <img
              src={image}
              alt={`Live snapshot from ${node.name}`}
              className="w-full h-full object-contain"
            />
          )}

          {!loading && !image && (
            <div className="flex flex-col items-center gap-2 px-8 text-center text-rose-300">
              <AlertTriangle className="h-7 w-7" />
              <span className="text-xs">{error || 'No snapshot received'}</span>
            </div>
          )}

          {!loading && image && (
            <div className="absolute top-3 left-3 flex items-center gap-2 px-2 py-1 rounded bg-black/70 border border-zinc-800 text-[10px] font-mono text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 pulse-emerald" />
              <span>ON-DEMAND EDGE SNAPSHOT</span>
            </div>
          )}
        </div>

        <div className="p-3 border-t border-zinc-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-zinc-950/40">
          <div className="text-[11px] text-zinc-400 font-mono">
            {meta?.camera_name && <span>{meta.camera_name} &bull; </span>}
            {meta?.timestamp ? new Date(meta.timestamp).toLocaleString() : 'Awaiting capture'}
            {error && image && <span className="text-amber-300"> &bull; refresh failed</span>}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchSnapshot(selectedCamId)}
              disabled={loading}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={onClose}
            >
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
