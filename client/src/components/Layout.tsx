import { useEffect, useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { api } from '../services/api';

const roleLabels: Record<string, string> = {
  manager: 'מנהל',
  secretary: 'מזכירה',
  madar: 'מד"ר',
  diver: 'צולל',
};

// SQLite datetime is UTC ("YYYY-MM-DD HH:MM:SS"); parse it as such.
function formatDateTime(value: string): string {
  const d = new Date(value.replace(' ', 'T') + 'Z');
  return d.toLocaleString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function Layout() {
  const { user, logout, hasRole } = useAuthStore();
  const navigate = useNavigate();
  const [lastImport, setLastImport] = useState<string | null | undefined>(undefined);

  const isStaff = hasRole('manager', 'secretary', 'madar');
  useEffect(() => {
    if (!isStaff) return;
    api.get<{ last_fitness_import_at: string | null }>('/config/last-fitness-import')
      .then(r => setLastImport(r.last_fitness_import_at))
      .catch(() => setLastImport(null));
  }, [isStaff]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition whitespace-nowrap ${
      isActive ? 'bg-blue-100 text-blue-800' : 'text-gray-600 hover:bg-gray-100'
    }`;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2 sm:py-3">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-lg sm:text-xl font-bold text-blue-800 shrink-0">Fit2Dive</h1>
            <div className="flex items-center gap-2 sm:gap-4 min-w-0">
              <span className="text-xs sm:text-sm text-gray-500 truncate">
                {user?.full_name}<span className="hidden sm:inline"> ({roleLabels[user?.role || '']})</span>
              </span>
              <button
                onClick={handleLogout}
                className="shrink-0 text-xs sm:text-sm text-red-600 hover:text-red-800 font-medium"
              >
                יציאה
              </button>
            </div>
          </div>
          {isStaff && lastImport !== undefined && (
            <div className="text-[11px] sm:text-xs text-gray-500 mt-1 truncate">
              קובץ כשירות אחרון: {lastImport ? formatDateTime(lastImport) : 'לא נטען'}
            </div>
          )}
          <nav className="flex gap-1 mt-2 overflow-x-auto pb-1 -mb-1">
            {hasRole('manager', 'secretary', 'madar') && (
              <NavLink to="/" className={linkClass} end>צוללים</NavLink>
            )}
            {hasRole('diver') && (
              <NavLink to="/" className={linkClass} end>הסטטוס שלי</NavLink>
            )}
            {hasRole('manager', 'secretary') && (
              <NavLink to="/upload" className={linkClass}>ייבוא צוללים</NavLink>
            )}
            {hasRole('manager', 'secretary') && (
              <NavLink to="/upload-activities" className={linkClass}>ייבוא פעילויות</NavLink>
            )}
            {hasRole('manager') && (
              <NavLink to="/access-log" className={linkClass}>יומן גישה</NavLink>
            )}
            {hasRole('manager') && (
              <NavLink to="/admin" className={linkClass}>ניהול</NavLink>
            )}
          </nav>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
        <Outlet />
      </main>
    </div>
  );
}
