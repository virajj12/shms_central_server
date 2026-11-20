import React, { useState, useEffect } from 'react';
import { Sliders } from 'lucide-react';
import { api } from '../services/api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function RemoteConfigModal({ isOpen, onClose, node, onSuccess }) {
  const [windowSize, setWindowSize] = useState(2);
  const [pestThreshold, setPestThreshold] = useState(20);
  const [hygieneThreshold, setHygieneThreshold] = useState(40);
  const [cooldown, setCooldown] = useState(30);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (node) {
      const cfg = node.config || {};
      setWindowSize(cfg.window_size || 2);
      setPestThreshold(Math.round((cfg.threshold_pest ?? 0.20) * 100));
      setHygieneThreshold(Math.round((cfg.threshold_hygiene ?? 0.40) * 100));
      setCooldown(cfg.cooldown ?? 30);
    }
  }, [node]);

  if (!node) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        window_size: parseInt(windowSize),
        threshold_pest: parseFloat(pestThreshold) / 100,
        threshold_hygiene: parseFloat(hygieneThreshold) / 100,
        cooldown: parseInt(cooldown),
      };
      await api.pushConfig(node.id, payload);
      alert(`Configuration queued for ${node.name}! It will be applied automatically on its next heartbeat.`);
      onSuccess?.();
      onClose();
    } catch (err) {
      alert(`Failed to push configuration: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md p-0 gap-0 overflow-hidden border-zinc-800 bg-[#18181c]">
        <DialogHeader className="p-4 border-b border-zinc-800 text-left">
          <DialogTitle className="text-sm font-bold text-white flex items-center gap-2">
            <Sliders className="h-4 w-4 text-emerald-400" />
            Remote Edge Configuration
          </DialogTitle>
          <DialogDescription className="text-xs text-zinc-400">
            {node.name} &bull; {node.hotel_name}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="space-y-1">
            <Label htmlFor="window-size">
              AMFV Rolling Window Size (Frames)
            </Label>
            <Input 
              id="window-size"
              type="number" 
              value={windowSize} 
              onChange={(e) => setWindowSize(e.target.value)}
              min="1" 
              max="30" 
              className="font-mono"
            />
            <p className="text-[10px] text-zinc-500">Number of consecutive frames over which consensus is computed (default: 2-10).</p>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <Label>Pest Consensus Threshold</Label>
              <span className="font-mono text-rose-400 font-bold">{pestThreshold}%</span>
            </div>
            <input 
              type="range" 
              min="5" 
              max="90" 
              step="5" 
              value={pestThreshold}
              onChange={(e) => setPestThreshold(e.target.value)}
              className="w-full accent-rose-500" 
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <Label>Hygiene (PPE) Consensus Threshold</Label>
              <span className="font-mono text-amber-400 font-bold">{hygieneThreshold}%</span>
            </div>
            <input 
              type="range" 
              min="5" 
              max="90" 
              step="5" 
              value={hygieneThreshold}
              onChange={(e) => setHygieneThreshold(e.target.value)}
              className="w-full accent-amber-500" 
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="cooldown-sec">
              Alert Cooldown (Seconds)
            </Label>
            <Input 
              id="cooldown-sec"
              type="number" 
              value={cooldown} 
              onChange={(e) => setCooldown(e.target.value)}
              min="5" 
              max="300" 
              className="font-mono"
            />
          </div>

          <div className="pt-3 border-t border-zinc-800 flex justify-end gap-2 bg-zinc-950/20 -mx-4 -mb-4 p-4">
            <Button 
              type="button" 
              variant="outline"
              size="sm"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              size="sm"
              disabled={saving}
            >
              {saving ? 'Pushing...' : 'Push Config to Edge'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
