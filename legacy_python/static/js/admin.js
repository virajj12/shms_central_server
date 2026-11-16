/**
 * SHMS Central Fleet Management - Reactive Dashboard Controller
 */

let state = {
    activeTab: 'nodes',
    nodes: [],
    overview: {},
    violations: [],
    selectedEdgeForStream: null,
    selectedCameraForStream: null,
    selectedEdgeForConfig: null,
    evidenceFilter: 'all',
    hotelFilter: 'all',
    dailyChart: null,
    hourlyChart: null,
};

// ── Initialization ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    initClock();
    loadOverview();
    loadNodes();
    loadViolations();
    loadAnalytics();
    loadSettings();

    // Polling intervals
    setInterval(loadOverview, 5000);
    setInterval(loadNodes, 5000);
});

function initClock() {
    const clockEl = document.getElementById('liveClock');
    function tick() {
        const now = new Date();
        clockEl.innerText = now.toLocaleTimeString('en-US', { hour12: false });
    }
    tick();
    setInterval(tick, 1000);
}

// ── Tab Navigation ──────────────────────────────────────────────────────────
function switchTab(tabId) {
    state.activeTab = tabId;
    ['nodes', 'evidence', 'analytics', 'settings'].forEach(t => {
        const btn = document.getElementById(`tabBtn_${t}`);
        const view = document.getElementById(`tabView_${t}`);
        if (t === tabId) {
            btn.className = "flex items-center gap-2 py-1.5 px-3 rounded-lg text-xs font-bold bg-white text-zinc-950 shadow-sm transition-all";
            view.classList.remove('hidden');
        } else {
            btn.className = "flex items-center gap-2 py-1.5 px-3 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 transition-all";
            view.classList.add('hidden');
        }
    });

    if (tabId === 'evidence') loadViolations();
    if (tabId === 'analytics') loadAnalytics();
    lucide.createIcons();
}

// ── API Fetchers ────────────────────────────────────────────────────────────

async function loadOverview() {
    try {
        const res = await fetch('/api/fleet/overview');
        if (!res.ok) return;
        const data = await res.json();
        state.overview = data;

        document.getElementById('kpi_online_nodes').innerText = `${data.online_nodes} / ${data.total_nodes}`;
        document.getElementById('kpi_active_cameras').innerText = data.total_cameras;
        document.getElementById('kpi_total_violations').innerText = data.total_violations;
        document.getElementById('kpi_pest_violations').innerText = data.pest_violations;
        document.getElementById('kpi_hygiene_violations').innerText = data.hygiene_violations;
        document.getElementById('kpi_risk_branch').innerText = data.highest_risk_hotel || 'All Compliant';
        document.getElementById('header_fleet_status').innerText = `${data.online_nodes} of ${data.total_nodes} Edges Online`;
    } catch (e) {
        console.error('Error fetching overview', e);
    }
}

async function loadNodes() {
    try {
        const res = await fetch('/api/fleet/nodes');
        if (!res.ok) return;
        const nodes = await res.json();
        state.nodes = nodes;
        renderNodes(nodes);
        updateHotelFilterDropdown(nodes);
    } catch (e) {
        console.error('Error fetching nodes', e);
    }
}

function renderNodes(nodes) {
    const container = document.getElementById('nodesGrid');
    if (!container) return;

    if (nodes.length === 0) {
        container.innerHTML = `
            <div class="col-span-full py-20 text-center text-zinc-500 border border-dashed border-zinc-800 rounded-2xl p-8">
                <i data-lucide="server-off" class="h-10 w-10 text-zinc-600 mx-auto mb-3"></i>
                <div class="text-sm font-semibold text-zinc-300">No Edge Devices Registered Yet</div>
                <div class="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">
                    When you run the Smart Hotel Monitoring edge system with central sync enabled, it will automatically appear here.
                </div>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    container.innerHTML = nodes.map(node => {
        const isOnline = node.status === 'online';
        const cameras = node.cameras || [];
        const telemetry = node.telemetry || {};
        const cpu = telemetry.cpu_percent != null ? `${telemetry.cpu_percent}%` : 'N/A';
        const mem = telemetry.memory_percent != null ? `${telemetry.memory_percent}%` : 'N/A';
        const lastSeen = node.last_heartbeat ? new Date(node.last_heartbeat).toLocaleTimeString() : 'N/A';

        return `
            <div class="bg-[#18181c] border ${isOnline ? 'border-zinc-800' : 'border-rose-950/40 bg-rose-950/5'} rounded-2xl p-5 shadow-lg flex flex-col justify-between hover:border-zinc-700 transition-all">
                <div>
                    <!-- Header -->
                    <div class="flex items-start justify-between gap-3">
                        <div class="min-w-0">
                            <div class="flex items-center gap-2">
                                <span class="h-2.5 w-2.5 rounded-full shrink-0 ${isOnline ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] pulse-emerald' : 'bg-rose-500'}"></span>
                                <h3 class="text-sm font-bold text-white truncate" title="${node.name}">${node.name}</h3>
                            </div>
                            <div class="text-xs text-zinc-400 mt-0.5 truncate">
                                🏨 <span class="text-zinc-200 font-semibold">${node.hotel_name}</span> &bull; <span>${node.location}</span>
                            </div>
                        </div>

                        <span class="px-2 py-0.5 text-[10px] font-mono uppercase font-bold rounded ${isOnline ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'}">
                            ${node.status}
                        </span>
                    </div>

                    <!-- Telemetry Row -->
                    <div class="grid grid-cols-3 gap-2 mt-4 p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800/80 text-[11px]">
                        <div>
                            <span class="text-zinc-500 text-[10px] block">IP Address</span>
                            <span class="font-mono text-zinc-300 truncate block">${node.ip_address || 'Localhost'}</span>
                        </div>
                        <div>
                            <span class="text-zinc-500 text-[10px] block">Cameras</span>
                            <span class="font-mono text-white font-semibold block">${cameras.length} Active</span>
                        </div>
                        <div>
                            <span class="text-zinc-500 text-[10px] block">Last Ping</span>
                            <span class="font-mono text-zinc-400 block">${lastSeen}</span>
                        </div>
                    </div>

                    <!-- Active Cameras Badges -->
                    <div class="mt-3">
                        <span class="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1.5">Monitored Feeds</span>
                        <div class="flex flex-wrap gap-1.5">
                            ${cameras.length === 0 
                                ? '<span class="text-xs text-zinc-600 italic">No cameras attached</span>' 
                                : cameras.map(c => `
                                    <span class="px-2 py-1 rounded-md text-[10px] font-mono bg-zinc-900 border border-zinc-800 text-zinc-300 flex items-center gap-1.5">
                                        <span class="h-1.5 w-1.5 rounded-full ${c.connected ? 'bg-emerald-400' : 'bg-zinc-600'}"></span>
                                        <span>${c.name}</span>
                                        ${c.fps ? `<span class="text-zinc-500">${c.fps}fps</span>` : ''}
                                    </span>
                                `).join('')
                            }
                        </div>
                    </div>
                </div>

                <!-- Action Toolbar -->
                <div class="mt-5 pt-4 border-t border-zinc-800 flex items-center justify-between gap-2">
                    <button 
                        onclick="openLiveStreamModal('${node.id}')"
                        ${!isOnline || cameras.length === 0 ? 'disabled' : ''}
                        class="flex-1 py-1.5 px-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 disabled:opacity-40 disabled:pointer-events-none text-zinc-200 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                    >
                        <i data-lucide="video" class="h-3.5 w-3.5 text-emerald-400"></i>
                        <span>Live Stream</span>
                    </button>

                    <button 
                        onclick="openConfigModal('${node.id}')"
                        class="py-1.5 px-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-zinc-200 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors"
                        title="Remote Edge Settings & AMFV"
                    >
                        <i data-lucide="sliders" class="h-3.5 w-3.5 text-zinc-400"></i>
                        <span>Config</span>
                    </button>

                    <button 
                        onclick="deleteNode('${node.id}')"
                        class="p-1.5 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                        title="Deregister Node"
                    >
                        <i data-lucide="trash-2" class="h-4 w-4"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');

    lucide.createIcons();
}

function updateHotelFilterDropdown(nodes) {
    const select = document.getElementById('evidenceHotelFilter');
    if (!select) return;
    const currentVal = select.value;
    const hotels = Array.from(new Set(nodes.map(n => n.hotel_name).filter(Boolean)));

    select.innerHTML = `<option value="all">All Hotel Branches</option>` +
        hotels.map(h => `<option value="${h}">${h}</option>`).join('');
    
    select.value = currentVal;
}

// ── Live Stream Proxy Modal ─────────────────────────────────────────────────

function openLiveStreamModal(edgeId) {
    const node = state.nodes.find(n => n.id === edgeId);
    if (!node || !node.cameras || node.cameras.length === 0) return;

    state.selectedEdgeForStream = node;
    state.selectedCameraForStream = node.cameras[0].id;

    document.getElementById('streamModalTitle').innerText = `${node.name} — Live CCTV Feeds`;
    document.getElementById('streamModalSubtitle').innerText = `${node.hotel_name} &bull; ${node.location}`;

    // Populate camera selector pills
    const selectorContainer = document.getElementById('streamCameraPills');
    selectorContainer.innerHTML = node.cameras.map((c, idx) => `
        <button 
            onclick="changeStreamCamera('${c.id}')"
            id="streamCamBtn_${c.id}"
            class="px-3 py-1 rounded-md text-xs font-medium border transition-all ${idx === 0 ? 'bg-white text-zinc-950 border-white' : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white'}"
        >
            ${c.name}
        </button>
    `).join('');

    updateStreamPlayer();
    document.getElementById('streamModal').classList.remove('hidden');
    lucide.createIcons();
}

function changeStreamCamera(camId) {
    state.selectedCameraForStream = camId;
    if (state.selectedEdgeForStream) {
        state.selectedEdgeForStream.cameras.forEach(c => {
            const btn = document.getElementById(`streamCamBtn_${c.id}`);
            if (btn) {
                if (c.id === camId) {
                    btn.className = "px-3 py-1 rounded-md text-xs font-medium border bg-white text-zinc-950 border-white";
                } else {
                    btn.className = "px-3 py-1 rounded-md text-xs font-medium border bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white";
                }
            }
        });
    }
    updateStreamPlayer();
}

function updateStreamPlayer() {
    const img = document.getElementById('proxyStreamImg');
    const edgeId = state.selectedEdgeForStream?.id;
    const camId = state.selectedCameraForStream;

    if (edgeId && camId) {
        img.src = `/api/proxy/stream/${edgeId}/${camId}`;
    }
}

function closeStreamModal() {
    const img = document.getElementById('proxyStreamImg');
    img.src = '';
    document.getElementById('streamModal').classList.add('hidden');
    state.selectedEdgeForStream = null;
    state.selectedCameraForStream = null;
}

// ── Remote Configuration Modal ──────────────────────────────────────────────

function openConfigModal(edgeId) {
    const node = state.nodes.find(n => n.id === edgeId);
    if (!node) return;

    state.selectedEdgeForConfig = node;
    const config = node.config || {};

    document.getElementById('configModalNodeName').innerText = `${node.name} (${node.hotel_name})`;
    document.getElementById('cfg_window_size').value = config.window_size || 2;
    document.getElementById('cfg_threshold_pest').value = Math.round((config.threshold_pest ?? 0.20) * 100);
    document.getElementById('cfg_threshold_hygiene').value = Math.round((config.threshold_hygiene ?? 0.40) * 100);
    document.getElementById('cfg_cooldown').value = config.cooldown ?? 30;

    document.getElementById('val_threshold_pest').innerText = `${document.getElementById('cfg_threshold_pest').value}%`;
    document.getElementById('val_threshold_hygiene').innerText = `${document.getElementById('cfg_threshold_hygiene').value}%`;

    document.getElementById('configModal').classList.remove('hidden');
}

function closeConfigModal() {
    document.getElementById('configModal').classList.add('hidden');
    state.selectedEdgeForConfig = null;
}

async function handleSaveConfig(e) {
    e.preventDefault();
    if (!state.selectedEdgeForConfig) return;

    const edgeId = state.selectedEdgeForConfig.id;
    const payload = {
        window_size: parseInt(document.getElementById('cfg_window_size').value),
        threshold_pest: parseFloat(document.getElementById('cfg_threshold_pest').value) / 100,
        threshold_hygiene: parseFloat(document.getElementById('cfg_threshold_hygiene').value) / 100,
        cooldown: parseInt(document.getElementById('cfg_cooldown').value),
    };

    try {
        const res = await fetch(`/api/fleet/nodes/${edgeId}/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (data.success) {
            alert(`Configuration queued for edge device! It will be applied automatically on its next heartbeat.`);
            closeConfigModal();
            loadNodes();
        }
    } catch (err) {
        alert(`Failed to push configuration: ${err.message}`);
    }
}

async function deleteNode(edgeId) {
    if (!confirm(`Are you sure you want to remove node ${edgeId} from the central registry?`)) return;
    try {
        await fetch(`/api/fleet/nodes/${edgeId}`, { method: 'DELETE' });
        loadNodes();
        loadOverview();
    } catch (err) {
        alert(err.message);
    }
}

// ── Global Evidence Vault ───────────────────────────────────────────────────

async function loadViolations() {
    try {
        const hotel = document.getElementById('evidenceHotelFilter')?.value || 'all';
        let url = `/api/fleet/violations?limit=80`;
        if (state.evidenceFilter !== 'all') url += `&category=${state.evidenceFilter}`;
        if (hotel !== 'all') url += `&hotel_name=${encodeURIComponent(hotel)}`;

        const res = await fetch(url);
        if (!res.ok) return;
        const violations = await res.json();
        state.violations = violations;
        renderEvidence(violations);
    } catch (e) {
        console.error('Error loading violations', e);
    }
}

function filterEvidence(category) {
    state.evidenceFilter = category;
    ['all', 'pest', 'hygiene'].forEach(c => {
        const btn = document.getElementById(`btn_ev_${c}`);
        if (btn) {
            if (c === category) {
                btn.className = "px-3 py-1 rounded-md text-xs font-bold bg-white text-zinc-950 shadow-sm";
            } else {
                btn.className = "px-3 py-1 rounded-md text-xs font-medium text-zinc-400 hover:text-white";
            }
        }
    });
    loadViolations();
}

function renderEvidence(items) {
    const grid = document.getElementById('evidenceGrid');
    if (!grid) return;

    if (items.length === 0) {
        grid.innerHTML = `
            <div class="col-span-full py-16 text-center text-zinc-500">
                <i data-lucide="shield-check" class="h-9 w-9 mx-auto mb-2 text-zinc-600"></i>
                <div class="text-xs font-semibold text-zinc-300">No Violations Found</div>
                <div class="text-[11px] text-zinc-500 mt-0.5">All monitored kitchens are currently operating within compliance limits.</div>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    grid.innerHTML = items.map(item => {
        const isPest = item.category === 'pest';
        const labelNice = item.label.replace('_', ' ').toUpperCase();
        const imgUrl = item.snapshot_url;

        return `
            <div class="bg-[#18181c] border border-zinc-800 rounded-xl overflow-hidden shadow-lg flex flex-col hover:border-zinc-700 transition-all">
                <div class="relative aspect-video bg-black cursor-pointer group" onclick="zoomEvidence('${imgUrl}', '${labelNice}', '${item.hotel_name}', '${item.timestamp}', ${item.confidence})">
                    ${imgUrl 
                        ? `<img src="${imgUrl}" alt="${labelNice}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />`
                        : `<div class="w-full h-full flex items-center justify-center text-zinc-600 text-xs">No Snapshot</div>`
                    }
                    
                    <div class="absolute top-2 left-2 flex gap-1">
                        <span class="px-1.5 py-0.5 rounded text-[9px] font-bold ${isPest ? 'bg-rose-500 text-white' : 'bg-amber-400 text-zinc-950'}">
                            ${isPest ? 'PEST' : 'HYGIENE'}
                        </span>
                        <span class="px-1.5 py-0.5 rounded text-[9px] font-mono bg-black/70 text-zinc-200 border border-zinc-700">
                            ${Math.round((item.confidence || 0) * 100)}%
                        </span>
                    </div>

                    <div class="absolute bottom-2 right-2 p-1 rounded bg-black/60 text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity">
                        <i data-lucide="zoom-in" class="h-3.5 w-3.5"></i>
                    </div>
                </div>

                <div class="p-3 flex items-center justify-between text-xs">
                    <div>
                        <div class="font-bold text-white">${labelNice}</div>
                        <div class="text-[10px] text-zinc-400 mt-0.5">
                            ${item.hotel_name || 'Kitchen'} &bull; ${item.timestamp}
                        </div>
                    </div>

                    <button 
                        onclick="acknowledgeViolation(${item.id})"
                        class="px-2 py-1 rounded text-[10px] font-semibold border transition-all ${item.acknowledged 
                            ? 'text-zinc-500 border-zinc-800 bg-zinc-900 cursor-default' 
                            : 'text-zinc-300 border-zinc-700 hover:bg-zinc-800'}"
                    >
                        ${item.acknowledged ? '✓ Reviewed' : 'Review'}
                    </button>
                </div>
            </div>
        `;
    }).join('');

    lucide.createIcons();
}

async function acknowledgeViolation(id) {
    try {
        await fetch(`/api/fleet/violations/${id}/acknowledge`, { method: 'POST' });
        loadViolations();
        loadOverview();
    } catch (e) {
        console.error('Failed to acknowledge', e);
    }
}

function zoomEvidence(url, label, hotel, ts, conf) {
    if (!url) return;
    document.getElementById('zoomImg').src = url;
    document.getElementById('zoomTitle').innerText = `${label} Evidence`;
    document.getElementById('zoomMeta').innerText = `${hotel} &bull; ${ts} &bull; Confidence: ${Math.round(conf * 100)}%`;
    document.getElementById('zoomModal').classList.remove('hidden');
}

function closeZoomModal() {
    document.getElementById('zoomModal').classList.add('hidden');
    document.getElementById('zoomImg').src = '';
}

// ── Analytics & Compliance Charts ───────────────────────────────────────────

async function loadAnalytics() {
    try {
        const res = await fetch('/api/fleet/analytics');
        if (!res.ok) return;
        const data = await res.json();

        renderCharts(data);
        renderBranchRanking(data.branch_ranking || []);
    } catch (e) {
        console.error('Error loading analytics', e);
    }
}

function renderCharts(analytics) {
    // 1. Daily Trend Line Chart
    const dailyLabels = (analytics.daily_trend || []).map(d => d.day);
    const pestData = (analytics.daily_trend || []).map(d => d.pests);
    const hygieneData = (analytics.daily_trend || []).map(d => d.hygiene);

    const ctxDaily = document.getElementById('chartDailyTrend')?.getContext('2d');
    if (ctxDaily) {
        if (state.dailyChart) state.dailyChart.destroy();
        state.dailyChart = new Chart(ctxDaily, {
            type: 'line',
            data: {
                labels: dailyLabels,
                datasets: [
                    {
                        label: 'Pest Incursions',
                        data: pestData,
                        borderColor: '#ef4444',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        fill: true,
                        tension: 0.3,
                    },
                    {
                        label: 'Hygiene Breaches',
                        data: hygieneData,
                        borderColor: '#f59e0b',
                        backgroundColor: 'rgba(245, 158, 11, 0.1)',
                        fill: true,
                        tension: 0.3,
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: '#a1a1aa', font: { family: 'Plus Jakarta Sans', size: 11 } } }
                },
                scales: {
                    x: { ticks: { color: '#71717a' }, grid: { color: '#27272a' } },
                    y: { ticks: { color: '#71717a' }, grid: { color: '#27272a' }, beginAtZero: true }
                }
            }
        });
    }

    // 2. 24h Peak Risk Bar Chart
    const hourlyLabels = (analytics.hourly_distribution || []).map(h => h.hour);
    const hourlyCounts = (analytics.hourly_distribution || []).map(h => h.count);

    const ctxHourly = document.getElementById('chartHourlyRisk')?.getContext('2d');
    if (ctxHourly) {
        if (state.hourlyChart) state.hourlyChart.destroy();
        state.hourlyChart = new Chart(ctxHourly, {
            type: 'bar',
            data: {
                labels: hourlyLabels,
                datasets: [{
                    label: 'Incidents by Hour',
                    data: hourlyCounts,
                    backgroundColor: '#e4e4e7',
                    borderRadius: 4,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: { ticks: { color: '#71717a' }, grid: { display: false } },
                    y: { ticks: { color: '#71717a' }, grid: { color: '#27272a' }, beginAtZero: true }
                }
            }
        });
    }
}

function renderBranchRanking(ranking) {
    const tbody = document.getElementById('branchRankingBody');
    if (!tbody) return;

    if (ranking.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center py-6 text-zinc-500 text-xs">No branch incidents recorded.</td></tr>`;
        return;
    }

    tbody.innerHTML = ranking.map((r, idx) => `
        <tr class="border-b border-zinc-800/60 hover:bg-zinc-900/40 text-xs">
            <td class="py-2.5 px-3 font-semibold text-white flex items-center gap-2">
                <span class="text-[10px] text-zinc-500 font-mono">#${idx + 1}</span>
                <span>${r.hotel_name}</span>
            </td>
            <td class="py-2.5 px-3 font-mono font-bold text-rose-400">${r.pests}</td>
            <td class="py-2.5 px-3 font-mono font-bold text-amber-400">${r.hygiene}</td>
            <td class="py-2.5 px-3 font-mono font-bold text-white">${r.total_violations}</td>
        </tr>
    `).join('');
}

// ── Settings Management ─────────────────────────────────────────────────────

async function loadSettings() {
    try {
        const res = await fetch('/api/settings');
        if (!res.ok) return;
        const data = await res.json();
        document.getElementById('set_central_email').value = data.central_email || '';
        document.getElementById('set_webhook_url').value = data.webhook_url || '';
        document.getElementById('set_heartbeat_timeout').value = data.heartbeat_timeout || 30;
    } catch (e) {
        console.error('Error loading settings', e);
    }
}

async function handleSaveSettings(e) {
    e.preventDefault();
    const payload = {
        central_email: document.getElementById('set_central_email').value.trim(),
        webhook_url: document.getElementById('set_webhook_url').value.trim(),
        heartbeat_timeout: document.getElementById('set_heartbeat_timeout').value.trim(),
    };

    try {
        await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        alert('Central settings saved successfully!');
    } catch (err) {
        alert(err.message);
    }
}

// ── Logout ──────────────────────────────────────────────────────────────────

async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
}

