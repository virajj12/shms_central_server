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
  MoreVertical,
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
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Alert, AlertDescription } from '@/components/ui/alert';

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

        <Button
          variant="emerald"
          onClick={() => {
            setCreateError('');
            setShowCreateModal(true);
          }}
        >
          <Plus className="h-4 w-4" />
          <span>Provision New Hotel</span>
        </Button>
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
      <div className="relative flex items-center">
        <Search className="absolute left-3 h-4 w-4 text-zinc-500 pointer-events-none" />
        <Input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by hotel name, slug (e.g. /grand-hotel), or admin username..."
          className="pl-9 pr-14 h-10 bg-[#18181c]"
        />
        {search && (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setSearch('')}
            className="absolute right-2 text-zinc-500 hover:text-zinc-300"
          >
            Clear
          </Button>
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
                      <Badge variant={isSuspended ? 'destructive' : 'success'}>
                        {hotel.status}
                      </Badge>
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
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={(e) => handleCopyLink(hotel.slug, e)}
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
                        </Button>
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
                  <Button
                    variant="outline"
                    size="sm"
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
                    className="flex-1"
                    title="Edit hotel details and kitchen quotas"
                  >
                    <Settings className="h-3.5 w-3.5 text-zinc-400" />
                    <span>Edit Quota</span>
                  </Button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="icon-sm" title="More Options">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuLabel>Hotel Management</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => {
                          setResetModalHotel(hotel);
                          setNewPassword('');
                          setResetError('');
                          setResetSuccess('');
                        }}
                      >
                        <KeyRound className="h-4 w-4 text-emerald-400" />
                        <span>Reset Password</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleToggleStatus(hotel)}>
                        <Power className={`h-4 w-4 ${isSuspended ? 'text-emerald-400' : 'text-amber-400'}`} />
                        <span>{isSuspended ? 'Activate Hotel' : 'Suspend Access'}</span>
                      </DropdownMenuItem>
                      {hotel.id !== 'OWN-DEFAULT-SYSTEM' && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => handleDeleteHotel(hotel)}
                          >
                            <Trash2 className="h-4 w-4" />
                            <span>Delete Hotel</span>
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
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
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{createError}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleCreateHotel} className="space-y-3.5 text-xs">
            <div className="space-y-1">
              <Label htmlFor="company-name">
                Hotel Company / Brand Name
              </Label>
              <Input
                id="company-name"
                type="text"
                required
                placeholder="Enter hotel company or brand name"
                value={formData.company_name}
                onChange={handleNameChange}
                className="focus-visible:border-emerald-500 focus-visible:ring-emerald-500"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="hotel-slug">
                Vanity URL Slug (Instagram-style Username)
              </Label>
              <div className="flex items-center gap-1.5">
                <span className="text-zinc-500 font-mono text-xs select-none">{originUrl}/</span>
                <Input
                  id="hotel-slug"
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
                  className="font-mono text-emerald-400 focus-visible:border-emerald-500 focus-visible:ring-emerald-500"
                />
              </div>
              <span className="text-[10px] text-zinc-500 mt-0.5 block font-mono">
                This hotel will manage all its branches at this link.
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="admin-username">
                  Hotel Admin Username
                </Label>
                <Input
                  id="admin-username"
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
                  className="font-mono focus-visible:border-emerald-500 focus-visible:ring-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="admin-password">
                  Initial Password
                </Label>
                <Input
                  id="admin-password"
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
                  className="font-mono focus-visible:border-emerald-500 focus-visible:ring-emerald-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="contact-email">
                  Contact Email (Optional)
                </Label>
                <Input
                  id="contact-email"
                  type="email"
                  placeholder="manager@hotel.com"
                  value={formData.contact_email}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      contact_email: e.target.value,
                    })
                  }
                  className="focus-visible:border-emerald-500 focus-visible:ring-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="max-kitchens">
                  Max Kitchen Branches
                </Label>
                <Input
                  id="max-kitchens"
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
                  className="font-mono focus-visible:border-emerald-500 focus-visible:ring-emerald-500"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-zinc-800 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowCreateModal(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="emerald"
                size="sm"
                disabled={creating}
              >
                {creating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>{creating ? 'Creating...' : 'Create Hotel Organization'}</span>
              </Button>
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
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{resetError}</AlertDescription>
              </Alert>
            )}

            {resetSuccess && (
              <Alert variant="success">
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>{resetSuccess}</AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleResetPassword} className="space-y-3 text-xs">
              <div className="space-y-1">
                <Label htmlFor="new-hotel-password">
                  New Password
                </Label>
                <Input
                  id="new-hotel-password"
                  type="password"
                  required
                  placeholder="Minimum 6 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="font-mono focus-visible:border-emerald-500 focus-visible:ring-emerald-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setResetModalHotel(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="emerald"
                  size="sm"
                  disabled={resetting}
                >
                  {resetting && <Loader2 className="h-3 w-3 animate-spin" />}
                  <span>{resetting ? 'Updating...' : 'Save Password'}</span>
                </Button>
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
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{editError}</AlertDescription>
              </Alert>
            )}

            {editSuccess && (
              <Alert variant="success">
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>{editSuccess}</AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleUpdateHotel} className="space-y-3.5 text-xs">
              <div className="space-y-1">
                <Label htmlFor="edit-company-name">
                  Hotel Company Name
                </Label>
                <Input
                  id="edit-company-name"
                  type="text"
                  required
                  value={editFormData.company_name}
                  onChange={(e) => setEditFormData({ ...editFormData, company_name: e.target.value })}
                  className="focus-visible:border-emerald-500 focus-visible:ring-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="edit-contact-email">
                  Contact / Notifications Email
                </Label>
                <Input
                  id="edit-contact-email"
                  type="email"
                  value={editFormData.contact_email}
                  onChange={(e) => setEditFormData({ ...editFormData, contact_email: e.target.value })}
                  placeholder="admin@hotel.com"
                  className="font-mono focus-visible:border-emerald-500 focus-visible:ring-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="edit-max-kitchens">
                  Max Kitchen Appliances Allowed
                </Label>
                <Input
                  id="edit-max-kitchens"
                  type="number"
                  min="1"
                  max="100"
                  required
                  value={editFormData.max_kitchens}
                  onChange={(e) => setEditFormData({ ...editFormData, max_kitchens: Number(e.target.value) })}
                  className="font-mono focus-visible:border-emerald-500 focus-visible:ring-emerald-500"
                />
                <span className="text-[10px] text-zinc-500 block mt-0.5">
                  Limits the maximum number of edge kitchen computers this hotel can pair.
                </span>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditModalHotel(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="emerald"
                  size="sm"
                  disabled={editing}
                >
                  {editing && <Loader2 className="h-3 w-3 animate-spin" />}
                  <span>{editing ? 'Saving...' : 'Save Settings'}</span>
                </Button>
              </div>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
