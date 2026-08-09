import {
  ExistingSheetRecord,
  InvoiceData,
  ValidationCheckStep,
  ValidationResult
} from '../types';
import { getAccessToken, clearAccessToken } from './auth';
import { findOrCreateAPSpreadsheet, fetchInvoiceRowsFromSheet } from './googleWorkspace';

/**
 * Formats currency values cleanly as $X,XXX.XX
 */
export function formatCurrency(amount: number | undefined | null): string {
  if (amount === undefined || amount === null || isNaN(amount)) return '$0.00';
  return new Intl.NumberFormat('en-SG', {
    style: 'currency',
    currency: 'SGD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount).replace('SGD', '$');
}

/**
 * Normalizes supplier name by trimming whitespace, converting to lowercase,
 * ignoring repeated spaces, and ignoring punctuation differences.
 */
export function normalizeSupplierName(supplier?: string): string {
  if (!supplier) return '';
  return supplier
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Normalizes invoice number by trimming whitespace, converting to lowercase,
 * ignoring repeated spaces, and ignoring punctuation differences (removing non-alphanumeric).
 */
export function normalizeInvoiceNumber(invNum?: string): string {
  if (!invNum) return '';
  return invNum
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Standardizes any date string (e.g. 26/07/2026, 2026/07/26, 15 Jul 2026) strictly to YYYY-MM-DD.
 */
export function formatToYYYYMMDD(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const trimmed = dateStr.trim();
  if (!trimmed || trimmed === 'N/A') return trimmed;

  // Check if already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  // YYYY/MM/DD
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(trimmed)) {
    return trimmed.replace(/\//g, '-');
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const ddmmyyyy = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (ddmmyyyy) {
    const p1 = parseInt(ddmmyyyy[1], 10);
    const p2 = parseInt(ddmmyyyy[2], 10);
    const year = ddmmyyyy[3];
    let day = p1;
    let month = p2;
    if (p1 <= 12 && p2 > 12) {
      day = p2;
      month = p1;
    }
    const dayStr = String(day).padStart(2, '0');
    const monthStr = String(month).padStart(2, '0');
    return `${year}-${monthStr}-${dayStr}`;
  }

  // YYYY-M-D or YYYY/M/D
  const yyyymd = trimmed.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (yyyymd) {
    const year = yyyymd[1];
    const month = String(parseInt(yyyymd[2], 10)).padStart(2, '0');
    const day = String(parseInt(yyyymd[3], 10)).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Standard JS Date parsing
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return trimmed;
}

/**
 * Calculates date difference in calendar days
 */
function getDaysDifference(dateStr1: string, dateStr2: string): number {
  try {
    const d1 = new Date(dateStr1);
    const d2 = new Date(dateStr2);
    if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 9999;
    const diffTime = Math.abs(d2.getTime() - d1.getTime());
    return diffTime / (1000 * 60 * 60 * 24);
  } catch {
    return 9999;
  }
}

/**
 * Checks if a field value represents a missing or placeholder value.
 * e.g., N/A, NA, Not Available, Not Found, Missing, Unknown, -, empty strings, blank spaces, null, undefined
 */
export function isPlaceholderValue(val: string | number | boolean | null | undefined): boolean {
  if (val === null || val === undefined) return true;
  if (typeof val === 'number') {
    return isNaN(val);
  }
  const str = String(val).trim();
  if (!str) return true;

  const lower = str.toLowerCase();

  const exactPlaceholders = [
    'n/a',
    'na',
    'not available',
    'not found',
    'missing',
    'unknown',
    '-',
    'none',
    'null',
    'undefined',
    'missing (not found)',
    'missing (required)',
    '[missing]',
    'n.a.',
    'n.a'
  ];

  if (exactPlaceholders.includes(lower)) return true;

  // Clean brackets, parentheses, spaces, punctuation
  const cleaned = lower.replace(/[\[\]\(\)\-\_\.]/g, ' ').replace(/\s+/g, ' ').trim();
  if (exactPlaceholders.includes(cleaned)) return true;

  if (
    lower.startsWith('missing') ||
    lower.startsWith('not found') ||
    lower.startsWith('not available') ||
    lower.startsWith('unknown') ||
    lower.startsWith('[missing')
  ) {
    return true;
  }

  return false;
}

/**
 * Runs the strict 4-step AP Invoice Validation Engine in exact order.
 * Stops at the first check that fails.
 */
export async function validateInvoice(
  invoice: InvoiceData,
  existingSheetRecords?: ExistingSheetRecord[],
  recordIdOverride?: string
): Promise<ValidationResult> {
  const activeRecordId = invoice.recordId || recordIdOverride;

  // Step 1: Field Completeness Check (Mandatory fields: Supplier Name, Invoice Number, Invoice Date, PO Number, Item Description, Quantity, Unit Price, Invoice Total, Due Date. Payment Terms is NOT mandatory.)
  const missingFields: string[] = [];
  
  if (isPlaceholderValue(invoice.supplierName?.value)) {
    missingFields.push('Supplier Name');
  }
  if (isPlaceholderValue(invoice.invoiceNumber?.value)) {
    missingFields.push('Invoice Number');
  }
  if (isPlaceholderValue(invoice.invoiceDate?.value)) {
    missingFields.push('Invoice Date');
  }
  if (isPlaceholderValue(invoice.poNumber?.value)) {
    missingFields.push('PO Number');
  }

  const dueDateVal = invoice.paymentDueDate?.value || invoice.paymentDueDateOrTerms?.value;
  if (isPlaceholderValue(dueDateVal) || invoice.paymentDueDate?.isMissing) {
    missingFields.push('Due Date');
  }

  if (
    invoice.invoiceTotal?.value === undefined ||
    invoice.invoiceTotal?.value === null ||
    invoice.invoiceTotal?.value <= 0 ||
    isPlaceholderValue(invoice.invoiceTotal?.value)
  ) {
    missingFields.push('Invoice Total');
  }

  // Check line items completeness
  if (!invoice.lineItems || invoice.lineItems.length === 0) {
    missingFields.push('Line Items');
  } else {
    let hasDescMissing = false;
    let hasQtyMissing = false;
    let hasPriceMissing = false;

    for (let i = 0; i < invoice.lineItems.length; i++) {
      const item = invoice.lineItems[i];
      if (isPlaceholderValue(item.description)) {
        hasDescMissing = true;
      }
      if (item.quantity === undefined || item.quantity === null || item.quantity <= 0 || isPlaceholderValue(item.quantity)) {
        hasQtyMissing = true;
      }
      if (item.unitPrice === undefined || item.unitPrice === null || item.unitPrice < 0 || isPlaceholderValue(item.unitPrice)) {
        hasPriceMissing = true;
      }
    }

    if (hasDescMissing) missingFields.push('Item Description');
    if (hasQtyMissing) missingFields.push('Quantity');
    if (hasPriceMissing) missingFields.push('Unit Price');
  }

  let check1State: ValidationCheckStep;

  if (missingFields.length > 0) {
    let failureReason = '';
    if (missingFields.length === 1) {
      const field = missingFields[0];
      if (field === 'PO Number' || field === 'Purchase Order (PO) Number') {
        failureReason = 'Mandatory PO Number is missing from the invoice.';
      } else {
        failureReason = `Mandatory ${field} is missing from the invoice.`;
      }
    } else {
      failureReason = `Mandatory fields missing from the invoice: ${missingFields.join(', ')}.`;
    }

    const fullReason = `Check 1: Field Completeness – ${failureReason}`;

    check1State = {
      id: 1,
      title: 'Field Completeness',
      description: 'Verifies that all mandatory AP fields are present and readable.',
      state: 'Failed',
      reason: fullReason,
      details: fullReason,
      failedFields: missingFields
    };

    return {
      check1Completeness: check1State,
      check2Confidence: {
        id: 2,
        title: 'Extraction Confidence',
        description: 'Ensures OCR confidence level is High for all mandatory fields.',
        state: 'Not Run'
      },
      check3Arithmetic: {
        id: 3,
        title: 'Arithmetic Validation',
        description: 'Reconciles line items against stated invoice total.',
        state: 'Not Run'
      },
      check4Duplicate: {
        id: 4,
        title: 'Duplicate Detection',
        description: 'Checks for hard and soft duplicate entries in central AP database.',
        state: 'Not Run'
      },
      overallStatus: 'Requires Review',
      primaryFailureReason: fullReason,
      failedCheckIndex: 1
    };
  }

  check1State = {
    id: 1,
    title: 'Field Completeness',
    description: 'Verifies that all mandatory AP fields are present and readable.',
    state: 'Passed',
    details: 'All mandatory fields (Supplier, Invoice No, Date, PO No, Due Date, Items, Total) are present.'
  };

  // Step 2: Extraction Confidence Check
  const lowConfidenceFields: string[] = [];
  let hasHumanVerifiedField = false;

  if (invoice.supplierName.confidence === 'Low' && !invoice.supplierName.isHumanVerified) {
    lowConfidenceFields.push('Supplier Name');
  }
  if (invoice.supplierName.isHumanVerified) hasHumanVerifiedField = true;

  if (invoice.invoiceNumber.confidence === 'Low' && !invoice.invoiceNumber.isHumanVerified) {
    lowConfidenceFields.push('Invoice Number');
  }
  if (invoice.invoiceNumber.isHumanVerified) hasHumanVerifiedField = true;

  if (invoice.invoiceDate.confidence === 'Low' && !invoice.invoiceDate.isHumanVerified) {
    lowConfidenceFields.push('Invoice Date');
  }
  if (invoice.invoiceDate.isHumanVerified) hasHumanVerifiedField = true;

  if (invoice.poNumber.confidence === 'Low' && !invoice.poNumber.isHumanVerified) {
    lowConfidenceFields.push('PO Number');
  }
  if (invoice.poNumber.isHumanVerified) hasHumanVerifiedField = true;

  const dueDateIsLow = (invoice.paymentDueDate?.confidence === 'Low' || invoice.paymentDueDateOrTerms?.confidence === 'Low') &&
    !invoice.paymentDueDate?.isHumanVerified &&
    !invoice.paymentDueDateOrTerms?.isHumanVerified;
  if (dueDateIsLow) {
    lowConfidenceFields.push('Payment Due Date');
  }
  if (invoice.paymentDueDate?.isHumanVerified || invoice.paymentDueDateOrTerms?.isHumanVerified) {
    hasHumanVerifiedField = true;
  }

  if (invoice.invoiceTotal.confidence === 'Low' && !invoice.invoiceTotal.isHumanVerified) {
    lowConfidenceFields.push('Invoice Total');
  }
  if (invoice.invoiceTotal.isHumanVerified) hasHumanVerifiedField = true;

  for (let i = 0; i < invoice.lineItems.length; i++) {
    const item = invoice.lineItems[i];
    if (item.confidence === 'Low' && !item.isHumanVerified) {
      lowConfidenceFields.push(`Line Item ${i + 1}`);
    }
    if (item.isHumanVerified) hasHumanVerifiedField = true;
  }

  if (invoice.correctedByMadamLim) {
    hasHumanVerifiedField = true;
  }

  let check2State: ValidationCheckStep;

  if (lowConfidenceFields.length > 0) {
    let failureReason = `The ${lowConfidenceFields[0]} could not be confirmed clearly from the invoice. Please verify.`;
    if (lowConfidenceFields.includes('Invoice Total')) {
      failureReason = 'The invoice total was difficult to read clearly from the scanned document. Please verify.';
    } else if (lowConfidenceFields.includes('Supplier Name')) {
      failureReason = 'The supplier name was difficult to read clearly from the scanned document. Please verify.';
    } else if (lowConfidenceFields.includes('Payment Due Date')) {
      failureReason = 'The payment due date was difficult to read clearly from the scanned document. Please verify.';
    } else if (lowConfidenceFields.includes('Invoice Number')) {
      failureReason = 'The invoice number was difficult to read clearly from the scanned document. Please verify.';
    } else if (lowConfidenceFields.includes('PO Number')) {
      failureReason = 'The Purchase Order number was difficult to read clearly from the scanned document. Please verify.';
    }

    const fullReason = `Check 2: Extraction Confidence – ${failureReason}`;

    check2State = {
      id: 2,
      title: 'Extraction Confidence',
      description: 'Ensures OCR confidence level is High for all mandatory fields.',
      state: 'Failed',
      reason: fullReason,
      details: `Low confidence fields: ${lowConfidenceFields.join(', ')}`,
      lowConfidenceFields: lowConfidenceFields
    };

    return {
      check1Completeness: check1State,
      check2Confidence: check2State,
      check3Arithmetic: {
        id: 3,
        title: 'Arithmetic Validation',
        description: 'Reconciles line items against stated invoice total.',
        state: 'Not Run'
      },
      check4Duplicate: {
        id: 4,
        title: 'Duplicate Detection',
        description: 'Checks for hard and soft duplicate entries in central AP database.',
        state: 'Not Run'
      },
      overallStatus: 'Requires Review',
      primaryFailureReason: fullReason,
      failedCheckIndex: 2
    };
  }

  check2State = {
    id: 2,
    title: 'Extraction Confidence',
    description: 'Ensures OCR confidence level is High for all mandatory fields.',
    state: 'Passed',
    details: hasHumanVerifiedField
      ? 'Passed – Low-confidence field manually verified by Accounts Executive.'
      : 'All extracted fields passed legibility thresholds with High confidence.'
  };

  // Step 3: Arithmetic Validation Check
  let calculatedInvoiceTotal = 0;

  for (const item of invoice.lineItems) {
    const qty = Number(item.quantity) || 0;
    const price = Number(item.unitPrice) || 0;
    const calcLineTotal = qty * price;
    item.lineTotal = calcLineTotal;
    calculatedInvoiceTotal += calcLineTotal;
  }

  const statedInvoiceTotal = Number(invoice.invoiceTotal?.value || 0);
  const diff = Math.abs(calculatedInvoiceTotal - statedInvoiceTotal);

  let check3State: ValidationCheckStep;

  if (diff >= 0.001) {
    const formattedCalculated = formatCurrency(calculatedInvoiceTotal);
    const formattedStated = formatCurrency(statedInvoiceTotal);
    const formattedDiff = formatCurrency(diff);

    const failureReason = `Arithmetic inconsistency detected. Calculated Invoice Total: ${formattedCalculated}. Stated Invoice Total: ${formattedStated}. Difference: ${formattedDiff}. Please review the Quantity, Unit Price, Line Total, or Invoice Total.`;
    const fullReason = `Check 3: Arithmetic Validation – ${failureReason}`;

    check3State = {
      id: 3,
      title: 'Arithmetic Validation',
      description: 'Reconciles line items against stated invoice total.',
      state: 'Failed',
      reason: fullReason,
      details: `Arithmetic inconsistency detected.\nCalculated Invoice Total: ${formattedCalculated}\nStated Invoice Total: ${formattedStated}\nDifference: ${formattedDiff}\nPlease review the Quantity, Unit Price, Line Total, or Invoice Total.`
    };

    return {
      check1Completeness: check1State,
      check2Confidence: check2State,
      check3Arithmetic: check3State,
      check4Duplicate: {
        id: 4,
        title: 'Duplicate Detection',
        description: 'Checks for hard and soft duplicate entries in central AP database.',
        state: 'Not Run'
      },
      overallStatus: 'Requires Review',
      primaryFailureReason: fullReason,
      failedCheckIndex: 3
    };
  }

  const formattedCalculated = formatCurrency(calculatedInvoiceTotal);
  const formattedStated = formatCurrency(statedInvoiceTotal);

  check3State = {
    id: 3,
    title: 'Arithmetic Validation',
    description: 'Reconciles line items against stated invoice total.',
    state: 'Passed',
    details: `All line item calculations are mathematically correct.\nCalculated Invoice Total (${formattedCalculated}) matches the Stated Invoice Total (${formattedStated}).`
  };

  // Step 4: Duplicate Detection Check
  let check4State: ValidationCheckStep;

  let freshRecords: ExistingSheetRecord[] = [];
  let sheetAccessFailed = false;

  const token = getAccessToken();
  if (!token) {
    if (existingSheetRecords && existingSheetRecords.length > 0) {
      freshRecords = existingSheetRecords;
    } else {
      sheetAccessFailed = true;
    }
  } else {
    try {
      const sheetInfo = await findOrCreateAPSpreadsheet(token);
      freshRecords = await fetchInvoiceRowsFromSheet(token, sheetInfo.id);
    } catch (err: any) {
      const errStr = String(err?.message || err || '');
      if (errStr.includes('401') || errStr.includes('UNAUTHENTICATED')) {
        clearAccessToken();
      }
      console.warn('Unable to read active Google Sheet for duplicate detection, falling back to local records:', errStr);
      if (existingSheetRecords && existingSheetRecords.length > 0) {
        freshRecords = existingSheetRecords;
      } else {
        sheetAccessFailed = true;
      }
    }
  }

  if (sheetAccessFailed) {
    const failureReason = 'Unable to verify duplicates because the active Google Sheet could not be accessed.';
    const fullReason = `Check 4: Duplicate Detection – ${failureReason}`;
    check4State = {
      id: 4,
      title: 'Duplicate Detection',
      description: 'Checks for duplicate entries by normalized Supplier Name and Invoice Number.',
      state: 'Failed',
      reason: fullReason,
      details: fullReason
    };

    return {
      check1Completeness: check1State,
      check2Confidence: check2State,
      check3Arithmetic: check3State,
      check4Duplicate: check4State,
      overallStatus: 'Requires Review',
      primaryFailureReason: fullReason,
      failedCheckIndex: 4
    };
  }

  const currentRecId = (activeRecordId || invoice.recordId || recordIdOverride || '').trim().toLowerCase();
  const currentSheetRowNumber = invoice.sheetRowNumber;

  // Filter qualifying rows present in the active Google Sheet:
  // Exclude current row / self / newly appended row / current session
  const qualifyingRows = freshRecords.filter(record => {
    if (!record) return false;

    // Exclude current row if updating/revalidating
    if (currentSheetRowNumber && record.sheetRowNumber && record.sheetRowNumber === currentSheetRowNumber) {
      return false;
    }

    const recId = (record.id || (record as any).recordId || '').trim().toLowerCase();
    if (currentRecId && recId && recId === currentRecId) {
      return false;
    }

    return true;
  });

  // Normalization helper: trim leading/trailing spaces, reduce multiple spaces, compare case-insensitively
  const normalizeStr = (val: string | undefined | null): string => {
    if (!val) return '';
    return val.trim().replace(/\s+/g, ' ').toLowerCase();
  };

  const isInvalidOrMissingVal = (valStr: string): boolean => {
    if (!valStr) return true;
    const v = valStr.trim().toLowerCase();
    return (
      v === '' ||
      v === 'missing' ||
      v === 'n/a' ||
      v === 'not found' ||
      v === 'unknown supplier' ||
      v === 'missing (not found)' ||
      v === 'none' ||
      v === 'null' ||
      v === 'undefined'
    );
  };

  const supplierClean = normalizeStr(invoice.supplierName?.value);
  const invNumberClean = normalizeStr(invoice.invoiceNumber?.value);
  const poNumberClean = normalizeStr(invoice.poNumber?.value);

  const isSupplierValid = supplierClean !== '' && !isInvalidOrMissingVal(supplierClean);
  const isInvNumberValid = invNumberClean !== '' && !isInvalidOrMissingVal(invNumberClean);
  const isPoNumberValid = poNumberClean !== '' && !isInvalidOrMissingVal(poNumberClean);

  let duplicateMatch: ExistingSheetRecord | null = null;
  let isSameInvoiceNumber = false;
  let isSamePoNumber = false;

  if (isSupplierValid && (isInvNumberValid || isPoNumberValid)) {
    for (const record of qualifyingRows) {
      const recSupplier = normalizeStr(record.supplier);
      const recInvNum = normalizeStr(record.invoiceNumber);
      const recPoNum = normalizeStr(record.poNumber);

      const isRecSupplierValid = recSupplier !== '' && !isInvalidOrMissingVal(recSupplier);
      const isRecInvNumValid = recInvNum !== '' && !isInvalidOrMissingVal(recInvNum);
      const isRecPoNumValid = recPoNum !== '' && !isInvalidOrMissingVal(recPoNum);

      if (!isRecSupplierValid || recSupplier !== supplierClean) {
        continue;
      }

      const matchesInv = isInvNumberValid && isRecInvNumValid && (invNumberClean === recInvNum);
      const matchesPo = isPoNumberValid && isRecPoNumValid && (poNumberClean === recPoNum);

      if (matchesInv || matchesPo) {
        if (!duplicateMatch) {
          duplicateMatch = record;
        }
        if (matchesInv) isSameInvoiceNumber = true;
        if (matchesPo) isSamePoNumber = true;
      }
    }
  }

  if (duplicateMatch) {
    let failureReason = '';
    if (isSameInvoiceNumber && isSamePoNumber) {
      failureReason = 'Duplicate detected: An existing processed invoice from the same supplier has the same invoice number and PO number.';
    } else if (isSameInvoiceNumber) {
      failureReason = 'Duplicate detected: An existing processed invoice from the same supplier has the same invoice number.';
    } else {
      failureReason = 'Duplicate detected: An existing processed invoice from the same supplier has the same PO number.';
    }

    const fullReason = `Check 4: Duplicate Detection – ${failureReason}`;

    check4State = {
      id: 4,
      title: 'Duplicate Detection',
      description: 'Checks for duplicate entries by normalized Supplier Name, Invoice Number, or PO Number.',
      state: 'Failed',
      reason: fullReason,
      details: `Duplicate matched existing saved record ${duplicateMatch.id} (${duplicateMatch.supplier}, Invoice: ${duplicateMatch.invoiceNumber}, PO: ${duplicateMatch.poNumber})`
    };

    return {
      check1Completeness: check1State,
      check2Confidence: check2State,
      check3Arithmetic: check3State,
      check4Duplicate: check4State,
      overallStatus: 'Requires Review',
      primaryFailureReason: fullReason,
      failedCheckIndex: 4
    };
  }

  // If no prior row matches same supplier and (same invoice number OR same PO number)
  check4State = {
    id: 4,
    title: 'Duplicate Detection',
    description: 'Checks for duplicate entries by normalized Supplier Name, Invoice Number, or PO Number.',
    state: 'Passed',
    details: 'Not a duplicate'
  };

  // All 4 checks passed!
  return {
    check1Completeness: check1State,
    check2Confidence: check2State,
    check3Arithmetic: check3State,
    check4Duplicate: check4State,
    overallStatus: 'Validated'
  };
}

function formatDateShort(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  } catch {
    return dateStr;
  }
}
