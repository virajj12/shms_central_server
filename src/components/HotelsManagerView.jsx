import React, { useState } from 'react';
import {
  Building2,
  Plus,
  ExternalLink,
  Copy,
  Check,
  KeyRound,
  Trash2,
  Power,
  ShieldCheck,
  Server,
  Users,
  Search,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { api } from '../services/api';

export default function HotelsManagerView({
  hotels = [],
  onRefresh,
  onSelectHotel,
}) {
  const [search, setSearch] = useState('');
  const [copiedSlug, setCopiedSlug] = useState(null);

  // Provision Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [formData, setFormData] = useState({
    company_name: '',
    slug: '',
    admin_username: '',
    admin_password: '',
    contact_email: '',
    max_kitchens: 20,
  });

  // Reset Password Modal
  const [resetModalHotel, setResetModalHotel] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetSuccess, setResetSuccess] = useState('');
  const [resetError, setResetError] = useState('');

  const originUrl = window.location.origin;

  const handleCopyLink = (slug, e) => {
    e?.stopPropagation();
    const url = `${originUrl}/${slug}`;
    navigator.clipboard.writeText(url);
    setCopiedSlug(slug);
    setTimeout(() => setCopiedSlug(null), 2000);
  };

  const handleNameChange = (e) => {
    const name = e.target.value;
    const autoSlug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const autoUsername = name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 14) + '_admin';

    setFormData((prev) => ({
      ...prev,
      company_name: name,
      slug: prev.slug === '' || prev.slug === autoSlug.slice(0, -1) ? autoSlug : prev.slug,
      admin_username: prev.admin_username === '' ? autoUsername : prev.admin_username,
    }));
  };

  const handleCreateHotel = async (e) => {
    e.preventDefault();
    setCreating(true);
    setCreateError('');
    try {
      await api.createHotel(formData);
      setShowCreateModal(false);
      setFormData({
        company_name: '',
        slug: '',
        admin_username: '',
        admin_password: '',
        contact_email: '',
        max_kitchens: 20,
      });
      onRefresh();
    } catch (err) {
      setCreateError(err.message || 'Failed to create hotel organization');
    } finally {
      setCreating(false);
    }
  };

  const handleToggleStatus = async (hotel) => {
    const nextStatus = hotel.status === 'active' ? 'suspended' : 'active';
    try {
      await api.updateHotel(hotel.id, { status: nextStatus });
      onRefresh();
    } catch (err) {
      alert(`Error updating hotel status: ${err.message}`);
    }
  };

  const handleDeleteHotel = async (hotel) => {
    if (
      !window.confirm(
        `Are you sure you want to permanently delete hotel "${hotel.name}"?\nAll associated kitchen branches and incident records will be deleted.`
      )
    ) {
      return;
    }
    try {
      await api.deleteHotel(hotel.id);
      onRefresh();
    } catch (err) {
      alert(`Delete error: ${err.message}`);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!resetModalHotel) return;
    setResetting(true);
    setResetError('');
    setResetSuccess('');
    try {
      await api.resetHotelPassword(resetModalHotel.id, newPassword);
      setResetSuccess(`Password updated successfully for ${resetModalHotel.admin_username || resetModalHotel.name}`);
      setTimeout(() => {
        setResetModalHotel(null);
        setNewPassword('');
        setResetSuccess('');
      }, 1500);
    } catch (err) {
      setResetError(err.message || 'Failed to update password');
    } finally {
      setResetting(false);
    }
  };

  const filteredHotels = hotels.filter((h) => {
    const q = search.toLowerCase();
    return (
      h.name?.toLowerCase().includes(q) ||
      h.slug?.toLowerCase().includes(q) ||
      h.admin_username?.toLowerCase().includes(q) ||
      h.id?.toLowerCase().includes(q)
    );
  });

  const totalKitchens = hotels.reduce((sum, h) => sum + (h.kitchen_count || 0), 0);
  const totalOnline = hotels.reduce((sum, h) => sum + (h.online_count || 0), 0);

  return (
    <div className="space-y-6">
      {/* Top Banner / Metrics */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-emerald-400" />
            <h2 className="text-base font-bold text-white">
              Multi-Tenant Hotels & Brands Directory
            </h2>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            Manage hotel tenants, vanity portal URLs (Instagram-style /:hotel-slug), and assign dedicated hotel admin credentials.
          </p>
        </div>

        <button
          onClick={() => {
            setCreateError('');
            setShowCreateModal(true);
          }}
          className="py-2 px-4 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-bold rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-emerald-950/40 shrink-0"
        >
          <Plus className="h-4 w-4" />
          <span>Provision New Hotel</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-[#18181c] border border-zinc-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
              Registered Hotels
            </span>
            <div className="text-2xl font-bold font-mono text-white mt-1">
              {hotels.length}
            </div>
          </div>
          <div className="h-10 w-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-300">
            <Building2 className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-[#18181c] border border-zinc-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
              Total Kitchen Branches
            </span>
            <div className="text-2xl font-bold font-mono text-white mt-1">
              {totalKitchens}
            </div>
          </div>
          <div className="h-10 w-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-sky-400">
            <Server className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-[#18181c] border border-zinc-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
              Active Online Nodes
            </span>
            <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">
              {totalOnline}
            </div>
          </div>
          <div className="h-10 w-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-emerald-400">
            <ShieldCheck className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="flex items-center gap-2 bg-[#18181c] border border-zinc-800 rounded-xl px-3 py-2">
        <Search className="h-4 w-4 text-zinc-500 shrink-0" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by hotel name, slug (e.g. /grand-hotel), or admin username..."
          className="bg-transparent border-none text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none w-full"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="text-[10px] text-zinc-500 hover:text-zinc-300"
          >
            Clear
          </button>
        )}
      </div>

      {/* Hotels Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredHotels.length === 0 ? (
          <div className="col-span-full py-16 text-center text-zinc-500 border border-dashed border-zinc-800 rounded-2xl p-8">
            <Building2 className="h-10 w-10 text-zinc-600 mx-auto mb-2" />
            <div className="text-sm font-semibold text-zinc-300">No Hotels Found</div>
            <div className="text-xs text-zinc-500 mt-1">
              {search ? 'Try clearing your search query.' : 'Click "Provision New Hotel" to register your first hotel brand.'}
            </div>
          </div>
        ) : (
          filteredHotels.map((hotel) => {
            const portalUrl = `${originUrl}/${hotel.slug}`;
            const isSuspended = hotel.status === 'suspended';

            return (
              <div
                key={hotel.id}
                className={`bg-[#18181c] border ${
                  isSuspended ? 'border-rose-950/50 bg-rose-950/5' : 'border-zinc-800 hover:border-zinc-700'
                } rounded-2xl p-5 shadow-lg flex flex-col justify-between transition-all`}
              >
                <div>
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                            isSuspended
                              ? 'bg-rose-500'
                              : hotel.online_count > 0
                              ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] pulse-emerald'
                              : 'bg-zinc-600'
                          }`}
                        />
                        <h3 className="text-sm font-bold text-white truncate" title={hotel.name}>
                          {hotel.name}
                        </h3>
                      </div>
                      <div className="text-[11px] text-zinc-400 font-mono mt-0.5 truncate">
                        ID: {hotel.id}
                      </div>
                    </div>

                    <span
                      className={`px-2 py-0.5 text-[10px] font-mono uppercase font-bold rounded ${
                        isSuspended
                          ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                          : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                      }`}
                    >
                      {hotel.status}
                    </span>
                  </div>

                  {/* Vanity Link Pill (Instagram style username) */}
                  <div className="mt-3.5 p-2 rounded-xl bg-zinc-900/90 border border-zinc-800 flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-1.5 min-w-0 font-mono">
                      <span className="text-zinc-500 shrink-0">URL:</span>
                      <a
                        href={`/${hotel.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-emerald-400 hover:text-emerald-300 font-semibold truncate hover:underline"
                        title={portalUrl}
                      >
                        /{hotel.slug}
                      </a>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={(e) => handleCopyLink(hotel.slug, e)}
                        className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                        title="Copy Hotel Portal Link"
                      >
                        {copiedSlug === hotel.slug ? (
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                      <a
                        href={`/${hotel.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                        title="Open Hotel Portal in New Tab"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 gap-2 mt-3 p-2.5 rounded-xl bg-zinc-900/50 border border-zinc-800/80 text-[11px]">
                    <div>
                      <span className="text-zinc-500 text-[10px] block">Kitchen Branches</span>
                      <span className="font-mono text-zinc-200 font-semibold block mt-0.5">
                        {hotel.kitchen_count} Deployed ({hotel.online_count} Online)
                      </span>
                    </div>

                    <div>
                      <span className="text-zinc-500 text-[10px] block">Hotel Admin</span>
                      <span className="font-mono text-zinc-300 font-semibold block mt-0.5 truncate" title={hotel.admin_username || 'N/A'}>
                        {hotel.admin_username || 'admin'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions Toolbar */}
                <div className="mt-5 pt-3.5 border-t border-zinc-800 flex items-center justify-between gap-1.5">
                  <button
                    onClick={() => onSelectHotel(hotel.id)}
                    className="flex-1 py-1.5 px-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-zinc-200 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                    title="View and manage branches for this hotel"
                  >
                    <Server className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Manage Branches</span>
                  </button>

                  <button
                    onClick={() => {
                      setResetModalHotel(hotel);
                      setNewPassword('');
                      setResetError('');
                      setResetSuccess('');
                    }}
                    className="p-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 rounded-lg transition-colors"
                    title="Reset Hotel Owner Password"
                  >
                    <KeyRound className="h-4 w-4" />
                  </button>

                  <button
                    onClick={() => handleToggleStatus(hotel)}
                    className={`p-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 ${
                      isSuspended ? 'text-amber-400 hover:text-amber-300' : 'text-zinc-400 hover:text-zinc-200'
                    } rounded-lg transition-colors`}
                    title={isSuspended ? 'Activate Hotel' : 'Suspend Hotel'}
                  >
                    <Power className="h-4 w-4" />
                  </button>

                  {hotel.id !== 'OWN-DEFAULT-SYSTEM' && (
                    <button
                      onClick={() => handleDeleteHotel(hotel)}
                      className="p-1.5 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                      title="Delete Hotel"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal: Provision New Hotel */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#18181c] border border-zinc-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">Provision New Hotel Brand</h3>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-zinc-500 hover:text-zinc-300 text-sm"
              >
                ✕
              </button>
            </div>

            {createError && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{createError}</span>
              </div>
            )}

            <form onSubmit={handleCreateHotel} className="space-y-3.5 text-xs">
              <div>
                <label className="text-zinc-300 font-semibold block mb-1">
                  Hotel Company / Brand Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. The Oberoi Grand"
                  value={formData.company_name}
                  onChange={handleNameChange}
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-zinc-300 font-semibold block mb-1">
                  Vanity URL Slug (Instagram-style Username)
                </label>
                <div className="flex items-center gap-1.5">
                  <span className="text-zinc-500 font-mono select-none">{originUrl}/</span>
                  <input
                    type="text"
                    required
                    placeholder="oberoi-grand"
                    value={formData.slug}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        slug: e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9-]/g, ''),
                      })
                    }
                    className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg font-mono text-emerald-400 placeholder-zinc-600 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <span className="text-[10px] text-zinc-500 mt-0.5 block font-mono">
                  This hotel will manage all its branches at this link.
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-zinc-300 font-semibold block mb-1">
                    Hotel Admin Username
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="oberoi_admin"
                    value={formData.admin_username}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        admin_username: e.target.value.trim(),
                      })
                    }
                    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-white font-mono placeholder-zinc-600 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-zinc-300 font-semibold block mb-1">
                    Initial Password
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={formData.admin_password}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        admin_password: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-white font-mono placeholder-zinc-600 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-zinc-300 font-semibold block mb-1">
                    Contact Email (Optional)
                  </label>
                  <input
                    type="email"
                    placeholder="manager@hotel.com"
                    value={formData.contact_email}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        contact_email: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-zinc-300 font-semibold block mb-1">
                    Max Kitchen Branches
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={formData.max_kitchens}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        max_kitchens: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-white font-mono placeholder-zinc-600 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-zinc-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="py-2 px-3 rounded-lg border border-zinc-800 hover:bg-zinc-900 text-zinc-400 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="py-2 px-4 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold rounded-lg flex items-center gap-1.5 disabled:opacity-50"
                >
                  {creating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>{creating ? 'Creating...' : 'Create Hotel Organization'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Reset Hotel Admin Password */}
      {resetModalHotel && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#18181c] border border-zinc-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-white">Reset Hotel Password</h3>
              </div>
              <button
                onClick={() => setResetModalHotel(null)}
                className="text-zinc-500 hover:text-zinc-300 text-xs"
              >
                ✕
              </button>
            </div>

            <div className="text-xs text-zinc-400">
              Set a new access password for <strong className="text-white">{resetModalHotel.name}</strong> (Username: <code className="text-emerald-400">{resetModalHotel.admin_username || 'admin'}</code>).
            </div>

            {resetError && (
              <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{resetError}</span>
              </div>
            )}

            {resetSuccess && (
              <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>{resetSuccess}</span>
              </div>
            )}

            <form onSubmit={handleResetPassword} className="space-y-3 text-xs">
              <div>
                <label className="text-zinc-300 font-semibold block mb-1">
                  New Password
                </label>
                <input
                  type="password"
                  required
                  placeholder="Minimum 6 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-white font-mono placeholder-zinc-600 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setResetModalHotel(null)}
                  className="py-1.5 px-3 rounded-lg border border-zinc-800 text-zinc-400 hover:bg-zinc-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resetting}
                  className="py-1.5 px-3 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold rounded-lg flex items-center gap-1.5 disabled:opacity-50"
                >
                  {resetting && <Loader2 className="h-3 w-3 animate-spin" />}
                  <span>{resetting ? 'Updating...' : 'Save Password'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
