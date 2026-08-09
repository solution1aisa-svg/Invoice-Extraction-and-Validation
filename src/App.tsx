import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Header } from './components/Header';
import { InvoiceUpload } from './components/InvoiceUpload';
import { ExtractionResults } from './components/ExtractionResults';
import { ValidationProgress } from './components/ValidationProgress';
import { StatusBanner } from './components/StatusBanner';
import { GoogleSheetsPreview } from './components/GoogleSheetsPreview';
import { DatabaseView } from './components/DatabaseView';

import {
  InvoiceData,
  ValidationResult,
  ExistingSheetRecord,
  ReviewQueueItem,
  UserProfile
} from './types';
import { INITIAL_SHEET_RECORDS, INITIAL_REVIEW_QUEUE } from './data/mockDatabase';
import { validateInvoice, formatToYYYYMMDD, isPlaceholderValue } from './utils/validationEngine';
import { generateInvoiceCanvasBase64 } from './utils/sampleImageGenerator';
import { initAuth, googleSignIn, logoutUser, getAccessToken, clearAccessToken } from './utils/auth';
import {
  findOrCreateAPSpreadsheet,
  findOrCreateAPFolder,
  upsertInvoiceRowInSheets,
  fetchInvoiceRowsFromSheet,
  uploadDocumentToDrive,
  convertSheetRecordToReviewQueueItem,
  sheetRecordToInvoiceData,
  appendAuditLogEntry
} from './utils/googleWorkspace';

interface SheetsSaveStatus {
  success: boolean;
  isUpdate?: boolean;
  message: string;
  isSaving?: boolean;
}

export default function App() {
  const [currentUserProfile] = useState<UserProfile>({
    name: 'Madam Lim',
    role: 'Accounts Executive',
    initials: 'ML',
  });

  const [activeStage, setActiveStage] = useState<1 | 2 | 3>(1);
  const [currentInvoice, setCurrentInvoice] = useState<InvoiceData | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isRevalidating, setIsRevalidating] = useState<boolean>(false);
  const [revalidateError, setRevalidateError] = useState<string | null>(null);
  const [hasProcessed, setHasProcessed] = useState<boolean>(false);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [backupInvoice, setBackupInvoice] = useState<InvoiceData | null>(null);
  const [currentRecordId, setCurrentRecordId] = useState<string | null>(null);

  // Google Workspace Integration State
  const [user, setUser] = useState<User | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);
  const [isGoogleConnected, setIsGoogleConnected] = useState<boolean>(false);
  const [spreadsheetId, setSpreadsheetId] = useState<string | null>(null);
  const [spreadsheetUrl, setSpreadsheetUrl] = useState<string | null>(null);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [folderUrl, setFolderUrl] = useState<string | null>(null);

  // Google Sheets Save Feedback State
  const [sheetsSaveStatus, setSheetsSaveStatus] = useState<SheetsSaveStatus | null>(null);
  const [currentDriveLink, setCurrentDriveLink] = useState<string | undefined>(undefined);

  // Re-sync System State
  const [isResyncing, setIsResyncing] = useState<boolean>(false);
  const [resyncStatus, setResyncStatus] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Central Google Sheets database state
  const [sheetRecords, setSheetRecords] = useState<ExistingSheetRecord[]>([]);

  // Deriving Review Queue items directly from active connected Google Sheet records (Status = 'Requires Review')
  const requiresReviewQueue: ReviewQueueItem[] = isGoogleConnected
    ? sheetRecords
        .filter(r => (r.status || '').trim().toLowerCase() === 'requires review')
        .map(convertSheetRecordToReviewQueueItem)
    : [];

  const handleReviewAndEditFromQueue = async (item: ReviewQueueItem) => {
    const matchedRecord = sheetRecords.find(
      r => r.id === item.id || (r.sheetRowNumber && item.invoiceData.sheetRowNumber && r.sheetRowNumber === item.invoiceData.sheetRowNumber)
    );

    const invData = matchedRecord ? sheetRecordToInvoiceData(matchedRecord) : item.invoiceData;

    if (!invData.filePreviewUrl && matchedRecord?.driveLink) {
      invData.filePreviewUrl = matchedRecord.driveLink;
    }

    const isNetworkOrDataUrl = invData.filePreviewUrl && (
      invData.filePreviewUrl.startsWith('data:') ||
      invData.filePreviewUrl.startsWith('blob:') ||
      invData.filePreviewUrl.startsWith('http://') ||
      invData.filePreviewUrl.startsWith('https://')
    );

    if (!isNetworkOrDataUrl && !invData.base64Data) {
      try {
        const base64 = generateInvoiceCanvasBase64(invData);
        invData.base64Data = base64;
        invData.filePreviewUrl = 'data:image/png;base64,' + base64;
      } catch (e) {
        console.warn('Canvas image preview error:', e);
      }
    }

    const recId = matchedRecord?.id || item.id;
    const freshValRes = await validateInvoice(invData, sheetRecords, recId);

    setCurrentInvoice(invData);
    setValidationResult(freshValRes);
    setCurrentRecordId(recId);
    setUploadedFileName(matchedRecord?.originalFileName || item.originalFileName || invData.fileName);
    setHasProcessed(true);
    setIsEditing(false);
    setSheetsSaveStatus(null);
    setActiveStage(2);
  };

  const handleRejectQueueItem = async (item: ReviewQueueItem, note?: string) => {
    const token = getAccessToken();
    if (!token || !spreadsheetId) return;

    const matchedRecord = sheetRecords.find(
      r => r.id === item.id || (r.sheetRowNumber && item.invoiceData.sheetRowNumber && r.sheetRowNumber === item.invoiceData.sheetRowNumber)
    );

    const targetRowNumber = matchedRecord?.sheetRowNumber || item.invoiceData.sheetRowNumber;
    if (!targetRowNumber) return;

    const rejectionReason = note ? `Rejected: ${note}` : 'Rejected during review queue audit';
    const prevStatus = item.reviewStatus || 'Requires Review';

    const updatedRecord: ExistingSheetRecord = matchedRecord
      ? {
          ...matchedRecord,
          status: 'Rejected',
          reason: rejectionReason,
          reviewedBy: 'Accounts Executive',
        }
      : {
          id: item.id,
          sheetRowNumber: targetRowNumber,
          supplier: item.supplierName,
          invoiceNumber: item.invoiceNumber,
          invoiceDate: item.invoiceDate,
          poNumber: item.poNumber,
          invoiceTotal: item.invoiceTotal,
          dueDate: item.invoiceData?.paymentDueDate?.value || '',
          status: 'Rejected',
          reason: rejectionReason,
          originalFileName: item.originalFileName,
          driveLink: item.originalFileLink,
          processedAt: item.dateAndTImeAdded,
          reviewedBy: 'Accounts Executive',
        };

    try {
      setSheetsSaveStatus({
        success: false,
        message: 'Updating row status in Google Sheets...',
        isSaving: true,
      });

      await upsertInvoiceRowInSheets(token, spreadsheetId, updatedRecord, {
        isNewUpload: false,
        targetRowNumber,
      });

      // Log Audit Entry for Invoice Rejected
      appendAuditLogEntry(token, spreadsheetId, {
        invoiceNumber: item.invoiceNumber,
        recordId: item.id,
        poNumber: item.poNumber,
        performedBy: currentUserProfile.name,
        role: currentUserProfile.role,
        action: 'Invoice Rejected',
        previousStatus: prevStatus,
        newStatus: 'Rejected',
        details: note ? `Rejected: ${note}` : 'Invoice rejected during review queue audit.'
      });

      const liveRows = await fetchInvoiceRowsFromSheet(token, spreadsheetId);
      setSheetRecords(liveRows);

      setSheetsSaveStatus({
        success: true,
        isUpdate: true,
        message: 'Invoice marked as Rejected in Google Sheets.',
        isSaving: false,
      });
    } catch (err: any) {
      console.warn('Notice updating Google Sheets:', err?.message || err);
      const errStr = String(err?.message || err || '');
      if (errStr.includes('401') || errStr.includes('UNAUTHENTICATED')) {
        clearAccessToken();
        setIsGoogleConnected(false);
        setSheetsSaveStatus({
          success: false,
          message: 'Google Workspace token expired. Please click "Connect Google Workspace" to sign in again.',
          isSaving: false,
        });
      } else {
        setSheetsSaveStatus({
          success: false,
          message: 'Failed to update Google Sheets. Please try again.',
          isSaving: false,
        });
      }
    }
  };


  const handleStartEditing = () => {
    if (currentInvoice) {
      setBackupInvoice(JSON.parse(JSON.stringify(currentInvoice)));
    }
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    if (backupInvoice) {
      setCurrentInvoice(backupInvoice);
      setBackupInvoice(null);
    }
    setIsEditing(false);
  };

  // Initialize Firebase Auth & Google Workspace integration listener
  useEffect(() => {
    const unsubscribe = initAuth(
      async (authUser, token) => {
        setUser(authUser);
        try {
          const sheetInfo = await findOrCreateAPSpreadsheet(token);
          setSpreadsheetId(sheetInfo.id);
          setSpreadsheetUrl(sheetInfo.url);

          const folderInfo = await findOrCreateAPFolder(token);
          if (folderInfo.url) {
            setFolderId(folderInfo.id);
            setFolderUrl(folderInfo.url);
          }

          setIsGoogleConnected(true);

          const liveRows = await fetchInvoiceRowsFromSheet(token, sheetInfo.id);
          // When connected to real Google Sheet, use ONLY live rows from Google Sheets for duplicate detection
          setSheetRecords(liveRows);
        } catch (err) {
          console.error('Failed to sync Google Spreadsheet:', err);
          setIsGoogleConnected(false);
        }
      },
      () => {
        setUser(null);
        setSpreadsheetId(null);
        setSpreadsheetUrl(null);
        setFolderId(null);
        setFolderUrl(null);
        setIsGoogleConnected(false);
        setSheetRecords([]);
      }
    );

    return () => unsubscribe();
  }, []);

  // Auto-refresh Database page from active connected Google Sheet whenever Database tab is opened
  useEffect(() => {
    if (activeStage === 3 && isGoogleConnected) {
      const token = getAccessToken();
      if (token && spreadsheetId) {
        fetchInvoiceRowsFromSheet(token, spreadsheetId)
          .then(liveRows => setSheetRecords(liveRows))
          .catch(err => console.warn('Failed to refresh sheet rows on Database view:', err));
      }
    }
  }, [activeStage, isGoogleConnected, spreadsheetId]);

  // Google Sign-In Handler
  const handleSignIn = async () => {
    setIsLoggingIn(true);
    try {
      const authResult = await googleSignIn();
      if (authResult) {
        setUser(authResult.user);
        const sheetInfo = await findOrCreateAPSpreadsheet(authResult.accessToken);
        setSpreadsheetId(sheetInfo.id);
        setSpreadsheetUrl(sheetInfo.url);

        const folderInfo = await findOrCreateAPFolder(authResult.accessToken);
        if (folderInfo.url) {
          setFolderId(folderInfo.id);
          setFolderUrl(folderInfo.url);
        }

        setIsGoogleConnected(true);

        const liveRows = await fetchInvoiceRowsFromSheet(authResult.accessToken, sheetInfo.id);
        setSheetRecords(liveRows);
      }
    } catch (err: any) {
      console.warn('Google Sign-In notice:', err?.message || err);
      setIsGoogleConnected(false);
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Google Sign-Out Handler
  const handleSignOut = async () => {
    await logoutUser();
    setUser(null);
    setSpreadsheetId(null);
    setSpreadsheetUrl(null);
    setFolderId(null);
    setFolderUrl(null);
    setIsGoogleConnected(false);
    setSheetRecords(INITIAL_SHEET_RECORDS);
  };

  // Handler: Custom File Upload
  const handleFileUpload = (file: File) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64Data = result.split(',')[1];
      const mimeType = file.type || (file.name.endsWith('.pdf') ? 'application/pdf' : 'image/png');
      const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf';

      const newInvoiceData: InvoiceData = {
        supplierName: { value: '', confidence: 'Low', confidenceNote: '' },
        invoiceNumber: { value: '', confidence: 'Low', confidenceNote: '' },
        invoiceDate: { value: '', confidence: 'Low', confidenceNote: '' },
        poNumber: { value: '', confidence: 'Low', confidenceNote: '' },
        paymentDueDate: { value: '', confidence: 'Low', isMissing: true, confidenceNote: '' },
        paymentTerms: { value: '', confidence: 'Low', isMissing: true, confidenceNote: '' },
        paymentDueDateOrTerms: { value: '', confidence: 'Low', isMissing: true, confidenceNote: '' },
        invoiceTotal: { value: 0, confidence: 'Low', confidenceNote: '' },
        lineItems: [],
        fileName: file.name,
        fileSize: Math.round(file.size / 1024) + ' KB',
        fileType: ext === 'pdf' ? 'pdf' : (ext === 'png' ? 'png' : 'jpeg'),
        filePreviewUrl: result,
        rawFile: file,
        base64Data,
        mimeType
      };

      const recId = `REC-BH-${Date.now().toString().slice(-6)}`;
      newInvoiceData.recordId = recId;

      setCurrentInvoice(newInvoiceData);
      setUploadedFileName(file.name);
      setHasProcessed(false);
      setValidationResult(null);
      setIsEditing(false);
      setSheetsSaveStatus(null);
      setCurrentRecordId(recId);
      setActiveStage(1);
    };
  };

  // Helper: Save/Update record in Google Sheets & local state
  const saveRecordToSheets = async (
    inv: InvoiceData,
    val: ValidationResult,
    recordIdOverride?: string,
    options?: { isNewUpload?: boolean }
  ) => {
    const isNewUpload = options?.isNewUpload ?? false;
    const recordId = recordIdOverride || inv.recordId || currentRecordId || `REC-BH-${Date.now().toString().slice(-6)}`;
    if (!currentRecordId) {
      setCurrentRecordId(recordId);
    }
    inv.recordId = recordId;

    const token = getAccessToken();
    let driveLink = currentDriveLink;

    // Upload document to Google Drive if authenticated
    if (token) {
      try {
        const driveRes = await uploadDocumentToDrive(
          token,
          inv.fileName,
          inv.mimeType || 'application/pdf',
          inv.base64Data,
          folderId || undefined,
          inv.supplierName?.value,
          inv.invoiceNumber?.value
        );
        if (driveRes?.webViewLink) {
          driveLink = driveRes.webViewLink;
          setCurrentDriveLink(driveLink);
        }
      } catch (err) {
        console.warn('Drive upload warning:', err);
      }
    }

    const itemDesc = inv.lineItems && inv.lineItems.length > 0
      ? inv.lineItems.map(l => l.description).join('; ')
      : 'N/A';
    const qtyStr = inv.lineItems && inv.lineItems.length > 0
      ? inv.lineItems.map(l => l.quantity).join('; ')
      : '1';
    const unitPriceStr = inv.lineItems && inv.lineItems.length > 0
      ? inv.lineItems.map(l => `$${l.unitPrice.toFixed(2)}`).join('; ')
      : '$0.00';

    const cleanDueDate = formatToYYYYMMDD(inv.paymentDueDate?.value) ||
                         formatToYYYYMMDD(inv.paymentDueDateOrTerms?.value) ||
                         'N/A';

    const cleanTerms = (inv.paymentTerms?.value || '').trim();

    const currentTimestamp = new Date().toLocaleString('en-SG');
    inv.processedAt = currentTimestamp;

    const newRecord: ExistingSheetRecord = {
      id: recordId,
      sheetRowNumber: inv.sheetRowNumber,
      supplier: inv.supplierName.value || 'N/A',
      invoiceNumber: inv.invoiceNumber.value || 'N/A',
      invoiceDate: formatToYYYYMMDD(inv.invoiceDate.value) || 'N/A',
      poNumber: inv.poNumber.value || 'N/A',
      itemDescription: itemDesc,
      quantity: qtyStr,
      unitPrice: unitPriceStr,
      invoiceTotal: inv.invoiceTotal.value || 0,
      dueDate: cleanDueDate,
      paymentTerms: cleanTerms,
      status: val.overallStatus,
      reason: val.primaryFailureReason || 'Passed all validation checks',
      confidenceNotes: val.check2Confidence.state === 'Passed' ? 'All extracted fields High confidence' : val.check2Confidence.reason || 'Low confidence flagged',
      originalFileName: inv.fileName,
      driveLink,
      processedAt: currentTimestamp,
      reviewedBy: 'Accounts Executive',
      lineItems: inv.lineItems
    };

    // Update local sheetRecords (strictly match by Record ID)
    setSheetRecords(prev => {
      const idx = prev.findIndex(r => r.id === recordId);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = newRecord;
        return updated;
      }
      return [newRecord, ...prev];
    });

    // Write to Google Sheets API if connected
    if (token && spreadsheetId) {
      setSheetsSaveStatus({
        success: false,
        message: 'Saving record to Google Sheets...',
        isSaving: true
      });

      try {
        const res = await upsertInvoiceRowInSheets(token, spreadsheetId, newRecord, {
          isNewUpload,
          targetRowNumber: inv.sheetRowNumber
        });

        if (res.rowNumber) {
          inv.sheetRowNumber = res.rowNumber;
          newRecord.sheetRowNumber = res.rowNumber;
        }

        if (res.success) {
          // Replace preview dataset with actual rows directly fetched from active connected Google Sheet
          const liveRows = await fetchInvoiceRowsFromSheet(token, spreadsheetId);
          setSheetRecords(liveRows);

          setSheetsSaveStatus({
            success: true,
            isUpdate: res.isUpdate,
            message: 'Invoice record successfully saved to Google Sheets.',
            isSaving: false
          });
        } else {
          setSheetsSaveStatus({
            success: false,
            message: 'Invoice could not be saved to Google Sheets. Please try again.',
            isSaving: false
          });
        }
      } catch (err: any) {
        console.warn('Notice saving row to Google Sheets:', err?.message || err);
        const errStr = String(err?.message || err || '');
        const is401 = errStr.includes('401') || errStr.includes('UNAUTHENTICATED');
        if (is401) {
          clearAccessToken();
          setIsGoogleConnected(false);
          setSheetsSaveStatus({
            success: false,
            message: 'Google Workspace token expired. Please click "Connect Google Workspace" to sign in again.',
            isSaving: false
          });
        } else {
          setSheetsSaveStatus({
            success: false,
            message: 'Invoice could not be saved to Google Sheets. Please try again.',
            isSaving: false
          });
        }
      }
    } else {
      setSheetsSaveStatus({
        success: false,
        message: 'Google Workspace not connected. Sign in with Google to save to Google Sheets.',
        isSaving: false
      });
    }
  };

  // Handler: Process Invoice using Gemini Multimodal OCR
  const handleProcessInvoice = async () => {
    if (!currentInvoice) return;

    setIsProcessing(true);
    setIsEditing(false);
    setSheetsSaveStatus(null);
    setHasProcessed(false);
    setValidationResult(null);

    const recId = currentRecordId || `REC-BH-${Date.now().toString().slice(-6)}`;
    setCurrentRecordId(recId);

    try {
      const base64Data = currentInvoice.base64Data;
      const mimeType = currentInvoice.mimeType || 'image/png';

      if (!base64Data) {
        throw new Error('Unable to extract invoice data from the uploaded file.');
      }

      const response = await fetch('/api/extract-invoice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          base64Data,
          mimeType,
          fileName: currentInvoice.fileName
        })
      });

      const resData = await response.json();

      if (!response.ok || !resData.success || !resData.data) {
        throw new Error(resData.error || 'Unable to extract invoice data from the uploaded file.');
      }

      const ext = resData.data;

      // Extract and combine due date and payment terms
      const paymentDueVal = formatToYYYYMMDD(ext.paymentDueDate?.value?.trim() || '');
      const paymentTermsVal = ext.paymentTerms?.value?.trim() || '';
      const combinedTerms = paymentDueVal && paymentTermsVal
        ? `${paymentDueVal} (${paymentTermsVal})`
        : paymentDueVal || paymentTermsVal;

      const termsConfidence = (ext.paymentDueDate?.confidence === 'High' && Boolean(paymentDueVal)) ||
        (ext.paymentTerms?.confidence === 'High' && Boolean(paymentTermsVal))
          ? 'High'
          : (combinedTerms ? 'Low' : 'Low');

      const termsNote = ext.paymentDueDate?.confidenceNote || ext.paymentTerms?.confidenceNote || (!combinedTerms ? 'Payment due date or terms could not be identified on document.' : 'Clearly legible on document');

      // Line items extraction
      const extractedLineItems = (ext.lineItems || []).map((item: any, idx: number) => ({
        id: (idx + 1).toString(),
        description: item.description || '',
        quantity: typeof item.quantity === 'number' ? item.quantity : Number(item.quantity) || 1,
        unitPrice: typeof item.unitPrice === 'number' ? item.unitPrice : Number(item.unitPrice) || 0,
        lineTotal: typeof item.lineTotal === 'number' ? item.lineTotal : (item.quantity || 1) * (item.unitPrice || 0),
        confidence: item.confidence || 'High',
        confidenceNote: item.confidenceNote || 'Extracted line item'
      }));

      const statedTotalVal = ext.invoiceTotal?.value || 0;

      const extractedInvoice: InvoiceData = {
        ...currentInvoice,
        recordId: recId,
        supplierName: {
          value: ext.supplierName?.value || '',
          confidence: ext.supplierName?.confidence || 'Low',
          confidenceNote: ext.supplierName?.confidenceNote || 'Extracted via Gemini multimodal model',
          isMissing: isPlaceholderValue(ext.supplierName?.value)
        },
        invoiceNumber: {
          value: ext.invoiceNumber?.value || '',
          confidence: ext.invoiceNumber?.confidence || 'Low',
          confidenceNote: ext.invoiceNumber?.confidenceNote || 'Extracted via Gemini multimodal model',
          isMissing: isPlaceholderValue(ext.invoiceNumber?.value)
        },
        invoiceDate: {
          value: formatToYYYYMMDD(ext.invoiceDate?.value || ''),
          confidence: ext.invoiceDate?.confidence || 'Low',
          confidenceNote: ext.invoiceDate?.confidenceNote || 'Extracted via Gemini multimodal model',
          isMissing: isPlaceholderValue(ext.invoiceDate?.value)
        },
        poNumber: {
          value: ext.poNumber?.value || '',
          confidence: ext.poNumber?.confidence || 'Low',
          confidenceNote: ext.poNumber?.confidenceNote || 'Extracted via Gemini multimodal model',
          isMissing: isPlaceholderValue(ext.poNumber?.value)
        },
        paymentDueDate: {
          value: paymentDueVal,
          confidence: ext.paymentDueDate?.confidence || 'Low',
          confidenceNote: ext.paymentDueDate?.confidenceNote || 'Extracted payment due date',
          isMissing: isPlaceholderValue(paymentDueVal)
        },
        paymentTerms: {
          value: paymentTermsVal,
          confidence: ext.paymentTerms?.confidence || 'Low',
          confidenceNote: ext.paymentTerms?.confidenceNote || 'Extracted payment terms',
          isMissing: isPlaceholderValue(paymentTermsVal)
        },
        paymentDueDateOrTerms: {
          value: combinedTerms,
          confidence: termsConfidence,
          confidenceNote: termsNote,
          isMissing: isPlaceholderValue(combinedTerms)
        },
        invoiceTotal: {
          value: statedTotalVal,
          confidence: ext.invoiceTotal?.confidence || 'Low',
          confidenceNote: ext.invoiceTotal?.confidenceNote || 'Stated invoice total from document',
          isMissing: ext.invoiceTotal?.value === null || ext.invoiceTotal?.value === undefined || ext.invoiceTotal?.value <= 0 || isPlaceholderValue(ext.invoiceTotal?.value)
        },
        lineItems: extractedLineItems
      };

      setCurrentInvoice(extractedInvoice);

      // Run 4-Tier Validation checks against live Google Sheet records that existed before this invoice
      const result = await validateInvoice(extractedInvoice, sheetRecords, recId);
      setValidationResult(result);
      setHasProcessed(true);
      setActiveStage(2);

      const finalInvoiceNo = extractedInvoice.invoiceNumber.value && !isPlaceholderValue(extractedInvoice.invoiceNumber.value)
        ? extractedInvoice.invoiceNumber.value
        : 'N/A';
      const finalPoNo = extractedInvoice.poNumber.value && !isPlaceholderValue(extractedInvoice.poNumber.value)
        ? extractedInvoice.poNumber.value
        : 'N/A';

      // 1. Write queued 'Invoice Uploaded' audit entry using extracted Invoice Number
      appendAuditLogEntry(getAccessToken(), spreadsheetId, {
        invoiceNumber: finalInvoiceNo,
        recordId: recId,
        poNumber: finalPoNo,
        performedBy: currentUserProfile.name,
        role: currentUserProfile.role,
        action: 'Invoice Uploaded',
        previousStatus: 'N/A',
        newStatus: 'Pending Validation',
        details: `Uploaded document for processing: ${currentInvoice.fileName}`
      });

      // 2. Write queued 'Validation Started' audit entry using extracted Invoice Number
      appendAuditLogEntry(getAccessToken(), spreadsheetId, {
        invoiceNumber: finalInvoiceNo,
        recordId: recId,
        poNumber: finalPoNo,
        performedBy: currentUserProfile.name,
        role: currentUserProfile.role,
        action: 'Validation Started',
        previousStatus: 'Pending Validation',
        newStatus: 'Pending Validation',
        details: 'Started 4-step automated rule check.'
      });

      // 3. Write 'Validation Completed' or 'Validation Failed' audit entry using extracted Invoice Number
      if (result.overallStatus === 'Validated') {
        appendAuditLogEntry(getAccessToken(), spreadsheetId, {
          invoiceNumber: finalInvoiceNo,
          recordId: recId,
          poNumber: finalPoNo,
          performedBy: currentUserProfile.name,
          role: currentUserProfile.role,
          action: 'Validation Completed',
          previousStatus: 'Pending Validation',
          newStatus: 'Validated',
          details: 'All validation checks passed.'
        });
      } else {
        appendAuditLogEntry(getAccessToken(), spreadsheetId, {
          invoiceNumber: finalInvoiceNo,
          recordId: recId,
          poNumber: finalPoNo,
          performedBy: currentUserProfile.name,
          role: currentUserProfile.role,
          action: 'Validation Failed',
          previousStatus: 'Pending Validation',
          newStatus: result.overallStatus,
          details: result.primaryFailureReason || 'Validation check failed and requires review.'
        });
      }

      // Always save processed invoice into Google Sheets (Status = Validated or Requires Review)
      await saveRecordToSheets(extractedInvoice, result, recId, { isNewUpload: true });
    } catch (err: any) {
      console.error('Invoice Extraction Error:', err);

      // Append queued early audit entries with 'N/A' for Invoice Number if extraction completely fails
      appendAuditLogEntry(getAccessToken(), spreadsheetId, {
        invoiceNumber: 'N/A',
        recordId: recId,
        poNumber: 'N/A',
        performedBy: currentUserProfile.name,
        role: currentUserProfile.role,
        action: 'Invoice Uploaded',
        previousStatus: 'N/A',
        newStatus: 'Pending Validation',
        details: `Uploaded document for processing: ${currentInvoice.fileName}`
      });

      appendAuditLogEntry(getAccessToken(), spreadsheetId, {
        invoiceNumber: 'N/A',
        recordId: recId,
        poNumber: 'N/A',
        performedBy: currentUserProfile.name,
        role: currentUserProfile.role,
        action: 'Validation Started',
        previousStatus: 'Pending Validation',
        newStatus: 'Pending Validation',
        details: 'Started 4-step automated rule check.'
      });

      appendAuditLogEntry(getAccessToken(), spreadsheetId, {
        invoiceNumber: 'N/A',
        recordId: recId,
        poNumber: 'N/A',
        performedBy: currentUserProfile.name,
        role: currentUserProfile.role,
        action: 'Validation Failed',
        previousStatus: 'Pending Validation',
        newStatus: 'Requires Review',
        details: err.message || 'Unable to extract invoice data from the uploaded file.'
      });

      if (currentInvoice) {
        const blankInvoice: InvoiceData = {
          ...currentInvoice,
          supplierName: { value: '', confidence: 'Low', confidenceNote: '' },
          invoiceNumber: { value: '', confidence: 'Low', confidenceNote: '' },
          invoiceDate: { value: '', confidence: 'Low', confidenceNote: '' },
          poNumber: { value: '', confidence: 'Low', confidenceNote: '' },
          paymentDueDate: { value: '', confidence: 'Low', isMissing: true, confidenceNote: '' },
          paymentTerms: { value: '', confidence: 'Low', isMissing: true, confidenceNote: '' },
          paymentDueDateOrTerms: { value: '', confidence: 'Low', isMissing: true, confidenceNote: '' },
          invoiceTotal: { value: 0, confidence: 'Low', confidenceNote: '' },
          lineItems: []
        };
        setCurrentInvoice(blankInvoice);
      }
      setHasProcessed(false);
      setValidationResult(null);
      alert('Unable to extract invoice data from the uploaded file.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Handler: Clear Invoice
  const handleClearInvoice = () => {
    setCurrentInvoice(null);
    setUploadedFileName(null);
    setHasProcessed(false);
    setValidationResult(null);
    setIsEditing(false);
    setSheetsSaveStatus(null);
    setCurrentRecordId(null);
    setActiveStage(1);
  };

  // Handler: Re-run validation checks after user corrects fields
  const handleRevalidate = async () => {
    if (!currentInvoice) return;

    const previousStatus = validationResult?.overallStatus || 'Requires Review';

    setBackupInvoice(null);
    setRevalidateError(null);
    setIsRevalidating(true);

    const recId = currentInvoice.recordId || currentRecordId || `REC-BH-${Date.now().toString().slice(-6)}`;
    if (!currentRecordId) {
      setCurrentRecordId(recId);
    }

    const updatedInvoice: InvoiceData = {
      ...currentInvoice,
      recordId: recId,
      correctedByMadamLim: true,
    };

    try {
      // 1. Run all four validation checks (Check 1 to Check 4) locally FIRST
      //    Check 4 explicitly excludes current invoice record (recId) from duplicate detection
      const updatedResult = await validateInvoice(updatedInvoice, sheetRecords, recId);

      // 2. Update local app state with corrected invoice values and fresh validation result
      setCurrentInvoice(updatedInvoice);
      setValidationResult(updatedResult);
      setIsEditing(false);

      let auditDetails = updatedResult.overallStatus === 'Validated'
        ? 'Missing information corrected and validation successful.'
        : (updatedResult.primaryFailureReason || 'Invoice data updated and revalidated.');

      if (updatedResult.check2Confidence.details?.includes('manually verified by Accounts Executive') || updatedResult.check2Confidence.details?.includes('Low-confidence field manually verified')) {
        auditDetails = 'Low-confidence extracted field reviewed and confirmed by Accounts Executive.';
      }

      // Append Audit Log entry for Invoice Revalidated
      appendAuditLogEntry(getAccessToken(), spreadsheetId, {
        invoiceNumber: updatedInvoice.invoiceNumber.value,
        recordId: recId,
        poNumber: updatedInvoice.poNumber.value,
        performedBy: currentUserProfile.name,
        role: currentUserProfile.role,
        action: 'Invoice Revalidated',
        previousStatus: previousStatus,
        newStatus: updatedResult.overallStatus,
        details: auditDetails
      });

      // 3. Always update invoice in Google Sheets with new values and fresh status/reason
      await saveRecordToSheets(updatedInvoice, updatedResult, recId, { isNewUpload: false });
    } catch (err) {
      console.error('Error revalidating invoice record:', err);
      setRevalidateError(err instanceof Error ? err.message : 'An error occurred during revalidation.');
    } finally {
      setIsRevalidating(false);
    }
  };

  // Handler: Reject Invoice
  const handleRejectInvoice = async (note?: string) => {
    if (!currentInvoice || !validationResult) return;

    const previousStatus = validationResult.overallStatus || 'Requires Review';
    const recId = currentInvoice.recordId || currentRecordId || 'REC-BH-UNKNOWN';
    const typedNote = (note || '').trim();
    const rejectionReason = typedNote ? `Rejected: ${typedNote}` : 'Rejected';

    const updatedInvoice: InvoiceData = {
      ...currentInvoice,
      reviewNotes: rejectionReason,
    };

    const rejectedResult: ValidationResult = {
      ...validationResult,
      overallStatus: 'Rejected',
      primaryFailureReason: rejectionReason,
    };

    setCurrentInvoice(updatedInvoice);
    setValidationResult(rejectedResult);
    setIsEditing(false);

    // Append Audit Log entry for Invoice Rejected
    appendAuditLogEntry(getAccessToken(), spreadsheetId, {
      invoiceNumber: currentInvoice.invoiceNumber.value,
      recordId: recId,
      poNumber: currentInvoice.poNumber.value,
      performedBy: currentUserProfile.name,
      role: currentUserProfile.role,
      action: 'Invoice Rejected',
      previousStatus: previousStatus,
      newStatus: 'Rejected',
      details: typedNote ? `Rejected: ${typedNote}` : 'Invoice rejected by Accounts Payable.'
    });

    // Update invoice status as Rejected in Google Sheets
    await saveRecordToSheets(updatedInvoice, rejectedResult, currentRecordId || undefined, { isNewUpload: false });
  };

  // Retry Google Sheets Save
  const handleRetrySave = () => {
    if (currentInvoice && validationResult) {
      saveRecordToSheets(currentInvoice, validationResult, currentRecordId || undefined, { isNewUpload: false });
    }
  };

  // Re-sync System Handler
  const handleResyncSystem = async () => {
    setIsResyncing(true);
    setResyncStatus(null);
    try {
      let token = getAccessToken();
      if (!token && !user) {
        setResyncStatus({
          type: 'error',
          message: 'Unable to synchronise with Google Sheets. Please try again.',
        });
        setIsResyncing(false);
        return;
      }

      if (!token) {
        try {
          const authRes = await googleSignIn();
          setUser(authRes.user);
          token = authRes.accessToken;
        } catch (authErr) {
          console.warn('Re-authentication during resync failed:', authErr);
        }
      }

      const effectiveToken = token || getAccessToken();
      if (!effectiveToken) {
        setResyncStatus({
          type: 'error',
          message: 'Unable to synchronise with Google Sheets. Please try again.',
        });
        setIsResyncing(false);
        return;
      }

      // Reconnect to currently connected Google Sheet & Folder
      const sheetInfo = await findOrCreateAPSpreadsheet(effectiveToken);
      setSpreadsheetId(sheetInfo.id);
      setSpreadsheetUrl(sheetInfo.url);

      const folderInfo = await findOrCreateAPFolder(effectiveToken);
      if (folderInfo.url) {
        setFolderId(folderInfo.id);
        setFolderUrl(folderInfo.url);
      }

      setIsGoogleConnected(true);

      // Reread latest worksheet data from Google Sheets
      const liveRows = await fetchInvoiceRowsFromSheet(effectiveToken, sheetInfo.id);

      // Refresh cached data in memory
      setSheetRecords(liveRows);

      setResyncStatus({
        type: 'success',
        message: 'System synchronised successfully. Latest Google Sheet data loaded.',
      });
    } catch (err: any) {
      console.warn('Notice re-syncing with Google Sheets:', err?.message || err);
      const errStr = String(err?.message || err || '');
      if (errStr.includes('401') || errStr.includes('UNAUTHENTICATED')) {
        clearAccessToken();
        setIsGoogleConnected(false);
        setResyncStatus({
          type: 'error',
          message: 'Google Workspace session expired. Please sign in with Google to re-connect.',
        });
      } else {
        setResyncStatus({
          type: 'error',
          message: 'Unable to synchronise with Google Sheets. Please try again.',
        });
      }
    } finally {
      setIsResyncing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 font-sans antialiased pb-16">
      {/* 1. Header with Google Workspace Sign-In & Connection Indicator */}
      <Header
        user={user}
        userProfile={currentUserProfile}
        spreadsheetUrl={spreadsheetUrl}
        folderUrl={folderUrl}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
        isLoggingIn={isLoggingIn}
        onResync={handleResyncSystem}
        isResyncing={isResyncing}
      />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">
        {/* Re-sync Toast Notification */}
        {resyncStatus && (
          <div
            className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center justify-between gap-3 shadow-xs transition-all animate-fadeIn ${
              resyncStatus.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-red-50 border-red-200 text-red-900'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {resyncStatus.type === 'success' ? (
                <CheckCircle2 className="w-4.5 h-4.5 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-4.5 h-4.5 text-red-600 shrink-0" />
              )}
              <span>{resyncStatus.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setResyncStatus(null)}
              className="text-xs font-bold px-2.5 py-1 rounded-md bg-white/80 hover:bg-white text-slate-800 border border-slate-300 transition-all cursor-pointer shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}
        {/* 3-Tab Workflow Navigation */}
        <div className="bg-slate-100 rounded-xl border border-slate-200 p-1.5 shadow-2xs">
          <div className="grid grid-cols-3 gap-1.5 text-center text-xs font-bold">
            {/* Tab 1 */}
            <button
              type="button"
              onClick={() => setActiveStage(1)}
              className={`py-2.5 px-4 rounded-lg transition-all flex items-center justify-center cursor-pointer ${
                activeStage === 1
                  ? 'bg-slate-900 text-white shadow-xs border border-slate-900 font-bold'
                  : 'bg-white text-slate-800 hover:bg-slate-50 border border-slate-200 font-semibold'
              }`}
            >
              <span>Upload Invoice</span>
            </button>

            {/* Tab 2 */}
            <button
              type="button"
              disabled={!hasProcessed || !currentInvoice}
              onClick={() => hasProcessed && currentInvoice && setActiveStage(2)}
              className={`py-2.5 px-4 rounded-lg transition-all flex items-center justify-center ${
                activeStage === 2
                  ? 'bg-slate-900 text-white shadow-xs border border-slate-900 font-bold'
                  : hasProcessed && currentInvoice
                  ? 'bg-white text-slate-800 hover:bg-slate-50 border border-slate-200 font-semibold cursor-pointer'
                  : 'bg-slate-50 text-slate-400 border border-slate-200 opacity-60 cursor-not-allowed'
              }`}
            >
              <span>Review & Validate</span>
            </button>

            {/* Tab 3 */}
            <button
              type="button"
              onClick={() => setActiveStage(3)}
              className={`py-2.5 px-4 rounded-lg transition-all flex items-center justify-center cursor-pointer ${
                activeStage === 3
                  ? 'bg-slate-900 text-white shadow-xs border border-slate-900 font-bold'
                  : 'bg-white text-slate-800 hover:bg-slate-50 border border-slate-200 font-semibold'
              }`}
            >
              <span>Database</span>
            </button>
          </div>
        </div>

        {/* STAGE 1 — UPLOAD INVOICE */}
        {activeStage === 1 && (
          <div className="animate-fadeIn">
            <InvoiceUpload
              currentInvoice={currentInvoice}
              uploadedFileName={uploadedFileName}
              onFileUpload={handleFileUpload}
              onProcessInvoice={handleProcessInvoice}
              onClearInvoice={handleClearInvoice}
              isProcessing={isProcessing}
              hasProcessed={hasProcessed}
            />
          </div>
        )}

        {/* STAGE 2 — REVIEW EXTRACTION & VALIDATION (Vertical Single-Column Layout) */}
        {activeStage === 2 && currentInvoice && validationResult && (
          <div className="relative space-y-6 animate-fadeIn">
            {/* Revalidating Banner / Loading State */}
            {isRevalidating && (
              <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 shadow-sm flex items-center justify-center gap-3 animate-pulse">
                <RefreshCw className="w-5 h-5 text-blue-600 animate-spin shrink-0" />
                <div>
                  <strong className="block text-sm font-bold text-blue-900">Revalidating invoice...</strong>
                  <span className="text-xs text-blue-700">Please wait while the updated values are checked.</span>
                </div>
              </div>
            )}

            {revalidateError && (
              <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-900 shadow-sm flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 text-xs">
                  <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
                  <div>
                    <strong className="block text-sm font-bold text-red-900">Revalidation Error</strong>
                    <span>{revalidateError}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setRevalidateError(null)}
                  className="px-3 py-1 rounded-md bg-red-100 hover:bg-red-200 text-red-800 text-xs font-semibold transition-all cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* 1. Extracted Invoice Details */}
            <div className={`w-full ${isRevalidating ? 'opacity-60 pointer-events-none transition-opacity' : ''}`}>
              <ExtractionResults
                invoice={currentInvoice}
                validationResult={validationResult}
                isEditing={isEditing}
                isRevalidating={isRevalidating}
                onInvoiceChange={(updated) => setCurrentInvoice(updated)}
                onStartEditing={handleStartEditing}
                onRevalidate={handleRevalidate}
                onCancelEdit={handleCancelEdit}
              />
            </div>

            {/* 2. Invoice Status */}
            <div className={`w-full ${isRevalidating ? 'opacity-60 pointer-events-none transition-opacity' : ''}`}>
              <StatusBanner
                validationResult={validationResult}
                invoice={currentInvoice}
                isEditing={isEditing}
                onStartEditing={handleStartEditing}
                onRevalidate={handleRevalidate}
                onRejectInvoice={handleRejectInvoice}
                onProceedToSolution2={() => setActiveStage(3)}
                onProcessAnotherInvoice={handleClearInvoice}
              />
            </div>

            {/* 3. Validation Results */}
            <div className={`w-full ${isRevalidating ? 'opacity-60 pointer-events-none transition-opacity' : ''}`}>
              <ValidationProgress
                validationResult={validationResult}
                isProcessing={isProcessing || isRevalidating}
                invoice={currentInvoice}
                onProceedToSolution2={() => setActiveStage(3)}
                onRejectInvoice={handleRejectInvoice}
              />
            </div>
          </div>
        )}

        {/* STAGE 3 — DATABASE & RECORDS */}
        {activeStage === 3 && (
          <div className="animate-fadeIn">
            <DatabaseView
              currentInvoice={currentInvoice}
              validationResult={validationResult}
              hasProcessed={hasProcessed}
              sheetRecords={isGoogleConnected ? sheetRecords : []}
              requiresReviewQueue={isGoogleConnected ? requiresReviewQueue : []}
              sheetsSaveStatus={sheetsSaveStatus}
              onRetrySave={handleRetrySave}
              driveLink={currentDriveLink}
              spreadsheetUrl={spreadsheetUrl}
              onProcessAnotherInvoice={handleClearInvoice}
              onReviewAndEditFromQueue={handleReviewAndEditFromQueue}
              onRejectQueueItem={handleRejectQueueItem}
              isGoogleConnected={isGoogleConnected}
              onSignIn={handleSignIn}
              isLoggingIn={isLoggingIn}
            />
          </div>
        )}
      </main>
    </div>
  );
}


