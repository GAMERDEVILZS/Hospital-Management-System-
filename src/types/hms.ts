export type StaffRole = 'admin' | 'doctor' | 'reception';

export interface StaffUser {
  _id: string;
  name: string;
  email: string;
  role: StaffRole;
  department: string;
  doctorId?: string;
  active: boolean;
  createdAt: string;
}

export interface StaffUserRecord extends StaffUser {
  passwordHash: string;
}

export interface VitalRecord {
  _id: string;
  recordedAt: string;
  recordedBy: string;
  bloodPressure: string;
  heartRate: number;
  temperature: number;
  spo2: number;
  respiratoryRate: number;
  weightKg: number;
}

export interface ClinicalNote {
  _id: string;
  date: string;
  doctorName: string;
  department: string;
  chiefComplaint: string;
  diagnosis: string;
  treatmentPlan: string;
  followUpDate?: string;
}

export interface Prescription {
  _id: string;
  date: string;
  doctorName: string;
  medicationName: string;
  pharmacyItemId?: string;
  dosage: string;
  frequency: string;
  duration: string;
  quantity: number;
  dispensed: boolean;
  instructions?: string;
}

export type PatientStatus = 'outpatient' | 'admitted' | 'discharged';

export interface Patient {
  _id: string;
  mrn: string;
  fullName: string;
  dateOfBirth: string;
  gender: 'Male' | 'Female' | 'Other';
  bloodGroup: 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';
  phone: string;
  email: string;
  address: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  insuranceProvider: string;
  insurancePolicyNumber: string;
  allergies: string[];
  status: PatientStatus;
  vitals: VitalRecord[];
  clinicalNotes: ClinicalNote[];
  prescriptions: Prescription[];
  createdAt: string;
}

export type ShiftType = 'Morning' | 'Evening' | 'Night' | 'Off';

export interface DoctorShift {
  day: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
  shiftType: ShiftType;
  hours: string;
}

export type DoctorStatus = 'on_duty' | 'in_surgery' | 'off_duty';

export interface Doctor {
  _id: string;
  fullName: string;
  specialty: string;
  department: string;
  licenseNumber: string;
  phone: string;
  email: string;
  consultationFee: number;
  avatarUrl?: string;
  status: DoctorStatus;
  shifts: DoctorShift[];
  createdAt: string;
}

export type AppointmentStatus =
  | 'scheduled'
  | 'checked_in'
  | 'in_consultation'
  | 'completed'
  | 'cancelled';

export type AppointmentType =
  | 'Consultation'
  | 'Follow-Up'
  | 'Emergency'
  | 'Procedure';

export interface Appointment {
  _id: string;
  tokenNumber: string;
  patientId: string;
  doctorId: string;
  department: string;
  date: string;
  timeSlot: string;
  type: AppointmentType;
  reason: string;
  status: AppointmentStatus;
  fee: number;
  createdAt: string;
}

export type WardType = 'ICU' | 'General' | 'Surgical' | 'Pediatrics' | 'Maternity';
export type BedStatus = 'available' | 'occupied' | 'maintenance' | 'reserved';

export interface RoundNote {
  _id: string;
  timestamp: string;
  author: string;
  note: string;
}

export interface WardBed {
  _id: string;
  wardName: string;
  wardType: WardType;
  bedNumber: string;
  dailyRate: number;
  status: BedStatus;
  patientId?: string | null;
  attendingDoctorId?: string | null;
  admissionDate?: string | null;
  diagnosis?: string;
  roundNotes: RoundNote[];
}

export interface PharmacyItem {
  _id: string;
  sku: string;
  name: string;
  genericName: string;
  category: string;
  batchNumber: string;
  stockQty: number;
  reorderLevel: number;
  unitPrice: number;
  expiryDate: string;
  supplier: string;
  updatedAt: string;
}

export type LabPriority = 'Routine' | 'Urgent' | 'STAT';
export type LabStatus = 'ordered' | 'sample_collected' | 'in_analysis' | 'completed';

export interface LabResultParameter {
  parameter: string;
  value: string;
  unit: string;
  referenceRange: string;
  flag: 'Normal' | 'High' | 'Low' | 'Critical';
}

export interface LabOrder {
  _id: string;
  orderCode: string;
  patientId: string;
  doctorId: string;
  testName: string;
  category: string;
  priority: LabPriority;
  status: LabStatus;
  results: LabResultParameter[];
  notes: string;
  orderedAt: string;
  completedAt?: string | null;
}

export interface InvoiceLineItem {
  description: string;
  category: 'Consultation' | 'Inpatient Bed' | 'Laboratory' | 'Pharmacy' | 'Procedure';
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface PaymentRecord {
  _id: string;
  amount: number;
  method: 'Card' | 'Cash' | 'Insurance' | 'Bank Transfer';
  paidAt: string;
  reference: string;
  recordedBy: string;
}

export type InvoiceStatus = 'unpaid' | 'partial' | 'paid' | 'overdue';

export interface Invoice {
  _id: string;
  invoiceNumber: string;
  patientId: string;
  items: InvoiceLineItem[];
  subtotal: number;
  insuranceProvider: string;
  insuranceCoverage: number;
  tax: number;
  totalDue: number;
  amountPaid: number;
  status: InvoiceStatus;
  payments: PaymentRecord[];
  issuedAt: string;
  dueDate: string;
}

export interface DashboardSummary {
  storageMode: 'mongodb' | 'local_store';
  kpis: {
    totalPatients: number;
    admittedPatients: number;
    appointmentsToday: number;
    waitingQueue: number;
    inConsultation: number;
    occupiedBeds: number;
    totalBeds: number;
    availableBeds: number;
    lowStockMedications: number;
    pendingLabOrders: number;
    criticalLabFlags: number;
    totalRevenueCollected: number;
    outstandingBalance: number;
    onDutyDoctors: number;
    totalDoctors: number;
  };
  wardBreakdown: Array<{
    wardName: string;
    wardType: WardType;
    total: number;
    occupied: number;
    available: number;
    maintenance: number;
    reserved: number;
  }>;
  activeQueue: Array<Appointment & { patientName: string; patientMrn: string; doctorName: string }>;
  recentLabAlerts: Array<LabOrder & { patientName: string; patientMrn: string; doctorName: string }>;
  lowStockItems: PharmacyItem[];
}
