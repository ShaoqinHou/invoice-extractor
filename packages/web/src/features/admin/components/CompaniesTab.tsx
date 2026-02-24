import { useState } from 'react';
import { useAdminCompanies, useCreateCompany } from '../hooks/useAdmin';

export function CompaniesTab() {
  const { data: companies, isLoading } = useAdminCompanies();
  const createCompany = useCreateCompany();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    createCompany.mutate(
      { name: name.trim() },
      {
        onSuccess: () => {
          setName('');
          setShowForm(false);
        },
      },
    );
  };

  if (isLoading) return <p className="text-sm text-gray-500 p-4">Loading companies...</p>;

  return (
    <div>
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <h3 className="text-sm font-medium text-gray-700">
          {companies?.length ?? 0} companies
        </h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded bg-[#0078c8] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#006ab5]"
        >
          {showForm ? 'Cancel' : 'Add Company'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="flex items-center gap-2 border-b border-gray-100 px-4 py-3 bg-gray-50">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Company name"
            className="flex-1 rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-[#0078c8] focus:outline-none"
            autoFocus
          />
          <button
            type="submit"
            disabled={createCompany.isPending || !name.trim()}
            className="rounded bg-[#0078c8] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#006ab5] disabled:opacity-50"
          >
            Create
          </button>
        </form>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase text-gray-500">
            <th className="px-4 py-3">Name</th>
            <th className="px-4 py-3">Slug</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Created</th>
          </tr>
        </thead>
        <tbody>
          {companies?.map((company) => (
            <tr key={company.id} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="px-4 py-3 font-medium">{company.name}</td>
              <td className="px-4 py-3 text-gray-500 font-mono text-xs">{company.slug || '—'}</td>
              <td className="px-4 py-3">
                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${company.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {company.is_active ? 'Active' : 'Inactive'}
                </span>
              </td>
              <td className="px-4 py-3 text-xs text-gray-500">
                {company.created_at ? new Date(company.created_at).toLocaleDateString() : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {(!companies || companies.length === 0) && (
        <p className="p-4 text-center text-sm text-gray-500">No companies yet</p>
      )}
    </div>
  );
}
