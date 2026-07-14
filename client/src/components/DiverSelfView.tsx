import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { fitnessBadgeClass, fitnessLabel, formatUnfitDays } from '../lib/fitness';
import type { DiverWithDetails } from '../../../shared/types';

interface Activity {
  id: number;
  activity_date: string;
  activity_name: string;
  diver_role: string;
  location: string;
  notes: string;
}

export default function DiverSelfView() {
  const user = useAuthStore(s => s.user);
  const [diver, setDiver] = useState<DiverWithDetails | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user?.diver_id) {
      Promise.all([
        api.get<DiverWithDetails>(`/divers/${user.diver_id}`),
        api.get<Activity[]>(`/activities/${user.diver_id}`),
      ])
        .then(([d, a]) => { setDiver(d); setActivities(a); })
        .catch(e => setError(e.message))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
      setError('לא משויך לרשומת צולל. פנה למנהל המערכת.');
    }
  }, [user]);

  if (loading) return <div className="text-center py-10">טוען...</div>;
  if (error) return <div className="bg-red-50 text-red-700 p-4 rounded-lg text-sm">{error}</div>;
  if (!diver) return null;

  const isExpiringSoon = (date: string | null) => {
    if (!date) return false;
    return new Date(date) <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  };

  return (
    <div className="max-w-lg mx-auto px-1">
      <div className="bg-white rounded-xl shadow-md p-4 sm:p-6">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mb-4 sm:mb-6 text-center">הסטטוס שלי</h2>

        <div className="text-center mb-4 sm:mb-6">
          <div className="text-lg sm:text-xl font-semibold text-gray-800">{diver.first_name} {diver.last_name}</div>
          <div className="text-sm text-gray-500">מספר אישי: {diver.personal_number}</div>
        </div>

        <div className="space-y-3 sm:space-y-4">
          {/* Certifications */}
          {diver.certifications.length > 0 ? (
            <div>
              <span className="text-sm text-gray-600 font-medium">הסמכות</span>
              <div className="mt-1 space-y-1.5">
                {diver.certifications.map(c => (
                  <div key={c.id} className="flex justify-between items-center bg-gray-50 rounded-lg px-3 py-2">
                    <span className="text-sm font-medium text-gray-800">{c.level_name}</span>
                    {c.expiry_date && (
                      <span className={`text-xs ${isExpiringSoon(c.expiry_date) ? 'text-orange-600 font-medium' : 'text-gray-500'}`}>
                        תוקף: {new Date(c.expiry_date).toLocaleDateString('he-IL')}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <InfoRow label="הסמכות" value="אין הסמכות" />
          )}

          <div className="border-t pt-3 sm:pt-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 font-medium">סטטוס כשירות</span>
              <span className={`px-3 py-1 rounded-full text-xs sm:text-sm font-medium ${fitnessBadgeClass(diver.fitness_status)}`}>
                {fitnessLabel(diver.fitness_status)}
              </span>
            </div>
          </div>

          <InfoRow
            label="תוקף כשירות"
            value={diver.fitness_expiry_date ? new Date(diver.fitness_expiry_date).toLocaleDateString('he-IL') : 'לא הוגדר'}
            warning={isExpiringSoon(diver.fitness_expiry_date) ? 'עומד לפוג בקרוב!' : undefined}
          />

          {diver.unfit_days != null && (
            <InfoRow label="ימי אי כשירות" value={formatUnfitDays(diver.unfit_days)} />
          )}

          {diver.fitness_status_date && (
            <InfoRow label="תאריך סטטוס" value={new Date(diver.fitness_status_date).toLocaleDateString('he-IL')} />
          )}

          {diver.last_exam_date && (
            <InfoRow label="בדיקה אחרונה" value={new Date(diver.last_exam_date).toLocaleDateString('he-IL')} />
          )}

          {diver.required_exams.length > 0 && (
            <div className="border-t pt-3 sm:pt-4">
              <span className="text-sm text-gray-600 font-medium">בדיקות נדרשות</span>
              <ul className="mt-1.5 space-y-1">
                {diver.required_exams.map((exam, i) => (
                  <li key={i} className="flex items-start gap-2 bg-amber-50 text-amber-900 rounded-lg px-3 py-2 text-sm">
                    <span className="text-amber-500 mt-0.5">•</span>
                    <span>{exam}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {diver.teams.length > 0 && (
            <InfoRow label="צוותים" value={diver.team_names} />
          )}
        </div>
      </div>

      {activities.length > 0 && (
        <div className="bg-white rounded-xl shadow-md p-4 sm:p-6 mt-4">
          <h3 className="text-base sm:text-lg font-bold text-gray-800 mb-3">פעילויות</h3>
          <div className="space-y-2">
            {activities.map(a => (
              <div key={a.id} className="border-b border-gray-100 pb-2 last:border-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                  <span className="font-medium text-sm text-gray-800">{a.activity_name}</span>
                  {a.diver_role && <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs">{a.diver_role}</span>}
                </div>
                <div className="flex flex-wrap gap-x-3 text-xs text-gray-500">
                  <span>{new Date(a.activity_date).toLocaleDateString('he-IL')}</span>
                  {a.location && <span>{a.location}</span>}
                  {a.notes && <span>{a.notes}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value, warning }: { label: string; value: string; warning?: string }) {
  return (
    <div className="flex justify-between items-start gap-2 py-1">
      <span className="text-sm text-gray-600 font-medium shrink-0">{label}</span>
      <div className="text-left">
        <span className="text-sm text-gray-800">{value}</span>
        {warning && <div className="text-xs text-orange-600 font-medium">{warning}</div>}
      </div>
    </div>
  );
}
