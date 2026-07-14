import { useState, useRef, useCallback } from 'react';
import { api } from '../services/api';

interface PreviewData {
  headers: string[];
  rows: Record<string, any>[];
  totalRows: number;
}

const FIELDS = [
  { key: 'personal_number', label: 'מספר אישי' },
  { key: 'first_name', label: 'שם פרטי' },
  { key: 'last_name', label: 'שם משפחה' },
  { key: 'fitness_status', label: 'סטטוס כשירות' },
  { key: 'fitness_status_date', label: 'תאריך סטטוס כשירות' },
  { key: 'fitness_expiry_date', label: 'תוקף כשירות' },
  { key: 'unfit_days', label: 'ימי אי כשירות' },
  { key: 'last_exam_date', label: 'תאריך בדיקה אחרון' },
  { key: 'id_number', label: 'תעודת זהות' },
  { key: 'phone', label: 'טלפון' },
  { key: 'email', label: 'אימייל' },
  { key: 'notes', label: 'הערות' },
];

// Columns holding required-exam notes are detected automatically by header
// pattern (הערה 1, הערה 2, ...) rather than mapped one-by-one.
const EXAM_COLUMN_RE = /^\s*הערה\s*\d+\s*$/;

export default function ExcelUpload() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [examColumns, setExamColumns] = useState<string[]>([]);
  const [result, setResult] = useState<{ imported: number; created?: number; updated?: number; errors: string[]; total: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleDownloadSample = useCallback(async () => {
    const token = localStorage.getItem('token');
    const res = await fetch('/api/upload/sample', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sample_divers.xlsx';
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
      const data = await api.post<PreviewData>('/upload/preview', fd);
      setPreview(data);

      const autoMap: Record<string, string[]> = {
        personal_number: ['מספר אישי', 'מס אישי', 'מס\' אישי', 'personal_number'],
        first_name: ['שם פרטי', 'first_name', 'שם'],
        last_name: ['שם משפחה', 'last_name', 'משפחה'],
        fitness_status: ['סטטוס כשירות', 'סטטוס', 'כשירות', 'fitness_status'],
        fitness_status_date: ['תאריך סטטוס כשירות', 'fitness_status_date'],
        fitness_expiry_date: ['תאריך סיום תוקף כשירות', 'תוקף כשירות', 'תוקף רפואי', 'fitness_expiry'],
        unfit_days: ['ימי אי כשירות', 'unfit_days'],
        last_exam_date: ['תאריך בדיקה אחרון', 'תאריך בדיקה אחרונה', 'last_exam_date'],
        id_number: ['תעודת זהות', 'ת.ז', 'id_number', 'id', 'tz'],
        phone: ['טלפון', 'phone', 'נייד'],
        email: ['אימייל', 'email', 'דוא"ל'],
        notes: ['הערות', 'notes'],
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

      // Auto-detect the הערה 1/2/3... columns that hold required exams.
      setExamColumns(data.headers.filter(h => EXAM_COLUMN_RE.test(h)));
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
      fd.append('exam_columns', JSON.stringify(examColumns));
      const data = await api.post<{ imported: number; created?: number; updated?: number; errors: string[]; total: number }>('/upload/import', fd);
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mb-4 sm:mb-6">ייבוא מאקסל</h2>

      {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm mb-4">{error}</div>}

      {result && (
        <div className="bg-green-50 border border-green-200 p-3 sm:p-4 rounded-lg mb-4">
          <div className="text-green-800 font-medium text-sm sm:text-base">
            יובאו {result.imported} מתוך {result.total} שורות בהצלחה
            {(result.created !== undefined || result.updated !== undefined) && (
              <span className="font-normal"> ({result.created ?? 0} חדשים, {result.updated ?? 0} עודכנו)</span>
            )}
          </div>
          {result.errors.length > 0 && (
            <div className="mt-2 text-xs sm:text-sm text-red-600">
              <div className="font-medium">שגיאות:</div>
              {result.errors.map((e, i) => <div key={i}>{e}</div>)}
            </div>
          )}
        </div>
      )}

      {/* Instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 sm:p-5 mb-4">
        <h3 className="text-sm sm:text-base font-semibold text-blue-800 mb-2">הנחיות להכנת קובץ האקסל</h3>
        <p className="text-xs sm:text-sm text-blue-700 mb-3">
          הקובץ צריך להיות בפורמט <strong>xlsx</strong> עם שורת כותרות בשורה הראשונה. שמות העמודות המומלצים:
        </p>
        <div className="overflow-x-auto -mx-1 mb-3">
          <table className="text-xs sm:text-sm border-collapse">
            <thead>
              <tr className="text-blue-800">
                <th className="px-2 sm:px-3 py-1 text-right font-semibold border-b border-blue-200">עמודה</th>
                <th className="px-2 sm:px-3 py-1 text-right font-semibold border-b border-blue-200">חובה</th>
                <th className="px-2 sm:px-3 py-1 text-right font-semibold border-b border-blue-200">פורמט / ערכים</th>
              </tr>
            </thead>
            <tbody className="text-blue-700">
              <tr><td className="px-2 sm:px-3 py-1">מספר אישי</td><td className="px-2 sm:px-3 py-1">כן</td><td className="px-2 sm:px-3 py-1">מספר (מזהה ייחודי לכל צולל)</td></tr>
              <tr><td className="px-2 sm:px-3 py-1">שם פרטי</td><td className="px-2 sm:px-3 py-1">כן</td><td className="px-2 sm:px-3 py-1">טקסט</td></tr>
              <tr><td className="px-2 sm:px-3 py-1">שם משפחה</td><td className="px-2 sm:px-3 py-1">כן</td><td className="px-2 sm:px-3 py-1">טקסט</td></tr>
              <tr><td className="px-2 sm:px-3 py-1">סטטוס כשירות</td><td className="px-2 sm:px-3 py-1">לא</td><td className="px-2 sm:px-3 py-1">כשיר / כשיר זמני / טרם נבדק / בלתי כשיר...</td></tr>
              <tr><td className="px-2 sm:px-3 py-1">תאריך סטטוס כשירות</td><td className="px-2 sm:px-3 py-1">לא</td><td className="px-2 sm:px-3 py-1">תאריך (DD/MM/YYYY)</td></tr>
              <tr><td className="px-2 sm:px-3 py-1">תאריך סיום תוקף כשירות</td><td className="px-2 sm:px-3 py-1">לא</td><td className="px-2 sm:px-3 py-1">תאריך (DD/MM/YYYY)</td></tr>
              <tr><td className="px-2 sm:px-3 py-1">ימי אי כשירות</td><td className="px-2 sm:px-3 py-1">לא</td><td className="px-2 sm:px-3 py-1">מספר</td></tr>
              <tr><td className="px-2 sm:px-3 py-1">תאריך בדיקה אחרון</td><td className="px-2 sm:px-3 py-1">לא</td><td className="px-2 sm:px-3 py-1">תאריך (YYYY-MM-DD)</td></tr>
              <tr><td className="px-2 sm:px-3 py-1">הערה 1, הערה 2, ...</td><td className="px-2 sm:px-3 py-1">לא</td><td className="px-2 sm:px-3 py-1">בדיקות שהצולל נדרש להשלים (עמודות מרובות, מזוהות אוטומטית)</td></tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-blue-600 mb-3">
          אם שמות העמודות שונים מהמומלץ, ניתן למפות אותן ידנית לאחר העלאת הקובץ.
          צולל עם מספר אישי קיים — רק שדות הכשירות והסטטוס מתעדכנים; שם, טלפון, אימייל ותעודת זהות נשמרים ואינם נדרסים.
        </p>
        <button
          onClick={handleDownloadSample}
          className="inline-flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-lg text-xs sm:text-sm font-medium hover:bg-blue-700 transition"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          הורד קובץ דוגמה
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-md p-4 sm:p-6">
        <div className="mb-4 sm:mb-6">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileSelect}
            className="hidden"
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="bg-blue-600 text-white px-4 sm:px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition w-full sm:w-auto"
          >
            בחר קובץ אקסל
          </button>
          {file && <div className="mt-2 sm:mt-0 sm:inline sm:mr-3 text-gray-600 text-sm">{file.name}</div>}
        </div>

        {loading && <div className="text-center py-4 text-gray-500">טוען...</div>}

        {preview && !loading && (
          <>
            <div className="mb-4 sm:mb-6">
              <h3 className="text-base sm:text-lg font-semibold mb-2 sm:mb-3">מיפוי עמודות</h3>
              <p className="text-xs sm:text-sm text-gray-500 mb-3">
                התאם את עמודות הקובץ לשדות המערכת (נמצאו {preview.totalRows} שורות)
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                {FIELDS.map(f => (
                  <div key={f.key} className="flex items-center gap-2">
                    <span className="text-xs sm:text-sm font-medium text-gray-600 w-20 sm:w-28 shrink-0">
                      {f.label}{f.key === 'personal_number' && <span className="text-red-500"> *</span>}
                    </span>
                    <select
                      value={mapping[f.key] || ''}
                      onChange={e => setMapping(prev => ({ ...prev, [f.key]: e.target.value }))}
                      className="flex-1 min-w-0 px-2 sm:px-3 py-1.5 border border-gray-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">-- לא ממופה --</option>
                      {preview.headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              {examColumns.length > 0 && (
                <div className="mt-3 text-xs sm:text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                  עמודות בדיקות שזוהו אוטומטית ({examColumns.length}): {examColumns.join(', ')}
                </div>
              )}
            </div>

            <div className="mb-4 sm:mb-6">
              <h3 className="text-base sm:text-lg font-semibold mb-2 sm:mb-3">תצוגה מקדימה</h3>
              <div className="overflow-x-auto border rounded-lg -mx-1">
                <table className="w-full text-xs sm:text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      {preview.headers.map(h => (
                        <th key={h} className="px-2 sm:px-3 py-2 text-right font-medium text-gray-600 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {preview.rows.slice(0, 10).map((row, i) => (
                      <tr key={i}>
                        {preview.headers.map(h => (
                          <td key={h} className="px-2 sm:px-3 py-2 whitespace-nowrap">{String(row[h] || '')}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <button
                onClick={handleImport}
                disabled={loading || !mapping.personal_number}
                className="bg-green-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition w-full sm:w-auto"
              >
                ייבוא {preview.totalRows} שורות
              </button>
              {!mapping.personal_number && (
                <span className="text-xs sm:text-sm text-orange-600">יש למפות לפחות את שדה המספר האישי</span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
