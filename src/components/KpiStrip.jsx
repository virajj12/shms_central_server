import React from 'react';
import { Card, CardTitle, CardDescription } from '@/components/ui/card';

export default function KpiStrip({ overview = {} }) {
  const online = overview.online_nodes ?? 0;
  const total = overview.total_nodes ?? 0;
  const cameras = overview.total_cameras ?? 0;
  const totalViolations = overview.total_violations ?? 0;
  const pests = overview.pest_violations ?? 0;
  const hygiene = overview.hygiene_violations ?? 0;
  const riskHotel = overview.highest_risk_hotel || 'All Compliant';

  return (
    <section className="px-4 sm:px-6 pt-4 pb-1">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        <Card size="sm" className="bg-[#18181c] border-zinc-800/90 shadow-sm p-3 gap-0">
          <CardDescription className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">
            Edges Online
          </CardDescription>
          <CardTitle className="text-lg font-extrabold text-white font-mono block mt-0.5">
            {online} / {total}
          </CardTitle>
        </Card>

        <Card size="sm" className="bg-[#18181c] border-zinc-800/90 shadow-sm p-3 gap-0">
          <CardDescription className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">
            Active Cameras
          </CardDescription>
          <CardTitle className="text-lg font-extrabold text-white font-mono block mt-0.5">
            {cameras}
          </CardTitle>
        </Card>

        <Card size="sm" className="bg-[#18181c] border-zinc-800/90 shadow-sm p-3 gap-0">
          <CardDescription className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">
            Fleet Violations
          </CardDescription>
          <CardTitle className="text-lg font-extrabold text-white font-mono block mt-0.5">
            {totalViolations}
          </CardTitle>
        </Card>

        <Card size="sm" className="bg-[#18181c] border-zinc-800/90 shadow-sm p-3 gap-0">
          <CardDescription className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">
            Pest Incursions
          </CardDescription>
          <CardTitle className="text-lg font-extrabold text-rose-400 font-mono block mt-0.5">
            {pests}
          </CardTitle>
        </Card>

        <Card size="sm" className="bg-[#18181c] border-zinc-800/90 shadow-sm p-3 gap-0">
          <CardDescription className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">
            Hygiene Breaches
          </CardDescription>
          <CardTitle className="text-lg font-extrabold text-amber-400 font-mono block mt-0.5">
            {hygiene}
          </CardTitle>
        </Card>

        <Card size="sm" className="bg-[#18181c] border-zinc-800/90 shadow-sm p-3 gap-0">
          <CardDescription className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">
            Highest Risk Branch
          </CardDescription>
          <CardTitle className="text-xs font-bold text-zinc-200 truncate block mt-1.5">
            {riskHotel}
          </CardTitle>
        </Card>
      </div>
    </section>
  );
}
