import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { FileText } from 'lucide-react';
import { useLogin } from '../hooks/useAuth';

export function LoginPage() {
  const navigate = useNavigate();
  const login = useLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    login.mutate(
      { email, password },
      {
        onSuccess: () => navigate({ to: '/invoices' }),
      },
    );
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <FileText className="mx-auto h-10 w-10 text-[#0078c8]" />
          <h1 className="mt-3 text-xl font-semibold text-gray-900">
            Invoice Extractor
          </h1>
          <p className="mt-1 text-sm text-gray-500">Sign in to your account</p>
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
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-[#0078c8] focus:outline-none focus:ring-1 focus:ring-[#0078c8]"
              placeholder="you@example.com"
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
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-[#0078c8] focus:outline-none focus:ring-1 focus:ring-[#0078c8]"
            />
          </div>

          {login.isError && (
            <p className="text-sm text-red-600">
              {login.error.message}
            </p>
          )}

          <button
            type="submit"
            disabled={login.isPending}
            className="w-full rounded-md bg-[#0078c8] px-4 py-2 text-sm font-medium text-white hover:bg-[#006ab5] focus:outline-none focus:ring-2 focus:ring-[#0078c8] focus:ring-offset-2 disabled:opacity-50"
          >
            {login.isPending ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
