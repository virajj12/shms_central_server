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
  Settings,
} from 'lucide-react';
import { api } from '../services/api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
  CardFooter,
} from '@/components/ui/card';

export default function HotelsManagerView({
  hotels = [],
  onRefresh,
}) {
  const [search, setSearch] = useState('');
  const [copiedSlug, setCopiedSlug] = useState(null);

  // Edit Hotel Details Modal
  const [editModalHotel, setEditModalHotel] = useState(null);
  const [editFormData, setEditFormData] = useState({ company_name: '', contact_email: '', max_kitchens: 20 });
  const [editing, setEditing] = useState(false);
  const [editSuccess, setEditSuccess] = useState('');
  const [editError, setEditError] = useState('');

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

  const handleUpdateHotel = async (e) => {
    e.preventDefault();
    if (!editModalHotel) return;
    setEditing(true);
    setEditError('');
    setEditSuccess('');
    try {
      await api.updateHotel(editModalHotel.id, editFormData);
      setEditSuccess('Hotel details updated successfully!');
      setTimeout(() => {
        setEditModalHotel(null);
        setEditSuccess('');
        onRefresh();
      }, 1000);
    } catch (err) {
      setEditError(err.message || 'Failed to update hotel details');
    } finally {
      setEditing(false);
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
        <Card size="sm" className="flex-row items-center justify-between p-4">
          <div>
            <CardDescription className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
              Registered Hotels
            </CardDescription>
            <CardTitle className="text-2xl font-bold font-mono text-white mt-1">
              {hotels.length}
            </CardTitle>
          </div>
          <div className="h-10 w-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-300 shrink-0">
            <Building2 className="h-5 w-5" />
          </div>
        </Card>

        <Card size="sm" className="flex-row items-center justify-between p-4">
          <div>
            <CardDescription className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
              Total Kitchen Branches
            </CardDescription>
            <CardTitle className="text-2xl font-bold font-mono text-white mt-1">
              {totalKitchens}
            </CardTitle>
          </div>
          <div className="h-10 w-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-sky-400 shrink-0">
            <Server className="h-5 w-5" />
          </div>
        </Card>

        <Card size="sm" className="flex-row items-center justify-between p-4">
          <div>
            <CardDescription className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
              Active Online Nodes
            </CardDescription>
            <CardTitle className="text-2xl font-bold font-mono text-emerald-400 mt-1">
              {totalOnline}
            </CardTitle>
          </div>
          <div className="h-10 w-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-emerald-400 shrink-0">
            <ShieldCheck className="h-5 w-5" />
          </div>
        </Card>
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
              <Card
                key={hotel.id}
                className={`justify-between transition-all ${
                  isSuspended ? 'border-rose-950/50 bg-rose-950/5' : 'border-zinc-800 hover:border-zinc-700'
                }`}
              >
                <div>
                  {/* Header */}
                  <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-0">
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
                        <CardTitle className="text-sm font-bold text-white truncate" title={hotel.name}>
                          {hotel.name}
                        </CardTitle>
                      </div>
                      <CardDescription className="text-[11px] text-zinc-400 font-mono mt-0.5 truncate">
                        ID: {hotel.id}
                      </CardDescription>
                    </div>

                    <CardAction className="m-0 shrink-0">
                      <span
                        className={`px-2 py-0.5 text-[10px] font-mono uppercase font-bold rounded ${
                          isSuspended
                            ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                            : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                        }`}
                      >
                        {hotel.status}
                      </span>
                    </CardAction>
                  </CardHeader>

                  <CardContent className="p-0 pt-3.5">
                    {/* Client Endpoint Handle Pill */}
                    <div className="p-2 rounded-xl bg-zinc-900/90 border border-zinc-800 flex items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-1.5 min-w-0 font-mono">
                        <span className="text-zinc-500 shrink-0">Client Endpoint:</span>
                        <span className="text-emerald-400 font-semibold truncate select-all">
                          /{hotel.slug}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={(e) => handleCopyLink(hotel.slug, e)}
                          className="py-1 px-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-[11px] font-semibold flex items-center gap-1 transition-colors"
                          title="Copy client login link to provide to hotel owner"
                        >
                          {copiedSlug === hotel.slug ? (
                            <>
                              <Check className="h-3 w-3 text-emerald-400" />
                              <span className="text-emerald-400">Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3" />
                              <span>Copy Link</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 gap-2 mt-3 p-2.5 rounded-xl bg-zinc-900/50 border border-zinc-800/80 text-[11px]">
                      <div>
                        <span className="text-zinc-500 text-[10px] block">Kitchen Branches</span>
                        <span className="font-mono text-zinc-200 font-semibold block mt-0.5">
                          {hotel.kitchen_count} of {hotel.max_kitchens || 20} Max ({hotel.online_count} Online)
                        </span>
                      </div>

                      <div>
                        <span className="text-zinc-500 text-[10px] block">Owner Login Handle</span>
                        <span className="font-mono text-emerald-400 font-semibold block mt-0.5 truncate" title={`Sign in with username: ${hotel.admin_username || hotel.slug}`}>
                          {hotel.admin_username || hotel.slug}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </div>

                {/* Actions Toolbar (Superadmin Operator Only Manages) */}
                <CardFooter className="p-0 mt-5 pt-3.5 border-t border-zinc-800/80 flex items-center justify-between gap-1.5">
                  <button
                    onClick={() => {
                      setEditModalHotel(hotel);
                      setEditFormData({
                        company_name: hotel.name,
                        contact_email: hotel.contact_email || '',
                        max_kitchens: hotel.max_kitchens || 20,
                      });
                      setEditError('');
                      setEditSuccess('');
                    }}
                    className="flex-1 py-1.5 px-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-zinc-200 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                    title="Edit hotel details and kitchen quotas"
                  >
                    <Settings className="h-3.5 w-3.5 text-zinc-400" />
                    <span>Edit Quota</span>
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
                </CardFooter>
              </Card>
            );
          })
        )}
      </div>

      {/* Modal: Provision New Hotel (shadcn/ui Dialog) */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader className="pb-3 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-emerald-400" />
              <DialogTitle className="text-base font-bold text-white">Provision New Hotel Brand</DialogTitle>
            </div>
            <DialogDescription className="text-xs text-zinc-400">
              Create a new client hotel tenant, vanity endpoint, and credentials.
            </DialogDescription>
          </DialogHeader>

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
                placeholder="Enter hotel company or brand name"
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
                  placeholder="hotel-endpoint-slug"
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
                  placeholder="admin_username"
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
        </DialogContent>
      </Dialog>

      {/* Modal: Reset Hotel Admin Password (shadcn/ui Dialog) */}
      <Dialog open={Boolean(resetModalHotel)} onOpenChange={(open) => !open && setResetModalHotel(null)}>
        {resetModalHotel && (
          <DialogContent className="max-w-sm">
            <DialogHeader className="pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-emerald-400" />
                <DialogTitle className="text-sm font-bold text-white">Reset Hotel Password</DialogTitle>
              </div>
              <DialogDescription className="text-xs text-zinc-400 pt-1">
                Set a new access password for <strong className="text-white">{resetModalHotel.name}</strong> (Username: <code className="text-emerald-400">{resetModalHotel.admin_username || resetModalHotel.slug}</code>).
              </DialogDescription>
            </DialogHeader>

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
          </DialogContent>
        )}
      </Dialog>

      {/* Modal: Edit Hotel Details & Quotas (shadcn/ui Dialog) */}
      <Dialog open={Boolean(editModalHotel)} onOpenChange={(open) => !open && setEditModalHotel(null)}>
        {editModalHotel && (
          <DialogContent className="max-w-md">
            <DialogHeader className="pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4 text-emerald-400" />
                <DialogTitle className="text-sm font-bold text-white">Edit Hotel Settings &amp; Quotas</DialogTitle>
              </div>
              <DialogDescription className="text-xs text-zinc-400 pt-1">
                Configure parameters for <strong className="text-white">{editModalHotel.name}</strong> (Endpoint: <code className="text-emerald-400">/{editModalHotel.slug}</code>).
              </DialogDescription>
            </DialogHeader>

            {editError && (
              <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{editError}</span>
              </div>
            )}

            {editSuccess && (
              <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>{editSuccess}</span>
              </div>
            )}

            <form onSubmit={handleUpdateHotel} className="space-y-3.5 text-xs">
              <div>
                <label className="text-zinc-300 font-semibold block mb-1">
                  Hotel Company Name
                </label>
                <input
                  type="text"
                  required
                  value={editFormData.company_name}
                  onChange={(e) => setEditFormData({ ...editFormData, company_name: e.target.value })}
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-zinc-300 font-semibold block mb-1">
                  Contact / Notifications Email
                </label>
                <input
                  type="email"
                  value={editFormData.contact_email}
                  onChange={(e) => setEditFormData({ ...editFormData, contact_email: e.target.value })}
                  placeholder="admin@hotel.com"
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-white font-mono placeholder-zinc-600 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-zinc-300 font-semibold block mb-1">
                  Max Kitchen Appliances Allowed
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  required
                  value={editFormData.max_kitchens}
                  onChange={(e) => setEditFormData({ ...editFormData, max_kitchens: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-white font-mono placeholder-zinc-600 focus:outline-none focus:border-emerald-500"
                />
                <span className="text-[10px] text-zinc-500 block mt-0.5">
                  Limits the maximum number of edge kitchen computers this hotel can pair.
                </span>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditModalHotel(null)}
                  className="py-1.5 px-3 rounded-lg border border-zinc-800 text-zinc-400 hover:bg-zinc-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editing}
                  className="py-1.5 px-3 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold rounded-lg flex items-center gap-1.5 disabled:opacity-50"
                >
                  {editing && <Loader2 className="h-3 w-3 animate-spin" />}
                  <span>{editing ? 'Saving...' : 'Save Settings'}</span>
                </button>
              </div>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
