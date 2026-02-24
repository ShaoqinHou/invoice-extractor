export const authKeys = {
  me: ['auth', 'me'] as const,
  status: ['auth', 'status'] as const,
  invite: (token: string) => ['auth', 'invite', token] as const,
};
