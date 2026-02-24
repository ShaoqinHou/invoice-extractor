export const adminKeys = {
  users: ['admin', 'users'] as const,
  companies: ['admin', 'companies'] as const,
  companyMembers: (id: number) => ['admin', 'companies', id, 'members'] as const,
  invites: ['admin', 'invites'] as const,
};
