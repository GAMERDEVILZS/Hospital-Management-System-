import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { MongooseModels } from './models.ts';
import { buildSeedDataset, type SeedDataset } from './seed.ts';

export type CollectionName = keyof SeedDataset;

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'meridian-hms.json');

export function generateId(prefix = ''): string {
  const hex = crypto.randomBytes(8).toString('hex');
  return prefix ? `${prefix}_${hex}` : hex;
}

class DualModeHospitalDB {
  private mode: 'mongodb' | 'local_store' = 'local_store';
  private store: SeedDataset | null = null;
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;

    const mongoUri = process.env.MONGODB_URI?.trim();
    if (mongoUri) {
      try {
        await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
        this.mode = 'mongodb';
        await this.seedMongoIfEmpty();
        this.initialized = true;
        console.log('[Meridian DB] Connected to MongoDB via Mongoose');
        return;
      } catch (err) {
        console.warn('[Meridian DB] MongoDB connection failed, falling back to local persistent document store:', (err as Error).message);
      }
    }

    this.mode = 'local_store';
    this.loadOrSeedLocalStore();
    this.initialized = true;
    console.log(`[Meridian DB] Running with persistent local document store (${DATA_FILE})`);
  }

  getMode(): 'mongodb' | 'local_store' {
    return this.mode;
  }

  private async seedMongoIfEmpty(): Promise<void> {
    const existingStaff = await MongooseModels.staffUsers.countDocuments();
    if (existingStaff > 0) return;

    const seed = buildSeedDataset();
    await Promise.all([
      MongooseModels.staffUsers.insertMany(seed.staffUsers),
      MongooseModels.doctors.insertMany(seed.doctors),
      MongooseModels.patients.insertMany(seed.patients),
      MongooseModels.appointments.insertMany(seed.appointments),
      MongooseModels.wardBeds.insertMany(seed.wardBeds),
      MongooseModels.pharmacyItems.insertMany(seed.pharmacyItems),
      MongooseModels.labOrders.insertMany(seed.labOrders),
      MongooseModels.invoices.insertMany(seed.invoices),
    ]);
  }

  private loadOrSeedLocalStore(): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        const parsed = JSON.parse(raw) as SeedDataset;
        if (parsed && Array.isArray(parsed.staffUsers) && parsed.staffUsers.length > 0) {
          this.store = parsed;
          return;
        }
      }
    } catch (err) {
      console.warn('[Meridian DB] Re-initializing local store due to read error:', (err as Error).message);
    }

    this.store = buildSeedDataset();
    this.persistLocalStore();
  }

  private persistLocalStore(): void {
    if (!this.store) return;
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmpFile = `${DATA_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(this.store, null, 2), 'utf-8');
    fs.renameSync(tmpFile, DATA_FILE);
  }

  async findAll<K extends CollectionName>(collection: K): Promise<SeedDataset[K]> {
    if (this.mode === 'mongodb') {
      const docs = await MongooseModels[collection].find().lean();
      return docs as unknown as SeedDataset[K];
    }
    return structuredClone(this.store![collection]);
  }

  async findById<K extends CollectionName>(
    collection: K,
    id: string
  ): Promise<SeedDataset[K][number] | null> {
    if (this.mode === 'mongodb') {
      const doc = await MongooseModels[collection].findById(id).lean();
      return (doc as unknown as SeedDataset[K][number]) || null;
    }
    const found = (this.store![collection] as Array<{ _id: string }>).find((item) => item._id === id);
    return found ? (structuredClone(found) as SeedDataset[K][number]) : null;
  }

  async findOne<K extends CollectionName>(
    collection: K,
    predicate: (item: SeedDataset[K][number]) => boolean
  ): Promise<SeedDataset[K][number] | null> {
    const all = await this.findAll(collection);
    const found = (all as Array<SeedDataset[K][number]>).find(predicate);
    return found ?? null;
  }

  async insert<K extends CollectionName>(
    collection: K,
    doc: SeedDataset[K][number]
  ): Promise<SeedDataset[K][number]> {
    if (this.mode === 'mongodb') {
      const created = await MongooseModels[collection].create(doc);
      return created.toObject() as unknown as SeedDataset[K][number];
    }
    const clone = structuredClone(doc);
    (this.store![collection] as Array<SeedDataset[K][number]>).unshift(clone);
    this.persistLocalStore();
    return structuredClone(clone);
  }

  async updateById<K extends CollectionName>(
    collection: K,
    id: string,
    patch: Partial<SeedDataset[K][number]>
  ): Promise<SeedDataset[K][number] | null> {
    if (this.mode === 'mongodb') {
      const updated = await MongooseModels[collection]
        .findByIdAndUpdate(id, { $set: patch }, { new: true })
        .lean();
      return (updated as unknown as SeedDataset[K][number]) || null;
    }
    const list = this.store![collection] as Array<SeedDataset[K][number] & { _id: string }>;
    const idx = list.findIndex((item) => item._id === id);
    if (idx === -1) return null;
    const merged = { ...list[idx], ...structuredClone(patch), _id: id };
    list[idx] = merged;
    this.persistLocalStore();
    return structuredClone(merged);
  }

  async deleteById<K extends CollectionName>(collection: K, id: string): Promise<boolean> {
    if (this.mode === 'mongodb') {
      const res = await MongooseModels[collection].findByIdAndDelete(id);
      return Boolean(res);
    }
    const list = this.store![collection] as Array<{ _id: string }>;
    const idx = list.findIndex((item) => item._id === id);
    if (idx === -1) return false;
    list.splice(idx, 1);
    this.persistLocalStore();
    return true;
  }
}

export const db = new DualModeHospitalDB();
