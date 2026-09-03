import { z } from '../../openapi/registry';

// ---- Requests --------------------------------------------------------------

export const CreateDrugBody = z
  .object({
    name: z.string().min(1).max(200),
    form: z.string().max(40).nullable().optional(),
    strength: z.string().max(60).nullable().optional(),
    unit: z.string().max(30).optional(),
    // Set when the drug was adopted from the system catalogue (ADR-072); omit for a pure custom drug.
    catalogCode: z.string().max(64).nullable().optional(),
    hsnSac: z.string().max(12).nullable().optional(),
    unitPricePaise: z.number().int().nonnegative(),
    taxRateBps: z.number().int().min(0).max(100000).optional(),
    reorderLevel: z.number().int().min(0).optional(),
  })
  .openapi('CreateDrugBody');

export const ReceiveStockBody = z
  .object({
    batchNo: z.string().max(60).nullable().optional(),
    expiryDate: z.string().nullable().optional(),
    quantity: z.number().int().positive(),
    costPricePaise: z.number().int().nonnegative().nullable().optional(),
    supplierId: z.string().uuid().nullable().optional(),
  })
  .openapi('ReceiveStockBody');

export const DispenseBody = z
  .object({
    prescriptionId: z.string().uuid(),
    drugId: z.string().uuid(),
    quantity: z.number().int().positive(),
  })
  .openapi('DispenseBody');

export const CreateSupplierBody = z
  .object({
    name: z.string().min(1).max(200),
    phone: z.string().max(32).nullable().optional(),
    email: z.string().email().nullable().optional(),
    gstin: z.string().max(15).nullable().optional(),
    addressLine: z.string().max(300).nullable().optional(),
  })
  .openapi('CreateSupplierBody');

export const UpdateSupplierBody = CreateSupplierBody.partial()
  .extend({ isActive: z.boolean().optional() })
  .openapi('UpdateSupplierBody');

export const SupplierSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    gstin: z.string().nullable(),
    addressLine: z.string().nullable(),
    isActive: z.boolean(),
  })
  .openapi('Supplier');
export const SupplierListSchema = z.array(SupplierSchema).openapi('SupplierList');

export const AdjustStockBody = z
  .object({
    batchId: z.string().uuid().nullable().optional(),
    delta: z
      .number()
      .int()
      .refine((n) => n !== 0, 'delta must be non-zero'),
    reason: z.string().min(3).max(300),
  })
  .openapi('AdjustStockBody');

export const StockAdjustmentSchema = z
  .object({
    id: z.string(),
    drugId: z.string(),
    drugName: z.string(),
    batchId: z.string().nullable(),
    delta: z.number(),
    reason: z.string(),
    createdAt: z.string(),
  })
  .openapi('StockAdjustment');
export const StockAdjustmentListSchema = z
  .array(StockAdjustmentSchema)
  .openapi('StockAdjustmentList');

// ---- Responses -------------------------------------------------------------

export const DrugSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    form: z.string().nullable(),
    strength: z.string().nullable(),
    unit: z.string(),
    unitPricePaise: z.number(),
    taxRateBps: z.number(),
    reorderLevel: z.number(),
    isActive: z.boolean(),
    onHand: z.number(),
    lowStock: z.boolean(),
  })
  .openapi('Drug');

export const DrugListSchema = z.array(DrugSchema).openapi('DrugList');

export const PendingPrescriptionSchema = z
  .object({
    id: z.string(),
    drugId: z.string().nullable(),
    drugName: z.string(),
    dose: z.string().nullable(),
    frequency: z.string().nullable(),
    duration: z.string().nullable(),
    route: z.string().nullable(),
    instructions: z.string().nullable(),
    status: z.string(),
    visitId: z.string(),
    patientId: z.string(),
    patientName: z.string(),
    patientUhid: z.string(),
    createdAt: z.string(),
  })
  .openapi('PendingPrescription');

export const PendingPrescriptionListSchema = z
  .array(PendingPrescriptionSchema)
  .openapi('PendingPrescriptionList');

export const DispenseResultSchema = z
  .object({
    dispenseId: z.string(),
    invoiceId: z.string().nullable(),
    drugName: z.string(),
    quantity: z.number(),
    totalPaise: z.number(),
  })
  .openapi('DispenseResult');
