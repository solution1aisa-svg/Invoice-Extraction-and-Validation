import React from 'react';
import {
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  Plus
} from 'lucide-react';
import { InvoiceData, ValidationResult, ExistingSheetRecord } from '../types';
import { formatCurrency, formatToYYYYMMDD } from '../utils/validationEngine';

interface SheetsSaveStatus {
  success: boolean;
  isUpdate?: boolean;
  message: string;
  isSaving?: boolean;
}

interface GoogleSheetsPreviewProps {
  currentInvoice: InvoiceData | null;
  validationResult: ValidationResult | null;
  hasProcessed: boolean;
  sheetRecords?: ExistingSheetRecord[];
  sheetsSaveStatus?: SheetsSaveStatus | null;
  onRetrySave?: () => void;
  driveLink?: string;
  spreadsheetUrl?: string | null;
  onProcessAnotherInvoice?: () => void;
  isGoogleConnected?: boolean;
  onSignIn?: () => void;
  isLoggingIn?: boolean;
}

/**
 * Safely parses a processedAt timestamp string into milliseconds since epoch.
 */
function parseProcessedAtTimestamp(dateStr: string | undefined): number {
  if (!dateStr || typeof dateStr !== 'string') return 0;
  const str = dateStr.trim();
  if (!str) return 0;

  // Standard ISO / Date.parse check
  const time = Date.parse(str);
  if (!isNaN(time) && time > 0) return time;

  // Custom regex parsing for DD/MM/YYYY, HH:MM:SS AM/PM or similar locale date strings
  const match = str.match(/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?)?/i);
  if (match) {
    const p1 = parseInt(match[1], 10);
    const p2 = parseInt(match[2], 10);
    const year = parseInt(match[3], 10);
    let hours = match[4] ? parseInt(match[4], 10) : 0;
    const minutes = match[5] ? parseInt(match[5], 10) : 0;
    const seconds = match[6] ? parseInt(match[6], 10) : 0;
    const ampm = match[7] ? match[7].toLowerCase() : null;

    if (ampm === 'pm' && hours < 12) hours += 12;
    if (ampm === 'am' && hours === 12) hours = 0;

    let day = p1;
    let month = p2 - 1;
    if (p1 <= 12 && p2 > 12) {
      day = p2;
      month = p1 - 1;
    }

    const d = new Date(year, month, day, hours, minutes, seconds);
    if (!isNaN(d.getTime())) return d.getTime();
  }

  return 0;
}

/**
 * Determines the latest audit trail entry recorded in the Google Sheet data source.
 * Evaluates the most recent processedAt write/update timestamp with row position tie breaker.
 */
function getLatestAuditTrailEntry(records: ExistingSheetRecord[]): ExistingSheetRecord | null {
  if (!records || records.length === 0) return null;

  let bestRecord: ExistingSheetRecord = records[0];
  let bestTime = parseProcessedAtTimestamp(bestRecord.processedAt);
  let bestRow = bestRecord.sheetRowNumber || 1;

  for (let i = 1; i < records.length; i++) {
    const rec = records[i];
    const recTime = parseProcessedAtTimestamp(rec.processedAt);
    const recRow = rec.sheetRowNumber || (i + 1);

    if (recTime > bestTime) {
      bestRecord = rec;
      bestTime = recTime;
      bestRow = recRow;
    } else if (recTime === bestTime && recTime > 0) {
      if (recRow > bestRow) {
        bestRecord = rec;
        bestRow = recRow;
      }
    } else if (bestTime === 0 && recTime === 0) {
      if (recRow >= bestRow) {
        bestRecord = rec;
        bestRow = recRow;
      }
    }
  }

  return bestRecord;
}

/**
 * Renders cell text or a prominent 'Missing' indicator if the field is omitted/blank/invalid.
 */
function renderCellText(
  val: string | number | undefined | null,
  options?: { isCurrency?: boolean; isStatusReason?: boolean; status?: string }
): React.ReactNode {
  if (val === undefined || val === null) {
    return (
      <span className="text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded text-[11px] italic font-semibold border border-amber-200">
        Missing
      </span>
    );
  }

  if (typeof val === 'number') {
    if (isNaN(val) || val < 0) {
      return (
        <span className="text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded text-[11px] italic font-semibold border border-amber-200">
          Missing
        </span>
      );
    }
    if (options?.isCurrency) {
      if (val === 0) {
        return (
          <span className="text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded text-[11px] italic font-semibold border border-amber-200">
            Missing
          </span>
        );
      }
      return formatCurrency(val);
    }
    return String(val);
  }

  const str = String(val).trim();
  if (!str || str.toUpperCase() === 'N/A' || str.toLowerCase() === 'missing') {
    if (options?.isStatusReason && options?.status === 'Validated') {
      return 'Passed all validation checks';
    }
    return (
      <span className="text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded text-[11px] italic font-semibold border border-amber-200">
        Missing
      </span>
    );
  }

  return str;
}

export const GoogleSheetsPreview: React.FC<GoogleSheetsPreviewProps> = ({
  currentInvoice,
  validationResult,
  hasProcessed,
  sheetRecords = [],
  sheetsSaveStatus,
  onRetrySave,
  driveLink,
  spreadsheetUrl,
  onProcessAnotherInvoice,
  isGoogleConnected = false,
  onSignIn,
  isLoggingIn = false,
}) => {
  // Determine the single latest audit trail entry recorded in the active Google Sheet
  const latestRecord = getLatestAuditTrailEntry(sheetRecords);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-0">
      {/* Header */}
      <div className="bg-emerald-900 text-white px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-300 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800">
            Google Sheets
          </span>
          <h2 className="text-base font-bold text-white mt-0.5 flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-emerald-300" />
            Latest Entry
          </h2>
        </div>

        <div className="flex items-center gap-2">
          {spreadsheetUrl && (
            <a
              href={spreadsheetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-1.5 bg-emerald-800 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg border border-emerald-600 inline-flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-300" />
              <span>Open Connected Sheet</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          )}

          {onProcessAnotherInvoice && (
            <button
              type="button"
              onClick={onProcessAnotherInvoice}
              className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Process Another Invoice</span>
            </button>
          )}
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Save Status Alert Banner */}
        {sheetsSaveStatus && (
          <div
            className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all text-xs ${
              sheetsSaveStatus.isSaving
                ? 'bg-blue-50 border-blue-300 text-blue-900'
                : sheetsSaveStatus.success
                ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                : 'bg-rose-50 border-rose-300 text-rose-950'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {sheetsSaveStatus.isSaving ? (
                <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin shrink-0"></div>
              ) : sheetsSaveStatus.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <div>
                <span className="font-bold block text-xs">
                  {sheetsSaveStatus.message}
                </span>
                {sheetsSaveStatus.success && (
                  <span className="text-[11px] text-emerald-800 font-medium">
                    {sheetsSaveStatus.isUpdate
                      ? 'Updated existing invoice entry in central AP database.'
                      : 'Saved new invoice entry in central AP database.'}
                  </span>
                )}
              </div>
            </div>

            {!sheetsSaveStatus.success && onRetrySave && (
              <button
                type="button"
                onClick={onRetrySave}
                className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-lg shadow-2xs transition-all flex items-center gap-1 shrink-0 self-start sm:self-auto cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Retry Saving</span>
              </button>
            )}
          </div>
        )}

        {/* Single-Row Audit Trail Entry Table */}
        <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
          <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
              <span>Latest Entry</span>
            </span>
            <span className="text-[11px] font-semibold text-slate-500">
              Most Recently Processed Row
            </span>
          </div>

          <div className="overflow-x-auto max-w-full">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead className="bg-emerald-900 text-emerald-100 font-bold uppercase tracking-wider text-[11px] border-b border-emerald-800">
                <tr>
                  <th className="py-2.5 px-3">Supplier Name</th>
                  <th className="py-2.5 px-3">Invoice Number</th>
                  <th className="py-2.5 px-3">Invoice Date</th>
                  <th className="py-2.5 px-3">PO Number</th>
                  <th className="py-2.5 px-3">Item Description</th>
                  <th className="py-2.5 px-3 text-center">Quantity</th>
                  <th className="py-2.5 px-3 text-right">Unit Price</th>
                  <th className="py-2.5 px-3 text-right">Invoice Total</th>
                  <th className="py-2.5 px-3">Due Date</th>
                  <th className="py-2.5 px-3">Payment Terms</th>
                  <th className="py-2.5 px-3 text-center">Validation Status</th>
                  <th className="py-2.5 px-3">Review Reason</th>
                  <th className="py-2.5 px-3">Original File Name</th>
                  <th className="py-2.5 px-3 text-center">Original File Link</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-800">
                {!isGoogleConnected ? (
                  <tr>
                    <td colSpan={14} className="py-12 px-4 text-center">
                      <div className="space-y-3 max-w-md mx-auto">
                        <div className="w-12 h-12 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-center mx-auto text-blue-700">
                          <FileSpreadsheet className="w-6 h-6" />
                        </div>
                        <h3 className="text-base font-bold text-slate-900">Connect Google Sheets to view processed invoices.</h3>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          Sign in with Google to load your Accounts Payable database and Requires Review queue.
                        </p>
                        {onSignIn && (
                          <div className="pt-1">
                            <button
                              type="button"
                              onClick={onSignIn}
                              disabled={isLoggingIn}
                              className="px-4 py-2 bg-blue-800 hover:bg-blue-900 text-white font-bold text-xs rounded-lg shadow-2xs transition-all inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
                            >
                              {isLoggingIn ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                              <span>Sign in with Google</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : !latestRecord ? (
                  <tr>
                    <td colSpan={14} className="py-12 px-4 text-center text-slate-500 font-medium text-xs">
                      No processed invoice records found.
                    </td>
                  </tr>
                ) : (() => {
                  const rec = latestRecord;
                  const itemDesc = (rec.lineItems && rec.lineItems.length > 0)
                    ? rec.lineItems.map(l => l.description).join('; ')
                    : (rec.itemDescription !== undefined && rec.itemDescription !== null ? String(rec.itemDescription) : '');

                  const qtyStr = (rec.lineItems && rec.lineItems.length > 0)
                    ? rec.lineItems.map(l => l.quantity).join('; ')
                    : (rec.quantity !== undefined && rec.quantity !== null ? String(rec.quantity) : '');

                  const unitPriceStr = (rec.lineItems && rec.lineItems.length > 0)
                    ? rec.lineItems.map(l => formatCurrency(l.unitPrice)).join('; ')
                    : (rec.unitPrice !== undefined && rec.unitPrice !== null && String(rec.unitPrice).trim() !== ''
                        ? (typeof rec.unitPrice === 'number'
                            ? formatCurrency(rec.unitPrice)
                            : (String(rec.unitPrice).startsWith('$')
                                ? String(rec.unitPrice)
                                : (!isNaN(parseFloat(String(rec.unitPrice)))
                                    ? formatCurrency(parseFloat(String(rec.unitPrice)))
                                    : String(rec.unitPrice))))
                        : '');

                  return (
                    <tr
                      key={rec.sheetRowNumber ? `sheet-row-${rec.sheetRowNumber}` : (rec.id || `rec-${rec.supplier}-${rec.invoiceNumber}`)}
                      className="bg-emerald-50/50 hover:bg-emerald-50/80 transition-colors font-medium"
                    >
                      {/* Supplier Name */}
                      <td className="py-3 px-3 font-bold text-slate-900 flex items-center gap-1.5">
                        <span>{renderCellText(rec.supplier === 'Unknown Supplier' ? '' : rec.supplier)}</span>
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase bg-emerald-700 text-white tracking-wider">
                          Latest
                        </span>
                      </td>

                      {/* Invoice Number */}
                      <td className="py-3 px-3 font-mono text-blue-900 font-bold">
                        {renderCellText(rec.invoiceNumber)}
                      </td>

                      {/* Invoice Date */}
                      <td className="py-3 px-3">
                        {renderCellText(rec.invoiceDate)}
                      </td>

                      {/* PO Number */}
                      <td className="py-3 px-3 font-mono">
                        {renderCellText(rec.poNumber)}
                      </td>

                      {/* Item Description */}
                      <td className="py-3 px-3 max-w-xs truncate text-slate-800 font-medium">
                        {renderCellText(itemDesc)}
                      </td>

                      {/* Quantity */}
                      <td className="py-3 px-3 text-center font-mono">
                        {renderCellText(qtyStr)}
                      </td>

                      {/* Unit Price */}
                      <td className="py-3 px-3 text-right font-mono">
                        {renderCellText(unitPriceStr)}
                      </td>

                      {/* Invoice Total */}
                      <td className="py-3 px-3 font-mono text-right font-bold text-slate-900">
                        {renderCellText(rec.invoiceTotal, { isCurrency: true })}
                      </td>

                      {/* Due Date */}
                      <td className="py-3 px-3">
                        {renderCellText(rec.dueDate)}
                      </td>

                      {/* Payment Terms */}
                      <td className="py-3 px-3 max-w-xs truncate text-slate-700">
                        {renderCellText(rec.paymentTerms)}
                      </td>

                      {/* Validation Status */}
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded text-[11px] font-extrabold ${
                            rec.status === 'Validated'
                              ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                              : (rec.status === 'Needs Correction' || rec.status === 'Requires Review')
                              ? 'bg-amber-100 text-amber-900 border border-amber-300'
                              : 'bg-rose-100 text-rose-900 border border-rose-300'
                          }`}
                        >
                          {rec.status === 'Needs Correction' ? 'Requires Review' : (rec.status || 'Validated')}
                        </span>
                      </td>

                      {/* Review Reason */}
                      <td className="py-3 px-3 max-w-xs truncate text-slate-700 font-normal">
                        {renderCellText(rec.reason, { isStatusReason: true, status: rec.status })}
                      </td>

                      {/* Original File Name */}
                      <td className="py-3 px-3 font-mono text-slate-600">
                        {renderCellText(rec.originalFileName)}
                      </td>

                      {/* Original File Link */}
                      <td className="py-3 px-3 text-center">
                        {rec.driveLink && rec.driveLink.startsWith('http') ? (
                          <a
                            href={rec.driveLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 font-bold underline flex items-center justify-center gap-1"
                          >
                            <span>Drive</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded text-[11px] italic font-semibold border border-amber-200">
                            Missing
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })()}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

