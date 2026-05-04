import { CollectorStatusBadge } from '../../features/status/CollectorStatusBadge';

export function TopBar() {
  return (
    <header className="liquid-glass flex items-center justify-end h-11 px-5">
      <div className="relative z-10">
        <CollectorStatusBadge />
      </div>
    </header>
  );
}
