import { useState } from 'react';
import { Copy, Check, Trash2 } from 'lucide-react';
import { useAdminInvites, useCreateInvite, useDeleteInvite, useAdminCompanies } from '../hooks/useAdmin';

const ROLES = ['admin', 'manager', 'user', 'viewer'] as const;

export function InvitesTab() {
  const { data: invites, isLoading } = useAdminInvites();
  const { data: companies } = useAdminCompanies();
  const createInvite = useCreateInvite();
  const deleteInvite = useDeleteInvite();

  const [showForm, setShowForm] = useState(false);
  const [role, setRole] = useState<string>('user');
  const [email, setEmail] = useState('');
  const [companyId, setCompanyId] = useState<string>('');
  const [expiresInHours, setExpiresInHours] = useState(168);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createInvite.mutate(
      {
        role,
        email: email.trim() || undefined,
        company_id: companyId ? parseInt(companyId) : undefined,
        expires_in_hours: expiresInHours,
      },
      {
        onSuccess: () => {
          setEmail('');
          setCompanyId('');
          setRole('user');
          setExpiresInHours(168);
          setShowForm(false);
        },
      },
    );
  };

  const copyInviteLink = (token: string) => {
    const url = `${window.location.origin}/register?token=${token}`;
    navigator.clipboard.writeText(url);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const now = new Date().toISOString();

  if (isLoading) return <p className="text-sm text-gray-500 p-4">Loading invites...</p>;

  return (
    <div>
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <h3 className="text-sm font-medium text-gray-700">
          {invites?.length ?? 0} invites
        </h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded bg-[#0078c8] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#006ab5]"
        >
          {showForm ? 'Cancel' : 'Create Invite'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="border-b border-gray-100 bg-gray-50 px-4 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Expires in</label>
              <select
                value={expiresInHours}
                onChange={(e) => setExpiresInHours(parseInt(e.target.value))}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              >
                <option value={24}>24 hours</option>
                <option value={72}>3 days</option>
                <option value={168}>7 days</option>
                <option value={720}>30 days</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email (optional lock)</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Only this email can use it"
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Company (optional)</label>
              <select
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              >
                <option value="">No company</option>
                {companies?.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
          <button
            type="submit"
            disabled={createInvite.isPending}
            className="rounded bg-[#0078c8] px-4 py-1.5 text-xs font-medium text-white hover:bg-[#006ab5] disabled:opacity-50"
          >
            {createInvite.isPending ? 'Creating...' : 'Generate Invite Link'}
          </button>
        </form>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase text-gray-500">
            <th className="px-4 py-3">Role</th>
            <th className="px-4 py-3">Email Lock</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Expires</th>
            <th className="px-4 py-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {invites?.map((invite) => {
            const isExpired = invite.expires_at < now;
            const isUsed = !!invite.used_at;
            const status = isUsed ? 'Used' : isExpired ? 'Expired' : 'Active';
            const statusColor = isUsed
              ? 'bg-gray-100 text-gray-600'
              : isExpired
                ? 'bg-red-100 text-red-700'
                : 'bg-green-100 text-green-700';

            return (
              <tr key={invite.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3">
                  <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs capitalize">
                    {invite.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-gray-600">{invite.email || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${statusColor}`}>
                    {status}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {new Date(invite.expires_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {!isUsed && !isExpired && (
                      <button
                        onClick={() => copyInviteLink(invite.token)}
                        className="flex items-center gap-1 text-xs text-[#0078c8] hover:underline"
                        title="Copy invite link"
                      >
                        {copiedToken === invite.token ? (
                          <><Check className="h-3 w-3" /> Copied</>
                        ) : (
                          <><Copy className="h-3 w-3" /> Copy link</>
                        )}
                      </button>
                    )}
                    <button
                      onClick={() => deleteInvite.mutate(invite.id)}
                      className="flex items-center gap-1 text-xs text-red-600 hover:underline"
                      title="Delete invite"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {(!invites || invites.length === 0) && (
        <p className="p-4 text-center text-sm text-gray-500">No invites yet</p>
      )}
    </div>
  );
}
