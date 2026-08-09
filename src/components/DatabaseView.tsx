import React, { useState } from 'react';
import { FileSpreadsheet, AlertTriangle, Database, CheckCircle2 } from 'lucide-react';
import { InvoiceData, ValidationResult, ExistingSheetRecord, ReviewQueueItem } from '../types';
import { GoogleSheetsPreview } from './GoogleSheetsPreview';
import { RequiresReviewQueue } from './RequiresReviewQueue';

interface SheetsSaveStatus {
  success: boolean;
  isUpdate?: boolean;
  message: string;
  isSaving?: boolean;
}

interface DatabaseViewProps {
  currentInvoice: InvoiceData | null;
  validationResult: ValidationResult | null;
  hasProcessed: boolean;
  sheetRecords: ExistingSheetRecord[];
  requiresReviewQueue: ReviewQueueItem[];
  sheetsSaveStatus?: SheetsSaveStatus | null;
  onRetrySave?: () => void;
  driveLink?: string;
  spreadsheetUrl?: string | null;
  onProcessAnotherInvoice?: () => void;
  onReviewAndEditFromQueue: (item: ReviewQueueItem) => void;
  onRejectQueueItem: (item: ReviewQueueItem, note?: string) => void;
  defaultSubTab?: 'validated' | 'requires_review';
  isGoogleConnected?: boolean;
  onSignIn?: () => void;
  isLoggingIn?: boolean;
}

export const DatabaseView: React.FC<DatabaseViewProps> = ({
  currentInvoice,
  validationResult,
  hasProcessed,
  sheetRecords = [],
  requiresReviewQueue = [],
  sheetsSaveStatus,
  onRetrySave,
  driveLink,
  spreadsheetUrl,
  onProcessAnotherInvoice,
  onReviewAndEditFromQueue,
  onRejectQueueItem,
  defaultSubTab,
  isGoogleConnected = false,
  onSignIn,
  isLoggingIn = false,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'validated' | 'requires_review'>(
    defaultSubTab || (requiresReviewQueue.length > 0 && validationResult?.overallStatus === 'Requires Review' ? 'requires_review' : 'validated')
  );

  const validatedRecords = isGoogleConnected
    ? sheetRecords.filter(r => (r.status || '').trim().toLowerCase() === 'validated')
    : [];

  const validatedCount = validatedRecords.length;
  const reviewCount = isGoogleConnected ? requiresReviewQueue.length : 0;

  return (
    <div className="space-y-6">
      {/* Database Page Master Navigation Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-900 text-white rounded-xl shadow-xs">
            <Database className="w-6 h-6 text-blue-300" />
          </div>
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded border border-blue-200">
              Accounts Payable Database
            </span>
            <h1 className="text-xl font-bold text-slate-900 mt-0.5">
              Invoice Records
            </h1>
          </div>
        </div>

        {/* Sub-Tab Selector Buttons */}
        <div className="flex items-center bg-slate-100 p-1.5 rounded-xl border border-slate-200 self-start md:self-auto">
          <button
            type="button"
            onClick={() => setActiveSubTab('validated')}
            className={`px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2 transition-all cursor-pointer ${
              activeSubTab === 'validated'
                ? 'bg-emerald-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <CheckCircle2 className={`w-4 h-4 ${activeSubTab === 'validated' ? 'text-emerald-300' : 'text-slate-500'}`} />
            <span>Latest Entry</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('requires_review')}
            className={`px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2 transition-all cursor-pointer ${
              activeSubTab === 'requires_review'
                ? 'bg-blue-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <AlertTriangle className={`w-4 h-4 ${activeSubTab === 'requires_review' ? 'text-amber-400' : 'text-amber-500'}`} />
            <span>Requires Review Queue</span>
            {reviewCount > 0 && (
              <span className={`ml-1 px-2 py-0.5 rounded-full text-[10px] font-black ${
                activeSubTab === 'requires_review'
                  ? 'bg-amber-500 text-white'
                  : 'bg-[#FFF8E8] text-[#A86A00] border border-[#F3D48A]'
              }`}>
                {reviewCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Sub-Tab 1: Latest Audit Trail Entry (Google Sheets Preview) */}
      {activeSubTab === 'validated' && (
        <div className="space-y-4">
          <GoogleSheetsPreview
            currentInvoice={currentInvoice}
            validationResult={validationResult}
            hasProcessed={hasProcessed}
            sheetRecords={sheetRecords}
            sheetsSaveStatus={sheetsSaveStatus}
            onRetrySave={onRetrySave}
            driveLink={driveLink}
            spreadsheetUrl={spreadsheetUrl}
            onProcessAnotherInvoice={onProcessAnotherInvoice}
            isGoogleConnected={isGoogleConnected}
            onSignIn={onSignIn}
            isLoggingIn={isLoggingIn}
          />
        </div>
      )}

      {/* Sub-Tab 2: Requires Review Queue */}
      {activeSubTab === 'requires_review' && (
        <div className="space-y-4">
          <RequiresReviewQueue
            queue={requiresReviewQueue}
            onReviewAndEdit={onReviewAndEditFromQueue}
            onRejectItem={onRejectQueueItem}
            isGoogleConnected={isGoogleConnected}
            onSignIn={onSignIn}
            isLoggingIn={isLoggingIn}
          />
        </div>
      )}
    </div>
  );
};
