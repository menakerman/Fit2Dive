import { useState, useEffect, type Dispatch, type SetStateAction } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { fitnessBadgeClass, fitnessLabel, formatUnfitDays, FITNESS_STATUSES } from '../lib/fitness';
import type { DiverWithDetails, CertificationLevel, Team } from '../../../shared/types';

export default function DiverList() {
  const [divers, setDivers] = useState<DiverWithDetails[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [certLevels, setCertLevels] = useState<CertificationLevel[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [certFilter, setCertFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [teamFilter, setTeamFilter] = useState<string[]>([]);
  const navigate = useNavigate();
  const hasRole = useAuthStore(s => s.hasRole);

  const fetchDivers = (q?: string) => {
    const query = q ? `?search=${encodeURIComponent(q)}` : '';
    api.get<DiverWithDetails[]>(`/divers${query}`)
      .then(setDivers)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchDivers();
    api.get<CertificationLevel[]>('/certifications').then(setCertLevels).catch(() => {});
    api.get<Team[]>('/teams').then(setTeams).catch(() => {});
  }, []);

  const handleSearch = () => {
    setLoading(true);
    fetchDivers(search);
  };

  // Client-side filters applied on top of the (server-side) search results.
  // Each dimension is multi-select: a diver matches when it equals ANY of the
  // selected values in that dimension (OR within a dimension, AND across them).
  const filteredDivers = divers.filter(d => {
    if (certFilter.length && !d.certifications.some(c => certFilter.includes(String(c.certification_level_id)))) return false;
    if (statusFilter.length && !statusFilter.includes(d.fitness_status)) return false;
    if (teamFilter.length && !d.teams.some(t => teamFilter.includes(String(t.id)))) return false;
    return true;
  });

  const activeFilters = certFilter.length + statusFilter.length + teamFilter.length;
  const clearFilters = () => { setCertFilter([]); setStatusFilter([]); setTeamFilter([]); };

  // Toggle a value in one of the multi-select filter arrays.
  const toggleValue = (
    setter: Dispatch<SetStateAction<string[]>>,
    value: string,
  ) => setter(prev => (prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]));

  const isExpiringSoon = (date: string | null) => {
    if (!date) return false;
    return new Date(date) <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-800">
          רשימת צוללים
          {!loading && <span className="text-sm font-normal text-gray-400 mr-2">({filteredDivers.length})</span>}
        </h2>
        {hasRole('manager', 'secretary', 'madar') && (
          <button
            onClick={() => navigate('/divers/new')}
            className="bg-blue-600 text-white px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium hover:bg-blue-700 transition"
          >
            + הוסף צולל
          </button>
        )}
      </div>

      <div className="flex gap-2 mb-3">
        <input
          type="text"
          placeholder="חיפוש לפי שם או מספר אישי..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          className="flex-1 min-w-0 px-3 sm:px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
        />
        <button
          onClick={() => setShowFilters(v => !v)}
          className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition shrink-0 ${
            showFilters || activeFilters > 0
              ? 'bg-blue-50 border-blue-300 text-blue-700'
              : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 011 1v1.586a1 1 0 01-.293.707L12 11v4a1 1 0 01-.553.894l-2 1A1 1 0 018 16v-5L3.293 6.293A1 1 0 013 5.586V4z" clipRule="evenodd" />
          </svg>
          <span className="hidden sm:inline">פילטרים</span>
          {activeFilters > 0 && (
            <span className="bg-blue-600 text-white rounded-full text-xs px-1.5 py-0.5 leading-none">{activeFilters}</span>
          )}
        </button>
        <button
          onClick={handleSearch}
          className="px-3 sm:px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition text-sm font-medium shrink-0"
        >
          חיפוש
        </button>
      </div>

      {activeFilters > 0 && (
        <div className="mb-3">
          <button onClick={clearFilters} className="text-sm text-blue-600 hover:underline">
            נקה סינון
          </button>
        </div>
      )}

      {/* Filters panel */}
      {showFilters && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 space-y-4">
          <FilterGroup
            label="הסמכות"
            options={certLevels.map(c => ({ value: String(c.id), label: c.name }))}
            selected={certFilter}
            onToggle={v => toggleValue(setCertFilter, v)}
            empty="לא הוגדרו הסמכות"
          />
          <FilterGroup
            label="סטטוס כשירות"
            options={FITNESS_STATUSES.map(s => ({ value: s, label: s }))}
            selected={statusFilter}
            onToggle={v => toggleValue(setStatusFilter, v)}
          />
          <FilterGroup
            label="צוותים"
            options={teams.map(t => ({ value: String(t.id), label: t.name }))}
            selected={teamFilter}
            onToggle={v => toggleValue(setTeamFilter, v)}
            empty="לא הוגדרו צוותים"
          />
        </div>
      )}

      {loading ? (
        <div className="text-center py-10 text-gray-500">טוען...</div>
      ) : filteredDivers.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          {divers.length === 0 ? 'אין צוללים להצגה' : 'אין צוללים התואמים לסינון'}
        </div>
      ) : (
        <>
          {/* Mobile card view */}
          <div className="sm:hidden space-y-3">
            {filteredDivers.map(d => (
              <div
                key={d.id}
                onClick={() => navigate(`/divers/${d.id}`)}
                className={`rounded-xl shadow-sm p-4 transition cursor-pointer ${
                  d.phone_self_provided ? 'bg-amber-50 ring-1 ring-amber-300 active:bg-amber-100' : 'bg-white active:bg-blue-50'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-gray-800 inline-flex items-center gap-1.5">
                    {d.first_name} {d.last_name}
                    {d.phone && <PhoneIcon />}
                    {!!d.phone_self_provided && <SelfPhoneBadge />}
                  </span>
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
                  {filteredDivers.map(d => (
                    <tr
                      key={d.id}
                      onClick={() => navigate(`/divers/${d.id}`)}
                      className={`cursor-pointer transition ${
                        d.phone_self_provided ? 'bg-amber-50 hover:bg-amber-100' : 'hover:bg-blue-50'
                      }`}
                    >
                      <td className="px-4 py-3 font-medium">
                        <span className="inline-flex items-center gap-1.5">
                          {d.first_name} {d.last_name}
                          {d.phone && <PhoneIcon />}
                          {!!d.phone_self_provided && <SelfPhoneBadge />}
                        </span>
                      </td>
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

// Flags a diver who supplied their own phone number at first login (the record
// had no phone on file). Highlighted so staff can verify the details.
function SelfPhoneBadge() {
  return (
    <span
      className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 text-[10px] font-semibold px-1.5 py-0.5 border border-amber-300"
      title="מספר הטלפון הוזן על ידי הצולל בכניסה הראשונה — יש לוודא את הפרטים"
    >
      טלפון עצמי
    </span>
  );
}

// Small indicator shown next to a diver who has a phone number on record
// (required for OTP login).
function PhoneIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-3.5 w-3.5 text-green-600 shrink-0"
      viewBox="0 0 20 20"
      fill="currentColor"
      role="img"
      aria-label="מספר טלפון מוזן"
    >
      <title>מספר טלפון מוזן</title>
      <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
    </svg>
  );
}

// A labelled group of multi-select filter chips.
function FilterGroup({ label, options, selected, onToggle, empty }: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
  empty?: string;
}) {
  return (
    <div>
      <div className="text-sm font-medium text-gray-700 mb-2">{label}</div>
      {options.length === 0 ? (
        <div className="text-xs text-gray-400">{empty || 'אין אפשרויות'}</div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {options.map(o => {
            const active = selected.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => onToggle(o.value)}
                className={`px-3 py-1.5 rounded-full text-xs sm:text-sm border transition ${
                  active
                    ? 'bg-blue-100 border-blue-400 text-blue-800 font-medium'
                    : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                }`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
