import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authKeys } from './keys';

interface AuthUser {
  id: number;
  email: string;
  display_name: string | null;
  role: string;
}

interface Company {
  id: number;
  name: string;
  slug: string | null;
  role: string;
}

interface MeResponse {
  user: AuthUser;
  companies: Company[];
}

interface AuthStatusResponse {
  auth_enabled: boolean;
}

export function useAuthStatus() {
  return useQuery({
    queryKey: authKeys.status,
    queryFn: async (): Promise<AuthStatusResponse> => {
      const res = await fetch('/api/auth/status');
      return res.json();
    },
    staleTime: Infinity,
  });
}

export function useMe() {
  return useQuery({
    queryKey: authKeys.me,
    queryFn: async (): Promise<MeResponse> => {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (res.status === 401) {
        throw new Error('UNAUTHORIZED');
      }
      if (!res.ok) throw new Error('Failed to fetch user');
      return res.json();
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { email: string; password: string }) => {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Login failed');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: authKeys.me });
    },
  });
}

export function useRegister() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      token: string;
      email?: string;
      display_name?: string;
      password: string;
    }) => {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Registration failed');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: authKeys.me });
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    },
    onSuccess: () => {
      queryClient.setQueryData(authKeys.me, null);
      queryClient.invalidateQueries({ queryKey: authKeys.me });
    },
  });
}

export function useInviteValidation(token: string | null) {
  return useQuery({
    queryKey: authKeys.invite(token || ''),
    queryFn: async () => {
      const res = await fetch(`/api/auth/invite/${token}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Invalid invite');
      }
      return res.json() as Promise<{
        valid: boolean;
        email: string | null;
        role: string;
        company_name: string | null;
      }>;
    },
    enabled: !!token,
    retry: false,
  });
}
