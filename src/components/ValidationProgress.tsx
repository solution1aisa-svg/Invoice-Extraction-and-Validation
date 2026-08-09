import React from 'react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Ban,
  ShieldCheck,
  AlertTriangle,
  ArrowRight
} from 'lucide-react';
import { ValidationResult, CheckState, InvoiceData } from '../types';

interface ValidationProgressProps {
  validationResult: ValidationResult | null;
  isProcessing: boolean;
  invoice?: InvoiceData | null;
  onProceedToSolution2?: () => void;
  onRejectInvoice?: (note?: string) => void;
}

export const ValidationProgress: React.FC<ValidationProgressProps> = ({
  validationResult,
  isProcessing,
  invoice,
  onProceedToSolution2,
  onRejectInvoice,
}) => {
  const checks = [
    validationResult?.check1Completeness,
    validationResult?.check2Confidence,
    validationResult?.check3Arithmetic,
    validationResult?.check4Duplicate,
  ];

  const getBadgeStyle = (state: CheckState) => {
    switch (state) {
      case 'Passed':
        return {
          bg: 'bg-emerald-50 border-emerald-200 text-emerald-800',
          badgeBg: 'bg-emerald-600 text-white',
          icon: <CheckCircle2 className="w-5 h-5 text-emerald-600" />,
          label: 'Passed'
        };
      case 'Failed':
        return {
          bg: 'bg-rose-50 border-rose-300 text-rose-900',
          badgeBg: 'bg-rose-600 text-white',
          icon: <XCircle className="w-5 h-5 text-rose-600 animate-pulse" />,
          label: 'Failed'
        };
      case 'Not Run':
        return {
          bg: 'bg-slate-50 border-slate-200 text-slate-400',
          badgeBg: 'bg-slate-200 text-slate-600',
          icon: <Ban className="w-5 h-5 text-slate-300" />,
          label: 'Not Run'
        };
      case 'Not Started':
      default:
        return {
          bg: 'bg-slate-50 border-slate-200 text-slate-500',
          badgeBg: 'bg-slate-200 text-slate-600',
          icon: <Clock className="w-5 h-5 text-slate-400" />,
          label: 'Not Started'
        };
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-0">
      {/* Header */}
      <div className="bg-slate-50 border-b border-slate-200 px-5 py-3 flex items-center justify-between">
        <div>
          <span className="text-[10px] font-extrabold text-blue-700 uppercase tracking-wider bg-blue-100 px-2 py-0.5 rounded border border-blue-200">
            Validation Checks
          </span>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2 mt-0.5">
            <ShieldCheck className="w-4 h-4 text-blue-600" />
            Validation Results
          </h2>
        </div>

        {validationResult && (
          <div className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
            {validationResult.failedCheckIndex
              ? `Halted at Check ${validationResult.failedCheckIndex}`
              : 'All Checks Passed'}
          </div>
        )}
      </div>

      <div className="p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            {
              id: 1,
              name: 'Field Completeness',
              desc: 'Mandatory fields must be present and readable.',
              stepData: validationResult?.check1Completeness
            },
            {
              id: 2,
              name: 'Extraction Confidence',
              desc: 'High legibility score required across all fields.',
              stepData: validationResult?.check2Confidence
            },
            {
              id: 3,
              name: 'Arithmetic Validation',
              desc: 'Line items must reconcile with total.',
              stepData: validationResult?.check3Arithmetic
            },
            {
              id: 4,
              name: 'Duplicate Detection',
              desc: 'Cross-checks against central Google Sheets AP database.',
              stepData: validationResult?.check4Duplicate
            },
          ].map((item) => {
            const state: CheckState = isProcessing
              ? 'Not Started'
              : item.stepData?.state || 'Not Started';

            const style = getBadgeStyle(state);

            return (
              <div
                key={item.id}
                className={`p-3 rounded-xl border transition-all flex flex-col justify-between ${style.bg}`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 bg-white/90 px-1.5 py-0.5 rounded border border-slate-200">
                      Check {item.id}
                    </span>
                    <div className="flex items-center gap-1">
                      {style.icon}
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${style.badgeBg}`}>
                        {style.label}
                      </span>
                    </div>
                  </div>

                  <h3 className="text-xs font-bold text-slate-900 mb-0.5">{item.name}</h3>
                  <p className="text-[10px] text-slate-600 leading-tight mb-2">{item.desc}</p>

                  {/* Step Specific Explanation or Failure Details */}
                  {state === 'Failed' && item.stepData?.reason && (
                    <div className="p-2 rounded-lg bg-rose-100/90 border border-rose-200 text-rose-950 text-[10px] font-medium leading-normal flex items-start gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                      <span>{item.stepData.reason}</span>
                    </div>
                  )}

                  {state === 'Passed' && item.stepData?.details && (
                    <div className="p-1.5 rounded-lg bg-emerald-100/70 border border-emerald-200 text-emerald-900 text-[10px]">
                      {item.stepData.details}
                    </div>
                  )}

                  {state === 'Not Run' && (
                    <div className="p-1.5 rounded-lg bg-slate-100 text-slate-400 text-[10px] italic">
                      Skipped because Check {validationResult?.failedCheckIndex} failed.
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Action Row at the bottom of Validation Results */}
        {validationResult && !isProcessing && (
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end">
            {onProceedToSolution2 && (
              <button
                type="button"
                onClick={onProceedToSolution2}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
              >
                <span>Continue to Database</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
