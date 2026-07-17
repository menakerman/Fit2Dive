export type Role = 'manager' | 'secretary' | 'madar' | 'diver';

// Fitness (כשירות) status values, as they appear in the source report. This is
// a type only — the runtime list lives in the client (client/src/lib/fitness.ts)
// and the server importer, since this module is compiled to a types-only shim.
export type FitnessStatus =
  | 'כשיר'
  | 'כשיר זמני'
  | 'טרם נבדק'
  | 'בלתי כשיר זמנית'
  | 'בלתי כשיר מנהלתית'
  | 'בלתי כשיר תמידית';

export interface User {
  id: number;
  username: string;
  full_name: string;
  role: Role;
  team_id: number | null;
  diver_id: number | null;
  phone: string;
  email: string;
  created_at: string;
}

export interface Diver {
  id: number;
  first_name: string;
  last_name: string;
  personal_number: string;
  id_number: string;
  phone: string;
  email: string;
  fitness_status: string;
  fitness_status_date: string | null;
  fitness_expiry_date: string | null;
  unfit_days: number | null;
  last_exam_date: string | null;
  medical_last_updated: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface DiverCertification {
  id: number;
  diver_id: number;
  certification_level_id: number;
  level_name: string;
  expiry_date: string | null;
  issued_date: string | null;
  notes: string;
}

export interface DiverWithDetails extends Diver {
  certifications: DiverCertification[];
  certification_names: string;
  teams: { id: number; name: string }[];
  team_names: string;
  required_exams: string[];
}

export interface CertificationLevel {
  id: number;
  name: string;
  description: string;
  sort_order: number;
}

export interface Team {
  id: number;
  name: string;
  madar_user_id: number | null;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface ApiError {
  error: string;
}
