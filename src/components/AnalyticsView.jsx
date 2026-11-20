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
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';

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
          <Button variant="outline" size="sm" asChild>
            <a
              href="/api/fleet/export/pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5"
            >
              <FileText className="h-3.5 w-3.5" />
              <span>Audit Certificate (PDF)</span>
            </a>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a
              href="/api/fleet/export/csv"
              download
              className="flex items-center gap-1.5"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              <span>Export Fleet CSV</span>
            </a>
          </Button>
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
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Hotel Branch</TableHead>
                <TableHead>Pest Incursions</TableHead>
                <TableHead>Hygiene Breaches</TableHead>
                <TableHead>Total Violations</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ranking.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-6 text-zinc-500">
                    No branch incidents recorded yet.
                  </TableCell>
                </TableRow>
              ) : (
                ranking.map((r, idx) => (
                  <TableRow key={r.hotel_name || idx}>
                    <TableCell className="font-semibold text-white flex items-center gap-2">
                      <span className="text-[10px] text-zinc-500 font-mono">#{idx + 1}</span>
                      <span>{r.hotel_name}</span>
                    </TableCell>
                    <TableCell className={`font-mono font-bold ${r.pests > 0 ? 'text-rose-400' : 'text-zinc-400'}`}>{r.pests}</TableCell>
                    <TableCell className={`font-mono font-bold ${r.hygiene > 0 ? 'text-amber-400' : 'text-zinc-400'}`}>{r.hygiene}</TableCell>
                    <TableCell className="font-mono font-bold text-white">{r.total_violations}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
