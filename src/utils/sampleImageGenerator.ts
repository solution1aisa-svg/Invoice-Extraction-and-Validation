import { InvoiceData } from '../types';

/**
 * Renders an invoice document on an HTML Canvas and returns base64 PNG data.
 * Used to convert sample preset invoice data into a visual image for Gemini OCR extraction.
 */
export function generateInvoiceCanvasBase64(invoice: InvoiceData): string {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 1000;
  const ctx = canvas.getContext('2d');

  if (!ctx) return '';

  // Background
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Paper card
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.08)';
  ctx.shadowBlur = 10;
  ctx.fillRect(30, 30, 740, 940);
  ctx.shadowColor = 'transparent';

  // Outer border
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 2;
  ctx.strokeRect(30, 30, 740, 940);

  // Header banner
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(30, 30, 740, 70);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText(invoice.supplierName.value || '[SUPPLIER NAME MISSING]', 50, 72);

  ctx.font = '12px sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText('TAX INVOICE & DELIVERY ORDER • SINGAPORE', 50, 88);

  // Invoice Details Block (Top right)
  ctx.textAlign = 'right';
  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText(`INVOICE NO: ${invoice.invoiceNumber.value || '[MISSING]'}`, 740, 62);

  ctx.fillStyle = '#e2e8f0';
  ctx.font = '12px sans-serif';
  ctx.fillText(`Date: ${invoice.invoiceDate.value || '[MISSING]'}`, 740, 80);
  ctx.fillText(`PO Ref: ${invoice.poNumber.value || '[MISSING]'}`, 740, 94);

  ctx.textAlign = 'left';

  // Metadata Box
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(50, 120, 700, 60);
  ctx.strokeStyle = '#e2e8f0';
  ctx.strokeRect(50, 120, 700, 60);

  ctx.fillStyle = '#475569';
  ctx.font = '11px sans-serif';
  ctx.fillText('Billed To: Boon Huat Hardware & Supplies Pte Ltd (Tuas Depot)', 65, 142);

  const dueOrTerms = invoice.paymentDueDateOrTerms.value || (invoice.paymentDueDate?.value || invoice.paymentTerms?.value || '');
  ctx.fillStyle = dueOrTerms ? '#1e293b' : '#dc2626';
  ctx.font = 'bold 12px sans-serif';
  ctx.fillText(`Payment Due Date / Terms: ${dueOrTerms || '[NOT STATED / MISSING ON DOCUMENT]'}`, 65, 162);

  // Table Header
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(50, 200, 700, 30);
  ctx.fillStyle = '#1e293b';
  ctx.font = 'bold 12px sans-serif';
  ctx.fillText('Item Description', 65, 220);
  ctx.fillText('Qty', 460, 220);
  ctx.fillText('Unit Price', 540, 220);
  ctx.fillText('Line Total', 660, 220);

  let currentY = 250;
  invoice.lineItems.forEach((item, index) => {
    ctx.fillStyle = index % 2 === 0 ? '#ffffff' : '#f8fafc';
    ctx.fillRect(50, currentY - 18, 700, 32);

    ctx.fillStyle = '#0f172a';
    ctx.font = '12px sans-serif';
    ctx.fillText(`${index + 1}. ${item.description}`, 65, currentY);

    ctx.fillText(item.quantity.toString(), 460, currentY);
    ctx.fillText(`$${item.unitPrice.toFixed(2)}`, 540, currentY);

    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(`$${(item.quantity * item.unitPrice).toFixed(2)}`, 660, currentY);

    currentY += 36;
  });

  // Table Divider
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(50, currentY + 10);
  ctx.lineTo(750, currentY + 10);
  ctx.stroke();

  currentY += 30;

  // Totals Section
  const subtotal = invoice.lineItems.reduce((acc, i) => acc + i.quantity * i.unitPrice, 0);

  ctx.textAlign = 'right';
  ctx.font = '12px sans-serif';
  ctx.fillStyle = '#475569';
  ctx.fillText('Subtotal:', 630, currentY);
  ctx.fillText(`$${subtotal.toFixed(2)}`, 740, currentY);

  currentY += 24;
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText('INVOICE TOTAL:', 630, currentY);

  const totalVal = invoice.invoiceTotal.value;
  if (invoice.invoiceTotal.confidence === 'Low') {
    // If smudged/low confidence sample, draw smudged blur box
    ctx.fillStyle = '#fef2f2';
    ctx.fillRect(650, currentY - 20, 100, 30);
    ctx.fillStyle = '#991b1b';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(`$${totalVal?.toFixed(2) || '???'} (smudged)`, 740, currentY);
  } else {
    ctx.fillStyle = '#1d4ed8';
    ctx.fillText(totalVal !== null && totalVal !== undefined ? `$${Number(totalVal).toFixed(2)}` : '[MISSING]', 740, currentY);
  }

  // Footer Note
  ctx.textAlign = 'center';
  ctx.fillStyle = '#64748b';
  ctx.font = '10px sans-serif';
  ctx.fillText('Thank you for your business. Please make cheque payable to Boon Huat Hardware & Supplies Pte Ltd.', 400, 930);

  const dataUrl = canvas.toDataURL('image/png');
  return dataUrl.split(',')[1];
}
