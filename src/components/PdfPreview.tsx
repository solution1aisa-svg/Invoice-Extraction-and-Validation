import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  AlertCircle,
  FileText
} from 'lucide-react';

// Configure pdfjs worker
try {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();
} catch {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
}

interface PdfPreviewProps {
  rawFile?: File;
  base64Data?: string;
  filePreviewUrl?: string;
  fileName: string;
}

export const PdfPreview: React.FC<PdfPreviewProps> = ({
  rawFile,
  base64Data,
  filePreviewUrl,
  fileName,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [objectUrl, setObjectUrl] = useState<string>('');
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pageNum, setPageNum] = useState<number>(1);
  const [numPages, setNumPages] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [renderError, setRenderError] = useState<boolean>(false);

  // Manage Local Object URL for "Open PDF in New Tab" and rendering
  useEffect(() => {
    let createdUrl = '';

    if (rawFile) {
      createdUrl = URL.createObjectURL(rawFile);
    } else if (filePreviewUrl && (filePreviewUrl.startsWith('blob:') || filePreviewUrl.startsWith('data:') || filePreviewUrl.startsWith('http://') || filePreviewUrl.startsWith('https://'))) {
      createdUrl = filePreviewUrl;
    } else if (base64Data) {
      const isPngOrJpg = base64Data.startsWith('iVBORw') || base64Data.startsWith('/9j/') || base64Data.startsWith('R0lG');
      createdUrl = isPngOrJpg ? `data:image/png;base64,${base64Data}` : `data:application/pdf;base64,${base64Data}`;
    }

    setObjectUrl(createdUrl);

    return () => {
      if (rawFile && createdUrl && createdUrl.startsWith('blob:')) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [rawFile, filePreviewUrl, base64Data]);

  // Load PDF document using PDF.js
  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setRenderError(false);
    setPdfDoc(null);
    setPageNum(1);
    setNumPages(0);

    async function loadPdfDocument() {
      try {
        let loadingTask: pdfjsLib.PDFDocumentLoadingTask;

        if (rawFile) {
          const arrayBuffer = await rawFile.arrayBuffer();
          loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
        } else if (base64Data) {
          const isPngOrJpg = base64Data.startsWith('iVBORw') || base64Data.startsWith('/9j/') || base64Data.startsWith('R0lG');
          if (isPngOrJpg) {
            throw new Error('Image base64 provided to PDF previewer');
          }
          const binaryString = atob(base64Data);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          loadingTask = pdfjsLib.getDocument({ data: bytes });
        } else if (filePreviewUrl && typeof filePreviewUrl === 'string' && filePreviewUrl.trim() !== '') {
          if (filePreviewUrl.startsWith('data:image/')) {
            throw new Error('Image data URL provided to PDF previewer');
          } else if (filePreviewUrl.startsWith('data:')) {
            const base64Index = filePreviewUrl.indexOf('base64,');
            if (base64Index !== -1) {
              const b64 = filePreviewUrl.slice(base64Index + 7);
              const binaryString = atob(b64);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              loadingTask = pdfjsLib.getDocument({ data: bytes });
            } else {
              loadingTask = pdfjsLib.getDocument({ url: filePreviewUrl });
            }
          } else if (
            filePreviewUrl.startsWith('http://') ||
            filePreviewUrl.startsWith('https://') ||
            filePreviewUrl.startsWith('blob:')
          ) {
            loadingTask = pdfjsLib.getDocument({ url: filePreviewUrl });
          } else {
            // Placeholder relative path like 'kim_seng_ks10510.pdf'
            throw new Error('Placeholder or non-network filePreviewUrl string');
          }
        } else {
          throw new Error('No valid PDF source found');
        }

        const doc = await loadingTask.promise;
        if (isMounted) {
          setPdfDoc(doc);
          setNumPages(doc.numPages);
          setPageNum(1);
          setIsLoading(false);
        }
      } catch (err: any) {
        if (isMounted) {
          setRenderError(true);
          setIsLoading(false);
        }
      }
    }

    loadPdfDocument();

    return () => {
      isMounted = false;
    };
  }, [rawFile, base64Data, filePreviewUrl]);

  // Render current page to canvas
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current || renderError) return;

    let isMounted = true;
    let currentRenderTask: pdfjsLib.RenderTask | null = null;

    async function renderPage() {
      try {
        const page = await pdfDoc.getPage(pageNum);
        if (!isMounted || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        if (!context) return;

        // Calculate suitable scale
        const initialViewport = page.getViewport({ scale: 1.0 });
        const targetWidth = Math.min(window.innerWidth - 80, 750);
        const scale = targetWidth / initialViewport.width;
        const viewport = page.getViewport({ scale: Math.max(scale, 1.2) });

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
        };

        currentRenderTask = page.render(renderContext);
        await currentRenderTask.promise;
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.error('Error rendering PDF page on canvas:', err);
          if (isMounted) {
            setRenderError(true);
          }
        }
      }
    }

    renderPage();

    return () => {
      isMounted = false;
      if (currentRenderTask) {
        currentRenderTask.cancel();
      }
    };
  }, [pdfDoc, pageNum, renderError]);

  const handleOpenNewTab = () => {
    if (!objectUrl) return;
    window.open(objectUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="w-full flex flex-col items-center">
      {/* Controls Bar: Multi-page navigation & Open PDF in New Tab */}
      <div className="w-full flex flex-wrap items-center justify-between gap-3 p-2.5 mb-3 bg-slate-200/70 rounded-lg border border-slate-300 text-xs text-slate-700">
        <div className="flex items-center gap-2 font-medium">
          <FileText className="w-4 h-4 text-blue-600" />
          <span className="font-semibold text-slate-900 truncate max-w-[200px] sm:max-w-[300px]">
            {fileName}
          </span>
          {numPages > 0 && (
            <span className="bg-slate-300/80 text-slate-800 px-2 py-0.5 rounded-full font-mono text-[11px]">
              {numPages} {numPages === 1 ? 'page' : 'pages'}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {/* Pagination Controls */}
          {numPages > 1 && !renderError && (
            <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-md px-2 py-1 shadow-2xs">
              <button
                type="button"
                onClick={() => setPageNum((p) => Math.max(1, p - 1))}
                disabled={pageNum <= 1}
                className="p-1 rounded hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                title="Previous Page"
              >
                <ChevronLeft className="w-4 h-4 text-slate-700" />
              </button>
              <span className="font-mono font-semibold text-slate-800 text-[11px] px-1">
                Page {pageNum} of {numPages}
              </span>
              <button
                type="button"
                onClick={() => setPageNum((p) => Math.min(numPages, p + 1))}
                disabled={pageNum >= numPages}
                className="p-1 rounded hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                title="Next Page"
              >
                <ChevronRight className="w-4 h-4 text-slate-700" />
              </button>
            </div>
          )}

          {/* Fallback / External View Button */}
          {objectUrl && (
            <button
              type="button"
              onClick={handleOpenNewTab}
              className="px-3 py-1 bg-white hover:bg-blue-50 border border-slate-300 text-blue-700 font-semibold rounded-md shadow-2xs transition-all flex items-center gap-1.5 text-xs"
            >
              <span>Open PDF in New Tab</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Main Canvas / Error Fallback Container */}
      <div className="w-full bg-slate-200/50 p-4 rounded-xl border border-slate-300 flex justify-center items-center min-h-[350px] overflow-auto">
        {isLoading ? (
          <div className="flex flex-col items-center gap-2 p-8 text-slate-500 text-xs">
            <div className="w-6 h-6 border-2 border-slate-400 border-t-amber-600 rounded-full animate-spin"></div>
            <span>Loading PDF document pages...</span>
          </div>
        ) : renderError ? (
          objectUrl && (objectUrl.startsWith('data:image/') || objectUrl.startsWith('blob:')) ? (
            <img
              src={objectUrl}
              alt={fileName}
              className="max-h-[580px] w-auto max-w-full object-contain rounded border border-slate-300 bg-white shadow-2xs"
            />
          ) : (
            <div className="flex flex-col items-center justify-center p-8 text-center bg-amber-50/80 rounded-xl border border-amber-200 max-w-md my-4">
              <AlertCircle className="w-8 h-8 text-amber-600 mb-2" />
              <h4 className="text-sm font-bold text-amber-900 mb-1">
                PDF preview is unavailable, but the document can still be processed.
              </h4>
              <p className="text-xs text-amber-800/90 mb-4">
                You can still click "Process Invoice" below to extract invoice details using OCR vision parsing.
              </p>
              {objectUrl && (objectUrl.startsWith('http://') || objectUrl.startsWith('https://') || objectUrl.startsWith('blob:') || objectUrl.startsWith('data:')) && (
                <button
                  type="button"
                  onClick={handleOpenNewTab}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-lg shadow-xs transition-all flex items-center gap-1.5"
                >
                  <span>Open Document in New Tab</span>
                  <ExternalLink className="w-4 h-4" />
                </button>
              )}
            </div>
          )
        ) : (
          <canvas
            ref={canvasRef}
            className="rounded-lg shadow-md border border-slate-300 bg-white max-w-full h-auto"
          />
        )}
      </div>
    </div>
  );
};
