import React, { useState } from 'react';
import {
  AlertTriangle,
  Edit3,
  XCircle,
  FileText,
  ExternalLink,
  Search,
  CheckCircle,
  Clock,
  ShieldAlert,
  ArrowRight,
  RefreshCw
} from 'lucide-react';
import { ReviewQueueItem } from '../types';
import { formatCurrency } from '../utils/validationEngine';
import { openContactProcurementEmail } from '../utils/procurementEmail';
import { GmailIcon } from './GmailIcon';

interface RequiresReviewQueueProps {
  queue: ReviewQueueItem[];
  onReviewAndEdit: (item: ReviewQueueItem) => void;
  onRejectItem: (item: ReviewQueueItem, note?: string) => void;
  isGoogleConnected?: boolean;
  onSignIn?: () => void;
  isLoggingIn?: boolean;
}

function getFormattedReason(reason: string, failedCheckTitle?: string): string {
  let cleaned = reason.replace(/^Reason:\s*/i, '').trim();

  // Strip duplicated check title prefix if reason repeats title (e.g., "Check 1: Field Completeness – Mandatory PO...")
  if (cleaned.includes('–')) {
    const parts = cleaned.split('–');
    if (parts.length > 1 && parts[0].toLowerCase().includes('check')) {
      cleaned = parts.slice(1).join('–').trim();
    }
  } else if (cleaned.includes(' - ')) {
    const parts = cleaned.split(' - ');
    if (parts.length > 1 && parts[0].toLowerCase().includes('check')) {
      cleaned = parts.slice(1).join(' - ').trim();
    }
  }

  // Remove duplicate Check title if prefix matches
  if (failedCheckTitle && cleaned.toLowerCase().startsWith(failedCheckTitle.toLowerCase())) {
    cleaned = cleaned.substring(failedCheckTitle.length).replace(/^[\s:–-]+/, '').trim();
  }

  return cleaned || reason;
}

export const RequiresReviewQueue: React.FC<RequiresReviewQueueProps> = ({
  queue,
  onReviewAndEdit,
  onRejectItem,
  isGoogleConnected = false,
  onSignIn,
  isLoggingIn = false,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRejectItem, setSelectedRejectItem] = useState<ReviewQueueItem | null>(null);
  const [rejectNote, setRejectNote] = useState('');

  const filteredQueue = queue.filter(item => {
    const term = searchTerm.toLowerCase();
    return (
      item.supplierName.toLowerCase().includes(term) ||
      item.invoiceNumber.toLowerCase().includes(term) ||
      item.poNumber.toLowerCase().includes(term) ||
      item.reason.toLowerCase().includes(term) ||
      item.failedCheckTitle.toLowerCase().includes(term)
    );
  });

  const totalValue = queue.reduce((sum, item) => sum + item.invoiceTotal, 0);

  const handleConfirmReject = () => {
    if (selectedRejectItem) {
      onRejectItem(selectedRejectItem, rejectNote);
      setSelectedRejectItem(null);
      setRejectNote('');
    }
  };

  return (
    <div className="space-y-4">
      {/* Metrics Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-3 shadow-2xs">
          <div className="p-2.5 rounded-xl border border-[#F3D48A]" style={{ backgroundColor: '#FFF8E8' }}>
            <AlertTriangle className="w-5 h-5" style={{ color: '#C98A1A' }} />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider" style={{ color: '#A86A00' }}>Awaiting Review</div>
            <div className="text-2xl font-black text-slate-900">{queue.length} Invoices</div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-3 shadow-2xs">
          <div className="p-2.5 bg-blue-50 rounded-xl text-blue-800 border border-blue-200">
            <ShieldAlert className="w-5 h-5 text-blue-700" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Stated Value</div>
            <div className="text-2xl font-black text-slate-900">{formatCurrency(totalValue)}</div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-2.5">
            <Clock className="w-5 h-5 text-slate-400" />
            <div>
              <div className="text-xs font-bold text-slate-700 uppercase tracking-wider">Audit Queue Policy</div>
              <div className="text-xs text-slate-500">Pending manual revalidation or rejection</div>
            </div>
          </div>
        </div>
      </div>

      {/* Control Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search supplier, invoice no, or PO..."
            className="w-full text-xs pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="text-xs text-slate-500 font-medium">
          Showing <strong className="text-slate-800">{filteredQueue.length}</strong> of <strong className="text-slate-800">{queue.length}</strong> flagged items
        </div>
      </div>

      {/* Review Queue Items List */}
      {!isGoogleConnected ? (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-8 text-center space-y-3">
          <div className="w-12 h-12 bg-blue-50 border border-blue-200 rounded-2xl flex items-center justify-center mx-auto text-blue-700">
            <AlertTriangle className="w-6 h-6 text-blue-700" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-slate-900">Connect Google Sheets to view processed invoices.</h3>
            <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
              Sign in with Google to load your Accounts Payable database and Requires Review queue.
            </p>
          </div>
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
      ) : queue.length === 0 ? (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-8 text-center space-y-2">
          <div className="w-12 h-12 bg-blue-50 border border-blue-200 rounded-2xl flex items-center justify-center mx-auto text-blue-700">
            <CheckCircle className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900">No invoices currently require review.</h3>
          <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
            Invoices that fail validation will automatically appear here for follow-up, correction and revalidation.
          </p>
        </div>
      ) : filteredQueue.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-500 text-xs">
          No items match your search filter "{searchTerm}".
        </div>
      ) : (
        <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-2xs">
          <div className="bg-slate-50 border-b border-slate-200 px-5 py-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider text-slate-900">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <span>Invoices Requiring Review & Correction ({filteredQueue.length})</span>
            </div>
            <span className="text-[11px] text-slate-500 font-medium">
              Click 'Review & Edit' to reopen Review & Validate screen
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[960px]">
              <thead className="bg-slate-100/90 text-slate-800 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200">
                <tr>
                  <th className="py-3 px-3.5 align-middle w-[18%]">Supplier & Status</th>
                  <th className="py-3 px-3.5 align-middle w-[13%]">Invoice Details</th>
                  <th className="py-3 px-3.5 align-middle w-[10%]">PO Number</th>
                  <th className="py-3 px-3.5 align-middle text-right w-[11%]">Invoice Total</th>
                  <th className="py-3 px-3.5 align-middle w-[28%]">Failed Check & Reason</th>
                  <th className="py-3 px-3.5 align-middle w-[12%]">File Ref & Added Date</th>
                  <th className="py-3 px-3.5 align-middle text-center w-[170px] min-w-[170px]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-800">
                {filteredQueue.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    {/* Supplier & Status */}
                    <td className="py-3 px-3.5 align-middle">
                      <div className="font-semibold text-slate-900 text-xs leading-tight">{item.supplierName}</div>
                      <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                        <span
                          className="px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border shrink-0"
                          style={{ backgroundColor: '#FFF8E8', borderColor: '#F3D48A', color: '#A86A00' }}
                        >
                          {item.reviewStatus}
                        </span>
                        <span className="font-mono text-[10px] text-slate-400 shrink-0">{item.id}</span>
                      </div>
                    </td>

                    {/* Invoice Details */}
                    <td className="py-3 px-3.5 align-middle">
                      <div className="font-mono font-semibold text-blue-900 text-xs whitespace-nowrap">{item.invoiceNumber || 'N/A'}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5 whitespace-nowrap">Date: {item.invoiceDate || 'N/A'}</div>
                    </td>

                    {/* PO Number */}
                    <td className="py-3 px-3.5 align-middle">
                      <span className={`font-mono text-[11px] font-semibold px-2 py-0.5 rounded-md inline-block whitespace-nowrap ${
                        item.poNumber.includes('Missing') || !item.poNumber
                          ? 'bg-slate-100 text-slate-600 border border-slate-200'
                          : 'text-slate-800 bg-slate-50 border border-slate-200'
                      }`}>
                        {item.poNumber || 'Missing'}
                      </span>
                    </td>

                    {/* Invoice Total */}
                    <td className="py-3 px-3.5 text-right align-middle font-mono font-black text-slate-900 text-xs whitespace-nowrap">
                      {formatCurrency(item.invoiceTotal)}
                    </td>

                    {/* Failed Check & Reason */}
                    <td className="py-3 px-3.5 align-middle">
                      <div className="p-2 bg-slate-50/80 rounded-lg border border-slate-200/80 space-y-0.5">
                        <div className="font-semibold text-blue-950 text-xs flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          <span>{item.failedCheckTitle}</span>
                        </div>
                        <p className="text-xs text-slate-700 leading-snug font-normal">
                          {getFormattedReason(item.reason, item.failedCheckTitle)}
                        </p>
                      </div>
                    </td>

                    {/* File Ref & Added Date */}
                    <td className="py-3 px-3.5 align-middle">
                      <div className="flex items-center gap-1 font-mono text-slate-700 text-xs truncate max-w-[140px]">
                        <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{item.originalFileName}</span>
                      </div>
                      {item.originalFileLink && (
                        <a
                          href={item.originalFileLink.startsWith('http') ? item.originalFileLink : `https://drive.google.com/file/d/audit_${encodeURIComponent(item.originalFileName)}/view`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-0.5 text-[11px] text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 underline whitespace-nowrap"
                        >
                          <span>View Original</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                      <div className="text-[10px] text-slate-400 mt-1 font-mono leading-tight">
                        {item.dateAndTImeAdded ? (
                          <>
                            <div>Added: {item.dateAndTImeAdded.split(' ')[0]}</div>
                            {item.dateAndTImeAdded.split(' ')[1] && <div>{item.dateAndTImeAdded.split(' ')[1]}</div>}
                          </>
                        ) : (
                          <div>Added: N/A</div>
                        )}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-3.5 align-middle text-center">
                      <div className="flex flex-col gap-1.5 items-center w-full min-w-[155px] max-w-[175px] mx-auto">
                        <button
                          type="button"
                          onClick={() => onReviewAndEdit(item)}
                          className="h-8.5 px-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg shadow-2xs transition-all flex items-center justify-center gap-1.5 w-full cursor-pointer active:scale-95 shrink-0"
                          title="Reopen Review & Validate screen with extracted details"
                        >
                          <Edit3 className="w-3.5 h-3.5 shrink-0" />
                          <span>Review & Edit</span>
                          <ArrowRight className="w-3 h-3 shrink-0" />
                        </button>

                        <button
                          type="button"
                          onClick={() => openContactProcurementEmail({
                            recordId: item.id,
                            supplierName: item.supplierName,
                            invoiceNumber: item.invoiceNumber,
                            poNumber: item.poNumber,
                            validationResult: item.validationResult,
                            failedCheckTitle: item.failedCheckTitle,
                            reason: item.reason,
                            originalFileLink: item.originalFileLink,
                            previousStatus: item.reviewStatus || 'Requires Review',
                            newStatus: item.reviewStatus || 'Requires Review',
                            performedBy: 'Madam Lim',
                            role: 'Accounts Executive'
                          })}
                          className="h-8.5 px-3 bg-white hover:bg-blue-50/60 text-slate-900 font-semibold text-xs rounded-lg border border-slate-200 hover:border-blue-900 transition-all flex items-center justify-center gap-2.5 w-full cursor-pointer active:scale-95 shadow-2xs shrink-0"
                          title="Open pre-drafted email to Procurement Department in Gmail"
                        >
                          <GmailIcon className="w-4 h-4 shrink-0" />
                          <span className="whitespace-nowrap">Contact Procurement</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setSelectedRejectItem(item)}
                          className="h-8.5 px-3 bg-white hover:bg-slate-50 text-slate-900 font-semibold text-xs rounded-lg border border-slate-200 hover:border-slate-300 transition-all flex items-center justify-center gap-1.5 w-full shadow-2xs cursor-pointer active:scale-95 shrink-0"
                        >
                          <XCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                          <span>Reject</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Reject Confirmation Modal */}
      {selectedRejectItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 animate-scaleIn">
            <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold">
                <XCircle className="w-4 h-4 text-rose-400" />
                <span>Confirm Invoice Rejection</span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRejectItem(null)}
                className="text-slate-400 hover:text-white p-1 rounded-md"
              >
                &times;
              </button>
            </div>

            <div className="p-5 space-y-4 font-sans text-xs">
              <p className="text-slate-800 font-medium leading-relaxed">
                Are you sure you want to reject invoice <strong className="text-slate-900">#{selectedRejectItem.invoiceNumber}</strong> from <strong className="text-slate-900">{selectedRejectItem.supplierName}</strong>?
              </p>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Optional Rejection Note for Accounts Payable Log:
                </label>
                <textarea
                  rows={3}
                  value={rejectNote}
                  onChange={(e) => setRejectNote(e.target.value)}
                  placeholder="e.g. Quantity on invoice does not match physical delivery. Supplier contacted."
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-slate-700 text-[11px]">
                <strong className="text-slate-900">Audit Policy:</strong> Removing from active Requires Review queue and marking status as <em>Rejected</em>.
              </div>
            </div>

            <div className="bg-slate-50 px-5 py-3.5 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setSelectedRejectItem(null)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReject}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <XCircle className="w-4 h-4" />
                <span>Confirm & Mark as Rejected</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

