import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import type { CertificationLevel, Team, User } from '../../../shared/types';

type Tab = 'certifications' | 'teams' | 'users' | 'settings';

export default function AdminPanel() {
  const [tab, setTab] = useState<Tab>('certifications');

  const tabClass = (t: Tab) =>
    `px-3 sm:px-4 py-2 rounded-t-lg text-xs sm:text-sm font-medium transition whitespace-nowrap ${
      tab === t ? 'bg-white text-blue-700 border-t-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'
    }`;

  return (
    <div>
      <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mb-4 sm:mb-6">ניהול מערכת</h2>
      <div className="flex gap-1 border-b mb-0 overflow-x-auto">
        <button className={tabClass('certifications')} onClick={() => setTab('certifications')}>רמות הסמכה</button>
        <button className={tabClass('teams')} onClick={() => setTab('teams')}>צוותים</button>
        <button className={tabClass('users')} onClick={() => setTab('users')}>משתמשים</button>
        <button className={tabClass('settings')} onClick={() => setTab('settings')}>הגדרות</button>
      </div>
      <div className="bg-white rounded-b-xl rounded-tl-none shadow-md p-4 sm:p-6">
        {tab === 'certifications' && <CertificationsTab />}
        {tab === 'teams' && <TeamsTab />}
        {tab === 'users' && <UsersTab />}
        {tab === 'settings' && <SettingsTab />}
      </div>
    </div>
  );
}

function CertificationsTab() {
  const [items, setItems] = useState<CertificationLevel[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [editId, setEditId] = useState<number | null>(null);

  const load = () => api.get<CertificationLevel[]>('/certifications').then(setItems);
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!name) return;
    if (editId) {
      await api.put(`/certifications/${editId}`, { name, description, sort_order: 0 });
    } else {
      await api.post('/certifications', { name, description, sort_order: 0 });
    }
    setName(''); setDescription(''); setEditId(null);
    load();
  };

  const remove = async (id: number) => {
    if (!confirm('למחוק?')) return;
    await api.delete(`/certifications/${id}`);
    load();
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <input placeholder="שם רמה" value={name} onChange={e => setName(e.target.value)}
          className="px-3 py-2 border rounded-lg text-sm flex-1" />
        <input placeholder="תיאור" value={description} onChange={e => setDescription(e.target.value)}
          className="px-3 py-2 border rounded-lg text-sm flex-1" />
        <div className="flex gap-2">
          <button onClick={save} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 flex-1 sm:flex-none">
            {editId ? 'עדכן' : 'הוסף'}
          </button>
          {editId && <button onClick={() => { setEditId(null); setName(''); setDescription(''); }}
            className="text-gray-500 text-sm">ביטול</button>}
        </div>
      </div>
      <div className="space-y-2">
        {items.map(c => (
          <div key={c.id} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg gap-2">
            <div className="min-w-0">
              <span className="font-medium text-sm">{c.name}</span>
              {c.description && <span className="text-gray-500 text-xs sm:text-sm mr-2">- {c.description}</span>}
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={() => { setEditId(c.id); setName(c.name); setDescription(c.description); }}
                className="text-blue-600 text-xs sm:text-sm hover:underline">ערוך</button>
              <button onClick={() => remove(c.id)} className="text-red-600 text-xs sm:text-sm hover:underline">מחק</button>
            </div>
          </div>
        ))}
        {items.length === 0 && <div className="text-gray-400 text-center py-4 text-sm">אין רמות הסמכה</div>}
      </div>
    </div>
  );
}

function TeamsTab() {
  const [items, setItems] = useState<(Team & { madar_name?: string })[]>([]);
  const [madarUsers, setMadarUsers] = useState<User[]>([]);
  const [name, setName] = useState('');
  const [madarUserId, setMadarUserId] = useState<string>('');
  const [editId, setEditId] = useState<number | null>(null);

  const load = () => {
    api.get<(Team & { madar_name?: string })[]>('/teams').then(setItems);
    api.get<User[]>('/users').then(users =>
      setMadarUsers(users.filter(u => u.role === 'madar' || u.role === 'manager'))
    );
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!name) return;
    const body = { name, madar_user_id: madarUserId || null };
    if (editId) {
      await api.put(`/teams/${editId}`, body);
    } else {
      await api.post('/teams', body);
    }
    setName(''); setMadarUserId(''); setEditId(null);
    load();
  };

  const remove = async (id: number) => {
    if (!confirm('למחוק?')) return;
    await api.delete(`/teams/${id}`);
    load();
  };

  const startEdit = (t: Team & { madar_name?: string }) => {
    setEditId(t.id);
    setName(t.name);
    setMadarUserId(t.madar_user_id ? String(t.madar_user_id) : '');
  };

  const cancelEdit = () => {
    setEditId(null);
    setName('');
    setMadarUserId('');
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <input placeholder="שם צוות" value={name} onChange={e => setName(e.target.value)}
          className="px-3 py-2 border rounded-lg text-sm flex-1 min-w-0" />
        <select value={madarUserId} onChange={e => setMadarUserId(e.target.value)}
          className="px-3 py-2 border rounded-lg text-sm flex-1 min-w-0">
          <option value="">-- מד"ר אחראי --</option>
          {madarUsers.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
        </select>
        <div className="flex gap-2 shrink-0">
          <button onClick={save} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 flex-1 sm:flex-none">
            {editId ? 'עדכן' : 'הוסף'}
          </button>
          {editId && <button onClick={cancelEdit}
            className="text-gray-500 text-sm">ביטול</button>}
        </div>
      </div>
      <div className="space-y-2">
        {items.map(t => (
          <div key={t.id} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg gap-2">
            <div className="min-w-0">
              <span className="font-medium text-sm">{t.name}</span>
              {t.madar_name && (
                <span className="text-gray-500 text-xs sm:text-sm mr-2">
                  — מד"ר: {t.madar_name}
                </span>
              )}
              {!t.madar_name && !t.madar_user_id && (
                <span className="text-orange-500 text-xs mr-2">ללא מד"ר</span>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={() => startEdit(t)}
                className="text-blue-600 text-xs sm:text-sm hover:underline">ערוך</button>
              <button onClick={() => remove(t.id)} className="text-red-600 text-xs sm:text-sm hover:underline">מחק</button>
            </div>
          </div>
        ))}
        {items.length === 0 && <div className="text-gray-400 text-center py-4 text-sm">אין צוותים</div>}
      </div>
    </div>
  );
}

function UsersTab() {
  const [items, setItems] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [divers, setDivers] = useState<{ id: number; first_name: string; last_name: string }[]>([]);
  const [form, setForm] = useState({ username: '', password: '', full_name: '', role: 'diver' as string, team_id: '' as string, diver_id: '' as string, phone: '', email: '' });
  const [editId, setEditId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // Reveal-password toggle is available only to the admin account.
  const isAdmin = useAuthStore(s => s.user?.username === 'admin');

  const load = () => {
    api.get<User[]>('/users').then(setItems);
    api.get<Team[]>('/teams').then(setTeams);
    api.get<any[]>('/divers').then(d => setDivers(d.map(x => ({ id: x.id, first_name: x.first_name, last_name: x.last_name }))));
  };
  useEffect(() => { load(); }, []);

  const roleLabels: Record<string, string> = { manager: 'מנהל', secretary: 'מזכירה', madar: 'מד"ר', diver: 'צולל' };

  const resetForm = () => {
    setForm({ username: '', password: '', full_name: '', role: 'diver', team_id: '', diver_id: '', phone: '', email: '' });
    setEditId(null);
    setShowForm(false);
  };

  const save = async () => {
    if (!form.username || !form.full_name || !form.role) return;
    if (!editId && !form.password) return;
    const actualPassword = form.password === '••••••' ? '' : form.password;
    const body = {
      ...form,
      team_id: form.team_id || null,
      diver_id: form.diver_id || null,
      password: actualPassword || undefined,
    };
    if (editId) {
      await api.put(`/users/${editId}`, body);
    } else {
      await api.post('/users', body);
    }
    resetForm();
    load();
  };

  const remove = async (id: number) => {
    if (!confirm('למחוק משתמש?')) return;
    try {
      await api.delete(`/users/${id}`);
      load();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const startEdit = (u: User) => {
    setEditId(u.id);
    setShowForm(true);
    setForm({
      username: u.username,
      password: '••••••',
      full_name: u.full_name,
      role: u.role,
      team_id: u.team_id ? String(u.team_id) : '',
      diver_id: u.diver_id ? String(u.diver_id) : '',
      phone: u.phone || '',
      email: u.email || '',
    });
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        {!showForm && (
          <button onClick={() => setShowForm(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">
            + הוסף משתמש
          </button>
        )}
        <button onClick={() => setShowImport(p => !p)}
          className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-200">
          {showImport ? 'סגור ייבוא' : 'ייבוא מאקסל'}
        </button>
      </div>

      {showImport && <UserImport onDone={() => { setShowImport(false); load(); }} />}

      {showForm && (
        <div className="border border-blue-200 rounded-lg p-3 sm:p-4 mb-4 bg-blue-50/50">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
            <input placeholder="שם משתמש" value={form.username} onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
              className="px-3 py-2 border rounded-lg text-sm" />
            <div className="relative">
              <input placeholder={editId ? 'סיסמה חדשה (ריק = ללא שינוי)' : 'סיסמה'}
                type={isAdmin && showPassword ? 'text' : 'password'}
                value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                onFocus={() => { if (editId && form.password === '••••••') setForm(p => ({ ...p, password: '' })); }}
                className={`w-full px-3 py-2 border rounded-lg text-sm ${isAdmin ? 'pl-9' : ''}`} />
              {isAdmin && (
                <button type="button" onClick={() => setShowPassword(v => !v)} tabIndex={-1}
                  title={showPassword ? 'הסתר סיסמה' : 'הצג סיסמה'}
                  className="absolute inset-y-0 left-2 flex items-center text-gray-400 hover:text-gray-600">
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
            <input placeholder="שם מלא" value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))}
              className="px-3 py-2 border rounded-lg text-sm" />
            <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
              className="px-3 py-2 border rounded-lg text-sm">
              <option value="diver">צולל</option>
              <option value="madar">מד"ר</option>
              <option value="secretary">מזכירה</option>
              <option value="manager">מנהל</option>
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
            <input placeholder="טלפון (לקוד כניסה)" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
              className="px-3 py-2 border rounded-lg text-sm" />
            <input placeholder="אימייל (לקוד כניסה)" type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
              className="px-3 py-2 border rounded-lg text-sm" />
          </div>
          <p className="text-xs text-gray-500 mb-2">קוד הכניסה (OTP) נשלח לטלפון או לאימייל של המשתמש. חובה לפחות אחד מהם למשתמשי צוות.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
            <select value={form.team_id} onChange={e => setForm(p => ({ ...p, team_id: e.target.value }))}
              className="px-3 py-2 border rounded-lg text-sm">
              <option value="">-- צוות --</option>
              {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <select value={form.diver_id} onChange={e => setForm(p => ({ ...p, diver_id: e.target.value }))}
              className="px-3 py-2 border rounded-lg text-sm">
              <option value="">-- שיוך צולל --</option>
              {divers.map(d => <option key={d.id} value={d.id}>{d.first_name} {d.last_name}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={save} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">
              {editId ? 'עדכן' : 'הוסף'}
            </button>
            <button onClick={resetForm} className="text-gray-500 text-sm px-4 py-2">ביטול</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {items.map(u => (
          <div key={u.id} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1">
                <span className="font-medium text-sm">{u.full_name}</span>
                <span className="text-gray-500 text-xs">({u.username})</span>
                <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs">{roleLabels[u.role]}</span>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={() => startEdit(u)} className="text-blue-600 text-xs sm:text-sm hover:underline">ערוך</button>
              <button onClick={() => remove(u.id)} className="text-red-600 text-xs sm:text-sm hover:underline">מחק</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const USER_IMPORT_FIELDS = [
  { key: 'username', label: 'שם משתמש' },
  { key: 'password', label: 'סיסמה' },
  { key: 'full_name', label: 'שם מלא' },
  { key: 'role', label: 'תפקיד' },
];

function UserImport({ onDone }: { onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ headers: string[]; rows: Record<string, any>[]; totalRows: number } | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ imported: number; errors: string[]; total: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleDownloadSample = useCallback(async () => {
    const token = localStorage.getItem('token');
    const res = await fetch('/api/users/import/sample', { headers: { Authorization: `Bearer ${token}` } });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sample_users.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setResult(null);
    setError('');
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', f);
      const data = await api.post<{ headers: string[]; rows: Record<string, any>[]; totalRows: number }>('/users/import/preview', fd);
      setPreview(data);

      const autoMap: Record<string, string[]> = {
        username: ['שם משתמש', 'username', 'user'],
        password: ['סיסמה', 'password', 'pass'],
        full_name: ['שם מלא', 'full_name', 'שם'],
        role: ['תפקיד', 'role', 'הרשאה'],
      };
      const newMapping: Record<string, string> = {};
      for (const [field, aliases] of Object.entries(autoMap)) {
        for (const header of data.headers) {
          if (aliases.some(a => header.trim().toLowerCase() === a.toLowerCase())) {
            newMapping[field] = header;
            break;
          }
        }
      }
      setMapping(newMapping);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!file) return;
    setLoading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('mapping', JSON.stringify(mapping));
      const data = await api.post<{ imported: number; errors: string[]; total: number }>('/users/import', fd);
      setResult(data);
      if (data.imported > 0) onDone();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const allMapped = mapping.username && mapping.full_name && mapping.role;

  return (
    <div className="border border-gray-200 rounded-lg p-3 sm:p-4 mb-4 bg-gray-50/50">
      <h4 className="text-sm font-semibold text-gray-700 mb-2">ייבוא משתמשים מאקסל</h4>

      {error && <div className="bg-red-50 text-red-700 p-2 rounded text-xs mb-2">{error}</div>}

      {result && (
        <div className="bg-green-50 border border-green-200 p-2 rounded text-xs mb-2">
          <span className="text-green-800 font-medium">יובאו {result.imported} מתוך {result.total}</span>
          {result.errors.length > 0 && (
            <div className="mt-1 text-red-600 max-h-24 overflow-y-auto">
              {result.errors.map((e, i) => <div key={i}>{e}</div>)}
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-gray-500 mb-2">
        עמודות: <strong>שם משתמש</strong>, <strong>סיסמה</strong> (חובה למשתמשים חדשים), <strong>שם מלא</strong>, <strong>תפקיד</strong> (manager / secretary / madar / diver או בעברית).
        משתמש קיים יעודכן (ללא שינוי סיסמה).
      </p>

      <div className="flex flex-wrap gap-2 mb-3">
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileSelect} className="hidden" />
        <button onClick={() => fileRef.current?.click()}
          className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-blue-700 transition">
          בחר קובץ
        </button>
        <button onClick={handleDownloadSample}
          className="bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-gray-300 transition">
          הורד דוגמה
        </button>
        {file && <span className="text-xs text-gray-500 self-center">{file.name}</span>}
      </div>

      {loading && <div className="text-center py-2 text-gray-500 text-xs">טוען...</div>}

      {preview && !loading && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            {USER_IMPORT_FIELDS.map(f => (
              <div key={f.key}>
                <span className="text-xs font-medium text-gray-600">{f.label} <span className="text-red-500">*</span></span>
                <select value={mapping[f.key] || ''} onChange={e => setMapping(prev => ({ ...prev, [f.key]: e.target.value }))}
                  className="w-full mt-0.5 px-2 py-1 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-blue-500">
                  <option value="">-- בחר --</option>
                  {preview.headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto border rounded mb-3">
            <table className="w-full text-xs">
              <thead className="bg-gray-100">
                <tr>
                  {preview.headers.map(h => <th key={h} className="px-2 py-1 text-right font-medium text-gray-600 whitespace-nowrap">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y">
                {preview.rows.slice(0, 5).map((row, i) => (
                  <tr key={i}>
                    {preview.headers.map(h => <td key={h} className="px-2 py-1 whitespace-nowrap">{String(row[h] || '')}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={handleImport} disabled={loading || !allMapped}
              className="bg-green-600 text-white px-4 py-1.5 rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50 transition">
              ייבוא {preview.totalRows} משתמשים
            </button>
            {!allMapped && <span className="text-xs text-orange-600">יש למפות את כל השדות</span>}
          </div>
        </>
      )}
    </div>
  );
}

function CopyLinkButton({ url, label }: { url: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-3">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-700 mb-1">{label}</div>
        <div className="text-xs text-gray-500 truncate" dir="ltr">{url}</div>
      </div>
      <button onClick={copy}
        className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
          copied ? 'bg-green-100 text-green-700' : 'bg-blue-600 text-white hover:bg-blue-700'
        }`}>
        {copied ? 'הועתק!' : 'העתק'}
      </button>
    </div>
  );
}

function SettingsTab() {
  const [config, setConfig] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [applyMsg, setApplyMsg] = useState('');

  const load = () => {
    setLoading(true);
    api.get<Record<string, string>>('/config')
      .then(setConfig)
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const update = (key: string, value: string) => {
    setConfig(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/config', config);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  const applyDefaults = async () => {
    setApplyMsg('');
    try {
      const data = await api.post<{ certsAdded: number; teamsAdded: number }>('/config/apply-defaults');
      const parts = [];
      if (data.certsAdded > 0) parts.push(`${data.certsAdded} רמות הסמכה`);
      if (data.teamsAdded > 0) parts.push(`${data.teamsAdded} צוותים`);
      setApplyMsg(parts.length > 0 ? `נוספו: ${parts.join(', ')}` : 'הכל כבר קיים, לא נוספו רשומות חדשות');
    } catch {
      setApplyMsg('שגיאה ביישום ברירות מחדל');
    }
  };

  if (loading) return <div className="text-center py-4 text-gray-500 text-sm">טוען...</div>;

  const fields: { key: string; label: string; hint: string; type?: string }[] = [
    { key: 'org_name', label: 'שם הארגון', hint: 'מוצג בכותרת המערכת' },
    { key: 'otp_expiry_minutes', label: 'תוקף קוד OTP (דקות)', hint: 'כמה זמן הקוד תקף', type: 'number' },
    { key: 'otp_max_attempts', label: 'מקסימום ניסיונות OTP', hint: 'אחרי כמה ניסיונות שגויים נועלים', type: 'number' },
    { key: 'lockout_hours', label: 'שעות נעילה', hint: 'כמה שעות ננעל חשבון אחרי ניסיונות כושלים', type: 'number' },
    { key: 'medical_expiry_warning_days', label: 'אזהרת תוקף רפואי (ימים)', hint: 'כמה ימים לפני פקיעה להציג אזהרה', type: 'number' },
  ];

  const baseUrl = window.location.origin;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base sm:text-lg font-semibold mb-3">קישורים לשיתוף</h3>
        <div className="space-y-2">
          <CopyLinkButton url={`${baseUrl}/diver-login`} label="קישור לצוללים (צפייה בסטטוס)" />
          <CopyLinkButton url={`${baseUrl}/login`} label="קישור למנהלים / מזכירות / מד״רים" />
        </div>
      </div>

      <div className="border-t pt-4">
        <h3 className="text-base sm:text-lg font-semibold mb-3">הגדרות כלליות</h3>
        <div className="space-y-3">
          {fields.map(f => (
            <div key={f.key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
              <input
                type={f.type || 'text'}
                value={config[f.key] || ''}
                onChange={e => update(f.key, e.target.value)}
                className="w-full sm:w-80 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-400 mt-0.5">{f.hint}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t pt-4">
        <h3 className="text-base sm:text-lg font-semibold mb-2">ברירות מחדל לאתחול</h3>
        <p className="text-xs sm:text-sm text-gray-500 mb-3">
          רמות הסמכה וצוותים שייווצרו אוטומטית בלחיצת "יישם". הפרד בפסיקים.
        </p>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">רמות הסמכה ברירת מחדל</label>
            <input
              type="text"
              value={config.default_certification_levels || ''}
              onChange={e => update('default_certification_levels', e.target.value)}
              placeholder="צולל 1, צולל 2, מדריך"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">צוותים ברירת מחדל</label>
            <input
              type="text"
              value={config.default_teams || ''}
              onChange={e => update('default_teams', e.target.value)}
              placeholder="צוות אלפא, צוות בטא"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={applyDefaults}
            className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-200 transition"
          >
            יישם ברירות מחדל
          </button>
          {applyMsg && <p className="text-sm text-green-700">{applyMsg}</p>}
        </div>
      </div>

      <div className="border-t pt-4 flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
        >
          {saving ? 'שומר...' : 'שמור הגדרות'}
        </button>
        {saved && <span className="text-green-600 text-sm">נשמר בהצלחה</span>}
      </div>
    </div>
  );
}
