import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

const roleLabels: Record<string, string> = {
  manager: 'מנהל',
  secretary: 'מזכירה',
  madar: 'מד"ר',
  diver: 'צולל',
};

export default function Layout() {
  const { user, logout, hasRole } = useAuthStore();
  const navigate = useNavigate();

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
          <div className="flex items-center justify-between">
            <h1 className="text-lg sm:text-xl font-bold text-blue-800">Fit2Dive</h1>
            <div className="flex items-center gap-2 sm:gap-4">
              <span className="text-xs sm:text-sm text-gray-500 hidden sm:inline">
                {user?.full_name} ({roleLabels[user?.role || '']})
              </span>
              <span className="text-xs text-gray-500 sm:hidden">
                {user?.full_name}
              </span>
              <button
                onClick={handleLogout}
                className="text-xs sm:text-sm text-red-600 hover:text-red-800 font-medium"
              >
                יציאה
              </button>
            </div>
          </div>
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
