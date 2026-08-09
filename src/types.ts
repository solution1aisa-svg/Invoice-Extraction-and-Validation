export interface UserProfile {
  name: string;
  role: string;
  initials?: string;
}

export type ConfidenceLevel = 'High' | 'Low';

export interface ExtractedField<T = string> {
  value: T;
  confidence: ConfidenceLevel;
  confidenceNote?: string;
  isMissing?: boolean;
  isHumanVerified?: boolean;
}

export interface ExtractedLineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  confidence: ConfidenceLevel;
  confidenceNote?: string;
  isHumanVerified?: boolean;
}

export interface InvoiceData {
  recordId?: string;
  sheetRowNumber?: number;
  supplierName: ExtractedField<string>;
  invoiceNumber: ExtractedField<string>;
  invoiceDate: ExtractedField<string>;
  poNumber: ExtractedField<string>;
  paymentDueDate: ExtractedField<string>;
  paymentTerms: ExtractedField<string>;
  paymentDueDateOrTerms: ExtractedField<string>;
  invoiceTotal: ExtractedField<number>;
  lineItems: ExtractedLineItem[];
  
  // File metadata
  fileName: string;
  fileSize?: string;
  fileType: 'pdf' | 'jpeg' | 'jpg' | 'png' | 'scan';
  filePreviewUrl?: string;
  rawFile?: File;
  uploadedAt?: string;
  base64Data?: string;
  mimeType?: string;
  reviewNotes?: string;
  correctedByMadamLim?: boolean;
  processedAt?: string;
}

export type CheckState = 'Not Started' | 'Passed' | 'Failed' | 'Not Run';

export interface ValidationCheckStep {
  id: 1 | 2 | 3 | 4;
  title: string;
  description: string;
  state: CheckState;
  reason?: string;
  details?: string;
  failedFields?: string[];
  lowConfidenceFields?: string[];
}

export interface ValidationResult {
  check1Completeness: ValidationCheckStep;
  check2Confidence: ValidationCheckStep;
  check3Arithmetic: ValidationCheckStep;
  check4Duplicate: ValidationCheckStep;
  
  overallStatus: 'Validated' | 'Needs Correction' | 'Requires Review' | 'Rejected';
  primaryFailureReason?: string;
  failedCheckIndex?: 1 | 2 | 3 | 4;
}

export interface ExistingSheetRecord {
  id: string;
  sheetRowNumber?: number;
  supplier: string;
  invoiceNumber: string;
  invoiceDate: string; // YYYY-MM-DD
  poNumber: string;
  itemDescription?: string;
  quantity?: number | string;
  unitPrice?: number | string;
  invoiceTotal: number;
  dueDate: string;
  paymentTerms?: string;
  status: 'Validated' | 'Needs Correction' | 'Requires Review' | 'Rejected';
  reason?: string;
  confidenceNotes?: string;
  originalFileName: string;
  driveLink?: string;
  processedAt: string;
  reviewedBy?: string;
  reviewNotes?: string;
  lineItems?: ExtractedLineItem[];
}

export interface ReviewQueueItem {
  id: string;
  supplierName: string;
  invoiceNumber: string;
  invoiceDate: string;
  poNumber: string;
  invoiceTotal: number;
  failedCheckTitle: string;
  reason: string;
  originalFileName: string;
  originalFileLink?: string;
  dateAndTImeAdded: string;
  reviewStatus: 'Requires Review' | 'Needs Correction';
  invoiceData: InvoiceData;
  validationResult: ValidationResult;
}

