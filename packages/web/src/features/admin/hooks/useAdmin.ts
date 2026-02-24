import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { API_BASE } from '@web/lib/api';
import { adminKeys } from './keys';

// ── Users ────────────────────────────────────────────────────────

export function useAdminUsers() {
  return useQuery({
    queryKey: adminKeys.users,
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/admin/users`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch users');
      return res.json() as Promise<Array<{
        id: number;
        email: string;
        display_name: string | null;
        role: string;
        is_active: boolean;
        created_at: string;
      }>>;
    },
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: number; [key: string]: unknown }) => {
      const res = await fetch(`${API_BASE}/admin/users/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to update user');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.users });
    },
  });
}

// ── Companies ────────────────────────────────────────────────────

export function useAdminCompanies() {
  return useQuery({
    queryKey: adminKeys.companies,
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/admin/companies`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch companies');
      return res.json() as Promise<Array<{
        id: number;
        name: string;
        slug: string | null;
        is_active: boolean;
        created_at: string;
      }>>;
    },
  });
}

export function useCreateCompany() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; slug?: string }) => {
      const res = await fetch(`${API_BASE}/admin/companies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to create company');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.companies });
    },
  });
}

// ── Invites ──────────────────────────────────────────────────────

export function useAdminInvites() {
  return useQuery({
    queryKey: adminKeys.invites,
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/admin/invites`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch invites');
      return res.json() as Promise<Array<{
        id: number;
        token: string;
        email: string | null;
        role: string;
        company_id: number | null;
        expires_at: string;
        used_at: string | null;
        created_at: string;
      }>>;
    },
  });
}

export function useCreateInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      role?: string;
      email?: string;
      company_id?: number;
      expires_in_hours?: number;
    }) => {
      const res = await fetch(`${API_BASE}/admin/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to create invite');
      }
      return res.json() as Promise<{
        id: number;
        token: string;
        expires_at: string;
        role: string;
      }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.invites });
    },
  });
}

export function useDeleteInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${API_BASE}/admin/invites/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to delete invite');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.invites });
    },
  });
}
