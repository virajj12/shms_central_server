import React, { useState, useEffect } from 'react';
import { ShieldCheck, ZoomIn, Check } from 'lucide-react';
import { api } from '../services/api';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

export default function EvidenceVault({ hotels = [], onViolationsChanged, ownerId = null }) {
  const [violations, setViolations] = useState([]);
  const [selectedHotel, setSelectedHotel] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [zoomItem, setZoomItem] = useState(null);

  const fetchViolations = async () => {
    try {
      const data = await api.getViolations({
        owner_id: ownerId,
        category: categoryFilter,
        hotel_name: selectedHotel,
        limit: 80,
      });
      setViolations(data || []);
    } catch (e) {
      console.error('Failed to load violations', e);
    }
  };

  useEffect(() => {
    fetchViolations();
  }, [selectedHotel, categoryFilter, ownerId]);

  const handleAcknowledge = async (id, e) => {
    e.stopPropagation();
    try {
      await api.acknowledgeViolation(id);
      setViolations((prev) =>
        prev.map((v) => (v.id === id ? { ...v, acknowledged: true } : v))
      );
      onViolationsChanged?.();
    } catch (e) {
      console.error('Failed to acknowledge', e);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header & Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-white">Surveillance Snapshot Evidence Vault</h2>
          <p className="text-xs text-zinc-400">Aggregated high-resolution evidence captured during confirmed AMFV violations</p>
        </div>

        <div className="flex items-center gap-2">
          {/* Hotel Filter */}
          <select 
            value={selectedHotel} 
            onChange={(e) => setSelectedHotel(e.target.value)}
            className="h-8 px-2.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-300 focus:outline-none"
          >
            <option value="all">All Hotel Branches</option>
            {hotels.map((h) => (
              <option key={h} value={h}>{h}</option>
            ))}
          </select>

          {/* Category Tabs */}
          <Tabs value={categoryFilter} onValueChange={setCategoryFilter}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="pest">Pest</TabsTrigger>
              <TabsTrigger value="hygiene">Hygiene</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {violations.length === 0 ? (
          <div className="col-span-full py-16 text-center text-zinc-500">
            <ShieldCheck className="h-9 w-9 mx-auto mb-2 text-zinc-600" />
            <div className="text-xs font-semibold text-zinc-300">No Violations Found</div>
            <div className="text-[11px] text-zinc-500 mt-0.5">All monitored kitchens are currently operating within compliance limits.</div>
          </div>
        ) : (
          violations.map((item) => {
            const isPest = item.category === 'pest';
            const labelNice = item.label.replace('_', ' ').toUpperCase();
            const imgUrl = item.snapshot_url;

            return (
              <Card 
                key={item.id}
                className="p-0 gap-0 overflow-hidden shadow-lg hover:border-zinc-700 transition-all"
              >
                <div 
                  className="relative aspect-video bg-black cursor-pointer group"
                  onClick={() => imgUrl && setZoomItem(item)}
                >
                  {imgUrl ? (
                    <img 
                      src={imgUrl} 
                      alt={labelNice} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-600 text-xs font-mono">
                      No Image Recorded
                    </div>
                  )}

                  <div className="absolute top-2 left-2 flex items-center gap-1.5">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                      isPest ? 'bg-rose-500/90 text-white' : 'bg-amber-500/90 text-zinc-950 font-extrabold'
                    }`}>
                      {item.category}
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-black/70 text-zinc-200 border border-zinc-700">
                      {Math.round((item.confidence || 0) * 100)}%
                    </span>
                  </div>

                  <div className="absolute bottom-2 right-2 p-1 rounded bg-black/60 text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity">
                    <ZoomIn className="h-3.5 w-3.5" />
                  </div>
                </div>

                <CardContent className="p-3 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-bold text-white">{labelNice}</div>
                    <div className="text-[10px] text-zinc-400 mt-0.5">
                      {item.hotel_name || 'Kitchen'} &bull; {item.timestamp}
                    </div>
                  </div>

                  <button 
                    onClick={(e) => handleAcknowledge(item.id, e)}
                    className={`px-2 py-1 rounded text-[10px] font-semibold border transition-all ${
                      item.acknowledged 
                        ? 'text-zinc-500 border-zinc-800 bg-zinc-900 cursor-default' 
                        : 'text-zinc-300 border-zinc-700 hover:bg-zinc-800'
                    }`}
                  >
                    {item.acknowledged ? '✓ Reviewed' : 'Review'}
                  </button>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Zoom Inspector Dialog */}
      <Dialog open={Boolean(zoomItem)} onOpenChange={(open) => !open && setZoomItem(null)}>
        <DialogContent className="max-w-4xl p-0 gap-0 overflow-hidden border-zinc-800 bg-[#18181c]">
          {zoomItem && (
            <>
              <DialogHeader className="p-3 border-b border-zinc-800 text-left">
                <DialogTitle className="text-sm font-bold text-white">
                  {zoomItem.label.replace('_', ' ').toUpperCase()} Evidence
                </DialogTitle>
                <DialogDescription className="text-xs text-zinc-400">
                  {zoomItem.hotel_name} &bull; {zoomItem.timestamp} &bull; Confidence: {Math.round((zoomItem.confidence || 0) * 100)}%
                </DialogDescription>
              </DialogHeader>
              <div className="relative bg-black aspect-video flex items-center justify-center overflow-hidden">
                <img src={zoomItem.snapshot_url} alt="Evidence Full" className="max-h-[70vh] w-auto object-contain" />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
