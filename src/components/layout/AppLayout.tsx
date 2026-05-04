import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

export function AppLayout() {
  return (
    <div className="flex h-screen mesh-bg overflow-hidden p-2 gap-2">
      <Sidebar />
      <main className="flex-1 overflow-auto px-4 py-4">
        <Outlet />
      </main>
    </div>
  );
}
