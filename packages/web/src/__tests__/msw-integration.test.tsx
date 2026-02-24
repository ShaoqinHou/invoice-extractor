import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { useInvoices } from '@web/features/invoices/hooks/useInvoices';
import React from 'react';

/**
 * Type 4: Frontend integration test — MSW intercepts fetch, React Query hook returns data.
 * No real API server. Tests the hook → fetch → mock response → state update cycle.
 */

const MOCK_INVOICES = [
  { id: 1, display_name: 'Electric Bill', status: 'draft', supplier_name: 'PowerCo' },
  { id: 2, display_name: 'Water Bill', status: 'approved', supplier_name: 'WaterCorp' },
];

const server = setupServer(
  http.get('/api/invoices', ({ request }) => {
    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    if (status) {
      return HttpResponse.json(MOCK_INVOICES.filter((i) => i.status === status));
    }
    return HttpResponse.json(MOCK_INVOICES);
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: qc }, children);
  };
}

describe('MSW + React Query integration', () => {
  it('useInvoices fetches full list via MSW', async () => {
    const { result } = renderHook(() => useInvoices(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(2);
    expect(result.current.data![0].display_name).toBe('Electric Bill');
    expect(result.current.data![1].supplier_name).toBe('WaterCorp');
  });

  it('useInvoices filters by status', async () => {
    const { result } = renderHook(() => useInvoices({ status: 'draft' }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0].status).toBe('draft');
  });

  it('useInvoices handles API error', async () => {
    server.use(
      http.get('/api/invoices', () => HttpResponse.json({ error: 'fail' }, { status: 500 })),
    );

    const { result } = renderHook(() => useInvoices(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeDefined();
  });
});
