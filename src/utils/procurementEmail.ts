import { ValidationResult } from '../types';
import { appendAuditLogEntry } from './googleWorkspace';

export interface ContactProcurementData {
  recordId?: string;
  supplierName?: string;
  invoiceNumber?: string;
  poNumber?: string;
  validationResult?: ValidationResult;
  failedCheckTitle?: string;
  reason?: string;
  originalFileLink?: string;
  previousStatus?: string;
  newStatus?: string;
  performedBy?: string;
  role?: string;
  accessToken?: string;
  spreadsheetId?: string;
}

export function openContactProcurementEmail(data: ContactProcurementData) {
  const supplier = (data.supplierName || '').trim() || 'Missing';
  const invNo = (data.invoiceNumber || '').trim() || 'Missing';

  let po = (data.poNumber || '').trim();
  if (!po || po.toLowerCase() === 'n/a' || po.toLowerCase() === 'missing' || po.includes('[MISSING')) {
    po = 'Missing';
  }

  // Determine failed checks and reasons
  const failedCheckList: string[] = [];
  const reasonList: string[] = [];

  if (data.validationResult) {
    const vr = data.validationResult;
    if (vr.check1Completeness?.state === 'Failed') {
      failedCheckList.push('Check 1 – Field Completeness');
      reasonList.push(vr.check1Completeness.reason || 'Mandatory field(s) missing or incomplete.');
    }
    if (vr.check2Confidence?.state === 'Failed') {
      failedCheckList.push('Check 2 – Extraction Confidence');
      reasonList.push(vr.check2Confidence.reason || 'Low extraction confidence detected in key fields.');
    }
    if (vr.check3Arithmetic?.state === 'Failed') {
      failedCheckList.push('Check 3 – Arithmetic Validation');
      reasonList.push(vr.check3Arithmetic.reason || 'Line item subtotal does not match stated total.');
    }
    if (vr.check4Duplicate?.state === 'Failed') {
      failedCheckList.push('Check 4 – Duplicate Detection');
      reasonList.push(vr.check4Duplicate.reason || 'An existing processed invoice matches duplicate detection criteria.');
    }
  }

  if (failedCheckList.length === 0) {
    if (data.failedCheckTitle) {
      failedCheckList.push(data.failedCheckTitle);
    } else {
      failedCheckList.push('Check 1 – Field Completeness');
    }
  }

  if (reasonList.length === 0) {
    if (data.reason) {
      reasonList.push(data.reason);
    } else if (data.validationResult?.primaryFailureReason) {
      reasonList.push(data.validationResult.primaryFailureReason);
    } else {
      reasonList.push('Validation check failed and requires review.');
    }
  }

  const failedChecksStr = failedCheckList.map(c => `• ${c}`).join('\n');
  const reasonsStr = reasonList.map(r => `• ${r}`).join('\n');

  let fileLink = (data.originalFileLink || '').trim();
  if (!fileLink || !fileLink.startsWith('http')) {
    fileLink = `https://drive.google.com/file/d/audit_${encodeURIComponent(invNo)}/view`;
  }

  const subject = `Invoice Requires Review – ${invNo}`;

  const body = `Hi Procurement Team,

The following supplier invoice has failed one or more validation checks and requires your assistance.

Supplier:
${supplier}

Invoice Number:
${invNo}

PO Number:
${po}

Failed Check(s):
${failedChecksStr}

Reason:
${reasonsStr}

Original Invoice:
${fileLink}

Please review the issue and advise on the appropriate action. If necessary, kindly liaise with the supplier and inform Accounts Payable once the issue has been resolved.

Thank you.`;

  const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&tf=1&to=${encodeURIComponent('procurement@boonhuathardware.com')}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  // Append entry to Audit Log
  const recId = data.recordId || (data.invoiceNumber ? `REC-BH-${data.invoiceNumber}` : 'REC-BH-UNKNOWN');
  appendAuditLogEntry(data.accessToken, data.spreadsheetId, {
    invoiceNumber: data.invoiceNumber,
    recordId: recId,
    poNumber: data.poNumber,
    performedBy: data.performedBy,
    role: data.role,
    action: 'Contact Procurement',
    previousStatus: data.previousStatus || 'Requires Review',
    newStatus: data.newStatus || 'Requires Review',
    details: 'Gmail draft prepared for Procurement regarding missing or incorrect invoice information.'
  });

  window.open(gmailUrl, '_blank');
}
