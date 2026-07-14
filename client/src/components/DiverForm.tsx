import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { FITNESS_STATUSES } from '../lib/fitness';
import type { CertificationLevel, Team, DiverWithDetails, DiverCertification } from '../../../shared/types';

type FieldErrors = Record<string, string>;

export default function DiverForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const hasRole = useAuthStore(s => s.hasRole);
  const isNew = id === 'new';
  const errorRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    personal_number: '',
    id_number: '',
    phone: '',
    email: '',
    fitness_status: 'טרם נבדק',
    fitness_status_date: '',
    fitness_expiry_date: '',
    last_exam_date: '',
    notes: '',
    team_ids: [] as number[],
    required_exams: [] as string[],
  });
  const [certLevels, setCertLevels] = useState<CertificationLevel[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<CertificationLevel[]>('/certifications').then(setCertLevels);
    api.get<Team[]>('/teams').then(setTeams);

    if (!isNew) {
      api.get<DiverWithDetails>(`/divers/${id}`)
        .then(d => {
          setForm({
            first_name: d.first_name,
            last_name: d.last_name,
            personal_number: d.personal_number,
            id_number: d.id_number,
            phone: d.phone,
            email: d.email,
            fitness_status: d.fitness_status || 'טרם נבדק',
            fitness_status_date: d.fitness_status_date || '',
            fitness_expiry_date: d.fitness_expiry_date || '',
            last_exam_date: d.last_exam_date || '',
            notes: d.notes,
            team_ids: d.teams.map(t => t.id),
            required_exams: d.required_exams || [],
          });
        })
        .catch(e => setError(e.message))
        .finally(() => setLoading(false));
    }
  }, [id]);

  const validate = (): boolean => {
    const errs: FieldErrors = {};
    if (!form.first_name.trim()) errs.first_name = 'שם פרטי הוא שדה חובה';
    if (!form.last_name.trim()) errs.last_name = 'שם משפחה הוא שדה חובה';
    if (!form.personal_number.trim()) errs.personal_number = 'מספר אישי הוא שדה חובה';
    if (!form.phone.trim()) {
      errs.phone = 'מספר טלפון הוא שדה חובה';
    }
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      errs.email = 'כתובת אימייל לא תקינה';
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const showError = (msg: string) => {
    setError(msg);
    setTimeout(() => errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  };

  const mapServerError = (msg: string) => {
    if (msg.includes('מספר אישי כבר')) setFieldErrors(prev => ({ ...prev, personal_number: msg }));
    else if (msg.includes('טלפון')) setFieldErrors(prev => ({ ...prev, phone: msg }));
    else if (msg.includes('אימייל')) setFieldErrors(prev => ({ ...prev, email: msg }));
    else if (msg.includes('תעודת זהות כבר')) setFieldErrors(prev => ({ ...prev, id_number: msg }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});
    if (!validate()) { showError('יש לתקן את השדות המסומנים'); return; }
    setSaving(true);
    try {
      const body = {
        ...form,
        fitness_status_date: form.fitness_status_date || null,
        fitness_expiry_date: form.fitness_expiry_date || null,
        last_exam_date: form.last_exam_date || null,
        required_exams: form.required_exams.map(e => e.trim()).filter(Boolean),
      };
      if (isNew) {
        await api.post('/divers', body);
      } else {
        await api.put(`/divers/${id}`, body);
      }
      navigate('/');
    } catch (err: any) {
      mapServerError(err.message);
      showError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('למחוק את הצולל?')) return;
    try { await api.delete(`/divers/${id}`); navigate('/'); } catch (err: any) { showError(err.message); }
  };

  const update = (field: string, value: any) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (fieldErrors[field]) {
      setFieldErrors(prev => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const toggleTeam = (teamId: number) => {
    setForm(prev => ({
      ...prev,
      team_ids: prev.team_ids.includes(teamId)
        ? prev.team_ids.filter(t => t !== teamId)
        : [...prev.team_ids, teamId],
    }));
  };

  if (loading) return <div className="text-center py-10">טוען...</div>;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-800">
          {isNew ? 'הוספת צולל' : 'עריכת צולל'}
        </h2>
        <button onClick={() => navigate('/')} className="text-gray-500 hover:text-gray-700 text-sm">חזרה לרשימה</button>
      </div>

      {error && (
        <div ref={errorRef} className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-sm mb-4 flex items-start gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-md p-4 sm:p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <Field label="שם פרטי" value={form.first_name} onChange={v => update('first_name', v)} required error={fieldErrors.first_name} />
          <Field label="שם משפחה" value={form.last_name} onChange={v => update('last_name', v)} required error={fieldErrors.last_name} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <Field label="מספר אישי" value={form.personal_number} onChange={v => update('personal_number', v)} required error={fieldErrors.personal_number} />
          <Field label="תעודת זהות" value={form.id_number} onChange={v => update('id_number', v)} error={fieldErrors.id_number} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <Field label="טלפון" value={form.phone} onChange={v => update('phone', v)} error={fieldErrors.phone} required />
          <Field label="אימייל" value={form.email} onChange={v => update('email', v)} type="email" error={fieldErrors.email} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">סטטוס כשירות</label>
            <select value={form.fitness_status} onChange={e => update('fitness_status', e.target.value)}
              className="w-full px-3 sm:px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm">
              {FITNESS_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <Field label="תאריך סטטוס כשירות" value={form.fitness_status_date} onChange={v => update('fitness_status_date', v)} type="date" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <Field label="תוקף כשירות" value={form.fitness_expiry_date} onChange={v => update('fitness_expiry_date', v)} type="date" />
          <Field label="תאריך בדיקה אחרון" value={form.last_exam_date} onChange={v => update('last_exam_date', v)} type="date" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">בדיקות נדרשות</label>
          <textarea
            value={form.required_exams.join('\n')}
            onChange={e => update('required_exams', e.target.value.split('\n'))}
            rows={3}
            placeholder="בדיקה אחת בכל שורה"
            className="w-full px-3 sm:px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm" />
          <p className="text-gray-400 text-xs mt-1">כל שורה היא בדיקה נפרדת שהצולל נדרש להשלים.</p>
        </div>

        {/* Teams - multi-select checkboxes */}
        {teams.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">צוותים</label>
            <div className="flex flex-wrap gap-2">
              {teams.map(t => (
                <label key={t.id} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm cursor-pointer transition ${
                  form.team_ids.includes(t.id) ? 'bg-blue-100 border-blue-400 text-blue-800' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                }`}>
                  <input type="checkbox" checked={form.team_ids.includes(t.id)} onChange={() => toggleTeam(t.id)} className="hidden" />
                  {t.name}
                </label>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">הערות</label>
          <textarea value={form.notes} onChange={e => update('notes', e.target.value)} rows={3}
            className="w-full px-3 sm:px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm" />
        </div>

        <div className="flex gap-3 pt-2 sm:pt-4">
          <button type="submit" disabled={saving}
            className="bg-blue-600 text-white px-5 sm:px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition">
            {saving ? 'שומר...' : 'שמירה'}
          </button>
          {!isNew && hasRole('manager') && (
            <button type="button" onClick={handleDelete}
              className="bg-red-50 text-red-600 px-5 sm:px-6 py-2 rounded-lg text-sm font-medium hover:bg-red-100 transition">
              מחיקה
            </button>
          )}
        </div>
      </form>

      {/* Certifications section */}
      {!isNew && <DiverCertifications diverId={parseInt(id!)} certLevels={certLevels} />}

      {/* Activities section */}
      {!isNew && <DiverActivities diverId={parseInt(id!)} />}
    </div>
  );
}

function DiverCertifications({ diverId, certLevels }: { diverId: number; certLevels: CertificationLevel[] }) {
  const [certs, setCerts] = useState<DiverCertification[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ certification_level_id: '', expiry_date: '', issued_date: '', notes: '' });
  const [loading, setLoading] = useState(true);

  const load = () => {
    api.get<DiverCertification[]>(`/diver-certs/${diverId}`)
      .then(setCerts)
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [diverId]);

  const resetForm = () => { setForm({ certification_level_id: '', expiry_date: '', issued_date: '', notes: '' }); setEditId(null); setShowForm(false); };

  const save = async () => {
    if (!form.certification_level_id) return;
    if (editId) {
      await api.put(`/diver-certs/${editId}`, form);
    } else {
      await api.post('/diver-certs', { ...form, diver_id: diverId });
    }
    resetForm();
    load();
  };

  const remove = async (id: number) => {
    if (!confirm('למחוק הסמכה?')) return;
    await api.delete(`/diver-certs/${id}`);
    load();
  };

  const startEdit = (c: DiverCertification) => {
    setEditId(c.id);
    setShowForm(true);
    setForm({
      certification_level_id: String(c.certification_level_id),
      expiry_date: c.expiry_date || '',
      issued_date: c.issued_date || '',
      notes: c.notes,
    });
  };

  const isExpiringSoon = (date: string | null) => {
    if (!date) return false;
    return new Date(date) <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  };

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg sm:text-xl font-bold text-gray-800">הסמכות</h3>
        {!showForm && (
          <button onClick={() => setShowForm(true)}
            className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium hover:bg-blue-700 transition">
            + הוסף הסמכה
          </button>
        )}
      </div>

      {showForm && (
        <div className="bg-white rounded-xl shadow-md p-4 sm:p-5 mb-4 border border-blue-200">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                רמת הסמכה<span className="text-red-500 mr-0.5"> *</span>
              </label>
              <select value={form.certification_level_id} onChange={e => setForm(p => ({ ...p, certification_level_id: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
                <option value="">-- בחר --</option>
                {certLevels.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">תאריך הנפקה</label>
              <input type="date" value={form.issued_date} onChange={e => setForm(p => ({ ...p, issued_date: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">תוקף</label>
              <input type="date" value={form.expiry_date} onChange={e => setForm(p => ({ ...p, expiry_date: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">הערות</label>
              <input type="text" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={save} disabled={!form.certification_level_id}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition">
              {editId ? 'עדכן' : 'הוסף'}
            </button>
            <button onClick={resetForm} className="text-gray-500 text-sm px-4 py-2">ביטול</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-4 text-gray-500 text-sm">טוען...</div>
      ) : certs.length === 0 ? (
        <div className="bg-white rounded-xl shadow-md p-6 text-center text-gray-400 text-sm">אין הסמכות</div>
      ) : (
        <div className="space-y-2">
          {certs.map(c => (
            <div key={c.id} className="bg-white rounded-xl shadow-sm p-3 sm:p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 mb-1">
                    <span className="font-medium text-sm text-gray-800">{c.level_name}</span>
                    {c.expiry_date && (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        isExpiringSoon(c.expiry_date) ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        תוקף: {new Date(c.expiry_date).toLocaleDateString('he-IL')}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-3 text-xs text-gray-500">
                    {c.issued_date && <span>הנפקה: {new Date(c.issued_date).toLocaleDateString('he-IL')}</span>}
                    {c.notes && <span>{c.notes}</span>}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => startEdit(c)} className="text-blue-600 text-xs hover:underline">ערוך</button>
                  <button onClick={() => remove(c.id)} className="text-red-600 text-xs hover:underline">מחק</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface Activity {
  id: number;
  diver_id: number;
  activity_date: string;
  activity_name: string;
  diver_role: string;
  location: string;
  notes: string;
  created_by_name: string | null;
  created_at: string;
}

function DiverActivities({ diverId }: { diverId: number }) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ activity_date: '', activity_name: '', diver_role: '', location: '', notes: '' });
  const [loading, setLoading] = useState(true);

  const load = () => { api.get<Activity[]>(`/activities/${diverId}`).then(setActivities).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, [diverId]);

  const resetForm = () => { setForm({ activity_date: '', activity_name: '', diver_role: '', location: '', notes: '' }); setEditId(null); setShowForm(false); };

  const save = async () => {
    if (!form.activity_date || !form.activity_name) return;
    if (editId) { await api.put(`/activities/${editId}`, form); } else { await api.post('/activities', { ...form, diver_id: diverId }); }
    resetForm(); load();
  };

  const remove = async (id: number) => { if (!confirm('למחוק פעילות?')) return; await api.delete(`/activities/${id}`); load(); };

  const startEdit = (a: Activity) => {
    setEditId(a.id); setShowForm(true);
    setForm({ activity_date: a.activity_date, activity_name: a.activity_name, diver_role: a.diver_role, location: a.location, notes: a.notes });
  };

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg sm:text-xl font-bold text-gray-800">פעילויות</h3>
        {!showForm && (
          <button onClick={() => setShowForm(true)}
            className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium hover:bg-blue-700 transition">
            + הוסף פעילות
          </button>
        )}
      </div>

      {showForm && (
        <div className="bg-white rounded-xl shadow-md p-4 sm:p-5 mb-4 border border-blue-200">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">תאריך<span className="text-red-500 mr-0.5"> *</span></label>
              <input type="date" value={form.activity_date} onChange={e => setForm(p => ({ ...p, activity_date: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">שם פעילות<span className="text-red-500 mr-0.5"> *</span></label>
              <input type="text" value={form.activity_name} onChange={e => setForm(p => ({ ...p, activity_name: e.target.value }))}
                placeholder="למשל: צלילת אימון, תרגיל חיפוש, קורס"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" required />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">תפקיד בפעילות</label>
              <input type="text" value={form.diver_role} onChange={e => setForm(p => ({ ...p, diver_role: e.target.value }))}
                placeholder="למשל: ראש צוות, בודי, צולל בטיחות"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">מיקום</label>
              <input type="text" value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">הערות</label>
            <input type="text" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex gap-2">
            <button onClick={save} disabled={!form.activity_date || !form.activity_name}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition">
              {editId ? 'עדכן' : 'הוסף'}
            </button>
            <button onClick={resetForm} className="text-gray-500 text-sm px-4 py-2">ביטול</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-4 text-gray-500 text-sm">טוען...</div>
      ) : activities.length === 0 ? (
        <div className="bg-white rounded-xl shadow-md p-6 text-center text-gray-400 text-sm">אין פעילויות רשומות</div>
      ) : (
        <div className="space-y-2">
          {activities.map(a => (
            <div key={a.id} className="bg-white rounded-xl shadow-sm p-3 sm:p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 mb-1">
                    <span className="font-medium text-sm text-gray-800">{a.activity_name}</span>
                    {a.diver_role && <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs">{a.diver_role}</span>}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
                    <span>{new Date(a.activity_date).toLocaleDateString('he-IL')}</span>
                    {a.location && <span>{a.location}</span>}
                    {a.notes && <span>{a.notes}</span>}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => startEdit(a)} className="text-blue-600 text-xs hover:underline">ערוך</button>
                  <button onClick={() => remove(a.id)} className="text-red-600 text-xs hover:underline">מחק</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', required = false, htmlRequired, error, hint }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean; htmlRequired?: boolean; error?: string; hint?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}{required && <span className="text-red-500 mr-0.5"> *</span>}
      </label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} required={htmlRequired ?? required}
        className={`w-full px-3 sm:px-4 py-2 border rounded-lg focus:ring-2 focus:border-transparent text-sm transition ${
          error ? 'border-red-400 bg-red-50 focus:ring-red-400' : 'border-gray-300 focus:ring-blue-500'
        }`} />
      {error && <p className="text-red-600 text-xs mt-1">{error}</p>}
      {!error && hint && <p className="text-gray-400 text-xs mt-1">{hint}</p>}
    </div>
  );
}
