import React, { useState, useRef } from 'react';
import {
  Upload,
  FileText,
  Image as ImageIcon,
  Play,
  RotateCcw,
  Eye,
  Plus
} from 'lucide-react';
import { InvoiceData } from '../types';
import { PdfPreview } from './PdfPreview';

interface InvoiceUploadProps {
  currentInvoice: InvoiceData | null;
  uploadedFileName: string | null;
  onFileUpload: (file: File) => void;
  onProcessInvoice: () => void;
  onClearInvoice: () => void;
  isProcessing: boolean;
  hasProcessed: boolean;
}

export const InvoiceUpload: React.FC<InvoiceUploadProps> = ({
  currentInvoice,
  uploadedFileName,
  onFileUpload,
  onProcessInvoice,
  onClearInvoice,
  isProcessing,
  hasProcessed,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (validateFileType(file)) {
        onFileUpload(file);
      } else {
        alert('Please upload a PDF, JPEG, JPG, or PNG file.');
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      if (validateFileType(file)) {
        onFileUpload(file);
      } else {
        alert('Please upload a PDF, JPEG, JPG, or PNG file.');
      }
    }
  };

  const validateFileType = (file: File): boolean => {
    const validTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    const validExts = ['.pdf', '.jpeg', '.jpg', '.png'];
    const nameLower = file.name.toLowerCase();
    return validTypes.includes(file.type) || validExts.some(ext => nameLower.endsWith(ext));
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Card Header */}
      <div className="bg-slate-50 border-b border-slate-200 px-5 py-3.5 flex items-center justify-between">
        <div>
          <span className="text-[11px] font-extrabold text-blue-700 uppercase tracking-wider bg-blue-100 px-2 py-0.5 rounded border border-blue-200">
            Upload Invoice
          </span>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2 mt-1">
            <Upload className="w-4 h-4 text-blue-600" />
            Upload Supplier Invoice
          </h2>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Drag & Drop File Upload Area */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
            isDragging
              ? 'border-amber-500 bg-amber-50/80 scale-[0.99]'
              : 'border-slate-300 bg-slate-50/60 hover:bg-slate-100/60 hover:border-slate-400'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpeg,.jpg,.png"
            onChange={handleFileChange}
            className="hidden"
          />
          <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 mx-auto flex items-center justify-center mb-2">
            <Upload className="w-5 h-5" />
          </div>
          <h3 className="text-xs font-bold text-slate-900">
            Click to select invoice file or drag & drop here
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Supports PDF, JPEG, JPG, or PNG paper scans or digital copies
          </p>
        </div>

        {/* Selected File Details & Small Document Preview */}
        {currentInvoice && (
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/80 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                  {currentInvoice.fileType === 'pdf' ? (
                    <FileText className="w-4 h-4" />
                  ) : (
                    <ImageIcon className="w-4 h-4" />
                  )}
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                    <span className="text-slate-500 font-semibold">Uploaded File:</span>
                    <span className="text-blue-700 font-mono text-xs bg-blue-50 px-2 py-0.5 rounded border border-blue-200 font-bold">
                      {currentInvoice.fileName}
                    </span>
                    <span className="text-[11px] text-slate-400">({currentInvoice.fileSize || '380 KB'})</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons: Process Invoice & Clear */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClearInvoice}
                  disabled={isProcessing}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-200/80 transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                  <span>Clear</span>
                </button>

                <button
                  type="button"
                  onClick={onProcessInvoice}
                  disabled={isProcessing}
                  className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 active:scale-95 shadow-xs transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  {isProcessing ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      <span>Extracting & Validating...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-white" />
                      <span>Process Invoice</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Document Visual Preview Box */}
            <div className="border border-slate-200 rounded-xl bg-white p-4 shadow-2xs">
              <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                <span className="flex items-center gap-1.5 font-bold text-slate-800">
                  <Eye className="w-4 h-4 text-blue-600" />
                  Invoice Preview ({currentInvoice.fileType.toUpperCase()})
                </span>
              </div>

              <div className="bg-slate-100 p-3 rounded-lg border border-slate-200 min-h-[480px] max-h-[650px] overflow-y-auto flex justify-center items-center">
                {currentInvoice.fileType === 'pdf' || currentInvoice.mimeType === 'application/pdf' ? (
                  <PdfPreview
                    rawFile={currentInvoice.rawFile}
                    base64Data={currentInvoice.base64Data}
                    filePreviewUrl={currentInvoice.filePreviewUrl}
                    fileName={currentInvoice.fileName}
                  />
                ) : (
                  <img
                    src={currentInvoice.filePreviewUrl || (currentInvoice.base64Data ? `data:${currentInvoice.mimeType || 'image/png'};base64,${currentInvoice.base64Data}` : '')}
                    alt={`Document Preview - ${currentInvoice.fileName}`}
                    className="max-h-[580px] w-auto max-w-full object-contain rounded border border-slate-300 bg-white shadow-2xs"
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

