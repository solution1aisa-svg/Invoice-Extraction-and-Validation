import React, { useState, useEffect, useRef } from 'react';
import { Building2, ShieldCheck, LogOut, FileSpreadsheet, ExternalLink, Folder, RefreshCw, Check } from 'lucide-react';
import { User } from 'firebase/auth';
import { UserProfile } from '../types';

interface HeaderProps {
  user?: User | null;
  userProfile?: UserProfile;
  spreadsheetUrl?: string | null;
  folderUrl?: string | null;
  onSignIn?: () => void;
  onSignOut?: () => void;
  isLoggingIn?: boolean;
  onResync?: () => void;
  isResyncing?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  userProfile = { name: 'Madam Lim', role: 'Accounts Executive', initials: 'ML' },
  spreadsheetUrl,
  folderUrl,
  onSignIn,
  onSignOut,
  isLoggingIn = false,
  onResync,
  isResyncing = false,
}) => {
  const name = userProfile.name || 'Madam Lim';
  const role = userProfile.role || 'Accounts Executive';
  const initials = userProfile.initials || (
    name.trim().split(/\s+/).length >= 2
      ? (name.trim().split(/\s+/)[0][0] + name.trim().split(/\s+/).slice(-1)[0][0]).toUpperCase()
      : name.slice(0, 2).toUpperCase()
  );

  const [justSynced, setJustSynced] = useState(false);
  const prevResyncing = useRef(isResyncing);

  useEffect(() => {
    if (prevResyncing.current && !isResyncing) {
      setJustSynced(true);
      const timer = setTimeout(() => {
        setJustSynced(false);
      }, 1500);
      return () => clearTimeout(timer);
    }
    prevResyncing.current = isResyncing;
  }, [isResyncing]);

  return (
    <header className="bg-slate-900 text-white border-b border-slate-800 shadow-md">
      {/* Top SME Identification & Auth Bar */}
      <div className="bg-slate-950 px-4 py-2 border-b border-slate-800/80 text-xs text-slate-300 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-blue-400" />
          <span className="font-semibold text-white tracking-wide">Boon Huat Hardware & Supplies Pte Ltd</span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Re-sync Button (Compact Header Utility Style) */}
          <button
            type="button"
            onClick={onResync}
            disabled={isResyncing}
            className="px-2.5 py-1 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-bold text-[11px] inline-flex items-center gap-1.5 border border-slate-700 hover:border-slate-600 shadow-2xs transition-all cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed shrink-0"
            title="Re-sync system data with Google Sheets"
          >
            {isResyncing ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 text-slate-300 animate-spin" />
                <span>Syncing...</span>
              </>
            ) : justSynced ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-300">Synced</span>
              </>
            ) : (
              <>
                <RefreshCw className="w-3.5 h-3.5 text-slate-300" />
                <span>Re-sync</span>
              </>
            )}
          </button>

          {/* Google Workspace Connection Badge & Sign-in control */}
          {user ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 bg-emerald-950/80 px-3 py-1 rounded-full text-emerald-300 border border-emerald-700/80 text-xs font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>Google Workspace Connected: <strong>{user.email || user.displayName}</strong></span>
              </div>

              {spreadsheetUrl && (
                <a
                  href={spreadsheetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1 rounded-full bg-emerald-800 hover:bg-emerald-700 text-white font-bold text-[11px] inline-flex items-center gap-1 transition-all"
                  title="Open live AP Ledger Spreadsheet in Google Sheets"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-200" />
                  <span>Open Sheet</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}

              {folderUrl ? (
                <a
                  href={folderUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1 rounded-full bg-emerald-800 hover:bg-emerald-700 text-white font-bold text-[11px] inline-flex items-center gap-1 transition-all"
                  title="Open connected Google Drive Invoice Folder"
                >
                  <Folder className="w-3.5 h-3.5 text-emerald-200" />
                  <span>Open Invoice Folder</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  className="px-2.5 py-1 rounded-full bg-slate-800 text-slate-400 font-bold text-[11px] inline-flex items-center gap-1 border border-slate-700 cursor-not-allowed opacity-75"
                  title="Invoice folder not connected"
                >
                  <Folder className="w-3.5 h-3.5 text-slate-500" />
                  <span>Invoice folder not connected</span>
                </button>
              )}

              {onSignOut && (
                <button
                  type="button"
                  onClick={onSignOut}
                  className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                  title="Sign out of Google Workspace"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 bg-slate-800 px-2.5 py-1 rounded-full text-slate-400 border border-slate-700 text-xs">
                <span className="w-2 h-2 rounded-full bg-slate-500"></span>
                <span>Google Workspace Disconnected</span>
              </div>

              {onSignIn && (
                <button
                  type="button"
                  onClick={onSignIn}
                  disabled={isLoggingIn}
                  className="bg-white hover:bg-slate-100 text-slate-800 font-bold px-3 py-1 rounded-lg text-xs flex items-center gap-2 shadow-sm transition-all border border-slate-300 disabled:opacity-50"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 48 48">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                  </svg>
                  <span>{isLoggingIn ? 'Signing in...' : 'Sign in with Google'}</span>
                </button>
              )}
            </div>
          )}

          {/* Signed-in AP User Profile Badge */}
          <div className="flex items-center gap-2.5 bg-slate-900/90 px-3 py-1 rounded-full border border-slate-800 shadow-2xs">
            <div className="w-7 h-7 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0 ring-2 ring-blue-500/30">
              {initials}
            </div>
            <div className="flex flex-col text-left leading-tight">
              <span className="font-bold text-white text-xs">{name}</span>
              <span className="text-[10px] text-slate-400 font-medium">{role}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Header Banner */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-blue-400/10 text-blue-300 border border-blue-400/20 text-xs font-semibold uppercase tracking-wider mb-2">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
              Accounts Payable
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center gap-3">
              Invoice Extraction & Validation
            </h1>
            <p className="mt-1 text-sm text-slate-300">
              Upload, extract and validate supplier invoices with automated validation checks.
            </p>
          </div>
        </div>
      </div>
    </header>
  );
};

