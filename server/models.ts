import mongoose, { Schema } from 'mongoose';

const StaffUserSchema = new Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['admin', 'doctor', 'reception'], required: true },
    department: { type: String, default: 'Administration' },
    doctorId: { type: String },
    active: { type: Boolean, default: true },
    createdAt: { type: String, required: true },
  },
  { versionKey: false }
);

const PatientSchema = new Schema(
  {
    _id: { type: String, required: true },
    mrn: { type: String, required: true, unique: true },
    fullName: { type: String, required: true },
    dateOfBirth: { type: String, required: true },
    gender: { type: String, enum: ['Male', 'Female', 'Other'], required: true },
    bloodGroup: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String, default: '' },
    address: { type: String, default: '' },
    emergencyContactName: { type: String, default: '' },
    emergencyContactPhone: { type: String, default: '' },
    insuranceProvider: { type: String, default: 'Self-Pay' },
    insurancePolicyNumber: { type: String, default: '' },
    allergies: { type: [String], default: [] },
    status: { type: String, enum: ['outpatient', 'admitted', 'discharged'], default: 'outpatient' },
    vitals: { type: [Schema.Types.Mixed], default: [] },
    clinicalNotes: { type: [Schema.Types.Mixed], default: [] },
    prescriptions: { type: [Schema.Types.Mixed], default: [] },
    createdAt: { type: String, required: true },
  },
  { versionKey: false }
);

const DoctorSchema = new Schema(
  {
    _id: { type: String, required: true },
    fullName: { type: String, required: true },
    specialty: { type: String, required: true },
    department: { type: String, required: true },
    licenseNumber: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String, required: true },
    consultationFee: { type: Number, required: true },
    avatarUrl: { type: String },
    status: { type: String, enum: ['on_duty', 'in_surgery', 'off_duty'], default: 'on_duty' },
    shifts: { type: [Schema.Types.Mixed], default: [] },
    createdAt: { type: String, required: true },
  },
  { versionKey: false }
);

const AppointmentSchema = new Schema(
  {
    _id: { type: String, required: true },
    tokenNumber: { type: String, required: true },
    patientId: { type: String, required: true },
    doctorId: { type: String, required: true },
    department: { type: String, required: true },
    date: { type: String, required: true },
    timeSlot: { type: String, required: true },
    type: { type: String, required: true },
    reason: { type: String, required: true },
    status: {
      type: String,
      enum: ['scheduled', 'checked_in', 'in_consultation', 'completed', 'cancelled'],
      default: 'scheduled',
    },
    fee: { type: Number, required: true },
    createdAt: { type: String, required: true },
  },
  { versionKey: false }
);

const WardBedSchema = new Schema(
  {
    _id: { type: String, required: true },
    wardName: { type: String, required: true },
    wardType: { type: String, required: true },
    bedNumber: { type: String, required: true, unique: true },
    dailyRate: { type: Number, required: true },
    status: { type: String, enum: ['available', 'occupied', 'maintenance', 'reserved'], default: 'available' },
    patientId: { type: String, default: null },
    attendingDoctorId: { type: String, default: null },
    admissionDate: { type: String, default: null },
    diagnosis: { type: String, default: '' },
    roundNotes: { type: [Schema.Types.Mixed], default: [] },
  },
  { versionKey: false }
);

const PharmacyItemSchema = new Schema(
  {
    _id: { type: String, required: true },
    sku: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    genericName: { type: String, required: true },
    category: { type: String, required: true },
    batchNumber: { type: String, required: true },
    stockQty: { type: Number, required: true },
    reorderLevel: { type: Number, required: true },
    unitPrice: { type: Number, required: true },
    expiryDate: { type: String, required: true },
    supplier: { type: String, required: true },
    updatedAt: { type: String, required: true },
  },
  { versionKey: false }
);

const LabOrderSchema = new Schema(
  {
    _id: { type: String, required: true },
    orderCode: { type: String, required: true, unique: true },
    patientId: { type: String, required: true },
    doctorId: { type: String, required: true },
    testName: { type: String, required: true },
    category: { type: String, required: true },
    priority: { type: String, enum: ['Routine', 'Urgent', 'STAT'], default: 'Routine' },
    status: {
      type: String,
      enum: ['ordered', 'sample_collected', 'in_analysis', 'completed'],
      default: 'ordered',
    },
    results: { type: [Schema.Types.Mixed], default: [] },
    notes: { type: String, default: '' },
    orderedAt: { type: String, required: true },
    completedAt: { type: String, default: null },
  },
  { versionKey: false }
);

const InvoiceSchema = new Schema(
  {
    _id: { type: String, required: true },
    invoiceNumber: { type: String, required: true, unique: true },
    patientId: { type: String, required: true },
    items: { type: [Schema.Types.Mixed], default: [] },
    subtotal: { type: Number, required: true },
    insuranceProvider: { type: String, default: 'Self-Pay' },
    insuranceCoverage: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    totalDue: { type: Number, required: true },
    amountPaid: { type: Number, default: 0 },
    status: { type: String, enum: ['unpaid', 'partial', 'paid', 'overdue'], default: 'unpaid' },
    payments: { type: [Schema.Types.Mixed], default: [] },
    issuedAt: { type: String, required: true },
    dueDate: { type: String, required: true },
  },
  { versionKey: false }
);

export const MongooseModels = {
  staffUsers: mongoose.models.StaffUser || mongoose.model('StaffUser', StaffUserSchema),
  patients: mongoose.models.Patient || mongoose.model('Patient', PatientSchema),
  doctors: mongoose.models.Doctor || mongoose.model('Doctor', DoctorSchema),
  appointments: mongoose.models.Appointment || mongoose.model('Appointment', AppointmentSchema),
  wardBeds: mongoose.models.WardBed || mongoose.model('WardBed', WardBedSchema),
  pharmacyItems: mongoose.models.PharmacyItem || mongoose.model('PharmacyItem', PharmacyItemSchema),
  labOrders: mongoose.models.LabOrder || mongoose.model('LabOrder', LabOrderSchema),
  invoices: mongoose.models.Invoice || mongoose.model('Invoice', InvoiceSchema),
};
