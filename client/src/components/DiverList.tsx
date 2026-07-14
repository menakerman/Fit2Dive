import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { fitnessBadgeClass, fitnessLabel, formatUnfitDays } from '../lib/fitness';
import type { DiverWithDetails } from '../../../shared/types';

export default function DiverList() {
  const [divers, setDivers] = useState<DiverWithDetails[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const hasRole = useAuthStore(s => s.hasRole);

  const fetchDivers = (q?: string) => {
    const query = q ? `?search=${encodeURIComponent(q)}` : '';
    api.get<DiverWithDetails[]>(`/divers${query}`)
      .then(setDivers)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchDivers(); }, []);

  const handleSearch = () => {
    setLoading(true);
    fetchDivers(search);
  };

  const isExpiringSoon = (date: string | null) => {
    if (!date) return false;
    return new Date(date) <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-800">רשימת צוללים</h2>
        {hasRole('manager', 'secretary', 'madar') && (
          <button
            onClick={() => navigate('/divers/new')}
            className="bg-blue-600 text-white px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium hover:bg-blue-700 transition"
          >
            + הוסף צולל
          </button>
        )}
      </div>

      <div className="flex gap-2 mb-4">
        <input
          type="text"
          placeholder="חיפוש לפי שם או מספר אישי..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          className="flex-1 min-w-0 px-3 sm:px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
        />
        <button
          onClick={handleSearch}
          className="px-3 sm:px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition text-sm font-medium shrink-0"
        >
          חיפוש
        </button>
      </div>

      {loading ? (
        <div className="text-center py-10 text-gray-500">טוען...</div>
      ) : divers.length === 0 ? (
        <div className="text-center py-10 text-gray-400">אין צוללים להצגה</div>
      ) : (
        <>
          {/* Mobile card view */}
          <div className="sm:hidden space-y-3">
            {divers.map(d => (
              <div
                key={d.id}
                onClick={() => navigate(`/divers/${d.id}`)}
                className="bg-white rounded-xl shadow-sm p-4 active:bg-blue-50 transition cursor-pointer"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-gray-800">{d.first_name} {d.last_name}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${fitnessBadgeClass(d.fitness_status)}`}>
                    {fitnessLabel(d.fitness_status)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1 text-xs text-gray-600">
                  <span>מספר אישי: {d.personal_number}</span>
                  <span>הסמכות: {d.certification_names}</span>
                  <span>
                    תוקף כשירות: {d.fitness_expiry_date ? (
                      <span className={isExpiringSoon(d.fitness_expiry_date) ? 'text-orange-600 font-medium' : ''}>
                        {new Date(d.fitness_expiry_date).toLocaleDateString('he-IL')}
                      </span>
                    ) : '-'}
                  </span>
                  <span>ימי אי כשירות: {d.unfit_days != null ? formatUnfitDays(d.unfit_days) : '-'}</span>
                  <span>צוותים: {d.team_names}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table view */}
          <div className="hidden sm:block bg-white rounded-xl shadow-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-600">שם</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-600">מספר אישי</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-600">הסמכות</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-600">סטטוס כשירות</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-600">תוקף כשירות</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-600">ימי אי כשירות</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-600">צוותים</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {divers.map(d => (
                    <tr
                      key={d.id}
                      onClick={() => navigate(`/divers/${d.id}`)}
                      className="hover:bg-blue-50 cursor-pointer transition"
                    >
                      <td className="px-4 py-3 font-medium">{d.first_name} {d.last_name}</td>
                      <td className="px-4 py-3 text-gray-600">{d.personal_number}</td>
                      <td className="px-4 py-3">{d.certification_names}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${fitnessBadgeClass(d.fitness_status)}`}>
                          {fitnessLabel(d.fitness_status)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {d.fitness_expiry_date ? (
                          <span className={isExpiringSoon(d.fitness_expiry_date) ? 'text-orange-600 font-medium' : ''}>
                            {new Date(d.fitness_expiry_date).toLocaleDateString('he-IL')}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap" title={d.unfit_days != null ? formatUnfitDays(d.unfit_days) : ''}>
                        {d.unfit_days != null ? `${d.unfit_days} ימים` : '-'}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{d.team_names}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
