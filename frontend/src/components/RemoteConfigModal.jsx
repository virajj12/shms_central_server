import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { api } from '../services/api';

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

  if (!isOpen || !node) return null;

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop">
      <div className="bg-[#18181c] border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white">Remote Edge Configuration</h3>
            <div className="text-xs text-zinc-400">{node.name} &bull; {node.hotel_name}</div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-300">AMFV Rolling Window Size (Frames)</label>
            <input 
              type="number" 
              value={windowSize} 
              onChange={(e) => setWindowSize(e.target.value)}
              min="1" 
              max="30" 
              className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-white font-mono focus:outline-none focus:border-zinc-500" 
            />
            <p className="text-[10px] text-zinc-500">Number of consecutive frames over which consensus is computed (default: 2-10).</p>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <label className="font-semibold text-zinc-300">Pest Consensus Threshold</label>
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
              <label className="font-semibold text-zinc-300">Hygiene (PPE) Consensus Threshold</label>
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
            <label className="text-xs font-semibold text-zinc-300">Alert Cooldown (Seconds)</label>
            <input 
              type="number" 
              value={cooldown} 
              onChange={(e) => setCooldown(e.target.value)}
              min="5" 
              max="300" 
              className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-white font-mono focus:outline-none focus:border-zinc-500" 
            />
          </div>

          <div className="pt-3 border-t border-zinc-800 flex justify-end gap-2">
            <button 
              type="button" 
              onClick={onClose} 
              className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-semibold rounded-lg border border-zinc-800"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={saving}
              className="px-3 py-1.5 bg-white hover:bg-zinc-200 text-zinc-950 text-xs font-bold rounded-lg shadow-sm"
            >
              {saving ? 'Pushing...' : 'Push Config to Edge'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

