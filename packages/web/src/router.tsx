import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from "@tanstack/react-router";
import { RootLayout } from "./components/layout/RootLayout";
import { InvoicesPage } from "./features/invoices/routes/InvoicesPage";
import { ReviewDetailPage } from "./features/invoices/routes/ReviewDetailPage";

const rootRoute = createRootRoute({
  component: RootLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/invoices" });
  },
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

const routeTree = rootRoute.addChildren([
  indexRoute,
  invoicesRoute,
  reviewRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
