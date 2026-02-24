import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from "@tanstack/react-router";
import { AppShell } from "./components/layout/AppShell";
import { InvoicesPage } from "./features/invoices/routes/InvoicesPage";
import { ReviewDetailPage } from "./features/invoices/routes/ReviewDetailPage";
import { LoginPage } from "./features/auth/routes/LoginPage";
import { RegisterPage } from "./features/auth/routes/RegisterPage";
import { AdminPage } from "./features/admin/routes/AdminPage";

const rootRoute = createRootRoute({
  component: AppShell,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/invoices" });
  },
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginPage,
});

const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/register",
  component: RegisterPage,
  validateSearch: (search: Record<string, unknown>) => ({
    token: (search.token as string) || undefined,
  }),
});

const invoicesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/invoices",
  component: InvoicesPage,
});

const reviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/invoices/$id",
  component: ReviewDetailPage,
});

const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin",
  component: AdminPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  registerRoute,
  invoicesRoute,
  reviewRoute,
  adminRoute,
]);

export const router = createRouter({
  routeTree,
  basepath: import.meta.env.BASE_URL?.replace(/\/$/, '') || '/',
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
