import React, { useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  X,
  ShieldAlert,
  Info,
  FileText
} from 'lucide-react';
import { ValidationResult, InvoiceData } from '../types';

interface StatusBannerProps {
  validationResult: ValidationResult;
  invoice: InvoiceData;
  isEditing: boolean;
  onStartEditing: () => void;
  onRevalidate: () => void;
  onRejectInvoice: (note?: string) => void;
  onProceedToSolution2?: () => void;
  onProcessAnotherInvoice?: () => void;
}

export const StatusBanner: React.FC<StatusBannerProps> = ({
  validationResult,
  invoice,
  isEditing,
  onStartEditing,
  onRevalidate,
  onRejectInvoice,
  onProceedToSolution2,
  onProcessAnotherInvoice,
}) => {
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionNote, setRejectionNote] = useState('');

  const status = validationResult.overallStatus;

  const handleConfirmReject = () => {
    onRejectInvoice(rejectionNote);
    setShowRejectModal(false);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Top Banner Status Bar - Clean White Information Card */}
      <div className="px-6 py-4 bg-white border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="text-sm font-bold text-slate-800">Invoice Status:</div>
          {status === 'Validated' && (
            <span className="px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              Validated
            </span>
          )}
          {(status === 'Requires Review' || status === 'Needs Correction') && (
            <span className="px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              Requires Review
            </span>
          )}
          {status === 'Rejected' && (
            <span className="px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wider bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1.5">
              <XCircle className="w-4 h-4 text-rose-600" />
              Rejected
            </span>
          )}
        </div>
      </div>

      {/* Flag Reason Body */}
      {(status === 'Requires Review' || status === 'Needs Correction') && (
        <div className="p-5 bg-slate-50 border-b border-slate-200">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-amber-100 rounded-lg text-amber-800 shrink-0 mt-0.5 border border-amber-200">
              <ShieldAlert className="w-5 h-5 text-amber-700" />
            </div>
            <div className="flex-1">
              <div className="text-xs font-bold text-slate-700 mb-1">
                Reason:
              </div>
              <p className="text-sm font-semibold text-slate-900 leading-snug">
                {validationResult.primaryFailureReason || 'Validation check failed.'}
              </p>

              {/* Session File Reference Box */}
              <div className="mt-3 p-3 rounded-xl bg-white border border-slate-200 flex items-center gap-2 text-xs text-slate-700 font-medium shadow-2xs">
                <FileText className="w-4 h-4 text-slate-500 shrink-0" />
                <span>Original file retained in this app session for review.</span>
              </div>

              <div className="mt-3 pt-3 border-t border-slate-200 text-xs text-slate-600 flex items-center gap-1.5">
                <Info className="w-4 h-4 text-slate-500 shrink-0" />
                <span>
                  Review the highlighted field(s), make any necessary corrections, then click 'Save Corrections & Revalidate'. The system will rerun validation checks before updating the invoice status.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Validated Success Banner Body */}
      {status === 'Validated' && (
        <div className="p-5 bg-slate-50 border-b border-slate-200">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 rounded-lg text-emerald-800 shrink-0 border border-emerald-200">
                <CheckCircle2 className="w-5 h-5 text-emerald-700" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-700 mb-0.5">
                  Reason:
                </div>
                <p className="text-sm font-bold text-slate-900">
                  All validation checks passed.
                </p>
              </div>
            </div>
            <div className="text-xs font-mono text-slate-700 bg-white px-3 py-1 rounded-lg border border-slate-200">
              File Ref: {invoice.fileName}
            </div>
          </div>
        </div>
      )}

      {/* Rejected Banner Body */}
      {status === 'Rejected' && (
        <div className="p-5 bg-slate-50 border-b border-slate-200">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-rose-100 rounded-lg text-rose-800 shrink-0 mt-0.5 border border-rose-200">
              <XCircle className="w-5 h-5 text-rose-700" />
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-0.5">
                Invoice Rejected
              </div>
              <p className="text-sm font-bold text-slate-900 mb-1">
                "This invoice has been rejected. Follow-up with the supplier may be required."
              </p>
              {invoice.reviewNotes && (
                <div className="text-xs text-slate-800 bg-white p-2.5 rounded-lg border border-slate-200 font-mono mt-2">
                  <strong>Rejection Note:</strong> {invoice.reviewNotes}
                </div>
              )}
              <div className="text-[11px] text-slate-500 mt-2">
                Note: Original invoice document and extracted fields remain retained in this app session for audit.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rejection Confirmation Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 animate-scaleIn">
            <div className="bg-rose-900 text-white px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold">
                <XCircle className="w-4 h-4 text-rose-300" />
                <span>Confirm Invoice Rejection</span>
              </div>
              <button
                type="button"
                onClick={() => setShowRejectModal(false)}
                className="text-rose-200 hover:text-white p-1 rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 font-sans text-xs">
              <p className="text-slate-800 font-medium leading-relaxed">
                Are you sure you want to reject invoice <strong className="text-slate-900">#{invoice.invoiceNumber.value || 'N/A'}</strong> from <strong className="text-slate-900">{invoice.supplierName.value || 'Supplier'}</strong>?
              </p>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Optional Rejection Note for Accounts Payable Log:
                </label>
                <textarea
                  rows={3}
                  value={rejectionNote}
                  onChange={(e) => setRejectionNote(e.target.value)}
                  placeholder="e.g. Quantity on invoice does not match physical delivery. Supplier contacted."
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-hidden"
                />
              </div>

              <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-amber-900 text-[11px]">
                <strong>Audit Policy:</strong> The original file is retained in this app session for review, and status will be recorded as <em>Rejected</em> in Google Sheets.
              </div>
            </div>

            <div className="bg-slate-50 px-5 py-3.5 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowRejectModal(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReject}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md flex items-center gap-1.5"
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
