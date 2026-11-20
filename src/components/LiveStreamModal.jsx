import React, { useState, useEffect } from 'react';
import { Video } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

export default function LiveStreamModal({ isOpen, onClose, node }) {
  const [selectedCamId, setSelectedCamId] = useState('');

  useEffect(() => {
    if (node && node.cameras && node.cameras.length > 0) {
      setSelectedCamId(node.cameras[0].id);
    }
  }, [node]);

  if (!node) return null;

  const cameras = node.cameras || [];
  const streamUrl = selectedCamId ? `/api/proxy/stream/${node.id}/${selectedCamId}` : '';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl p-0 gap-0 overflow-hidden border-zinc-800 bg-[#18181c]">
        {/* Modal Header */}
        <DialogHeader className="p-4 border-b border-zinc-800 text-left">
          <DialogTitle className="text-sm font-bold text-white flex items-center gap-2">
            <Video className="h-4 w-4 text-emerald-400" />
            {node.name} &mdash; Live CCTV Feeds
          </DialogTitle>
          <DialogDescription className="text-xs text-zinc-400">
            {node.hotel_name} &bull; {node.location}
          </DialogDescription>
        </DialogHeader>

        {/* Camera Switcher Pills */}
        <div className="px-4 py-2 border-b border-zinc-800 bg-zinc-900/60 flex items-center gap-1.5 overflow-x-auto">
          {cameras.length === 0 ? (
            <span className="text-xs text-zinc-500 italic">No cameras attached</span>
          ) : (
            cameras.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedCamId(c.id)}
                className={`px-3 py-1 rounded-md text-xs font-medium border transition-all ${
                  selectedCamId === c.id 
                    ? 'bg-white text-zinc-950 border-white shadow-sm' 
                    : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white'
                }`}
              >
                {c.name}
              </button>
            ))
          )}
        </div>

        {/* Video Player Stage */}
        <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden">
          {streamUrl ? (
            <img 
              src={streamUrl} 
              alt="Live Edge Stream" 
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="text-zinc-600 text-xs">No active camera stream</div>
          )}

          <div className="absolute top-3 left-3 flex items-center gap-2 px-2 py-1 rounded bg-black/70 border border-zinc-800 text-[10px] font-mono text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 pulse-emerald" />
            <span>LIVE PROXIED STREAM</span>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-zinc-800 text-right bg-zinc-950/40">
          <button 
            onClick={onClose} 
            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold rounded-lg"
          >
            Close Stream
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
