import React, { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';
import { FileSpreadsheet, FileText } from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';

export default function AnalyticsView({ analytics = {} }) {
  const chartDailyRef = useRef(null);
  const chartHourlyRef = useRef(null);
  const dailyInstance = useRef(null);
  const hourlyInstance = useRef(null);

  useEffect(() => {
    // 1. Daily Trend Line Chart
    if (chartDailyRef.current) {
      if (dailyInstance.current) dailyInstance.current.destroy();

      const labels = (analytics.daily_trend || []).map((d) => d.day);
      const pests = (analytics.daily_trend || []).map((d) => d.pests);
      const hygiene = (analytics.daily_trend || []).map((d) => d.hygiene);

      dailyInstance.current = new Chart(chartDailyRef.current, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'Pest Incursions',
              data: pests,
              borderColor: '#ef4444',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              fill: true,
              tension: 0.3,
            },
            {
              label: 'Hygiene Breaches',
              data: hygiene,
              borderColor: '#f59e0b',
              backgroundColor: 'rgba(245, 158, 11, 0.1)',
              fill: true,
              tension: 0.3,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: '#a1a1aa', font: { family: 'Plus Jakarta Sans', size: 11 } } },
          },
          scales: {
            x: { ticks: { color: '#71717a' }, grid: { color: '#27272a' } },
            y: { ticks: { color: '#71717a' }, grid: { color: '#27272a' }, beginAtZero: true },
          },
        },
      });
    }

    // 2. 24h Hourly Bar Chart
    if (chartHourlyRef.current) {
      if (hourlyInstance.current) hourlyInstance.current.destroy();

      const labels = (analytics.hourly_distribution || []).map((h) => h.hour);
      const counts = (analytics.hourly_distribution || []).map((h) => h.count);

      hourlyInstance.current = new Chart(chartHourlyRef.current, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: 'Incidents by Hour',
              data: counts,
              backgroundColor: '#e4e4e7',
              borderRadius: 4,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: '#71717a' }, grid: { display: false } },
            y: { ticks: { color: '#71717a' }, grid: { color: '#27272a' }, beginAtZero: true },
          },
        },
      });
    }

    return () => {
      if (dailyInstance.current) dailyInstance.current.destroy();
      if (hourlyInstance.current) hourlyInstance.current.destroy();
    };
  }, [analytics]);

  const ranking = analytics.branch_ranking || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-white">Enterprise Fleet Compliance & Risk Analytics</h2>
          <p className="text-xs text-zinc-400">Cross-branch incident trends, hourly vulnerability mapping, and compliance scoring</p>
        </div>

        <div className="flex items-center gap-2">
          <a
            href="/api/fleet/export/pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="py-1.5 px-3 rounded-lg border border-emerald-800/60 bg-emerald-950/20 hover:bg-emerald-900/40 text-emerald-400 hover:text-emerald-300 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <FileText className="h-3.5 w-3.5 text-emerald-400" />
            <span>Audit Certificate (PDF)</span>
          </a>
          <a
            href="/api/fleet/export/csv"
            download
            className="py-1.5 px-3 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-zinc-400" />
            <span>Export Fleet CSV</span>
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 7-Day Trend Chart */}
        <Card className="p-4 flex flex-col h-80">
          <CardHeader className="flex-row items-center justify-between p-0 mb-2 space-y-0">
            <CardTitle className="text-xs font-bold text-white">7-Day Incident Trend</CardTitle>
            <CardDescription className="text-[10px] text-zinc-500 font-mono">Daily Violations</CardDescription>
          </CardHeader>
          <CardContent className="p-0 flex-1 relative">
            <canvas ref={chartDailyRef}></canvas>
          </CardContent>
        </Card>

        {/* 24-Hour Peak Risk Chart */}
        <Card className="p-4 flex flex-col h-80">
          <CardHeader className="flex-row items-center justify-between p-0 mb-2 space-y-0">
            <CardTitle className="text-xs font-bold text-white">24-Hour Peak Incursion Vulnerability</CardTitle>
            <CardDescription className="text-[10px] text-zinc-500 font-mono">Hour of Day (24h)</CardDescription>
          </CardHeader>
          <CardContent className="p-0 flex-1 relative">
            <canvas ref={chartHourlyRef}></canvas>
          </CardContent>
        </Card>
      </div>

      {/* Branch Risk Ranking Leaderboard */}
      <Card className="p-5">
        <CardHeader className="flex-row items-center justify-between p-0 mb-3 space-y-0">
          <CardTitle className="text-xs font-bold text-white">Hotel Branch Risk Ranking</CardTitle>
          <CardDescription className="text-[10px] text-zinc-500">Ranked by total compliance infractions</CardDescription>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-zinc-800 text-[10px] text-zinc-400 uppercase tracking-wider">
                <th className="py-2 px-3">Hotel Branch</th>
                <th className="py-2 px-3">Pest Incursions</th>
                <th className="py-2 px-3">Hygiene Breaches</th>
                <th className="py-2 px-3">Total Violations</th>
              </tr>
            </thead>
            <tbody>
              {ranking.length === 0 ? (
                <tr>
                  <td colSpan="4" className="text-center py-6 text-zinc-500 text-xs">
                    No branch incidents recorded yet.
                  </td>
                </tr>
              ) : (
                ranking.map((r, idx) => (
                  <tr key={r.hotel_name || idx} className="border-b border-zinc-800/60 hover:bg-zinc-900/40 text-xs">
                    <td className="py-2.5 px-3 font-semibold text-white flex items-center gap-2">
                      <span className="text-[10px] text-zinc-500 font-mono">#{idx + 1}</span>
                      <span>{r.hotel_name}</span>
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-rose-400">{r.pests}</td>
                    <td className="py-2.5 px-3 font-mono font-bold text-amber-400">{r.hygiene}</td>
                    <td className="py-2.5 px-3 font-mono font-bold text-white">{r.total_violations}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
