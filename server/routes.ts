import bcrypt from 'bcryptjs';
import { Router, type Response } from 'express';
import {
  requireAuth,
  requireRole,
  sanitizeStaffUser,
  signStaffToken,
  type AuthenticatedRequest,
} from './auth.ts';
import { db, generateId } from './db.ts';
import type {
  Appointment,
  BedStatus,
  ClinicalNote,
  DashboardSummary,
  Doctor,
  Invoice,
  InvoiceLineItem,
  InvoiceStatus,
  LabOrder,
  Patient,
  PaymentRecord,
  PharmacyItem,
  Prescription,
  StaffUserRecord,
  VitalRecord,
  WardType,
} from '../src/types/hms.ts';

export const apiRouter = Router();

function todayDateStr(): string {
  return new Date().toISOString().split('T')[0];
}

function handleError(res: Response, err: unknown, fallback = 'Internal server error'): void {
  console.error('[Meridian API Error]', err);
  res.status(500).json({ error: fallback });
}

/* ==========================================================================
   HEALTH & AUTH
   ========================================================================== */

apiRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', storageMode: db.getMode(), timestamp: new Date().toISOString() });
});

apiRouter.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email?.trim() || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const userRecord = await db.findOne(
      'staffUsers',
      (u) => u.email.toLowerCase() === normalizedEmail
    );

    if (!userRecord) {
      res.status(401).json({ error: 'Invalid staff credentials.' });
      return;
    }
    if (!userRecord.active) {
      res.status(403).json({ error: 'This staff account has been deactivated. Contact Admin.' });
      return;
    }

    const valid = bcrypt.compareSync(password, userRecord.passwordHash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid staff credentials.' });
      return;
    }

    const user = sanitizeStaffUser(userRecord);
    const token = signStaffToken(user);
    res.json({ token, user, storageMode: db.getMode() });
  } catch (err) {
    handleError(res, err, 'Unable to sign in');
  }
});

apiRouter.get('/auth/me', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userRecord = await db.findById('staffUsers', req.user!.userId);
    if (!userRecord || !userRecord.active) {
      res.status(401).json({ error: 'Account unavailable.' });
      return;
    }
    res.json({ user: sanitizeStaffUser(userRecord), storageMode: db.getMode() });
  } catch (err) {
    handleError(res, err, 'Unable to verify session');
  }
});

/* ==========================================================================
   STAFF MANAGEMENT (ADMIN ONLY)
   ========================================================================== */

apiRouter.get('/staff', requireAuth, requireRole('admin'), async (_req, res) => {
  try {
    const users = await db.findAll('staffUsers');
    res.json(users.map(sanitizeStaffUser));
  } catch (err) {
    handleError(res, err, 'Failed to load staff directory');
  }
});

apiRouter.post('/staff', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { name, email, password, role, department, doctorId } = req.body as {
      name?: string;
      email?: string;
      password?: string;
      role?: 'admin' | 'doctor' | 'reception';
      department?: string;
      doctorId?: string;
    };

    if (!name?.trim() || !email?.trim() || !password || !role) {
      res.status(400).json({ error: 'Name, email, password, and role are required.' });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters.' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing = await db.findOne('staffUsers', (u) => u.email.toLowerCase() === normalizedEmail);
    if (existing) {
      res.status(409).json({ error: 'A staff account with this email already exists.' });
      return;
    }

    const newRecord: StaffUserRecord = {
      _id: generateId('usr'),
      name: name.trim(),
      email: normalizedEmail,
      passwordHash: bcrypt.hashSync(password, 10),
      role,
      department: department?.trim() || 'General Operations',
      doctorId: doctorId || undefined,
      active: true,
      createdAt: new Date().toISOString(),
    };

    await db.insert('staffUsers', newRecord);
    res.status(201).json(sanitizeStaffUser(newRecord));
  } catch (err) {
    handleError(res, err, 'Failed to create staff account');
  }
});

apiRouter.patch('/staff/:id', requireAuth, requireRole('admin'), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { active, role, department, name } = req.body as Partial<StaffUserRecord>;
    if (id === req.user!.userId && active === false) {
      res.status(400).json({ error: 'You cannot deactivate your own active Admin account.' });
      return;
    }
    const patch: Partial<StaffUserRecord> = {};
    if (typeof active === 'boolean') patch.active = active;
    if (role) patch.role = role;
    if (department) patch.department = department.trim();
    if (name) patch.name = name.trim();

    const updated = await db.updateById('staffUsers', id, patch);
    if (!updated) {
      res.status(404).json({ error: 'Staff member not found.' });
      return;
    }
    res.json(sanitizeStaffUser(updated));
  } catch (err) {
    handleError(res, err, 'Failed to update staff account');
  }
});

/* ==========================================================================
   DASHBOARD OVERVIEW
   ========================================================================== */

apiRouter.get('/dashboard', requireAuth, async (_req, res) => {
  try {
    const [patients, doctors, appointments, wardBeds, pharmacyItems, labOrders, invoices] =
      await Promise.all([
        db.findAll('patients'),
        db.findAll('doctors'),
        db.findAll('appointments'),
        db.findAll('wardBeds'),
        db.findAll('pharmacyItems'),
        db.findAll('labOrders'),
        db.findAll('invoices'),
      ]);

    const today = todayDateStr();
    const patientMap = new Map(patients.map((p) => [p._id, p]));
    const doctorMap = new Map(doctors.map((d) => [d._id, d]));

    const todayAppointments = appointments.filter((a) => a.date === today && a.status !== 'cancelled');
    const waitingQueue = todayAppointments.filter((a) => a.status === 'checked_in').length;
    const inConsultation = todayAppointments.filter((a) => a.status === 'in_consultation').length;

    const occupiedBeds = wardBeds.filter((b) => b.status === 'occupied').length;
    const availableBeds = wardBeds.filter((b) => b.status === 'available').length;

    const lowStockItems = pharmacyItems
      .filter((item) => item.stockQty <= item.reorderLevel)
      .sort((a, b) => a.stockQty - b.stockQty);

    const pendingLabOrders = labOrders.filter((l) => l.status !== 'completed').length;
    const criticalLabFlags = labOrders.filter((l) =>
      l.results.some((r) => r.flag === 'Critical')
    ).length;

    const totalRevenueCollected = invoices.reduce((sum, inv) => sum + inv.amountPaid, 0);
    const outstandingBalance = invoices.reduce(
      (sum, inv) => sum + Math.max(0, inv.totalDue - inv.amountPaid),
      0
    );

    const wardGroups = new Map<
      string,
      {
        wardName: string;
        wardType: WardType;
        total: number;
        occupied: number;
        available: number;
        maintenance: number;
        reserved: number;
      }
    >();

    for (const bed of wardBeds) {
      const group = wardGroups.get(bed.wardName) || {
        wardName: bed.wardName,
        wardType: bed.wardType,
        total: 0,
        occupied: 0,
        available: 0,
        maintenance: 0,
        reserved: 0,
      };
      group.total += 1;
      if (bed.status === 'occupied') group.occupied += 1;
      if (bed.status === 'available') group.available += 1;
      if (bed.status === 'maintenance') group.maintenance += 1;
      if (bed.status === 'reserved') group.reserved += 1;
      wardGroups.set(bed.wardName, group);
    }

    const queueOrder: Record<string, number> = {
      in_consultation: 0,
      checked_in: 1,
      scheduled: 2,
    };

    const activeQueue = todayAppointments
      .filter((a) => a.status !== 'completed' && a.status !== 'cancelled')
      .sort((a, b) => {
        const diff = (queueOrder[a.status] ?? 9) - (queueOrder[b.status] ?? 9);
        if (diff !== 0) return diff;
        return a.timeSlot.localeCompare(b.timeSlot);
      })
      .slice(0, 8)
      .map((a) => ({
        ...a,
        patientName: patientMap.get(a.patientId)?.fullName || 'Unknown Patient',
        patientMrn: patientMap.get(a.patientId)?.mrn || '—',
        doctorName: doctorMap.get(a.doctorId)?.fullName || 'Unassigned',
      }));

    const recentLabAlerts = labOrders
      .filter((l) => l.priority === 'STAT' || l.status !== 'completed' || l.results.some((r) => r.flag === 'Critical'))
      .sort((a, b) => b.orderedAt.localeCompare(a.orderedAt))
      .slice(0, 6)
      .map((l) => ({
        ...l,
        patientName: patientMap.get(l.patientId)?.fullName || 'Unknown Patient',
        patientMrn: patientMap.get(l.patientId)?.mrn || '—',
        doctorName: doctorMap.get(l.doctorId)?.fullName || 'Unassigned',
      }));

    const summary: DashboardSummary = {
      storageMode: db.getMode(),
      kpis: {
        totalPatients: patients.length,
        admittedPatients: patients.filter((p) => p.status === 'admitted').length,
        appointmentsToday: todayAppointments.length,
        waitingQueue,
        inConsultation,
        occupiedBeds,
        totalBeds: wardBeds.length,
        availableBeds,
        lowStockMedications: lowStockItems.length,
        pendingLabOrders,
        criticalLabFlags,
        totalRevenueCollected: Math.round(totalRevenueCollected * 100) / 100,
        outstandingBalance: Math.round(outstandingBalance * 100) / 100,
        onDutyDoctors: doctors.filter((d) => d.status !== 'off_duty').length,
        totalDoctors: doctors.length,
      },
      wardBreakdown: Array.from(wardGroups.values()),
      activeQueue,
      recentLabAlerts,
      lowStockItems: lowStockItems.slice(0, 6),
    };

    res.json(summary);
  } catch (err) {
    handleError(res, err, 'Failed to compute hospital dashboard metrics');
  }
});

/* ==========================================================================
   PATIENTS & ELECTRONIC HEALTH RECORDS (EHR)
   ========================================================================== */

apiRouter.get('/patients', requireAuth, async (req, res) => {
  try {
    const search = String(req.query.search || '').trim().toLowerCase();
    const status = String(req.query.status || '').trim();
    let list = await db.findAll('patients');

    if (status && status !== 'all') {
      list = list.filter((p) => p.status === status);
    }
    if (search) {
      list = list.filter(
        (p) =>
          p.fullName.toLowerCase().includes(search) ||
          p.mrn.toLowerCase().includes(search) ||
          p.phone.toLowerCase().includes(search) ||
          p.bloodGroup.toLowerCase().includes(search)
      );
    }

    list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json(list);
  } catch (err) {
    handleError(res, err, 'Failed to fetch patients');
  }
});

apiRouter.get('/patients/:id', requireAuth, async (req, res) => {
  try {
    const patient = await db.findById('patients', req.params.id);
    if (!patient) {
      res.status(404).json({ error: 'Patient record not found.' });
      return;
    }

    const [appointments, wardBeds, labOrders, invoices, doctors] = await Promise.all([
      db.findAll('appointments'),
      db.findAll('wardBeds'),
      db.findAll('labOrders'),
      db.findAll('invoices'),
      db.findAll('doctors'),
    ]);

    const doctorMap = new Map(doctors.map((d) => [d._id, d.fullName]));
    const activeBed = wardBeds.find((b) => b.patientId === patient._id) || null;

    res.json({
      patient,
      activeBed: activeBed
        ? {
            ...activeBed,
            attendingDoctorName: activeBed.attendingDoctorId
              ? doctorMap.get(activeBed.attendingDoctorId) || 'Unassigned'
              : 'Unassigned',
          }
        : null,
      appointments: appointments
        .filter((a) => a.patientId === patient._id)
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((a) => ({ ...a, doctorName: doctorMap.get(a.doctorId) || 'Unassigned' })),
      labOrders: labOrders
        .filter((l) => l.patientId === patient._id)
        .sort((a, b) => b.orderedAt.localeCompare(a.orderedAt))
        .map((l) => ({ ...l, doctorName: doctorMap.get(l.doctorId) || 'Unassigned' })),
      invoices: invoices
        .filter((inv) => inv.patientId === patient._id)
        .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt)),
    });
  } catch (err) {
    handleError(res, err, 'Failed to load patient EHR');
  }
});

apiRouter.post('/patients', requireAuth, requireRole('admin', 'reception', 'doctor'), async (req, res) => {
  try {
    const body = req.body as Partial<Patient>;
    if (!body.fullName?.trim() || !body.dateOfBirth || !body.phone?.trim()) {
      res.status(400).json({ error: 'Full name, date of birth, and phone number are required.' });
      return;
    }

    const existing = await db.findAll('patients');
    const nextNum = 101 + existing.length + Math.floor(Math.random() * 5);
    const mrn = `MRN-2026-${String(nextNum).padStart(4, '0')}`;

    const newPatient: Patient = {
      _id: generateId('pat'),
      mrn,
      fullName: body.fullName.trim(),
      dateOfBirth: body.dateOfBirth,
      gender: body.gender || 'Female',
      bloodGroup: body.bloodGroup || 'O+',
      phone: body.phone.trim(),
      email: body.email?.trim() || '',
      address: body.address?.trim() || '',
      emergencyContactName: body.emergencyContactName?.trim() || '',
      emergencyContactPhone: body.emergencyContactPhone?.trim() || '',
      insuranceProvider: body.insuranceProvider?.trim() || 'Self-Pay',
      insurancePolicyNumber: body.insurancePolicyNumber?.trim() || '',
      allergies: Array.isArray(body.allergies) ? body.allergies.filter(Boolean) : [],
      status: body.status || 'outpatient',
      vitals: [],
      clinicalNotes: [],
      prescriptions: [],
      createdAt: new Date().toISOString(),
    };

    const saved = await db.insert('patients', newPatient);
    res.status(201).json(saved);
  } catch (err) {
    handleError(res, err, 'Failed to register patient');
  }
});

apiRouter.patch('/patients/:id', requireAuth, requireRole('admin', 'reception', 'doctor'), async (req, res) => {
  try {
    const existing = await db.findById('patients', req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Patient not found.' });
      return;
    }

    const body = req.body as Partial<Patient>;
    const patch: Partial<Patient> = {
      fullName: body.fullName?.trim() || existing.fullName,
      dateOfBirth: body.dateOfBirth || existing.dateOfBirth,
      gender: body.gender || existing.gender,
      bloodGroup: body.bloodGroup || existing.bloodGroup,
      phone: body.phone?.trim() || existing.phone,
      email: body.email !== undefined ? body.email.trim() : existing.email,
      address: body.address !== undefined ? body.address.trim() : existing.address,
      emergencyContactName:
        body.emergencyContactName !== undefined
          ? body.emergencyContactName.trim()
          : existing.emergencyContactName,
      emergencyContactPhone:
        body.emergencyContactPhone !== undefined
          ? body.emergencyContactPhone.trim()
          : existing.emergencyContactPhone,
      insuranceProvider:
        body.insuranceProvider !== undefined
          ? body.insuranceProvider.trim() || 'Self-Pay'
          : existing.insuranceProvider,
      insurancePolicyNumber:
        body.insurancePolicyNumber !== undefined
          ? body.insurancePolicyNumber.trim()
          : existing.insurancePolicyNumber,
      allergies: Array.isArray(body.allergies) ? body.allergies : existing.allergies,
      status: body.status || existing.status,
    };

    const updated = await db.updateById('patients', req.params.id, patch);
    res.json(updated);
  } catch (err) {
    handleError(res, err, 'Failed to update patient');
  }
});

apiRouter.delete('/patients/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const beds = await db.findAll('wardBeds');
    if (beds.some((b) => b.patientId === req.params.id)) {
      res.status(400).json({ error: 'Discharge patient from their inpatient bed before deleting the record.' });
      return;
    }
    const deleted = await db.deleteById('patients', req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Patient not found.' });
      return;
    }
    res.json({ deleted: true });
  } catch (err) {
    handleError(res, err, 'Failed to delete patient');
  }
});

apiRouter.post('/patients/:id/vitals', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const patient = await db.findById('patients', req.params.id);
    if (!patient) {
      res.status(404).json({ error: 'Patient not found.' });
      return;
    }
    const { bloodPressure, heartRate, temperature, spo2, respiratoryRate, weightKg } = req.body as Partial<VitalRecord>;
    if (!bloodPressure?.trim()) {
      res.status(400).json({ error: 'Blood pressure is required.' });
      return;
    }
    const record: VitalRecord = {
      _id: generateId('vit'),
      recordedAt: new Date().toISOString(),
      recordedBy: req.user!.name,
      bloodPressure: bloodPressure.trim(),
      heartRate: Number(heartRate) || 72,
      temperature: Number(temperature) || 36.8,
      spo2: Number(spo2) || 98,
      respiratoryRate: Number(respiratoryRate) || 16,
      weightKg: Number(weightKg) || 70,
    };
    const updated = await db.updateById('patients', patient._id, {
      vitals: [record, ...patient.vitals],
    });
    res.status(201).json(updated);
  } catch (err) {
    handleError(res, err, 'Failed to record vitals');
  }
});

apiRouter.post('/patients/:id/notes', requireAuth, requireRole('admin', 'doctor'), async (req: AuthenticatedRequest, res) => {
  try {
    const patient = await db.findById('patients', req.params.id);
    if (!patient) {
      res.status(404).json({ error: 'Patient not found.' });
      return;
    }
    const { chiefComplaint, diagnosis, treatmentPlan, followUpDate, department } =
      req.body as Partial<ClinicalNote>;
    if (!chiefComplaint?.trim() || !diagnosis?.trim()) {
      res.status(400).json({ error: 'Chief complaint and diagnosis are required.' });
      return;
    }
    const note: ClinicalNote = {
      _id: generateId('note'),
      date: new Date().toISOString(),
      doctorName: req.user!.name,
      department: department?.trim() || req.user!.department,
      chiefComplaint: chiefComplaint.trim(),
      diagnosis: diagnosis.trim(),
      treatmentPlan: treatmentPlan?.trim() || '',
      followUpDate: followUpDate || undefined,
    };
    const updated = await db.updateById('patients', patient._id, {
      clinicalNotes: [note, ...patient.clinicalNotes],
    });
    res.status(201).json(updated);
  } catch (err) {
    handleError(res, err, 'Failed to save clinical note');
  }
});

apiRouter.post('/patients/:id/prescriptions', requireAuth, requireRole('admin', 'doctor'), async (req: AuthenticatedRequest, res) => {
  try {
    const patient = await db.findById('patients', req.params.id);
    if (!patient) {
      res.status(404).json({ error: 'Patient not found.' });
      return;
    }
    const {
      medicationName,
      pharmacyItemId,
      dosage,
      frequency,
      duration,
      quantity,
      instructions,
      dispenseNow,
    } = req.body as Partial<Prescription> & { dispenseNow?: boolean };

    if (!medicationName?.trim() || !dosage?.trim() || !frequency?.trim()) {
      res.status(400).json({ error: 'Medication name, dosage, and frequency are required.' });
      return;
    }

    const qty = Math.max(1, Number(quantity) || 1);
    let dispensed = false;

    if (dispenseNow && pharmacyItemId) {
      const med = await db.findById('pharmacyItems', pharmacyItemId);
      if (!med) {
        res.status(404).json({ error: 'Selected pharmacy item was not found.' });
        return;
      }
      if (med.stockQty < qty) {
        res.status(400).json({
          error: `Insufficient pharmacy stock for ${med.name}. Available: ${med.stockQty}.`,
        });
        return;
      }
      await db.updateById('pharmacyItems', med._id, {
        stockQty: med.stockQty - qty,
        updatedAt: new Date().toISOString(),
      });
      dispensed = true;
    }

    const rx: Prescription = {
      _id: generateId('rx'),
      date: todayDateStr(),
      doctorName: req.user!.name,
      medicationName: medicationName.trim(),
      pharmacyItemId: pharmacyItemId || undefined,
      dosage: dosage.trim(),
      frequency: frequency.trim(),
      duration: duration?.trim() || '7 days',
      quantity: qty,
      dispensed,
      instructions: instructions?.trim() || '',
    };

    const updated = await db.updateById('patients', patient._id, {
      prescriptions: [rx, ...patient.prescriptions],
    });
    res.status(201).json(updated);
  } catch (err) {
    handleError(res, err, 'Failed to add prescription');
  }
});

apiRouter.patch('/patients/:id/prescriptions/:rxId/dispense', requireAuth, async (req, res) => {
  try {
    const patient = await db.findById('patients', req.params.id);
    if (!patient) {
      res.status(404).json({ error: 'Patient not found.' });
      return;
    }
    const rx = patient.prescriptions.find((p) => p._id === req.params.rxId);
    if (!rx) {
      res.status(404).json({ error: 'Prescription not found.' });
      return;
    }
    if (rx.dispensed) {
      res.status(400).json({ error: 'Prescription has already been dispensed.' });
      return;
    }

    if (rx.pharmacyItemId) {
      const med = await db.findById('pharmacyItems', rx.pharmacyItemId);
      if (med) {
        if (med.stockQty < rx.quantity) {
          res.status(400).json({
            error: `Insufficient pharmacy inventory for ${med.name} (${med.stockQty} left).`,
          });
          return;
        }
        await db.updateById('pharmacyItems', med._id, {
          stockQty: med.stockQty - rx.quantity,
          updatedAt: new Date().toISOString(),
        });
      }
    }

    const updatedRxList = patient.prescriptions.map((p) =>
      p._id === rx._id ? { ...p, dispensed: true } : p
    );
    const updated = await db.updateById('patients', patient._id, {
      prescriptions: updatedRxList,
    });
    res.json(updated);
  } catch (err) {
    handleError(res, err, 'Failed to dispense prescription');
  }
});

/* ==========================================================================
   DOCTORS, DEPARTMENTS & SHIFT SCHEDULES
   ========================================================================== */

apiRouter.get('/doctors', requireAuth, async (req, res) => {
  try {
    const department = String(req.query.department || '').trim();
    const search = String(req.query.search || '').trim().toLowerCase();
    let list = await db.findAll('doctors');

    if (department && department !== 'all') {
      list = list.filter((d) => d.department === department);
    }
    if (search) {
      list = list.filter(
        (d) =>
          d.fullName.toLowerCase().includes(search) ||
          d.specialty.toLowerCase().includes(search) ||
          d.department.toLowerCase().includes(search) ||
          d.licenseNumber.toLowerCase().includes(search)
      );
    }

    res.json(list);
  } catch (err) {
    handleError(res, err, 'Failed to load physicians');
  }
});

apiRouter.post('/doctors', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const body = req.body as Partial<Doctor>;
    if (!body.fullName?.trim() || !body.specialty?.trim() || !body.department?.trim()) {
      res.status(400).json({ error: 'Physician name, specialty, and department are required.' });
      return;
    }

    const defaultShifts: Doctor['shifts'] = [
      { day: 'Mon', shiftType: 'Morning', hours: '08:00–16:00' },
      { day: 'Tue', shiftType: 'Morning', hours: '08:00–16:00' },
      { day: 'Wed', shiftType: 'Morning', hours: '08:00–16:00' },
      { day: 'Thu', shiftType: 'Morning', hours: '08:00–16:00' },
      { day: 'Fri', shiftType: 'Morning', hours: '08:00–16:00' },
      { day: 'Sat', shiftType: 'Off', hours: 'Off Duty' },
      { day: 'Sun', shiftType: 'Off', hours: 'Off Duty' },
    ];

    const newDoctor: Doctor = {
      _id: generateId('doc'),
      fullName: body.fullName.trim(),
      specialty: body.specialty.trim(),
      department: body.department.trim(),
      licenseNumber: body.licenseNumber?.trim() || `MC-${Math.floor(10000 + Math.random() * 89999)}-CA`,
      phone: body.phone?.trim() || '(415) 555-0190',
      email: body.email?.trim() || '',
      consultationFee: Number(body.consultationFee) || 200,
      status: body.status || 'on_duty',
      shifts: Array.isArray(body.shifts) && body.shifts.length === 7 ? body.shifts : defaultShifts,
      createdAt: new Date().toISOString(),
    };

    const saved = await db.insert('doctors', newDoctor);
    res.status(201).json(saved);
  } catch (err) {
    handleError(res, err, 'Failed to add physician');
  }
});

apiRouter.patch('/doctors/:id', requireAuth, requireRole('admin', 'doctor'), async (req: AuthenticatedRequest, res) => {
  try {
    const existing = await db.findById('doctors', req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Physician not found.' });
      return;
    }

    if (req.user!.role === 'doctor' && req.user!.doctorId && req.user!.doctorId !== existing._id) {
      res.status(403).json({ error: 'Doctors may only update their own status or schedule.' });
      return;
    }

    const body = req.body as Partial<Doctor>;
    const patch: Partial<Doctor> = {};
    if (body.fullName) patch.fullName = body.fullName.trim();
    if (body.specialty) patch.specialty = body.specialty.trim();
    if (body.department) patch.department = body.department.trim();
    if (body.licenseNumber) patch.licenseNumber = body.licenseNumber.trim();
    if (body.phone) patch.phone = body.phone.trim();
    if (body.email !== undefined) patch.email = body.email.trim();
    if (typeof body.consultationFee === 'number') patch.consultationFee = body.consultationFee;
    if (body.status) patch.status = body.status;
    if (Array.isArray(body.shifts)) patch.shifts = body.shifts;

    const updated = await db.updateById('doctors', existing._id, patch);
    res.json(updated);
  } catch (err) {
    handleError(res, err, 'Failed to update physician');
  }
});

apiRouter.delete('/doctors/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const deleted = await db.deleteById('doctors', req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Physician not found.' });
      return;
    }
    res.json({ deleted: true });
  } catch (err) {
    handleError(res, err, 'Failed to remove physician');
  }
});

/* ==========================================================================
   APPOINTMENTS & OUTPATIENT QUEUE
   ========================================================================== */

apiRouter.get('/appointments', requireAuth, async (req, res) => {
  try {
    const [appointments, patients, doctors] = await Promise.all([
      db.findAll('appointments'),
      db.findAll('patients'),
      db.findAll('doctors'),
    ]);

    const patientMap = new Map(patients.map((p) => [p._id, p]));
    const doctorMap = new Map(doctors.map((d) => [d._id, d]));

    const status = String(req.query.status || '').trim();
    const date = String(req.query.date || '').trim();
    const doctorId = String(req.query.doctorId || '').trim();
    const search = String(req.query.search || '').trim().toLowerCase();

    let enriched = appointments.map((a) => ({
      ...a,
      patientName: patientMap.get(a.patientId)?.fullName || 'Unknown Patient',
      patientMrn: patientMap.get(a.patientId)?.mrn || '—',
      doctorName: doctorMap.get(a.doctorId)?.fullName || 'Unassigned',
    }));

    if (status && status !== 'all') {
      enriched = enriched.filter((a) => a.status === status);
    }
    if (date && date !== 'all') {
      enriched = enriched.filter((a) => a.date === date);
    }
    if (doctorId && doctorId !== 'all') {
      enriched = enriched.filter((a) => a.doctorId === doctorId);
    }
    if (search) {
      enriched = enriched.filter(
        (a) =>
          a.patientName.toLowerCase().includes(search) ||
          a.patientMrn.toLowerCase().includes(search) ||
          a.doctorName.toLowerCase().includes(search) ||
          a.tokenNumber.toLowerCase().includes(search) ||
          a.reason.toLowerCase().includes(search)
      );
    }

    enriched.sort((a, b) => {
      const dateCmp = b.date.localeCompare(a.date);
      if (dateCmp !== 0) return dateCmp;
      return a.timeSlot.localeCompare(b.timeSlot);
    });

    res.json(enriched);
  } catch (err) {
    handleError(res, err, 'Failed to fetch appointments');
  }
});

apiRouter.post('/appointments', requireAuth, requireRole('admin', 'reception', 'doctor'), async (req, res) => {
  try {
    const body = req.body as Partial<Appointment>;
    if (!body.patientId || !body.doctorId || !body.date || !body.timeSlot) {
      res.status(400).json({ error: 'Patient, physician, date, and time slot are required.' });
      return;
    }

    const [patient, doctor, all] = await Promise.all([
      db.findById('patients', body.patientId),
      db.findById('doctors', body.doctorId),
      db.findAll('appointments'),
    ]);

    if (!patient) {
      res.status(404).json({ error: 'Selected patient does not exist.' });
      return;
    }
    if (!doctor) {
      res.status(404).json({ error: 'Selected physician does not exist.' });
      return;
    }

    const tokenNumber = `Q-${101 + all.length}`;
    const newApt: Appointment = {
      _id: generateId('apt'),
      tokenNumber,
      patientId: patient._id,
      doctorId: doctor._id,
      department: doctor.department,
      date: body.date,
      timeSlot: body.timeSlot,
      type: body.type || 'Consultation',
      reason: body.reason?.trim() || 'General clinical evaluation',
      status: body.status || 'scheduled',
      fee: typeof body.fee === 'number' ? body.fee : doctor.consultationFee,
      createdAt: new Date().toISOString(),
    };

    const saved = await db.insert('appointments', newApt);
    res.status(201).json({
      ...saved,
      patientName: patient.fullName,
      patientMrn: patient.mrn,
      doctorName: doctor.fullName,
    });
  } catch (err) {
    handleError(res, err, 'Failed to schedule appointment');
  }
});

apiRouter.patch('/appointments/:id', requireAuth, async (req, res) => {
  try {
    const existing = await db.findById('appointments', req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Appointment not found.' });
      return;
    }
    const body = req.body as Partial<Appointment>;
    const patch: Partial<Appointment> = {};
    if (body.status) patch.status = body.status;
    if (body.date) patch.date = body.date;
    if (body.timeSlot) patch.timeSlot = body.timeSlot;
    if (body.reason !== undefined) patch.reason = body.reason.trim();
    if (body.type) patch.type = body.type;

    const updated = await db.updateById('appointments', existing._id, patch);
    res.json(updated);
  } catch (err) {
    handleError(res, err, 'Failed to update appointment');
  }
});

apiRouter.delete('/appointments/:id', requireAuth, requireRole('admin', 'reception'), async (req, res) => {
  try {
    const deleted = await db.deleteById('appointments', req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Appointment not found.' });
      return;
    }
    res.json({ deleted: true });
  } catch (err) {
    handleError(res, err, 'Failed to delete appointment');
  }
});

/* ==========================================================================
   INPATIENT WARDS & BED ALLOCATION
   ========================================================================== */

apiRouter.get('/wards', requireAuth, async (_req, res) => {
  try {
    const [beds, patients, doctors] = await Promise.all([
      db.findAll('wardBeds'),
      db.findAll('patients'),
      db.findAll('doctors'),
    ]);

    const patientMap = new Map(patients.map((p) => [p._id, p]));
    const doctorMap = new Map(doctors.map((d) => [d._id, d]));

    const enriched = beds.map((b) => ({
      ...b,
      patientName: b.patientId ? patientMap.get(b.patientId)?.fullName || 'Unknown' : null,
      patientMrn: b.patientId ? patientMap.get(b.patientId)?.mrn || null : null,
      attendingDoctorName: b.attendingDoctorId
        ? doctorMap.get(b.attendingDoctorId)?.fullName || 'Unassigned'
        : null,
    }));

    res.json(enriched);
  } catch (err) {
    handleError(res, err, 'Failed to load wards and beds');
  }
});

apiRouter.post('/wards/:id/admit', requireAuth, requireRole('admin', 'reception', 'doctor'), async (req: AuthenticatedRequest, res) => {
  try {
    const bed = await db.findById('wardBeds', req.params.id);
    if (!bed) {
      res.status(404).json({ error: 'Bed not found.' });
      return;
    }
    if (bed.status !== 'available' && bed.status !== 'reserved') {
      res.status(400).json({ error: `Bed ${bed.bedNumber} is currently ${bed.status} and cannot accept admissions.` });
      return;
    }

    const { patientId, attendingDoctorId, diagnosis } = req.body as {
      patientId?: string;
      attendingDoctorId?: string;
      diagnosis?: string;
    };
    if (!patientId || !attendingDoctorId) {
      res.status(400).json({ error: 'Patient and attending physician are required for admission.' });
      return;
    }

    const [patient, allBeds] = await Promise.all([
      db.findById('patients', patientId),
      db.findAll('wardBeds'),
    ]);
    if (!patient) {
      res.status(404).json({ error: 'Selected patient not found.' });
      return;
    }

    const existingBed = allBeds.find((b) => b.patientId === patientId && b.status === 'occupied');
    if (existingBed) {
      res.status(400).json({
        error: `${patient.fullName} is already admitted in bed ${existingBed.bedNumber}. Use Transfer instead.`,
      });
      return;
    }

    const admissionNote = {
      _id: generateId('rn'),
      timestamp: new Date().toISOString(),
      author: req.user!.name,
      note: `Admitted to ${bed.bedNumber}. Initial diagnosis: ${diagnosis?.trim() || 'Under evaluation'}.`,
    };

    const updatedBed = await db.updateById('wardBeds', bed._id, {
      status: 'occupied',
      patientId,
      attendingDoctorId,
      admissionDate: todayDateStr(),
      diagnosis: diagnosis?.trim() || 'Inpatient observation',
      roundNotes: [admissionNote, ...bed.roundNotes],
    });

    await db.updateById('patients', patientId, { status: 'admitted' });
    res.json(updatedBed);
  } catch (err) {
    handleError(res, err, 'Failed to admit patient');
  }
});

apiRouter.post('/wards/:id/discharge', requireAuth, requireRole('admin', 'reception', 'doctor'), async (req, res) => {
  try {
    const bed = await db.findById('wardBeds', req.params.id);
    if (!bed || bed.status !== 'occupied' || !bed.patientId) {
      res.status(400).json({ error: 'Bed is not currently occupied.' });
      return;
    }

    const patientId = bed.patientId;
    const admittedAt = bed.admissionDate ? new Date(bed.admissionDate) : new Date();
    const diffDays = Math.max(1, Math.ceil((Date.now() - admittedAt.getTime()) / (1000 * 60 * 60 * 24)));

    const updatedBed = await db.updateById('wardBeds', bed._id, {
      status: 'available',
      patientId: null,
      attendingDoctorId: null,
      admissionDate: null,
      diagnosis: '',
      roundNotes: [],
    });

    await db.updateById('patients', patientId, { status: 'discharged' });
    res.json({
      bed: updatedBed,
      dischargedPatientId: patientId,
      stayDays: diffDays,
      dailyRate: bed.dailyRate,
      bedNumber: bed.bedNumber,
    });
  } catch (err) {
    handleError(res, err, 'Failed to discharge patient');
  }
});

apiRouter.post('/wards/:id/transfer', requireAuth, requireRole('admin', 'reception', 'doctor'), async (req: AuthenticatedRequest, res) => {
  try {
    const sourceBed = await db.findById('wardBeds', req.params.id);
    const { targetBedId } = req.body as { targetBedId?: string };

    if (!sourceBed || sourceBed.status !== 'occupied' || !sourceBed.patientId) {
      res.status(400).json({ error: 'Source bed must be occupied to transfer.' });
      return;
    }
    if (!targetBedId) {
      res.status(400).json({ error: 'Target bed ID is required.' });
      return;
    }

    const targetBed = await db.findById('wardBeds', targetBedId);
    if (!targetBed || targetBed.status !== 'available') {
      res.status(400).json({ error: 'Target bed must be available.' });
      return;
    }

    const transferNote = {
      _id: generateId('rn'),
      timestamp: new Date().toISOString(),
      author: req.user!.name,
      note: `Transferred from ${sourceBed.bedNumber} (${sourceBed.wardName}) to ${targetBed.bedNumber}.`,
    };

    const updatedTarget = await db.updateById('wardBeds', targetBed._id, {
      status: 'occupied',
      patientId: sourceBed.patientId,
      attendingDoctorId: sourceBed.attendingDoctorId,
      admissionDate: sourceBed.admissionDate || todayDateStr(),
      diagnosis: sourceBed.diagnosis,
      roundNotes: [transferNote, ...sourceBed.roundNotes],
    });

    await db.updateById('wardBeds', sourceBed._id, {
      status: 'available',
      patientId: null,
      attendingDoctorId: null,
      admissionDate: null,
      diagnosis: '',
      roundNotes: [],
    });

    res.json(updatedTarget);
  } catch (err) {
    handleError(res, err, 'Failed to transfer patient');
  }
});

apiRouter.post('/wards/:id/rounds', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const bed = await db.findById('wardBeds', req.params.id);
    if (!bed || bed.status !== 'occupied') {
      res.status(400).json({ error: 'Round notes can only be added to an occupied bed.' });
      return;
    }
    const { note } = req.body as { note?: string };
    if (!note?.trim()) {
      res.status(400).json({ error: 'Round note cannot be empty.' });
      return;
    }
    const entry = {
      _id: generateId('rn'),
      timestamp: new Date().toISOString(),
      author: req.user!.name,
      note: note.trim(),
    };
    const updated = await db.updateById('wardBeds', bed._id, {
      roundNotes: [entry, ...bed.roundNotes],
    });
    res.status(201).json(updated);
  } catch (err) {
    handleError(res, err, 'Failed to save round note');
  }
});

apiRouter.patch('/wards/:id/status', requireAuth, requireRole('admin', 'reception'), async (req, res) => {
  try {
    const bed = await db.findById('wardBeds', req.params.id);
    if (!bed) {
      res.status(404).json({ error: 'Bed not found.' });
      return;
    }
    if (bed.status === 'occupied') {
      res.status(400).json({ error: 'Discharge or transfer the patient before changing bed maintenance status.' });
      return;
    }
    const { status, diagnosis } = req.body as { status?: BedStatus; diagnosis?: string };
    if (!status || !['available', 'maintenance', 'reserved'].includes(status)) {
      res.status(400).json({ error: 'Invalid bed status.' });
      return;
    }
    const updated = await db.updateById('wardBeds', bed._id, {
      status,
      diagnosis: diagnosis !== undefined ? diagnosis.trim() : status === 'available' ? '' : bed.diagnosis,
    });
    res.json(updated);
  } catch (err) {
    handleError(res, err, 'Failed to update bed status');
  }
});

/* ==========================================================================
   PHARMACY INVENTORY
   ========================================================================== */

apiRouter.get('/pharmacy', requireAuth, async (req, res) => {
  try {
    const search = String(req.query.search || '').trim().toLowerCase();
    const category = String(req.query.category || '').trim();
    const lowStock = req.query.lowStock === 'true';

    let items = await db.findAll('pharmacyItems');
    if (category && category !== 'all') {
      items = items.filter((i) => i.category === category);
    }
    if (lowStock) {
      items = items.filter((i) => i.stockQty <= i.reorderLevel);
    }
    if (search) {
      items = items.filter(
        (i) =>
          i.name.toLowerCase().includes(search) ||
          i.genericName.toLowerCase().includes(search) ||
          i.sku.toLowerCase().includes(search) ||
          i.batchNumber.toLowerCase().includes(search)
      );
    }
    items.sort((a, b) => a.name.localeCompare(b.name));
    res.json(items);
  } catch (err) {
    handleError(res, err, 'Failed to fetch pharmacy inventory');
  }
});

apiRouter.post('/pharmacy', requireAuth, requireRole('admin', 'doctor'), async (req, res) => {
  try {
    const body = req.body as Partial<PharmacyItem>;
    if (!body.name?.trim() || !body.category?.trim()) {
      res.status(400).json({ error: 'Medication name and category are required.' });
      return;
    }
    const all = await db.findAll('pharmacyItems');
    const newItem: PharmacyItem = {
      _id: generateId('ph'),
      sku: body.sku?.trim() || `MED-${1001 + all.length}`,
      name: body.name.trim(),
      genericName: body.genericName?.trim() || body.name.trim(),
      category: body.category.trim(),
      batchNumber: body.batchNumber?.trim() || `BT-26${Math.floor(10 + Math.random() * 89)}X`,
      stockQty: Math.max(0, Number(body.stockQty) || 0),
      reorderLevel: Math.max(5, Number(body.reorderLevel) || 30),
      unitPrice: Math.max(0, Number(body.unitPrice) || 5),
      expiryDate: body.expiryDate || '2027-12-31',
      supplier: body.supplier?.trim() || 'McKesson Clinical Supply',
      updatedAt: new Date().toISOString(),
    };
    const saved = await db.insert('pharmacyItems', newItem);
    res.status(201).json(saved);
  } catch (err) {
    handleError(res, err, 'Failed to add medication');
  }
});

apiRouter.post('/pharmacy/:id/adjust', requireAuth, async (req, res) => {
  try {
    const item = await db.findById('pharmacyItems', req.params.id);
    if (!item) {
      res.status(404).json({ error: 'Medication not found.' });
      return;
    }
    const { delta } = req.body as { delta?: number };
    const change = Number(delta);
    if (!Number.isFinite(change) || change === 0) {
      res.status(400).json({ error: 'Adjustment quantity must be a non-zero number.' });
      return;
    }
    const nextQty = item.stockQty + change;
    if (nextQty < 0) {
      res.status(400).json({ error: `Cannot dispense ${Math.abs(change)} units; only ${item.stockQty} available.` });
      return;
    }
    const updated = await db.updateById('pharmacyItems', item._id, {
      stockQty: nextQty,
      updatedAt: new Date().toISOString(),
    });
    res.json(updated);
  } catch (err) {
    handleError(res, err, 'Failed to adjust stock quantity');
  }
});

apiRouter.delete('/pharmacy/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const deleted = await db.deleteById('pharmacyItems', req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Medication not found.' });
      return;
    }
    res.json({ deleted: true });
  } catch (err) {
    handleError(res, err, 'Failed to delete medication');
  }
});

/* ==========================================================================
   LABORATORY & DIAGNOSTIC REPORTS
   ========================================================================== */

apiRouter.get('/labs', requireAuth, async (req, res) => {
  try {
    const [orders, patients, doctors] = await Promise.all([
      db.findAll('labOrders'),
      db.findAll('patients'),
      db.findAll('doctors'),
    ]);

    const patientMap = new Map(patients.map((p) => [p._id, p]));
    const doctorMap = new Map(doctors.map((d) => [d._id, d]));

    const status = String(req.query.status || '').trim();
    const priority = String(req.query.priority || '').trim();
    const search = String(req.query.search || '').trim().toLowerCase();

    let enriched = orders.map((o) => ({
      ...o,
      patientName: patientMap.get(o.patientId)?.fullName || 'Unknown Patient',
      patientMrn: patientMap.get(o.patientId)?.mrn || '—',
      doctorName: doctorMap.get(o.doctorId)?.fullName || 'Unassigned',
    }));

    if (status && status !== 'all') {
      enriched = enriched.filter((o) => o.status === status);
    }
    if (priority && priority !== 'all') {
      enriched = enriched.filter((o) => o.priority === priority);
    }
    if (search) {
      enriched = enriched.filter(
        (o) =>
          o.testName.toLowerCase().includes(search) ||
          o.orderCode.toLowerCase().includes(search) ||
          o.patientName.toLowerCase().includes(search) ||
          o.patientMrn.toLowerCase().includes(search)
      );
    }

    enriched.sort((a, b) => b.orderedAt.localeCompare(a.orderedAt));
    res.json(enriched);
  } catch (err) {
    handleError(res, err, 'Failed to load laboratory orders');
  }
});

apiRouter.post('/labs', requireAuth, async (req, res) => {
  try {
    const body = req.body as Partial<LabOrder>;
    if (!body.patientId || !body.doctorId || !body.testName?.trim()) {
      res.status(400).json({ error: 'Patient, ordering physician, and test name are required.' });
      return;
    }

    const all = await db.findAll('labOrders');
    const newOrder: LabOrder = {
      _id: generateId('lab'),
      orderCode: `LAB-26-${String(401 + all.length).padStart(4, '0')}`,
      patientId: body.patientId,
      doctorId: body.doctorId,
      testName: body.testName.trim(),
      category: body.category?.trim() || 'Biochemistry',
      priority: body.priority || 'Routine',
      status: 'ordered',
      results: [],
      notes: body.notes?.trim() || '',
      orderedAt: new Date().toISOString(),
      completedAt: null,
    };

    const saved = await db.insert('labOrders', newOrder);
    res.status(201).json(saved);
  } catch (err) {
    handleError(res, err, 'Failed to create lab order');
  }
});

apiRouter.patch('/labs/:id', requireAuth, async (req, res) => {
  try {
    const existing = await db.findById('labOrders', req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Lab order not found.' });
      return;
    }

    const body = req.body as Partial<LabOrder>;
    const patch: Partial<LabOrder> = {};
    if (body.status) {
      patch.status = body.status;
      if (body.status === 'completed' && !existing.completedAt) {
        patch.completedAt = new Date().toISOString();
      }
    }
    if (Array.isArray(body.results)) {
      patch.results = body.results;
    }
    if (body.notes !== undefined) {
      patch.notes = body.notes.trim();
    }

    const updated = await db.updateById('labOrders', existing._id, patch);
    res.json(updated);
  } catch (err) {
    handleError(res, err, 'Failed to update lab order');
  }
});

/* ==========================================================================
   BILLING, INVOICES & PAYMENT STATUS
   ========================================================================== */

apiRouter.get('/billing', requireAuth, async (req, res) => {
  try {
    const [invoices, patients] = await Promise.all([
      db.findAll('invoices'),
      db.findAll('patients'),
    ]);
    const patientMap = new Map(patients.map((p) => [p._id, p]));

    const status = String(req.query.status || '').trim();
    const search = String(req.query.search || '').trim().toLowerCase();

    let enriched = invoices.map((inv) => ({
      ...inv,
      patientName: patientMap.get(inv.patientId)?.fullName || 'Unknown Patient',
      patientMrn: patientMap.get(inv.patientId)?.mrn || '—',
    }));

    if (status && status !== 'all') {
      enriched = enriched.filter((inv) => inv.status === status);
    }
    if (search) {
      enriched = enriched.filter(
        (inv) =>
          inv.invoiceNumber.toLowerCase().includes(search) ||
          inv.patientName.toLowerCase().includes(search) ||
          inv.patientMrn.toLowerCase().includes(search) ||
          inv.insuranceProvider.toLowerCase().includes(search)
      );
    }

    enriched.sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
    res.json(enriched);
  } catch (err) {
    handleError(res, err, 'Failed to fetch billing ledger');
  }
});

apiRouter.post('/billing', requireAuth, requireRole('admin', 'reception'), async (req, res) => {
  try {
    const { patientId, items, insuranceProvider, insuranceCoverage, tax, dueDate } = req.body as {
      patientId?: string;
      items?: InvoiceLineItem[];
      insuranceProvider?: string;
      insuranceCoverage?: number;
      tax?: number;
      dueDate?: string;
    };

    if (!patientId || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'Patient and at least one billable line item are required.' });
      return;
    }

    const normalizedItems: InvoiceLineItem[] = items.map((item) => {
      const qty = Math.max(1, Number(item.quantity) || 1);
      const unitPrice = Math.max(0, Number(item.unitPrice) || 0);
      return {
        description: item.description.trim(),
        category: item.category || 'Consultation',
        quantity: qty,
        unitPrice,
        total: Math.round(qty * unitPrice * 100) / 100,
      };
    });

    const subtotal = Math.round(normalizedItems.reduce((sum, i) => sum + i.total, 0) * 100) / 100;
    const coverage = Math.min(subtotal, Math.max(0, Number(insuranceCoverage) || 0));
    const taxAmt = Math.max(0, Number(tax) || 0);
    const totalDue = Math.round(Math.max(0, subtotal - coverage + taxAmt) * 100) / 100;

    const all = await db.findAll('invoices');
    const due = new Date();
    due.setDate(due.getDate() + 14);

    const newInvoice: Invoice = {
      _id: generateId('inv'),
      invoiceNumber: `INV-2026-${8801 + all.length}`,
      patientId,
      items: normalizedItems,
      subtotal,
      insuranceProvider: insuranceProvider?.trim() || 'Self-Pay',
      insuranceCoverage: coverage,
      tax: taxAmt,
      totalDue,
      amountPaid: 0,
      status: totalDue === 0 ? 'paid' : 'unpaid',
      payments: [],
      issuedAt: todayDateStr(),
      dueDate: dueDate || due.toISOString().split('T')[0],
    };

    const saved = await db.insert('invoices', newInvoice);
    res.status(201).json(saved);
  } catch (err) {
    handleError(res, err, 'Failed to create invoice');
  }
});

apiRouter.post('/billing/:id/payments', requireAuth, requireRole('admin', 'reception'), async (req: AuthenticatedRequest, res) => {
  try {
    const invoice = await db.findById('invoices', req.params.id);
    if (!invoice) {
      res.status(404).json({ error: 'Invoice not found.' });
      return;
    }

    const { amount, method, reference } = req.body as {
      amount?: number;
      method?: PaymentRecord['method'];
      reference?: string;
    };
    const payAmount = Math.round((Number(amount) || 0) * 100) / 100;
    const remaining = Math.round(Math.max(0, invoice.totalDue - invoice.amountPaid) * 100) / 100;

    if (payAmount <= 0) {
      res.status(400).json({ error: 'Payment amount must be greater than zero.' });
      return;
    }
    if (payAmount > remaining + 0.01) {
      res.status(400).json({ error: `Payment exceeds remaining balance of $${remaining.toFixed(2)}.` });
      return;
    }

    const payment: PaymentRecord = {
      _id: generateId('pay'),
      amount: payAmount,
      method: method || 'Card',
      paidAt: new Date().toISOString(),
      reference: reference?.trim() || `TXN-${Math.floor(100000 + Math.random() * 899999)}`,
      recordedBy: req.user!.name,
    };

    const nextPaid = Math.round((invoice.amountPaid + payAmount) * 100) / 100;
    const nextStatus: InvoiceStatus =
      nextPaid >= invoice.totalDue - 0.01 ? 'paid' : 'partial';

    const updated = await db.updateById('invoices', invoice._id, {
      amountPaid: nextPaid,
      status: nextStatus,
      payments: [payment, ...invoice.payments],
    });
    res.json(updated);
  } catch (err) {
    handleError(res, err, 'Failed to record payment');
  }
});

apiRouter.delete('/billing/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const invoice = await db.findById('invoices', req.params.id);
    if (!invoice) {
      res.status(404).json({ error: 'Invoice not found.' });
      return;
    }
    if (invoice.amountPaid > 0) {
      res.status(400).json({ error: 'Invoices with recorded payments cannot be deleted.' });
      return;
    }
    await db.deleteById('invoices', invoice._id);
    res.json({ deleted: true });
  } catch (err) {
    handleError(res, err, 'Failed to delete invoice');
  }
});
