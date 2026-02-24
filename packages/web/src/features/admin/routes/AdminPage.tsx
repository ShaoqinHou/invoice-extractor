import { useState } from 'react';
import { UsersTab } from '../components/UsersTab';
import { CompaniesTab } from '../components/CompaniesTab';
import { InvitesTab } from '../components/InvitesTab';

const TABS = [
  { id: 'users', label: 'Users' },
  { id: 'companies', label: 'Companies' },
  { id: 'invites', label: 'Invites' },
] as const;

type TabId = typeof TABS[number]['id'];

export function AdminPage() {
  const [activeTab, setActiveTab] = useState<TabId>('users');

  return (
    <div className="h-full overflow-auto p-6">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-lg font-semibold text-gray-900 mb-4">Admin Panel</h1>

        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          {/* Tab bar */}
          <div className="flex border-b border-gray-200">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'border-b-2 border-[#0078c8] text-[#0078c8]'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {activeTab === 'users' && <UsersTab />}
          {activeTab === 'companies' && <CompaniesTab />}
          {activeTab === 'invites' && <InvitesTab />}
        </div>
      </div>
    </div>
  );
}
