import type {
  Appointment,
  BedStatus,
  DashboardSummary,
  Doctor,
  Invoice,
  InvoiceLineItem,
  LabOrder,
  LabResultParameter,
  Patient,
  PaymentRecord,
  PharmacyItem,
  StaffRole,
  StaffUser,
  WardBed,
} from '../types/hms';

const TOKEN_KEY = 'meridian_clinical_token';

export function getStoredToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) {
      sessionStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      sessionStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // ignore storage restriction
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`/api${path}`, {
    ...options,
    headers,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export type EnrichedAppointment = Appointment & {
  patientName: string;
  patientMrn: string;
  doctorName: string;
};

export type EnrichedWardBed = WardBed & {
  patientName: string | null;
  patientMrn: string | null;
  attendingDoctorName: string | null;
};

export type EnrichedLabOrder = LabOrder & {
  patientName: string;
  patientMrn: string;
  doctorName: string;
};

export type EnrichedInvoice = Invoice & {
  patientName: string;
  patientMrn: string;
};

export interface PatientEHRBundle {
  patient: Patient;
  activeBed: (WardBed & { attendingDoctorName: string }) | null;
  appointments: Array<Appointment & { doctorName: string }>;
  labOrders: Array<LabOrder & { doctorName: string }>;
  invoices: Invoice[];
}

export const api = {
  login: (email: string, password: string) =>
    request<{ token: string; user: StaffUser; storageMode: 'mongodb' | 'local_store' }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  me: () => request<{ user: StaffUser; storageMode: 'mongodb' | 'local_store' }>('/auth/me'),

  getDashboard: () => request<DashboardSummary>('/dashboard'),

  // Patients & EHR
  getPatients: (params?: { search?: string; status?: string }) => {
    const qs = new URLSearchParams();
    if (params?.search) qs.set('search', params.search);
    if (params?.status) qs.set('status', params.status);
    return request<Patient[]>(`/patients${qs.toString() ? `?${qs}` : ''}`);
  },
  getPatientEHR: (id: string) => request<PatientEHRBundle>(`/patients/${id}`),
  createPatient: (payload: Partial<Patient>) =>
    request<Patient>('/patients', { method: 'POST', body: JSON.stringify(payload) }),
  updatePatient: (id: string, payload: Partial<Patient>) =>
    request<Patient>(`/patients/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deletePatient: (id: string) =>
    request<{ deleted: boolean }>(`/patients/${id}`, { method: 'DELETE' }),
  addPatientVitals: (
    id: string,
    payload: {
      bloodPressure: string;
      heartRate: number;
      temperature: number;
      spo2: number;
      respiratoryRate: number;
      weightKg: number;
    }
  ) => request<Patient>(`/patients/${id}/vitals`, { method: 'POST', body: JSON.stringify(payload) }),
  addClinicalNote: (
    id: string,
    payload: {
      chiefComplaint: string;
      diagnosis: string;
      treatmentPlan: string;
      followUpDate?: string;
      department?: string;
    }
  ) => request<Patient>(`/patients/${id}/notes`, { method: 'POST', body: JSON.stringify(payload) }),
  addPrescription: (
    id: string,
    payload: {
      medicationName: string;
      pharmacyItemId?: string;
      dosage: string;
      frequency: string;
      duration: string;
      quantity: number;
      instructions?: string;
      dispenseNow?: boolean;
    }
  ) => request<Patient>(`/patients/${id}/prescriptions`, { method: 'POST', body: JSON.stringify(payload) }),
  dispensePrescription: (patientId: string, rxId: string) =>
    request<Patient>(`/patients/${patientId}/prescriptions/${rxId}/dispense`, { method: 'PATCH' }),

  // Doctors
  getDoctors: (params?: { search?: string; department?: string }) => {
    const qs = new URLSearchParams();
    if (params?.search) qs.set('search', params.search);
    if (params?.department) qs.set('department', params.department);
    return request<Doctor[]>(`/doctors${qs.toString() ? `?${qs}` : ''}`);
  },
  createDoctor: (payload: Partial<Doctor>) =>
    request<Doctor>('/doctors', { method: 'POST', body: JSON.stringify(payload) }),
  updateDoctor: (id: string, payload: Partial<Doctor>) =>
    request<Doctor>(`/doctors/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteDoctor: (id: string) =>
    request<{ deleted: boolean }>(`/doctors/${id}`, { method: 'DELETE' }),

  // Appointments
  getAppointments: (params?: { status?: string; date?: string; doctorId?: string; search?: string }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.date) qs.set('date', params.date);
    if (params?.doctorId) qs.set('doctorId', params.doctorId);
    if (params?.search) qs.set('search', params.search);
    return request<EnrichedAppointment[]>(`/appointments${qs.toString() ? `?${qs}` : ''}`);
  },
  createAppointment: (payload: Partial<Appointment>) =>
    request<EnrichedAppointment>('/appointments', { method: 'POST', body: JSON.stringify(payload) }),
  updateAppointment: (id: string, payload: Partial<Appointment>) =>
    request<Appointment>(`/appointments/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteAppointment: (id: string) =>
    request<{ deleted: boolean }>(`/appointments/${id}`, { method: 'DELETE' }),

  // Wards & Beds
  getWards: () => request<EnrichedWardBed[]>('/wards'),
  admitToBed: (
    bedId: string,
    payload: { patientId: string; attendingDoctorId: string; diagnosis: string }
  ) => request<WardBed>(`/wards/${bedId}/admit`, { method: 'POST', body: JSON.stringify(payload) }),
  dischargeBed: (bedId: string) =>
    request<{
      bed: WardBed;
      dischargedPatientId: string;
      stayDays: number;
      dailyRate: number;
      bedNumber: string;
    }>(`/wards/${bedId}/discharge`, { method: 'POST' }),
  transferBed: (sourceBedId: string, targetBedId: string) =>
    request<WardBed>(`/wards/${sourceBedId}/transfer`, {
      method: 'POST',
      body: JSON.stringify({ targetBedId }),
    }),
  addRoundNote: (bedId: string, note: string) =>
    request<WardBed>(`/wards/${bedId}/rounds`, { method: 'POST', body: JSON.stringify({ note }) }),
  updateBedStatus: (bedId: string, status: BedStatus, diagnosis?: string) =>
    request<WardBed>(`/wards/${bedId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, diagnosis }),
    }),

  // Pharmacy
  getPharmacy: (params?: { search?: string; category?: string; lowStock?: boolean }) => {
    const qs = new URLSearchParams();
    if (params?.search) qs.set('search', params.search);
    if (params?.category) qs.set('category', params.category);
    if (params?.lowStock) qs.set('lowStock', 'true');
    return request<PharmacyItem[]>(`/pharmacy${qs.toString() ? `?${qs}` : ''}`);
  },
  createPharmacyItem: (payload: Partial<PharmacyItem>) =>
    request<PharmacyItem>('/pharmacy', { method: 'POST', body: JSON.stringify(payload) }),
  adjustPharmacyStock: (id: string, delta: number) =>
    request<PharmacyItem>(`/pharmacy/${id}/adjust`, {
      method: 'POST',
      body: JSON.stringify({ delta }),
    }),
  deletePharmacyItem: (id: string) =>
    request<{ deleted: boolean }>(`/pharmacy/${id}`, { method: 'DELETE' }),

  // Labs
  getLabs: (params?: { status?: string; priority?: string; search?: string }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.priority) qs.set('priority', params.priority);
    if (params?.search) qs.set('search', params.search);
    return request<EnrichedLabOrder[]>(`/labs${qs.toString() ? `?${qs}` : ''}`);
  },
  createLabOrder: (payload: Partial<LabOrder>) =>
    request<LabOrder>('/labs', { method: 'POST', body: JSON.stringify(payload) }),
  updateLabOrder: (
    id: string,
    payload: { status?: LabOrder['status']; results?: LabResultParameter[]; notes?: string }
  ) => request<LabOrder>(`/labs/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),

  // Billing
  getBilling: (params?: { status?: string; search?: string }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.search) qs.set('search', params.search);
    return request<EnrichedInvoice[]>(`/billing${qs.toString() ? `?${qs}` : ''}`);
  },
  createInvoice: (payload: {
    patientId: string;
    items: InvoiceLineItem[];
    insuranceProvider?: string;
    insuranceCoverage?: number;
    tax?: number;
    dueDate?: string;
  }) => request<Invoice>('/billing', { method: 'POST', body: JSON.stringify(payload) }),
  recordPayment: (
    invoiceId: string,
    payload: { amount: number; method: PaymentRecord['method']; reference?: string }
  ) =>
    request<Invoice>(`/billing/${invoiceId}/payments`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deleteInvoice: (id: string) =>
    request<{ deleted: boolean }>(`/billing/${id}`, { method: 'DELETE' }),

  // Staff
  getStaff: () => request<StaffUser[]>('/staff'),
  createStaff: (payload: {
    name: string;
    email: string;
    password: string;
    role: StaffRole;
    department: string;
    doctorId?: string;
  }) => request<StaffUser>('/staff', { method: 'POST', body: JSON.stringify(payload) }),
  updateStaff: (id: string, payload: Partial<StaffUser>) =>
    request<StaffUser>(`/staff/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
};
