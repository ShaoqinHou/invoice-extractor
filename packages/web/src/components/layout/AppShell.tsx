import { Outlet, useLocation, useNavigate } from '@tanstack/react-router';
import { useAuthStatus, useMe } from '../../features/auth/hooks/useAuth';
import { RootLayout } from './RootLayout';
import { useEffect } from 'react';

const PUBLIC_PATHS = ['/login', '/register'];

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { data: authStatus, isLoading: statusLoading } = useAuthStatus();
  const { data: meData, isLoading: meLoading, isError: meError } = useMe();

  const isPublicPath = PUBLIC_PATHS.some(p => location.pathname.startsWith(p));
  const authEnabled = authStatus?.auth_enabled ?? false;

  // Still loading auth status
  if (statusLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-400">Loading...</p>
      </div>
    );
  }

  // Auth disabled — always show app shell with content
  if (!authEnabled) {
    return <RootLayout />;
  }

  // Auth enabled — public routes render bare (no nav shell)
  if (isPublicPath) {
    return <PublicRoute />;
  }

  // Auth enabled — protected routes need session check
  if (meLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-400">Loading...</p>
      </div>
    );
  }

  if (meError || !meData?.user) {
    return <RedirectToLogin />;
  }

  // Authenticated — show full app shell
  return <RootLayout />;
}

function PublicRoute() {
  const navigate = useNavigate();
  const { data: meData } = useMe();
  const location = useLocation();

  useEffect(() => {
    // If user is already logged in and visits login page, redirect to app
    if (meData?.user && location.pathname === '/login') {
      navigate({ to: '/invoices' });
    }
  }, [meData, navigate, location.pathname]);

  return <Outlet />;
}

function RedirectToLogin() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate({ to: '/login' });
  }, [navigate]);
  return null;
}
