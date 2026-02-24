import { useState } from 'react';
import { useAdminUsers, useUpdateUser } from '../hooks/useAdmin';

const ROLES = ['admin', 'manager', 'user', 'viewer'] as const;

export function UsersTab() {
  const { data: users, isLoading } = useAdminUsers();
  const updateUser = useUpdateUser();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editRole, setEditRole] = useState('');

  if (isLoading) return <p className="text-sm text-gray-500 p-4">Loading users...</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase text-gray-500">
            <th className="px-4 py-3">Email</th>
            <th className="px-4 py-3">Name</th>
            <th className="px-4 py-3">Role</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users?.map((user) => (
            <tr key={user.id} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="px-4 py-3 font-medium">{user.email}</td>
              <td className="px-4 py-3 text-gray-600">{user.display_name || '—'}</td>
              <td className="px-4 py-3">
                {editingId === user.id ? (
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value)}
                    className="rounded border border-gray-300 px-2 py-1 text-xs"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                ) : (
                  <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs capitalize">
                    {user.role}
                  </span>
                )}
              </td>
              <td className="px-4 py-3">
                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${user.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {user.is_active ? 'Active' : 'Inactive'}
                </span>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  {editingId === user.id ? (
                    <>
                      <button
                        onClick={() => {
                          updateUser.mutate(
                            { id: user.id, role: editRole },
                            { onSuccess: () => setEditingId(null) },
                          );
                        }}
                        className="text-xs text-[#0078c8] hover:underline"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="text-xs text-gray-500 hover:underline"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => { setEditingId(user.id); setEditRole(user.role); }}
                        className="text-xs text-[#0078c8] hover:underline"
                      >
                        Edit role
                      </button>
                      <button
                        onClick={() => updateUser.mutate({ id: user.id, is_active: !user.is_active })}
                        className={`text-xs hover:underline ${user.is_active ? 'text-red-600' : 'text-green-600'}`}
                      >
                        {user.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {(!users || users.length === 0) && (
        <p className="p-4 text-center text-sm text-gray-500">No users found</p>
      )}
    </div>
  );
}
