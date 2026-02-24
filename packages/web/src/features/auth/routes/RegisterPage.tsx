import { useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { FileText, AlertCircle } from 'lucide-react';
import { useRegister, useInviteValidation } from '../hooks/useAuth';

export function RegisterPage() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { token?: string };
  const token = search.token || null;

  const { data: invite, isLoading: inviteLoading, error: inviteError } = useInviteValidation(token);
  const register = useRegister();

  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const effectiveEmail = invite?.email || email;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) return;
    if (!token) return;

    register.mutate(
      {
        token,
        email: effectiveEmail,
        display_name: displayName || undefined,
        password,
      },
      {
        onSuccess: () => navigate({ to: '/invoices' }),
      },
    );
  };

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="text-center">
          <AlertCircle className="mx-auto h-10 w-10 text-red-500" />
          <h1 className="mt-3 text-lg font-semibold text-gray-900">Invalid Link</h1>
          <p className="mt-1 text-sm text-gray-500">
            Registration requires a valid invite link.
          </p>
        </div>
      </div>
    );
  }

  if (inviteLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">Validating invite...</p>
      </div>
    );
  }

  if (inviteError || !invite?.valid) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="text-center">
          <AlertCircle className="mx-auto h-10 w-10 text-red-500" />
          <h1 className="mt-3 text-lg font-semibold text-gray-900">
            {inviteError?.message || 'Invalid Invite'}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            This invite link may have expired or already been used.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <FileText className="mx-auto h-10 w-10 text-[#0078c8]" />
          <h1 className="mt-3 text-xl font-semibold text-gray-900">
            Create your account
          </h1>
          {invite.company_name && (
            <p className="mt-1 text-sm text-gray-500">
              Joining <span className="font-medium">{invite.company_name}</span>
            </p>
          )}
          <p className="mt-1 text-xs text-gray-400">
            Role: <span className="capitalize">{invite.role}</span>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={effectiveEmail}
              onChange={(e) => setEmail(e.target.value)}
              disabled={!!invite.email}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-[#0078c8] focus:outline-none focus:ring-1 focus:ring-[#0078c8] disabled:bg-gray-100 disabled:text-gray-500"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="displayName" className="block text-sm font-medium text-gray-700">
              Display name
            </label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-[#0078c8] focus:outline-none focus:ring-1 focus:ring-[#0078c8]"
              placeholder="Your name"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-[#0078c8] focus:outline-none focus:ring-1 focus:ring-[#0078c8]"
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
              Confirm password
            </label>
            <input
              id="confirmPassword"
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-[#0078c8] focus:outline-none focus:ring-1 focus:ring-[#0078c8]"
            />
            {confirmPassword && password !== confirmPassword && (
              <p className="mt-1 text-xs text-red-500">Passwords don't match</p>
            )}
          </div>

          {register.isError && (
            <p className="text-sm text-red-600">{register.error.message}</p>
          )}

          <button
            type="submit"
            disabled={register.isPending || password !== confirmPassword}
            className="w-full rounded-md bg-[#0078c8] px-4 py-2 text-sm font-medium text-white hover:bg-[#006ab5] focus:outline-none focus:ring-2 focus:ring-[#0078c8] focus:ring-offset-2 disabled:opacity-50"
          >
            {register.isPending ? 'Creating account...' : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  );
}
