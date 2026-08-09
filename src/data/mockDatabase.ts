import { ExistingSheetRecord, InvoiceData, ReviewQueueItem } from '../types';

// Central AP Database records (Empty by default, populated strictly from connected Google account)
export const INITIAL_SHEET_RECORDS: ExistingSheetRecord[] = [];

// Preloaded initial Requires Review Queue items (empty by default)
export const INITIAL_REVIEW_QUEUE: ReviewQueueItem[] = [];


// Sample Invoices for testing immediately
export interface SampleInvoicePreset {
  id: string;
  name: string;
  badge: string;
  badgeColor: 'emerald' | 'amber' | 'rose' | 'blue';
  description: string;
  expectedOutcome: 'Validated' | 'Requires Review';
  expectedFailedCheck?: string;
  data: InvoiceData;
}

export const SAMPLE_INVOICE_PRESETS: SampleInvoicePreset[] = [
  {
    id: 'scenario-1-valid',
    name: 'Scenario 1: Complete Valid Invoice',
    badge: 'Passes All Checks',
    badgeColor: 'emerald',
    description: 'Clean invoice from Kim Seng Hardware with all required fields present, high confidence, and valid arithmetic ($1,000 line items total = $1,000 invoice total).',
    expectedOutcome: 'Validated',
    data: {
      supplierName: { value: 'Kim Seng Hardware Pte Ltd', confidence: 'High' },
      invoiceNumber: { value: 'KS-10510', confidence: 'High' },
      invoiceDate: { value: '2026-08-01', confidence: 'High' },
      poNumber: { value: 'PO-2026-0450', confidence: 'High' },
      paymentDueDate: { value: '2026-08-31', confidence: 'High' },
      paymentTerms: { value: 'Net 30', confidence: 'High' },
      paymentDueDateOrTerms: { value: '2026-08-31 (Net 30)', confidence: 'High' },
      invoiceTotal: { value: 1000.00, confidence: 'High' },
      lineItems: [
        { id: '1', description: 'M12 Heavy Duty Galvanized Bolts (Box of 100)', quantity: 10, unitPrice: 45.00, lineTotal: 450.00, confidence: 'High' },
        { id: '2', description: 'Bosch Professional Angle Grinder GWS 7-100', quantity: 2, unitPrice: 135.00, lineTotal: 270.00, confidence: 'High' },
        { id: '3', description: 'Safety Steel Toe Work Boots (Size 42)', quantity: 4, unitPrice: 70.00, lineTotal: 280.00, confidence: 'High' },
      ],
      fileName: 'KimSeng_KS10510_Clean.pdf',
      fileSize: '420 KB',
      fileType: 'pdf',
      filePreviewUrl: 'kim_seng_ks10510.pdf'
    }
  },
  {
    id: 'scenario-2-missing-po',
    name: 'Scenario 2: Missing PO Number',
    badge: 'Fails Check 1',
    badgeColor: 'amber',
    description: 'Tax invoice from Express Safety Supplies where the Purchase Order (PO) number is missing from the document.',
    expectedOutcome: 'Requires Review',
    expectedFailedCheck: 'Check 1: Field Completeness',
    data: {
      supplierName: { value: 'Express Safety Supplies Pte Ltd', confidence: 'High' },
      invoiceNumber: { value: 'ESS-4409', confidence: 'High' },
      invoiceDate: { value: '2026-08-02', confidence: 'High' },
      poNumber: { value: '', confidence: 'Low', isMissing: true },
      paymentDueDate: { value: '2026-09-01', confidence: 'High' },
      paymentTerms: { value: 'Net 30 Days', confidence: 'High' },
      paymentDueDateOrTerms: { value: '2026-09-01 (Net 30 Days)', confidence: 'High' },
      invoiceTotal: { value: 550.00, confidence: 'High' },
      lineItems: [
        { id: '1', description: '3M N95 Respirator Dust Masks (Box of 50)', quantity: 5, unitPrice: 38.00, lineTotal: 190.00, confidence: 'High' },
        { id: '2', description: 'High Visibility Reflective Safety Vests (XL)', quantity: 20, unitPrice: 18.00, lineTotal: 360.00, confidence: 'High' },
      ],
      fileName: 'ExpressSafety_Scan_ESS4409.jpeg',
      fileSize: '1.2 MB',
      fileType: 'jpeg',
      filePreviewUrl: 'express_safety_ess4409.jpg'
    }
  },
  {
    id: 'scenario-3-low-confidence',
    name: 'Scenario 3: Low-Confidence Handwritten Invoice',
    badge: 'Fails Check 2',
    badgeColor: 'amber',
    description: 'Blurry or smudged paper invoice where the Stated Invoice Total is extracted with Low Confidence.',
    expectedOutcome: 'Requires Review',
    expectedFailedCheck: 'Check 2: Extraction Confidence',
    data: {
      supplierName: { value: 'Siong Huat Tools & Machinery', confidence: 'High' },
      invoiceNumber: { value: 'SHT-9988', confidence: 'High' },
      invoiceDate: { value: '2026-08-03', confidence: 'High' },
      poNumber: { value: 'PO-2026-0460', confidence: 'High' },
      paymentDueDate: { value: '2026-09-02', confidence: 'High' },
      paymentTerms: { value: 'Net 30 Days', confidence: 'High' },
      paymentDueDateOrTerms: { value: '2026-09-02 (Net 30 Days)', confidence: 'High' },
      invoiceTotal: { value: 1400.00, confidence: 'Low' },
      lineItems: [
        { id: '1', description: 'Makita Cordless Hammer Drill 18V', quantity: 2, unitPrice: 280.00, lineTotal: 560.00, confidence: 'High' },
        { id: '2', description: 'DeWalt Circular Saw Blade Set (10 pack)', quantity: 4, unitPrice: 210.00, lineTotal: 840.00, confidence: 'High' },
      ],
      fileName: 'SiongHuat_Handwritten_SHT9988.png',
      fileSize: '890 KB',
      fileType: 'png',
      filePreviewUrl: 'siong_huat_sht9988.png'
    }
  },
  {
    id: 'scenario-4-arithmetic-mismatch',
    name: 'Scenario 4: Arithmetic Mismatch',
    badge: 'Fails Check 3',
    badgeColor: 'rose',
    description: 'Line items sum to $1,100.00, but invoice states a total of $1,250.00.',
    expectedOutcome: 'Requires Review',
    expectedFailedCheck: 'Check 3: Arithmetic Validation',
    data: {
      supplierName: { value: 'Lian Seng Fasteners Pte Ltd', confidence: 'High' },
      invoiceNumber: { value: 'LSF-7712', confidence: 'High' },
      invoiceDate: { value: '2026-08-02', confidence: 'High' },
      poNumber: { value: 'PO-2026-0462', confidence: 'High' },
      paymentDueDate: { value: '2026-09-01', confidence: 'High' },
      paymentTerms: { value: 'Net 30', confidence: 'High' },
      paymentDueDateOrTerms: { value: '2026-09-01', confidence: 'High' },
      invoiceTotal: { value: 1250.00, confidence: 'High' },
      lineItems: [
        { id: '1', description: 'Stainless Steel Hex Screws 1/2" x 2" (Box)', quantity: 10, unitPrice: 60.00, lineTotal: 600.00, confidence: 'High' },
        { id: '2', description: 'Industrial Grade Epoxy Adhesive 500ml', quantity: 10, unitPrice: 50.00, lineTotal: 500.00, confidence: 'High' },
      ],
      fileName: 'LianSeng_LSF7712_Error.pdf',
      fileSize: '650 KB',
      fileType: 'pdf',
      filePreviewUrl: 'lian_seng_lsf7712.pdf'
    }
  },
  {
    id: 'scenario-5-hard-duplicate',
    name: 'Scenario 5: Tier 1 Hard Duplicate',
    badge: 'Fails Check 4 (Hard)',
    badgeColor: 'amber',
    description: 'Kim Seng Hardware invoice KS-10100 already exists in the AP database (Hard Duplicate matched by Supplier + Invoice Number).',
    expectedOutcome: 'Requires Review',
    expectedFailedCheck: 'Check 4: Duplicate Detection (Tier 1)',
    data: {
      supplierName: { value: 'Kim Seng Hardware Pte Ltd', confidence: 'High' },
      invoiceNumber: { value: 'KS-10100', confidence: 'High' },
      invoiceDate: { value: '2026-08-03', confidence: 'High' },
      poNumber: { value: 'PO-2026-0410', confidence: 'High' },
      paymentDueDate: { value: '2026-09-02', confidence: 'High' },
      paymentTerms: { value: 'Net 30', confidence: 'High' },
      paymentDueDateOrTerms: { value: '2026-09-02', confidence: 'High' },
      invoiceTotal: { value: 1000.00, confidence: 'High' },
      lineItems: [
        { id: '1', description: 'Heavy Duty Power Tools Set', quantity: 1, unitPrice: 1000.00, lineTotal: 1000.00, confidence: 'High' }
      ],
      fileName: 'KimSeng_KS10100_Duplicate.pdf',
      fileSize: '510 KB',
      fileType: 'pdf',
      filePreviewUrl: 'kim_seng_ks10100.pdf'
    }
  },
  {
    id: 'scenario-6-soft-duplicate',
    name: 'Scenario 6: Tier 2 Soft Duplicate',
    badge: 'Fails Check 4 (Soft)',
    badgeColor: 'amber',
    description: 'ABC Industrial Hardware invoice ($1,137.60, dated Jul 22) matches existing record ($1,137.60, same supplier within 7 days).',
    expectedOutcome: 'Requires Review',
    expectedFailedCheck: 'Check 4: Duplicate Detection (Tier 2)',
    data: {
      supplierName: { value: 'ABC Industrial Hardware Pte Ltd', confidence: 'High' },
      invoiceNumber: { value: 'INV-88999', confidence: 'High' },
      invoiceDate: { value: '2026-07-22', confidence: 'High' },
      poNumber: { value: 'PO-2026-0475', confidence: 'High' },
      paymentDueDate: { value: '2026-08-21', confidence: 'High' },
      paymentTerms: { value: 'Net 30', confidence: 'High' },
      paymentDueDateOrTerms: { value: '2026-08-21', confidence: 'High' },
      invoiceTotal: { value: 1137.60, confidence: 'High' },
      lineItems: [
        { id: '1', description: 'Hydraulic Hose Assembly 1/2" 2-Wire (10m)', quantity: 2, unitPrice: 350.00, lineTotal: 700.00, confidence: 'High' },
        { id: '2', description: 'Heavy Duty C-Clamps 12-inch', quantity: 6, unitPrice: 72.95, lineTotal: 437.70, confidence: 'High' }
      ],
      fileName: 'ABC_INV_88999_SoftDup.pdf',
      fileSize: '530 KB',
      fileType: 'pdf',
      filePreviewUrl: 'abc_inv_88999.pdf'
    }
  }
];
