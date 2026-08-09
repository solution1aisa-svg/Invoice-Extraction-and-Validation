import React, { useState } from 'react';
import {
  Building,
  Hash,
  Calendar,
  CreditCard,
  Receipt,
  DollarSign,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Trash2,
  RefreshCw,
  ShieldAlert,
  HelpCircle,
  Check,
  UserCheck,
  Edit3,
  Eye,
  ChevronDown,
  ChevronUp,
  FileText,
  Image as ImageIcon
} from 'lucide-react';
import { InvoiceData, ConfidenceLevel, ExtractedLineItem, ValidationResult } from '../types';
import { formatCurrency, formatToYYYYMMDD, isPlaceholderValue } from '../utils/validationEngine';
import { PdfPreview } from './PdfPreview';

interface ExtractionResultsProps {
  invoice: InvoiceData;
  validationResult?: ValidationResult | null;
  isEditing: boolean;
  isRevalidating?: boolean;
  onInvoiceChange: (updatedInvoice: InvoiceData) => void;
  onStartEditing?: () => void;
  onRevalidate: () => void;
  onCancelEdit: () => void;
}

export const ExtractionResults: React.FC<ExtractionResultsProps> = ({
  invoice,
  validationResult,
  isEditing,
  isRevalidating = false,
  onInvoiceChange,
  onStartEditing,
  onRevalidate,
  onCancelEdit,
}) => {
  const [showDocPreview, setShowDocPreview] = useState<boolean>(false);

  // Helper to format date "28/10/2024" or ISO string to "2024-10-28" for <input type="date">
  const formatDateForInput = (rawVal?: string | number): string => {
    if (!rawVal || isPlaceholderValue(rawVal)) return '';
    const str = String(rawVal).trim();
    if (!str || str.includes('[MISSING') || str.includes('[Missing')) return '';
    return formatToYYYYMMDD(str);
  };

  // Helper to format date strictly as YYYY-MM-DD for display
  const formatDateForDisplay = (rawVal?: string | number): string => {
    if (!rawVal || isPlaceholderValue(rawVal)) return '';
    const str = String(rawVal).trim();
    if (!str || str.includes('[MISSING') || str.includes('[Missing')) return '';
    return formatToYYYYMMDD(str);
  };

  // Helper to retrieve string value for text inputs without displaying '[MISSING...]' or placeholder strings
  const getDisplayValue = (field?: { value?: string | number; isMissing?: boolean }): string => {
    if (!field || field.value === undefined || field.value === null) return '';
    if (isPlaceholderValue(field.value)) return '';
    const valStr = String(field.value).trim();
    if (valStr.includes('[MISSING') || valStr.includes('[Missing') || valStr === 'undefined' || valStr === 'null') {
      return '';
    }
    return valStr;
  };

  // Helper to retrieve number value for numeric inputs without returning NaN
  const getNumberInputValue = (field?: { value?: number; isMissing?: boolean }): string => {
    if (!field || field.value === undefined || field.value === null) return '';
    if (typeof field.value === 'number' && !isNaN(field.value)) {
      return String(field.value);
    }
    const parsed = parseFloat(String(field.value));
    return !isNaN(parsed) ? String(parsed) : '';
  };

  const updateField = (
    fieldKey: keyof Omit<InvoiceData, 'lineItems' | 'fileName' | 'fileSize' | 'fileType' | 'filePreviewUrl' | 'uploadedAt' | 'correctionLog' | 'correctedByMadamLim' | 'reviewNotes' | 'auditFileRef'>,
    value: string | number
  ) => {
    const isNum = fieldKey === 'invoiceTotal';
    const parsedVal = isNum ? (typeof value === 'number' ? value : parseFloat(value) || 0) : value;
    const isMissingVal = parsedVal === '' || parsedVal === null || parsedVal === undefined;

    onInvoiceChange({
      ...invoice,
      [fieldKey]: {
        ...invoice[fieldKey],
        value: parsedVal,
        confidence: 'High', // When corrected manually, set confidence to High!
        isMissing: isMissingVal,
        isHumanVerified: true,
      },
    });
  };

  const confirmField = (
    fieldKey: keyof Omit<InvoiceData, 'lineItems' | 'fileName' | 'fileSize' | 'fileType' | 'filePreviewUrl' | 'uploadedAt' | 'correctionLog' | 'correctedByMadamLim' | 'reviewNotes' | 'auditFileRef'>
  ) => {
    const currentField = invoice[fieldKey];
    if (!currentField) return;

    onInvoiceChange({
      ...invoice,
      [fieldKey]: {
        ...currentField,
        confidence: 'High',
        isHumanVerified: true,
      },
    });
  };

  const updateLineItem = (
    id: string,
    key: keyof ExtractedLineItem,
    value: string | number
  ) => {
    const updatedItems = invoice.lineItems.map((item) => {
      if (item.id === id) {
        const isNumericKey = key === 'quantity' || key === 'unitPrice' || key === 'lineTotal';
        const parsedVal = isNumericKey ? (typeof value === 'number' ? value : parseFloat(value) || 0) : value;
        const newItem = {
          ...item,
          [key]: parsedVal,
          confidence: 'High' as ConfidenceLevel,
          isHumanVerified: true,
        };
        if (key === 'quantity' || key === 'unitPrice') {
          const qty = key === 'quantity' ? (typeof value === 'number' ? value : parseFloat(value) || 0) : (Number(item.quantity) || 0);
          const price = key === 'unitPrice' ? (typeof value === 'number' ? value : parseFloat(value) || 0) : (Number(item.unitPrice) || 0);
          newItem.lineTotal = qty * price;
        }
        return newItem;
      }
      return item;
    });

    onInvoiceChange({
      ...invoice,
      lineItems: updatedItems,
    });
  };

  const confirmLineItem = (id: string) => {
    const updatedItems = invoice.lineItems.map((item) => {
      if (item.id === id) {
        return {
          ...item,
          confidence: 'High' as ConfidenceLevel,
          isHumanVerified: true,
        };
      }
      return item;
    });

    onInvoiceChange({
      ...invoice,
      lineItems: updatedItems,
    });
  };

  const addLineItem = () => {
    const newItem: ExtractedLineItem = {
      id: Date.now().toString(),
      description: 'New Line Item',
      quantity: 1,
      unitPrice: 0.0,
      lineTotal: 0.0,
      confidence: 'High',
      isHumanVerified: true,
    };
    onInvoiceChange({
      ...invoice,
      lineItems: [...invoice.lineItems, newItem],
    });
  };

  const removeLineItem = (id: string) => {
    onInvoiceChange({
      ...invoice,
      lineItems: invoice.lineItems.filter((item) => item.id !== id),
    });
  };

  const renderConfidenceBadge = (
    confidence: ConfidenceLevel,
    isMissing?: boolean,
    note?: string,
    isHumanVerified?: boolean,
    onConfirmField?: () => void
  ) => {
    if (isHumanVerified) {
      return (
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300"
          title="Manually verified by Accounts Executive"
        >
          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
          Human Verified
        </span>
      );
    }

    if (isMissing) {
      return (
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-300"
          title={note || 'Field missing on invoice document'}
        >
          <AlertTriangle className="w-3 h-3 text-slate-500" />
          Missing
        </span>
      );
    }

    return confidence === 'High' ? (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300"
        title={note || 'High confidence: Legible text extracted with high OCR accuracy'}
      >
        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
        High
      </span>
    ) : (
      <div className="flex items-center gap-1.5">
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 animate-pulse"
          title={note || 'Low confidence: Blurry text or handwritten characters require verification'}
        >
          <AlertTriangle className="w-3 h-3 text-amber-600" />
          Low
        </span>
        {isEditing && onConfirmField && (
          <button
            type="button"
            onClick={onConfirmField}
            className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-2xs transition-all flex items-center gap-1 cursor-pointer active:scale-95"
            title="Confirm extracted value as human verified"
          >
            <Check className="w-3 h-3" />
            <span>Confirm Value</span>
          </button>
        )}
      </div>
    );
  };

  // Re-calculate subtotal for display
  const subtotal = invoice.lineItems.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
  const calculatedSum = subtotal;
  const statedTotal = Number(invoice.invoiceTotal.value) || 0;
  const hasArithmeticDiscrepancy = Math.abs(calculatedSum - statedTotal) > 0.001;

  // Identify failed fields for visual highlighting based strictly on validationResult
  const isFailedField = (fieldName: string): boolean => {
    if (!validationResult || validationResult.overallStatus === 'Validated') return false;

    const failedStep = validationResult.failedCheckIndex;

    // Check 1: Field Completeness
    if (failedStep === 1 || validationResult.check1Completeness.state === 'Failed') {
      const failedFields = (validationResult.check1Completeness.failedFields || []).map(f => f.toLowerCase());
      if (fieldName === 'supplier') {
        return failedFields.some(f => f.includes('supplier')) || isPlaceholderValue(invoice.supplierName.value);
      }
      if (fieldName === 'invoiceNumber') {
        return failedFields.some(f => f.includes('invoice number')) || isPlaceholderValue(invoice.invoiceNumber.value);
      }
      if (fieldName === 'invoiceDate') {
        return failedFields.some(f => f.includes('invoice date')) || isPlaceholderValue(invoice.invoiceDate.value);
      }
      if (fieldName === 'poNumber') {
        return failedFields.some(f => f.includes('po') || f.includes('purchase order')) || isPlaceholderValue(invoice.poNumber.value);
      }
      if (fieldName === 'dueDate') {
        const dueDateVal = invoice.paymentDueDate?.value || invoice.paymentDueDateOrTerms?.value;
        return failedFields.some(f => f.includes('due date') || f.includes('payment')) || isPlaceholderValue(dueDateVal);
      }
      if (fieldName === 'invoiceTotal') {
        return failedFields.some(f => f.includes('total')) || invoice.invoiceTotal.value <= 0 || isPlaceholderValue(invoice.invoiceTotal.value);
      }
      if (fieldName === 'lineItems') {
        return failedFields.some(f => f.includes('item') || f.includes('quantity') || f.includes('unit price') || f.includes('description'));
      }
      return false;
    }

    // Check 2: Extraction Confidence
    if (failedStep === 2 || validationResult.check2Confidence.state === 'Failed') {
      const lowConfFields = (validationResult.check2Confidence.lowConfidenceFields || []).map(f => f.toLowerCase());
      if (fieldName === 'supplier') {
        return (lowConfFields.some(f => f.includes('supplier')) || invoice.supplierName.confidence === 'Low') && !invoice.supplierName.isHumanVerified;
      }
      if (fieldName === 'invoiceNumber') {
        return (lowConfFields.some(f => f.includes('invoice number')) || invoice.invoiceNumber.confidence === 'Low') && !invoice.invoiceNumber.isHumanVerified;
      }
      if (fieldName === 'invoiceDate') {
        return (lowConfFields.some(f => f.includes('invoice date')) || invoice.invoiceDate.confidence === 'Low') && !invoice.invoiceDate.isHumanVerified;
      }
      if (fieldName === 'poNumber') {
        return (lowConfFields.some(f => f.includes('po') || f.includes('purchase order')) || invoice.poNumber.confidence === 'Low') && !invoice.poNumber.isHumanVerified;
      }
      if (fieldName === 'dueDate') {
        return (lowConfFields.some(f => f.includes('payment') || f.includes('due date')) || invoice.paymentDueDateOrTerms.confidence === 'Low') && !invoice.paymentDueDate?.isHumanVerified && !invoice.paymentDueDateOrTerms?.isHumanVerified;
      }
      if (fieldName === 'invoiceTotal') {
        return (lowConfFields.some(f => f.includes('total')) || invoice.invoiceTotal.confidence === 'Low') && !invoice.invoiceTotal.isHumanVerified;
      }
      if (fieldName === 'lineItems') {
        return lowConfFields.some(f => f.includes('line item')) && invoice.lineItems.some(i => i.confidence === 'Low' && !i.isHumanVerified);
      }
      return false;
    }

    // Check 3: Arithmetic Validation
    if (failedStep === 3 || validationResult.check3Arithmetic.state === 'Failed') {
      if (fieldName === 'invoiceTotal' || fieldName === 'lineItems') {
        return true;
      }
      return false;
    }

    // Check 4: Duplicate Detection
    if (failedStep === 4 || validationResult.check4Duplicate.state === 'Failed') {
      if (fieldName === 'supplier') {
        // Requirement 4: Only flag Supplier Name when it is genuinely empty or unreadable
        return !getDisplayValue(invoice.supplierName);
      }

      const dupReason = (
        validationResult.check4Duplicate?.reason ||
        validationResult.primaryFailureReason ||
        ''
      ).toLowerCase();

      const isInvoiceNumDup = dupReason.includes('invoice number');
      const isPoNumDup = dupReason.includes('po number');
      const fallbackInv = !isInvoiceNumDup && !isPoNumDup;

      if (fieldName === 'invoiceNumber') {
        return isInvoiceNumDup || fallbackInv;
      }
      if (fieldName === 'poNumber') {
        return isPoNumDup;
      }
      return false;
    }

    return false;
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-0">
      {/* Header */}
      <div className="bg-slate-50 border-b border-slate-200 px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-extrabold text-blue-700 uppercase tracking-wider bg-blue-100 px-2 py-0.5 rounded border border-blue-200">
              Extracted Details
            </span>
            {!isEditing && invoice.correctedByMadamLim && validationResult?.overallStatus === 'Validated' && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-900 border border-purple-300 flex items-center gap-1">
                <UserCheck className="w-3 h-3 text-purple-700" />
                Corrected & Revalidated
              </span>
            )}
          </div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2 mt-1">
            <Receipt className="w-4 h-4 text-blue-600" />
            Extracted Invoice Details
          </h2>
        </div>

        {!isEditing && onStartEditing && (
          <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
            <button
              type="button"
              onClick={onStartEditing}
              className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Review & Edit</span>
            </button>
          </div>
        )}
      </div>

      <div className="p-5 space-y-4">
        {/* Collapsible Document Preview */}
        <div className="border border-slate-200 rounded-xl bg-slate-50/80 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowDocPreview(!showDocPreview)}
            className="w-full px-4 py-2.5 text-xs font-bold text-slate-700 hover:text-slate-900 flex items-center justify-between hover:bg-slate-100 transition-all cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Eye className="w-3.5 h-3.5 text-blue-600" />
              <span>Invoice Preview ({invoice.fileName})</span>
            </span>
            <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-500">
              {showDocPreview ? 'Collapse' : 'Expand'}
              {showDocPreview ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </span>
          </button>

          {showDocPreview && (
            <div className="p-3 border-t border-slate-200 bg-slate-100 min-h-[480px] max-h-[650px] overflow-y-auto flex justify-center items-center">
              {invoice.fileType === 'pdf' || invoice.mimeType === 'application/pdf' ? (
                <PdfPreview
                  rawFile={invoice.rawFile}
                  base64Data={invoice.base64Data}
                  filePreviewUrl={invoice.filePreviewUrl}
                  fileName={invoice.fileName}
                />
              ) : (
                <img
                  src={invoice.filePreviewUrl || (invoice.base64Data ? `data:${invoice.mimeType || 'image/png'};base64,${invoice.base64Data}` : '')}
                  alt={`Document Preview - ${invoice.fileName}`}
                  className="max-h-[580px] w-auto max-w-full object-contain rounded border border-slate-300 bg-white shadow-2xs"
                />
              )}
            </div>
          )}
        </div>
        {/* Top 7 Mandatory Key Fields Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {/* Supplier Name */}
          <div className={`p-3.5 rounded-xl border flex flex-col justify-between transition-all ${
            isFailedField('supplier')
              ? 'border-amber-500 bg-amber-50/90 ring-2 ring-amber-400'
              : 'border-slate-200 bg-slate-50/50'
          }`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                <Building className="w-3.5 h-3.5 text-slate-400" />
                Supplier Name
                {isFailedField('supplier') && (
                  <span className="text-[10px] font-bold text-amber-900 bg-amber-200 px-1.5 py-0.5 rounded border border-amber-300 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-amber-700 shrink-0" />
                    <span>{getDisplayValue(invoice.supplierName) ? 'FLAGGED' : 'MISSING'}</span>
                  </span>
                )}
              </span>
              {renderConfidenceBadge(
                invoice.supplierName.confidence,
                invoice.supplierName.isMissing || !getDisplayValue(invoice.supplierName),
                invoice.supplierName.confidenceNote,
                invoice.supplierName.isHumanVerified,
                () => confirmField('supplierName')
              )}
            </div>
            {isEditing ? (
              <div className="space-y-1">
                <input
                  type="text"
                  placeholder="Enter supplier name (e.g. ABC Supplies Pte Ltd)"
                  value={getDisplayValue(invoice.supplierName)}
                  onChange={(e) => updateField('supplierName', e.target.value)}
                  className={`w-full text-sm font-bold text-slate-900 bg-white border rounded-md px-2.5 py-1.5 focus:ring-2 focus:outline-hidden ${
                    isFailedField('supplier') ? 'border-amber-500 ring-2 ring-amber-400 focus:ring-amber-500 bg-amber-50/30' : 'border-slate-300 focus:ring-blue-500'
                  }`}
                />
                {isFailedField('supplier') && (
                  <div className="flex items-center gap-1 text-[11px] font-semibold text-amber-800">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>Supplier name is required or low confidence.</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm font-bold text-slate-900 truncate">
                {getDisplayValue(invoice.supplierName) || <span className="text-rose-500 font-normal italic">[Missing]</span>}
              </div>
            )}
            {invoice.supplierName.confidenceNote && (
              <span className="text-[10px] text-slate-500 block mt-1 leading-tight">{invoice.supplierName.confidenceNote}</span>
            )}
          </div>

          {/* Invoice Number */}
          <div className={`p-3.5 rounded-xl border flex flex-col justify-between transition-all ${
            isFailedField('invoiceNumber')
              ? 'border-amber-500 bg-amber-50/90 ring-2 ring-amber-400'
              : 'border-slate-200 bg-slate-50/50'
          }`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                <Hash className="w-3.5 h-3.5 text-slate-400" />
                Invoice Number
                {isFailedField('invoiceNumber') && (
                  <span className="text-[10px] font-bold text-amber-900 bg-amber-200 px-1.5 py-0.5 rounded border border-amber-300 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-amber-700 shrink-0" />
                    <span>{getDisplayValue(invoice.invoiceNumber) ? 'FLAGGED' : 'MISSING'}</span>
                  </span>
                )}
              </span>
              {renderConfidenceBadge(
                invoice.invoiceNumber.confidence,
                invoice.invoiceNumber.isMissing || !getDisplayValue(invoice.invoiceNumber),
                invoice.invoiceNumber.confidenceNote,
                invoice.invoiceNumber.isHumanVerified,
                () => confirmField('invoiceNumber')
              )}
            </div>
            {isEditing ? (
              <div className="space-y-1">
                <input
                  type="text"
                  placeholder="Enter invoice number (e.g. INV-10024)"
                  value={getDisplayValue(invoice.invoiceNumber)}
                  onChange={(e) => updateField('invoiceNumber', e.target.value)}
                  className={`w-full text-sm font-bold font-mono text-slate-900 bg-white border rounded-md px-2.5 py-1.5 focus:ring-2 focus:outline-hidden ${
                    isFailedField('invoiceNumber') ? 'border-amber-500 ring-2 ring-amber-400 focus:ring-amber-500 bg-amber-50/30' : 'border-slate-300 focus:ring-blue-500'
                  }`}
                />
                {isFailedField('invoiceNumber') && (
                  <div className="flex items-center gap-1 text-[11px] font-semibold text-amber-800">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>Invoice number is required or potential duplicate.</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm font-bold text-slate-900 font-mono">
                {getDisplayValue(invoice.invoiceNumber) || <span className="text-rose-500 font-normal italic">[Missing]</span>}
              </div>
            )}
            {invoice.invoiceNumber.confidenceNote && (
              <span className="text-[10px] text-slate-500 block mt-1 leading-tight">{invoice.invoiceNumber.confidenceNote}</span>
            )}
          </div>

          {/* Invoice Date */}
          <div className={`p-3.5 rounded-xl border flex flex-col justify-between transition-all ${
            isFailedField('invoiceDate')
              ? 'border-amber-500 bg-amber-50/90 ring-2 ring-amber-400'
              : 'border-slate-200 bg-slate-50/50'
          }`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                Invoice Date
                {isFailedField('invoiceDate') && (
                  <span className="text-[10px] font-bold text-amber-900 bg-amber-200 px-1.5 py-0.5 rounded border border-amber-300 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-amber-700 shrink-0" />
                    <span>{getDisplayValue(invoice.invoiceDate) ? 'FLAGGED' : 'MISSING'}</span>
                  </span>
                )}
              </span>
              {renderConfidenceBadge(
                invoice.invoiceDate.confidence,
                invoice.invoiceDate.isMissing || !getDisplayValue(invoice.invoiceDate),
                invoice.invoiceDate.confidenceNote,
                invoice.invoiceDate.isHumanVerified,
                () => confirmField('invoiceDate')
              )}
            </div>
            {isEditing ? (
              <div className="space-y-1">
                <input
                  type="date"
                  value={formatDateForInput(invoice.invoiceDate.value)}
                  onChange={(e) => {
                    const rawVal = e.target.value;
                    const displayFmt = formatDateForDisplay(rawVal) || rawVal;
                    updateField('invoiceDate', displayFmt);
                  }}
                  className={`w-full text-sm font-bold text-slate-900 bg-white border rounded-md px-2.5 py-1.5 focus:ring-2 focus:outline-hidden ${
                    isFailedField('invoiceDate') ? 'border-amber-500 ring-2 ring-amber-400 focus:ring-amber-500 bg-amber-50/30' : 'border-slate-300 focus:ring-blue-500'
                  }`}
                />
                {isFailedField('invoiceDate') && (
                  <div className="flex items-center gap-1 text-[11px] font-semibold text-amber-800">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>Invoice date is missing or low confidence.</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm font-bold text-slate-900">
                {formatDateForDisplay(invoice.invoiceDate.value) || <span className="text-rose-500 font-normal italic">[Missing]</span>}
              </div>
            )}
            {invoice.invoiceDate.confidenceNote && (
              <span className="text-[10px] text-slate-500 block mt-1 leading-tight">{invoice.invoiceDate.confidenceNote}</span>
            )}
          </div>

          {/* PO Number */}
          <div className={`p-3.5 rounded-xl border flex flex-col justify-between transition-all ${
            isFailedField('poNumber')
              ? 'border-amber-500 bg-amber-50/90 ring-2 ring-amber-400'
              : 'border-slate-200 bg-slate-50/50'
          }`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                <FileSpreadsheet className="w-3.5 h-3.5 text-slate-400" />
                PO Number
                {isFailedField('poNumber') && (
                  <span className="text-[10px] font-bold text-amber-900 bg-amber-200 px-1.5 py-0.5 rounded border border-amber-300 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-amber-700 shrink-0" />
                    <span>{getDisplayValue(invoice.poNumber) ? 'FLAGGED' : 'MISSING'}</span>
                  </span>
                )}
              </span>
              {renderConfidenceBadge(
                invoice.poNumber.confidence,
                invoice.poNumber.isMissing || !getDisplayValue(invoice.poNumber),
                invoice.poNumber.confidenceNote,
                invoice.poNumber.isHumanVerified,
                () => confirmField('poNumber')
              )}
            </div>
            {isEditing ? (
              <div className="space-y-1">
                <input
                  type="text"
                  placeholder="Enter PO number (e.g. PO-2026-0450)"
                  value={getDisplayValue(invoice.poNumber)}
                  onChange={(e) => updateField('poNumber', e.target.value)}
                  className={`w-full text-sm font-bold font-mono text-slate-900 bg-white border rounded-md px-2.5 py-1.5 focus:ring-2 focus:outline-hidden ${
                    isFailedField('poNumber') ? 'border-amber-500 ring-2 ring-amber-400 focus:ring-amber-500 bg-amber-50/30' : 'border-slate-300 focus:ring-blue-500'
                  }`}
                />
                {isFailedField('poNumber') && (
                  <div className="flex items-center gap-1 text-[11px] font-semibold text-amber-800">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>
                      {!getDisplayValue(invoice.poNumber)
                        ? 'PO number is required for Field Completeness (Check 1).'
                        : 'PO number flagged due to validation or duplicate detection issue.'}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm font-bold text-slate-900 font-mono">
                {getDisplayValue(invoice.poNumber) || <span className="text-amber-800 font-bold bg-amber-100 px-1.5 py-0.5 rounded border border-amber-300">[MISSING - Required]</span>}
              </div>
            )}
            {invoice.poNumber.confidenceNote && (
              <span className="text-[10px] text-slate-500 block mt-1 leading-tight">{invoice.poNumber.confidenceNote}</span>
            )}
          </div>

          {/* Due Date */}
          <div className={`p-3.5 rounded-xl border flex flex-col gap-1.5 justify-start transition-all ${
            isFailedField('dueDate')
              ? 'border-amber-500 bg-amber-50/90 ring-2 ring-amber-400'
              : 'border-slate-200 bg-slate-50/50'
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                Due Date
                {isFailedField('dueDate') && (
                  <span className="text-[10px] font-bold text-amber-900 bg-amber-200 px-1.5 py-0.5 rounded border border-amber-300 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-amber-700 shrink-0" />
                    <span>{(getDisplayValue(invoice.paymentDueDate) || getDisplayValue(invoice.paymentDueDateOrTerms)) ? 'FLAGGED' : 'MISSING'}</span>
                  </span>
                )}
              </span>
              {renderConfidenceBadge(
                invoice.paymentDueDate?.confidence || invoice.paymentDueDateOrTerms?.confidence || 'High',
                invoice.paymentDueDate?.isMissing ?? (!getDisplayValue(invoice.paymentDueDate) && !getDisplayValue(invoice.paymentDueDateOrTerms)),
                invoice.paymentDueDate?.confidenceNote || invoice.paymentDueDateOrTerms?.confidenceNote,
                invoice.paymentDueDate?.isHumanVerified || invoice.paymentDueDateOrTerms?.isHumanVerified,
                () => {
                  confirmField('paymentDueDate');
                  confirmField('paymentDueDateOrTerms');
                }
              )}
            </div>
            {isEditing ? (
              <div className="space-y-1">
                <input
                  type="text"
                  placeholder="Enter payment due date (e.g. 2026-08-31)"
                  value={getDisplayValue(invoice.paymentDueDate) || getDisplayValue(invoice.paymentDueDateOrTerms)}
                  onChange={(e) => updateField('paymentDueDate', e.target.value)}
                  className={`w-full text-sm font-bold text-slate-900 bg-white border rounded-md px-2.5 py-1.5 focus:ring-2 focus:outline-hidden ${
                    isFailedField('dueDate') ? 'border-amber-500 ring-2 ring-amber-400 focus:ring-amber-500 bg-amber-50/30' : 'border-slate-300 focus:ring-blue-500'
                  }`}
                />
                {isFailedField('dueDate') && (
                  <div className="flex items-center gap-1 text-[11px] font-semibold text-amber-800">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>Payment due date required for Field Completeness (Check 1).</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm font-bold text-slate-900">
                {getDisplayValue(invoice.paymentDueDate) || getDisplayValue(invoice.paymentDueDateOrTerms) || (
                  <span className="text-amber-800 font-bold bg-amber-100 px-2 py-0.5 rounded border border-amber-300 inline-block">
                    [MISSING - Required]
                  </span>
                )}
              </div>
            )}
            {(invoice.paymentDueDate?.confidenceNote || invoice.paymentDueDateOrTerms?.confidenceNote) && (
              <span className="text-[10px] text-slate-500 block leading-tight">
                {invoice.paymentDueDate?.confidenceNote || invoice.paymentDueDateOrTerms?.confidenceNote}
              </span>
            )}
          </div>

          {/* Payment Terms */}
          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between transition-all">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                Payment Terms
              </span>
              {renderConfidenceBadge(
                invoice.paymentTerms?.confidence || 'High',
                invoice.paymentTerms?.isMissing ?? !getDisplayValue(invoice.paymentTerms),
                invoice.paymentTerms?.confidenceNote,
                invoice.paymentTerms?.isHumanVerified,
                () => confirmField('paymentTerms')
              )}
            </div>
            {isEditing ? (
              <div className="space-y-1">
                <input
                  type="text"
                  placeholder="Enter payment terms or instructions (e.g. Net 30, Bank transfer details)"
                  value={getDisplayValue(invoice.paymentTerms)}
                  onChange={(e) => updateField('paymentTerms', e.target.value)}
                  className="w-full text-sm font-bold text-slate-900 bg-white border border-slate-300 rounded-md px-2.5 py-1.5 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>
            ) : (
              <div className="text-sm font-bold text-slate-900">
                {getDisplayValue(invoice.paymentTerms) || (
                  <span className="text-slate-400 font-normal italic">
                    None specified
                  </span>
                )}
              </div>
            )}
            {invoice.paymentTerms?.confidenceNote && (
              <span className="text-[10px] text-slate-500 block mt-1 leading-tight">{invoice.paymentTerms.confidenceNote}</span>
            )}
          </div>

          {/* Stated Invoice Total */}
          <div className={`p-3.5 rounded-xl border col-span-1 sm:col-span-2 lg:col-span-3 flex flex-col justify-between transition-all ${
            isFailedField('invoiceTotal')
              ? 'border-amber-500 bg-amber-50/90 ring-2 ring-amber-400'
              : 'border-slate-200 bg-slate-50/50'
          }`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-slate-400" />
                Stated Invoice Total (SGD)
                {isFailedField('invoiceTotal') && (
                  <span className="text-[10px] font-bold text-amber-900 bg-amber-200 px-1.5 py-0.5 rounded border border-amber-300 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-amber-700 shrink-0" />
                    <span>NEEDS VERIFICATION</span>
                  </span>
                )}
              </span>
              {renderConfidenceBadge(
                invoice.invoiceTotal.confidence,
                invoice.invoiceTotal.isMissing,
                invoice.invoiceTotal.confidenceNote,
                invoice.invoiceTotal.isHumanVerified,
                () => confirmField('invoiceTotal')
              )}
            </div>
            {isEditing ? (
              <div className="space-y-1">
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={getNumberInputValue(invoice.invoiceTotal)}
                  onChange={(e) => updateField('invoiceTotal', parseFloat(e.target.value) || 0)}
                  className={`w-full text-base font-bold text-slate-900 bg-white border rounded-md px-3 py-1.5 focus:ring-2 focus:outline-hidden ${
                    isFailedField('invoiceTotal') ? 'border-amber-500 ring-2 ring-amber-400 focus:ring-amber-500 bg-amber-50/30' : 'border-slate-300 focus:ring-blue-500'
                  }`}
                />
                {hasArithmeticDiscrepancy && isFailedField('invoiceTotal') && (
                  <div className="flex items-center gap-1 text-[11px] font-bold text-rose-700">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                    <span>Items sum ({formatCurrency(subtotal)}) differs from stated total ({formatCurrency(statedTotal)}).</span>
                  </div>
                )}
                {!hasArithmeticDiscrepancy && isFailedField('invoiceTotal') && (
                  <div className="flex items-center gap-1 text-[11px] font-semibold text-amber-800">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>Stated invoice total was difficult to read clearly or flagged.</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-lg font-extrabold text-slate-900 font-mono flex flex-wrap items-center justify-between gap-2">
                <span>{formatCurrency(invoice.invoiceTotal.value)}</span>
                {hasArithmeticDiscrepancy && isFailedField('invoiceTotal') && (
                  <span className="text-xs font-medium text-rose-800 bg-rose-100 px-2 py-1 rounded border border-rose-300 flex items-center gap-1">
                    <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
                    Calculated Line Items = {formatCurrency(calculatedSum)}
                  </span>
                )}
              </div>
            )}
            {invoice.invoiceTotal.confidenceNote && (
              <span className="text-[10px] text-slate-500 block mt-1 leading-tight">{invoice.invoiceTotal.confidenceNote}</span>
            )}
          </div>
        </div>

        {/* Line Items Table */}
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <div className="bg-slate-100 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
              <span>Extracted Line Items ({invoice.lineItems.length})</span>
              {hasArithmeticDiscrepancy && (
                <span className="text-[10px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded border border-rose-200">
                  Subtotal Mismatch
                </span>
              )}
            </h3>
            {isEditing && (
              <button
                type="button"
                onClick={addLineItem}
                className="px-2.5 py-1 rounded bg-slate-800 text-white text-xs font-semibold hover:bg-slate-900 flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                Add Item
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4 w-12">#</th>
                  <th className="py-2.5 px-4">Item Description</th>
                  <th className="py-2.5 px-4 w-24 text-right">Qty</th>
                  <th className="py-2.5 px-4 w-32 text-right">Unit Price</th>
                  <th className="py-2.5 px-4 w-32 text-right">Line Total</th>
                  <th className="py-2.5 px-4 w-28 text-center">Confidence</th>
                  {isEditing && <th className="py-2.5 px-4 w-16 text-center">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-mono text-slate-800">
                {invoice.lineItems.map((item, index) => (
                  <tr key={item.id} className="hover:bg-slate-50/80">
                    <td className="py-2.5 px-4 text-slate-400 font-sans">{index + 1}</td>
                    <td className="py-2.5 px-4 font-sans font-medium text-slate-900">
                      {isEditing ? (
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => updateLineItem(item.id, 'description', e.target.value)}
                          className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs"
                        />
                      ) : (
                        item.description
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      {isEditing ? (
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateLineItem(item.id, 'quantity', e.target.value)}
                          className="w-full text-right bg-white border border-slate-300 rounded px-2 py-1 text-xs"
                        />
                      ) : (
                        item.quantity
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      {isEditing ? (
                        <input
                          type="number"
                          step="0.01"
                          value={item.unitPrice}
                          onChange={(e) => updateLineItem(item.id, 'unitPrice', e.target.value)}
                          className="w-full text-right bg-white border border-slate-300 rounded px-2 py-1 text-xs"
                        />
                      ) : (
                        formatCurrency(item.unitPrice)
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-right font-bold text-slate-900">
                      {formatCurrency(item.quantity * item.unitPrice)}
                    </td>
                    <td className="py-2.5 px-4 text-center font-sans">
                      {renderConfidenceBadge(
                        item.confidence,
                        isPlaceholderValue(item.description) || !item.description?.trim() || item.quantity <= 0 || isPlaceholderValue(item.quantity) || item.unitPrice === undefined || item.unitPrice < 0 || isPlaceholderValue(item.unitPrice),
                        item.confidenceNote,
                        item.isHumanVerified,
                        () => confirmLineItem(item.id)
                      )}
                    </td>
                    {isEditing && (
                      <td className="py-2.5 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => removeLineItem(item.id)}
                          className="text-rose-600 hover:text-rose-800 p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 border-t border-slate-200 font-mono text-xs">
                <tr>
                  <td colSpan={4} className="py-2 px-4 text-right font-semibold text-slate-600">
                    Line Items Subtotal:
                  </td>
                  <td className="py-2 px-4 text-right font-bold text-slate-900">
                    {formatCurrency(subtotal)}
                  </td>
                  <td colSpan={isEditing ? 2 : 1}></td>
                </tr>
                <tr className="border-t-2 border-slate-300 bg-slate-100/80">
                  <td colSpan={4} className="py-2.5 px-4 text-right font-bold text-slate-900 text-sm">
                    Invoice Total:
                  </td>
                  <td className={`py-2.5 px-4 text-right font-extrabold text-sm ${
                    hasArithmeticDiscrepancy ? 'text-rose-700' : 'text-emerald-700'
                  }`}>
                    {formatCurrency(calculatedSum)}
                  </td>
                  <td colSpan={isEditing ? 2 : 1}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Save Corrections & Revalidate CTA in Editing Mode */}
        {isEditing && (
          <div className="mt-6 p-4 rounded-xl bg-emerald-50 border border-emerald-300 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-xs text-emerald-950">
              <strong className="block text-sm font-bold text-emerald-900">Ready to re-verify invoice?</strong>
              Save your corrections to re-run validation checks.
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={onCancelEdit}
                className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs transition-all"
              >
                Cancel Editing
              </button>
              <button
                type="button"
                disabled={isRevalidating}
                onClick={onRevalidate}
                className={`px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-xs shadow-md transition-all flex items-center gap-2 ${
                  isRevalidating ? 'opacity-70 cursor-not-allowed' : 'hover:bg-emerald-500 active:scale-95'
                }`}
              >
                <RefreshCw className={`w-4 h-4 ${isRevalidating ? 'animate-spin' : ''}`} />
                <span>{isRevalidating ? 'Revalidating...' : 'Save Corrections & Revalidate'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
