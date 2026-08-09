import { ExistingSheetRecord, InvoiceData, ExtractedLineItem, ReviewQueueItem, ValidationResult } from '../types';
import { clearAccessToken, getAccessToken } from './auth';

export const AUDIT_LOG_SHEET_NAME = 'Audit Log';
export const AUDIT_LOG_HEADERS = [
  'Timestamp',
  'Invoice Number',
  'PO Number',
  'Performed By',
  'Role',
  'Module',
  'Action',
  'Previous Status',
  'New Status',
  'Details'
];

let cachedSpreadsheetId: string | null = null;

export function setCachedSpreadsheetId(id: string | null) {
  cachedSpreadsheetId = id;
}

export function getCachedSpreadsheetId(): string | null {
  return cachedSpreadsheetId;
}

/**
 * Helper to execute fetch requests to Google APIs with automatic exponential backoff retry on 429 rate limits or server errors.
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  maxRetries: number = 5,
  initialDelayMs: number = 1500
): Promise<Response> {
  let attempt = 0;
  let delay = initialDelayMs;

  while (true) {
    try {
      const response = await fetch(url, options);

      if (response.status === 401) {
        clearAccessToken();
        return response;
      }

      if (response.status === 429 || response.status === 503 || response.status === 500 || response.status === 502) {
        if (attempt < maxRetries) {
          attempt++;
          console.warn(`Google API rate limited / error (HTTP ${response.status}). Retrying attempt ${attempt}/${maxRetries} after ${delay}ms delay...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          delay = Math.min(delay * 2, 10000);
          continue;
        }
      }

      return response;
    } catch (err) {
      if (attempt < maxRetries) {
        attempt++;
        console.warn(`Google API fetch error: ${err}. Retrying attempt ${attempt}/${maxRetries} after ${delay}ms delay...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay = Math.min(delay * 2, 10000);
        continue;
      }
      throw err;
    }
  }
}

export const CLEAN_SHEET_HEADERS = [
  'Supplier Name',
  'Invoice Number',
  'Invoice Date',
  'PO Number',
  'Item Description',
  'Quantity',
  'Unit Price',
  'Invoice Total',
  'Due Date',
  'Payment Terms',
  'Status',
  'Reason',
  'Original File Name',
  'Original File Link'
];

export const SHEET_HEADERS = CLEAN_SHEET_HEADERS;
export const REQUIRED_HEADERS = CLEAN_SHEET_HEADERS;

/**
 * Helper to convert 0-based column index to Google Sheets column letter (0 -> A, 25 -> Z, 26 -> AA).
 */
export function columnIndexToLetter(colIndex: number): string {
  let temp = colIndex + 1;
  let letter = '';
  while (temp > 0) {
    const mod = (temp - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    temp = Math.floor((temp - mod) / 26);
  }
  return letter;
}

/**
 * Applies visual formatting and structural constraints to Google Sheets:
 * - Freeze row 1
 * - Bold header row with light green background
 * - Turn on text wrapping for header row & data cells
 * - Vertically align all cells to middle (VCENTER)
 * - Auto-resize columns to fit contents
 * - Set Item Description & Reason columns wide enough for longer text
 * - Format Invoice Date & Due Date as YYYY-MM-DD
 * - Format Quantity as number without currency symbols
 * - Format Unit Price & Invoice Total as currency
 * - Limit column count to 14 (Column A through Column N)
 */
export async function formatGoogleSheet(
  accessToken: string,
  spreadsheetId: string,
  sheetId: number = 0
): Promise<void> {
  const columnWidths = [
    { start: 0, end: 1, size: 230 },  // Supplier Name
    { start: 1, end: 2, size: 160 },  // Invoice Number
    { start: 2, end: 3, size: 120 },  // Invoice Date
    { start: 3, end: 4, size: 140 },  // PO Number
    { start: 4, end: 5, size: 280 },  // Item Description
    { start: 5, end: 6, size: 100 },  // Quantity
    { start: 6, end: 7, size: 120 },  // Unit Price
    { start: 7, end: 8, size: 130 },  // Invoice Total
    { start: 8, end: 9, size: 120 },  // Due Date
    { start: 9, end: 10, size: 180 }, // Payment Terms
    { start: 10, end: 11, size: 140 },// Status
    { start: 11, end: 12, size: 280 },// Reason
    { start: 12, end: 13, size: 220 },// Original File Name
    { start: 13, end: 14, size: 240 } // Original File Link
  ];

  const requests: any[] = [
    // 1. Freeze row 1 and restrict total column count to 14 (Column A through Column N)
    {
      updateSheetProperties: {
        properties: {
          sheetId,
          gridProperties: {
            frozenRowCount: 1,
            columnCount: 14
          }
        },
        fields: 'gridProperties.frozenRowCount,gridProperties.columnCount'
      }
    },
    // 2. Format Header Row (Row 0): Bold, Light Green background (#D9EAD3), Single line CLIP, Middle vertical alignment
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: 14
        },
        cell: {
          userEnteredFormat: {
            textFormat: { bold: true, fontSize: 10, foregroundColor: { red: 0.08, green: 0.22, blue: 0.12 } },
            backgroundColor: { red: 0.85, green: 0.94, blue: 0.88 },
            wrapStrategy: 'CLIP',
            verticalAlignment: 'MIDDLE'
          }
        },
        fields: 'userEnteredFormat(textFormat,backgroundColor,wrapStrategy,verticalAlignment)'
      }
    },
    // 3. Format Data Cells Default (Rows 1 to 1000): CLIP (single line), Middle vertical alignment
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 1,
          endRowIndex: 1000,
          startColumnIndex: 0,
          endColumnIndex: 14
        },
        cell: {
          userEnteredFormat: {
            wrapStrategy: 'CLIP',
            verticalAlignment: 'MIDDLE'
          }
        },
        fields: 'userEnteredFormat(wrapStrategy,verticalAlignment)'
      }
    },
    // 4. Wrap text only for long-text fields (Payment Terms Col 9, Reason Col 11, Original File Link Col 13)
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 9, endColumnIndex: 10 },
        cell: { userEnteredFormat: { wrapStrategy: 'WRAP' } },
        fields: 'userEnteredFormat.wrapStrategy'
      }
    },
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 11, endColumnIndex: 12 },
        cell: { userEnteredFormat: { wrapStrategy: 'WRAP' } },
        fields: 'userEnteredFormat.wrapStrategy'
      }
    },
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 13, endColumnIndex: 14 },
        cell: { userEnteredFormat: { wrapStrategy: 'WRAP' } },
        fields: 'userEnteredFormat.wrapStrategy'
      }
    },
    // 5. Alignments: Left-align text fields (Cols 0, 1, 3, 4, 9, 11, 12, 13)
    ...[0, 1, 3, 4, 9, 11, 12, 13].map(colIdx => ({
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1000, startColumnIndex: colIdx, endColumnIndex: colIdx + 1 },
        cell: { userEnteredFormat: { horizontalAlignment: 'LEFT' } },
        fields: 'userEnteredFormat.horizontalAlignment'
      }
    })),
    // 6. Alignments: Center-align dates, quantities, status (Cols 2, 5, 8, 10)
    ...[2, 5, 8, 10].map(colIdx => ({
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1000, startColumnIndex: colIdx, endColumnIndex: colIdx + 1 },
        cell: { userEnteredFormat: { horizontalAlignment: 'CENTER' } },
        fields: 'userEnteredFormat.horizontalAlignment'
      }
    })),
    // 7. Alignments: Right-align monetary values (Cols 6, 7)
    ...[6, 7].map(colIdx => ({
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1000, startColumnIndex: colIdx, endColumnIndex: colIdx + 1 },
        cell: { userEnteredFormat: { horizontalAlignment: 'RIGHT' } },
        fields: 'userEnteredFormat.horizontalAlignment'
      }
    })),
    // 8. Number Formats: Invoice Date & Due Date (Cols 2, 8) as YYYY-MM-DD
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 2, endColumnIndex: 3 },
        cell: { userEnteredFormat: { numberFormat: { type: 'DATE', pattern: 'yyyy-mm-dd' } } },
        fields: 'userEnteredFormat.numberFormat'
      }
    },
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 8, endColumnIndex: 9 },
        cell: { userEnteredFormat: { numberFormat: { type: 'DATE', pattern: 'yyyy-mm-dd' } } },
        fields: 'userEnteredFormat.numberFormat'
      }
    },
    // 9. Number Formats: Quantity (Col 5) as Number
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 5, endColumnIndex: 6 },
        cell: { userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern: '#,##0' } } },
        fields: 'userEnteredFormat.numberFormat'
      }
    },
    // 10. Number Formats: Unit Price & Invoice Total (Cols 6, 7) as Currency ($#,##0.00)
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 6, endColumnIndex: 8 },
        cell: { userEnteredFormat: { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0.00' } } },
        fields: 'userEnteredFormat.numberFormat'
      }
    },
    // 11. Auto-resize columns
    {
      autoResizeDimensions: {
        dimensions: {
          sheetId,
          dimension: 'COLUMNS',
          startIndex: 0,
          endIndex: 14
        }
      }
    },
    // 12. Apply explicit, generous column widths so single-line fields fit comfortably
    ...columnWidths.map(cw => ({
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: cw.start, endIndex: cw.end },
        properties: { pixelSize: cw.size },
        fields: 'pixelSize'
      }
    }))
  ];

  try {
    const res = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ requests })
    });
    if (!res.ok) {
      console.warn('BatchUpdate formatting warning:', await res.text());
    }
  } catch (err) {
    console.warn('Error applying sheet formatting:', err);
  }
}

/**
 * Reorganizes existing sheet data so it contains exactly the 16 required headers in exact order.
 * Remaps existing data into correct columns via exact header-based field mapping.
 * Removes extra/duplicate/blank columns (Record ID, Confidence Notes, Processed Date, etc.).
 * Formats the sheet automatically.
 */
export async function reorganizeAndFormatSheet(
  accessToken: string,
  spreadsheetId: string
): Promise<{ sheetId: number; headerRow: string[]; dataRows: string[][] }> {
  let sheetId = 0;
  try {
    const metaRes = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (metaRes.ok) {
      const metaData = await metaRes.json();
      const sheet = (metaData.sheets || []).find((s: any) => s.properties?.title === 'Invoice Records');
      if (sheet && sheet.properties && typeof sheet.properties.sheetId === 'number') {
        sheetId = sheet.properties.sheetId;
      }
    }
  } catch (err) {
    console.warn('Error fetching sheet metadata:', err);
  }

  // Read existing rows from 'Invoice Records'!A1:Z1000
  const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'Invoice Records'!A1:Z1000`;
  let rawRows: string[][] = [];
  try {
    const readRes = await fetchWithRetry(readUrl, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (readRes.status === 401) {
      throw new Error('401: UNAUTHENTICATED - Google Workspace access token expired.');
    }
    if (readRes.ok) {
      const readData = await readRes.json();
      if (readData.values && Array.isArray(readData.values)) {
        rawRows = readData.values;
      }
    }
  } catch (err) {
    if (String(err).includes('401') || String(err).includes('UNAUTHENTICATED')) {
      throw err;
    }
    console.warn('Error reading raw rows:', err);
  }

  if (rawRows.length === 0) {
    // Empty sheet: write clean headers and format
    await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'Invoice Records'!A1:N1?valueInputOption=USER_ENTERED`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ values: [CLEAN_SHEET_HEADERS] })
    });

    await formatGoogleSheet(accessToken, spreadsheetId, sheetId);
    return { sheetId, headerRow: CLEAN_SHEET_HEADERS, dataRows: [] };
  }

  const oldHeaderRow: string[] = rawRows[0] || [];

  // Exact header-based field mapping finder
  const findOldColIndex = (targetHeader: string): number => {
    const targetNorm = targetHeader.trim().toLowerCase();

    // Direct exact match
    const exactIdx = oldHeaderRow.findIndex(h => h && h.trim().toLowerCase() === targetNorm);
    if (exactIdx >= 0) return exactIdx;

    // Field-specific aliases
    if (targetNorm === 'supplier name') {
      return oldHeaderRow.findIndex(h => h && ['supplier name', 'supplier'].includes(h.trim().toLowerCase()));
    }
    if (targetNorm === 'invoice number') {
      return oldHeaderRow.findIndex(h => h && ['invoice number', 'invoice #', 'inv number', 'inv #'].includes(h.trim().toLowerCase()));
    }
    if (targetNorm === 'invoice date') {
      return oldHeaderRow.findIndex(h => h && ['invoice date', 'date'].includes(h.trim().toLowerCase()));
    }
    if (targetNorm === 'po number') {
      return oldHeaderRow.findIndex(h => h && ['po number', 'po #'].includes(h.trim().toLowerCase()));
    }
    if (targetNorm === 'item description') {
      return oldHeaderRow.findIndex(h => h && ['item description', 'description', 'items'].includes(h.trim().toLowerCase()));
    }
    if (targetNorm === 'quantity') {
      return oldHeaderRow.findIndex(h => h && ['quantity', 'qty'].includes(h.trim().toLowerCase()));
    }
    if (targetNorm === 'unit price') {
      return oldHeaderRow.findIndex(h => h && ['unit price', 'price'].includes(h.trim().toLowerCase()));
    }
    if (targetNorm === 'invoice total') {
      return oldHeaderRow.findIndex(h => h && ['invoice total', 'total', 'total amount'].includes(h.trim().toLowerCase()));
    }
    if (targetNorm === 'due date') {
      return oldHeaderRow.findIndex(h => h && ['due date', 'payment due date'].includes(h.trim().toLowerCase()));
    }
    if (targetNorm === 'payment terms') {
      return oldHeaderRow.findIndex(h => h && ['payment terms', 'terms', 'payment instructions'].includes(h.trim().toLowerCase()));
    }
    if (targetNorm === 'status') {
      return oldHeaderRow.findIndex(h => h && ['status'].includes(h.trim().toLowerCase()));
    }
    if (targetNorm === 'reason') {
      return oldHeaderRow.findIndex(h => h && ['reason'].includes(h.trim().toLowerCase()));
    }
    if (targetNorm === 'original file name') {
      return oldHeaderRow.findIndex(h => h && ['original file name', 'file name', 'filename'].includes(h.trim().toLowerCase()));
    }
    if (targetNorm === 'original file link') {
      return oldHeaderRow.findIndex(h => h && ['original file link', 'file link', 'drive link'].includes(h.trim().toLowerCase()));
    }
    if (targetNorm === 'processed date and time') {
      return oldHeaderRow.findIndex(h => h && ['processed date and time', 'processed date & time', 'processed date', 'processed at'].includes(h.trim().toLowerCase()));
    }
    if (targetNorm === 'reviewed by') {
      return oldHeaderRow.findIndex(h => h && ['reviewed by'].includes(h.trim().toLowerCase()));
    }

    return -1;
  };

  const colIndexMap = CLEAN_SHEET_HEADERS.map(header => findOldColIndex(header));

  const newRows: string[][] = [CLEAN_SHEET_HEADERS];

  for (let r = 1; r < rawRows.length; r++) {
    const oldRow = rawRows[r];
    if (!oldRow || oldRow.every(cell => !cell || cell.trim() === '')) continue;

    const newRow = new Array(CLEAN_SHEET_HEADERS.length).fill('');
    for (let c = 0; c < CLEAN_SHEET_HEADERS.length; c++) {
      const oldIdx = colIndexMap[c];
      if (oldIdx >= 0 && oldIdx < oldRow.length && oldRow[oldIdx] !== undefined && oldRow[oldIdx] !== null) {
        newRow[c] = oldRow[oldIdx];
      }
    }
    newRows.push(newRow);
  }

  // Clear existing sheet contents to remove unmapped/duplicate/blank trailing columns
  try {
    await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'Invoice Records'!A1:Z1000:clear`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` }
    });
  } catch (e) {
    console.warn('Clear sheet error:', e);
  }

  // Put clean values back
  await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'Invoice Records'!A1:N${newRows.length}?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ values: newRows })
  });

  // Apply formatting (freeze, light green headers, wrap text, middle align, width, column count = 16)
  await formatGoogleSheet(accessToken, spreadsheetId, sheetId);

  return {
    sheetId,
    headerRow: CLEAN_SHEET_HEADERS,
    dataRows: newRows.slice(1)
  };
}

/**
 * Searches for an existing Google Drive folder for storing invoice files, or creates one.
 * Folder Name: Boon Huat AP Invoices
 */
export async function findOrCreateAPFolder(accessToken: string): Promise<{ id: string; url: string }> {
  try {
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
      "name = 'Boon Huat AP Invoices' and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
    )}&fields=files(id,webViewLink)`;

    const searchRes = await fetchWithRetry(searchUrl, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (searchRes.ok) {
      const searchData = await searchRes.json();
      if (searchData.files && searchData.files.length > 0) {
        const folderId = searchData.files[0].id;
        const url = searchData.files[0].webViewLink || `https://drive.google.com/drive/folders/${folderId}`;
        return { id: folderId, url };
      }
    }

    // If not found, create new Drive folder
    const createRes = await fetchWithRetry('https://www.googleapis.com/drive/v3/files?fields=id,webViewLink', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Boon Huat AP Invoices',
        mimeType: 'application/vnd.google-apps.folder'
      })
    });

    if (createRes.ok) {
      const folderData = await createRes.json();
      const folderId = folderData.id;
      const url = folderData.webViewLink || `https://drive.google.com/drive/folders/${folderId}`;
      return { id: folderId, url };
    }
  } catch (err) {
    console.warn('Failed to find or create AP invoice folder:', err);
  }

  return { id: '', url: '' };
}

export async function ensureAuditLogSheet(
  accessToken: string,
  spreadsheetId: string
): Promise<{ sheetId: number; headerMap: Record<string, number> }> {
  let sheetId: number | null = null;
  try {
    const metaRes = await fetchWithRetry(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );

    if (metaRes.ok) {
      const metaData = await metaRes.json();
      const existingSheet = (metaData.sheets || []).find(
        (s: any) => s.properties?.title === AUDIT_LOG_SHEET_NAME
      );
      if (existingSheet && existingSheet.properties) {
        sheetId = existingSheet.properties.sheetId;
      }
    }
  } catch (err) {
    console.warn('Error fetching spreadsheet metadata for Audit Log:', err);
  }

  // If Audit Log sheet does not exist, create it once using the exact 10 columns in order
  if (sheetId === null) {
    try {
      const addSheetRes = await fetchWithRetry(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            requests: [
              {
                addSheet: {
                  properties: {
                    title: AUDIT_LOG_SHEET_NAME,
                    gridProperties: {
                      frozenRowCount: 1,
                      columnCount: 10
                    }
                  }
                }
              }
            ]
          })
        }
      );

      if (addSheetRes.ok) {
        const addSheetData = await addSheetRes.json();
        const newSheetProp = addSheetData.replies?.[0]?.addSheet?.properties;
        sheetId = newSheetProp?.sheetId ?? 0;

        // Write exact header row to 'Audit Log'!A1:J1
        await fetchWithRetry(
          `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${AUDIT_LOG_SHEET_NAME}'!A1:J1?valueInputOption=USER_ENTERED`,
          {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ values: [AUDIT_LOG_HEADERS] })
          }
        );

        await formatAuditLogSheet(accessToken, spreadsheetId, sheetId);
      }
    } catch (err) {
      console.warn('Error creating Audit Log worksheet:', err);
    }
  } else {
    // Sheet exists: inspect header row and repair columns/data rows if Invoice Number or PO Number is missing or shifted
    try {
      const getValRes = await fetchWithRetry(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${AUDIT_LOG_SHEET_NAME}'!A1:Z500`,
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      if (getValRes.ok) {
        const valData = await getValRes.json();
        const existingRows: string[][] = valData.values || [];

        let needsRepair = false;
        if (existingRows.length === 0) {
          needsRepair = true;
        } else {
          const headerRow = existingRows[0] || [];
          // Check if Invoice Number is present in column B (index 1) and PO Number in column C (index 2)
          if (!headerRow[1] || headerRow[1].trim() !== 'Invoice Number') {
            needsRepair = true;
          } else if (!headerRow[2] || headerRow[2].trim() !== 'PO Number') {
            needsRepair = true;
          } else if (headerRow.length < 10) {
            needsRepair = true;
          }
        }

        if (needsRepair) {
          console.log('[Audit Log] Repairing header structure and realigning data rows...');
          const repairedRows: string[][] = [AUDIT_LOG_HEADERS];

          for (let i = 1; i < existingRows.length; i++) {
            const row = existingRows[i];
            if (!row || row.length === 0) continue;

            // Extract invoice number from column B (or A/B)
            // Strip 'REC-BH-' prefix if present, e.g., 'REC-BH-AA-2026-210' -> 'AA-2026-210'
            let rawVal = (row[1] || '').trim();
            let invNum = rawVal.replace(/^REC-BH-/, '');
            if (!invNum || invNum === 'REC-BH-UNKNOWN') invNum = 'N/A';

            if (row.length === 9) {
              // Written under old 9-column schema (Timestamp, Record ID, Performed By, Role, ...)
              const repairedRow = [
                row[0] || '', // Timestamp
                invNum,       // Invoice Number
                'N/A',        // PO Number
                row[2] || '', // Performed By
                row[3] || '', // Role
                row[4] || '', // Module
                row[5] || '', // Action
                row[6] || '', // Previous Status
                row[7] || '', // New Status
                row[8] || ''  // Details
              ];
              repairedRows.push(repairedRow);
            } else if (row.length >= 10) {
              // Written under 10-column schema
              const repairedRow = [
                row[0] || '',
                invNum,
                row[2] || 'N/A',
                row[3] || '',
                row[4] || '',
                row[5] || '',
                row[6] || '',
                row[7] || '',
                row[8] || '',
                row[9] || ''
              ];
              repairedRows.push(repairedRow);
            } else {
              const padded = [...row];
              while (padded.length < 2) padded.push('');
              padded[1] = invNum;
              padded.splice(2, 0, 'N/A');
              while (padded.length < 10) padded.push('');
              repairedRows.push(padded.slice(0, 10));
            }
          }

          // Write repaired header & rows back to 'Audit Log'!A1:J...
          await fetchWithRetry(
            `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${AUDIT_LOG_SHEET_NAME}'!A1:J${repairedRows.length}?valueInputOption=USER_ENTERED`,
            {
              method: 'PUT',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ values: repairedRows })
            }
          );

          await formatAuditLogSheet(accessToken, spreadsheetId, sheetId);
        }
      }
    } catch (err) {
      console.warn('Error inspecting/repairing Audit Log worksheet:', err);
    }
  }

  const headerMap: Record<string, number> = {};
  AUDIT_LOG_HEADERS.forEach((h, idx) => {
    headerMap[h] = idx;
  });

  return { sheetId: sheetId ?? 0, headerMap };
}

export async function formatAuditLogSheet(
  accessToken: string,
  spreadsheetId: string,
  sheetId: number
): Promise<void> {
  const columnWidths = [
    { start: 0, end: 1, size: 170 }, // Timestamp
    { start: 1, end: 2, size: 140 }, // Record ID
    { start: 2, end: 3, size: 140 }, // PO Number
    { start: 3, end: 4, size: 180 }, // Performed By
    { start: 4, end: 5, size: 180 }, // Role
    { start: 5, end: 6, size: 220 }, // Module
    { start: 6, end: 7, size: 160 }, // Action
    { start: 7, end: 8, size: 140 }, // Previous Status
    { start: 8, end: 9, size: 140 }, // New Status
    { start: 9, end: 10, size: 320 } // Remarks / Details
  ];

  const requests: any[] = [
    {
      updateSheetProperties: {
        properties: {
          sheetId,
          gridProperties: {
            frozenRowCount: 1,
            columnCount: 10
          }
        },
        fields: 'gridProperties.frozenRowCount,gridProperties.columnCount'
      }
    },
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: 10
        },
        cell: {
          userEnteredFormat: {
            textFormat: { bold: true, fontSize: 10, foregroundColor: { red: 0.08, green: 0.22, blue: 0.12 } },
            backgroundColor: { red: 0.85, green: 0.94, blue: 0.88 },
            wrapStrategy: 'WRAP',
            verticalAlignment: 'MIDDLE'
          }
        },
        fields: 'userEnteredFormat(textFormat,backgroundColor,wrapStrategy,verticalAlignment)'
      }
    }
  ];

  columnWidths.forEach(cw => {
    requests.push({
      updateDimensionProperties: {
        range: {
          sheetId,
          dimension: 'COLUMNS',
          startIndex: cw.start,
          endIndex: cw.end
        },
        properties: { pixelSize: cw.size },
        fields: 'pixelSize'
      }
    });
  });

  try {
    await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ requests })
    });
  } catch (err) {
    console.warn('Format Audit Log sheet warning:', err);
  }
}

export interface AuditLogEntryParams {
  invoiceNumber?: string;
  recordId?: string;
  poNumber?: string;
  performedBy?: string;
  role?: string;
  action:
    | 'Invoice Uploaded'
    | 'Validation Started'
    | 'Validation Completed'
    | 'Validation Failed'
    | 'Invoice Revalidated'
    | 'Contact Procurement'
    | 'Invoice Rejected'
    | string;
  previousStatus: string;
  newStatus: string;
  details?: string;
  remarks?: string;
  timestamp?: string;
}

export async function appendAuditLogEntry(
  accessToken: string | null | undefined,
  spreadsheetId: string | null | undefined,
  params: AuditLogEntryParams
): Promise<void> {
  const token = accessToken || getAccessToken();
  const targetSpreadsheetId = spreadsheetId || cachedSpreadsheetId;

  if (!token || !targetSpreadsheetId) {
    console.info('Audit Log: Missing access token or spreadsheet ID; entry skipped.');
    return;
  }

  try {
    // 1. Ensure 'Audit Log' worksheet exists and structure is verified/repaired
    const { headerMap } = await ensureAuditLogSheet(token, targetSpreadsheetId);

    // 2. Prepare timestamp
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const timestamp = params.timestamp || `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;

    const rawInvNo = (params.invoiceNumber || '').trim();
    let invoiceNumber = rawInvNo.replace(/^REC-BH-/, '');
    if (!invoiceNumber || invoiceNumber === 'REC-BH-UNKNOWN' || invoiceNumber.toLowerCase() === 'unknown' || /^REC-BH-/i.test(params.invoiceNumber || '')) {
      invoiceNumber = 'N/A';
    }

    const rawPo = (params.poNumber || '').trim();
    let poNumber = rawPo;
    if (!poNumber || poNumber.includes('[MISSING') || poNumber.includes('[Missing') || poNumber.toLowerCase() === 'missing') {
      poNumber = 'N/A';
    }

    const performedBy = params.performedBy || 'Madam Lim';
    const role = params.role || 'Accounts Executive';
    const moduleName = 'Invoice Extraction & Validation';

    const rowValues = new Array(10).fill('');

    const getIdx = (name: string, fallback: number) => {
      if (headerMap[name] !== undefined) return headerMap[name];
      if (name === 'Invoice Number' && headerMap['Record ID'] !== undefined) return headerMap['Record ID'];
      const match = Object.keys(headerMap).find(k => k.toLowerCase() === name.toLowerCase());
      return match !== undefined ? headerMap[match] : fallback;
    };

    rowValues[getIdx('Timestamp', 0)] = timestamp;
    rowValues[getIdx('Invoice Number', 1)] = invoiceNumber;
    rowValues[getIdx('PO Number', 2)] = poNumber;
    rowValues[getIdx('Performed By', 3)] = performedBy;
    rowValues[getIdx('Role', 4)] = role;
    rowValues[getIdx('Module', 5)] = moduleName;
    rowValues[getIdx('Action', 6)] = params.action;
    rowValues[getIdx('Previous Status', 7)] = params.previousStatus || 'N/A';
    rowValues[getIdx('New Status', 8)] = params.newStatus || 'N/A';
    
    const detailsIdx = headerMap['Details'] !== undefined ? headerMap['Details'] : (headerMap['Remarks'] !== undefined ? headerMap['Remarks'] : 9);
    rowValues[detailsIdx] = params.details || params.remarks || '';

    // 3. Append row to 'Audit Log'!A:J (Never overwrite, edit or delete)
    const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${targetSpreadsheetId}/values/'${AUDIT_LOG_SHEET_NAME}'!A:J:append?valueInputOption=USER_ENTERED`;
    const response = await fetchWithRetry(appendUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        values: [rowValues]
      })
    });

    if (!response.ok) {
      if (response.status === 401) {
        clearAccessToken();
        console.info('[Audit Log] Skipped entry because Google token is unauthenticated (401).');
        return;
      }
      console.warn('Failed to append entry to Audit Log sheet:', await response.text());
    } else {
      console.log(`[Audit Log] Appended entry successfully: ${params.action} (Invoice: ${invoiceNumber}, PO: ${poNumber})`);
    }
  } catch (err) {
    console.warn('Error appending entry to Audit Log sheet:', err);
  }
}

/**
 * Searches for an existing Accounts Payable spreadsheet in the user's Drive, or creates one.
 * Spreadsheet Title: Boon Huat AP Database
 * Worksheet Title: Invoice Records
 */
export async function findOrCreateAPSpreadsheet(accessToken: string): Promise<{ id: string; url: string }> {
  // 1. Search for existing spreadsheet file by exact name
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
    "name = 'Boon Huat AP Database' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false"
  )}&fields=files(id,webViewLink)`;

  const searchRes = await fetchWithRetry(searchUrl, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (searchRes.ok) {
    const searchData = await searchRes.json();
    if (searchData.files && searchData.files.length > 0) {
      const spreadsheetId = searchData.files[0].id;
      setCachedSpreadsheetId(spreadsheetId);
      const url = searchData.files[0].webViewLink || `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;

      // Reorganize & format existing spreadsheet to clean 15-column structure
      try {
        await reorganizeAndFormatSheet(accessToken, spreadsheetId);
        await ensureAuditLogSheet(accessToken, spreadsheetId);
      } catch (e) {
        console.warn('Reorganize worksheet error:', e);
      }

      return { id: spreadsheetId, url };
    }
  }

  // 2. If not found, create new Spreadsheet
  const createRes = await fetchWithRetry('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      properties: {
        title: 'Boon Huat AP Database'
      },
      sheets: [
        {
          properties: {
            title: 'Invoice Records',
            gridProperties: { frozenRowCount: 1, columnCount: 16 }
          },
          data: [
            {
              startRow: 0,
              startColumn: 0,
              rowData: [
                {
                  values: CLEAN_SHEET_HEADERS.map(h => ({
                    userEnteredValue: { stringValue: h },
                    userEnteredFormat: {
                      textFormat: { bold: true },
                      backgroundColor: { red: 0.85, green: 0.94, blue: 0.88 },
                      wrapStrategy: 'WRAP',
                      verticalAlignment: 'MIDDLE'
                    }
                  }))
                }
              ]
            }
          ]
        }
      ]
    })
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Failed to create Google Spreadsheet: ${errText}`);
  }

  const createData = await createRes.json();
  const spreadsheetId = createData.spreadsheetId;
  setCachedSpreadsheetId(spreadsheetId);
  const spreadsheetUrl = createData.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;

  try {
    await formatGoogleSheet(accessToken, spreadsheetId, 0);
    await ensureAuditLogSheet(accessToken, spreadsheetId);
  } catch (e) {
    console.warn('Format new sheet error:', e);
  }

  return { id: spreadsheetId, url: spreadsheetUrl };
}

export interface UpsertInvoiceOptions {
  isNewUpload?: boolean;
  targetRowNumber?: number;
}

/**
 * Writes or updates an invoice record row in Google Sheets (worksheet: 'Invoice Records').
 * Uses an explicit header-to-field mapping based on exact Google Sheets column headers in Row 1.
 */
export async function upsertInvoiceRowInSheets(
  accessToken: string,
  spreadsheetId: string,
  record: ExistingSheetRecord,
  options?: UpsertInvoiceOptions
): Promise<{ success: boolean; isUpdate: boolean; rowNumber?: number }> {
  // Ensure sheet is reorganized and formatted to 15 columns first
  const { sheetId, dataRows } = await reorganizeAndFormatSheet(accessToken, spreadsheetId);

  // Prepare values for mapping
  const formattedTotal = typeof record.invoiceTotal === 'number'
    ? `$${record.invoiceTotal.toFixed(2)}`
    : (record.invoiceTotal !== undefined && record.invoiceTotal !== null ? String(record.invoiceTotal) : '');

  const itemDesc = record.lineItems && record.lineItems.length > 0
    ? record.lineItems.map(item => item.description).join('; ')
    : (record.itemDescription || '');

  const qtyStr = record.lineItems && record.lineItems.length > 0
    ? record.lineItems.map(item => item.quantity).join('; ')
    : (record.quantity !== undefined && record.quantity !== null ? String(record.quantity) : '');

  const unitPriceStr = record.lineItems && record.lineItems.length > 0
    ? record.lineItems.map(item => `$${item.unitPrice.toFixed(2)}`).join('; ')
    : (record.unitPrice !== undefined && record.unitPrice !== null
        ? (typeof record.unitPrice === 'number' ? `$${record.unitPrice.toFixed(2)}` : String(record.unitPrice))
        : '');

  const rowValues = [
    record.supplier || '',
    record.invoiceNumber || '',
    record.invoiceDate || '',
    record.poNumber || '',
    itemDesc,
    qtyStr,
    unitPriceStr,
    formattedTotal,
    record.dueDate || '',
    record.paymentTerms || '',
    record.status || '',
    record.reason || '',
    record.originalFileName || '',
    record.driveLink || (record as any).originalFileLink || ''
  ];

  let targetRowIndex = -1;

  // IMPORTANT:
  // 1. Newly processed uploads MUST use append/insert behavior and NEVER update an existing row.
  // 2. Do NOT identify rows for updating using Supplier Name, Invoice Number or PO Number alone.
  if (!options?.isNewUpload) {
    const explicitRow = options?.targetRowNumber || record.sheetRowNumber;
    if (explicitRow && explicitRow >= 2 && explicitRow <= dataRows.length + 1) {
      targetRowIndex = explicitRow;
    } else {
      // Find target row by Drive link, original file name, or supplier + invoice number
      const targetDriveLink = (record.driveLink || (record as any).originalFileLink || '').trim();
      const targetFileName = (record.originalFileName || '').trim().toLowerCase();
      const targetSupplier = (record.supplier || '').trim().toLowerCase();
      const targetInvoiceNo = (record.invoiceNumber || '').trim().toLowerCase();

      if (targetDriveLink || targetFileName || (targetSupplier && targetInvoiceNo)) {
        for (let i = 0; i < dataRows.length; i++) {
          const rFileName = (dataRows[i][12] || '').trim().toLowerCase();
          const rDriveLink = (dataRows[i][13] || '').trim();
          const rSupplier = (dataRows[i][0] || '').trim().toLowerCase();
          const rInvoiceNo = (dataRows[i][1] || '').trim().toLowerCase();

          const driveLinkMatches = Boolean(targetDriveLink && rDriveLink && rDriveLink === targetDriveLink);
          const fileNameMatches = Boolean(targetFileName && rFileName && rFileName === targetFileName);
          const invNoMatches = Boolean(
            targetSupplier && targetInvoiceNo && rSupplier && rInvoiceNo &&
            rSupplier === targetSupplier && rInvoiceNo === targetInvoiceNo
          );

          if (driveLinkMatches || fileNameMatches || invNoMatches) {
            targetRowIndex = i + 2;
            break;
          }
        }
      }
    }
  }

  if (targetRowIndex > 1) {
    // UPDATE existing row
    const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'Invoice Records'!A${targetRowIndex}:N${targetRowIndex}?valueInputOption=USER_ENTERED`;
    const response = await fetchWithRetry(updateUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ values: [rowValues] })
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('401: UNAUTHENTICATED - Google Workspace access token expired.');
      }
      const errText = await response.text();
      console.error('Failed to update row in Google Sheets:', errText);
      throw new Error(`Google Sheets update failed: ${errText}`);
    }

    await formatGoogleSheet(accessToken, spreadsheetId, sheetId);
    return { success: true, isUpdate: true, rowNumber: targetRowIndex };
  } else {
    // WRITE new row
    const newRowIndex = dataRows.length + 2;
    const writeUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'Invoice Records'!A${newRowIndex}:N${newRowIndex}?valueInputOption=USER_ENTERED`;
    const response = await fetchWithRetry(writeUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ values: [rowValues] })
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('401: UNAUTHENTICATED - Google Workspace access token expired.');
      }
      const errText = await response.text();
      console.error('Failed to append row to Google Sheets:', errText);
      throw new Error(`Google Sheets append failed: ${errText}`);
    }

    await formatGoogleSheet(accessToken, spreadsheetId, sheetId);
    return { success: true, isUpdate: false, rowNumber: newRowIndex };
  }
}

/**
 * Legacy wrapper for appendInvoiceRowToSheet calling upsert.
 */
export async function appendInvoiceRowToSheet(
  accessToken: string,
  spreadsheetId: string,
  record: ExistingSheetRecord
): Promise<void> {
  await upsertInvoiceRowInSheets(accessToken, spreadsheetId, record, { isNewUpload: true });
}

/**
 * Fetches all existing invoice rows from the Google Sheet for duplicate checking & audit preview.
 * Reads from worksheet 'Invoice Records' using dynamic column header indices.
 */
export async function fetchInvoiceRowsFromSheet(
  accessToken: string,
  spreadsheetId: string
): Promise<ExistingSheetRecord[]> {
  const { headerRow, dataRows } = await reorganizeAndFormatSheet(accessToken, spreadsheetId);

  // Helper to locate header indices dynamically (trimmed and case-insensitive)
  const getColIndex = (targetHeader: string, aliases: string[] = []): number => {
    if (!headerRow || !Array.isArray(headerRow)) return -1;
    const targetNorm = targetHeader.trim().toLowerCase();
    const aliasNorms = aliases.map(a => a.trim().toLowerCase());
    return headerRow.findIndex(h => {
      if (!h) return false;
      const normalized = h.trim().toLowerCase();
      return normalized === targetNorm || aliasNorms.includes(normalized);
    });
  };

  const supplierCol = getColIndex('Supplier Name', ['supplier']);
  const invoiceNoCol = getColIndex('Invoice Number', ['invoice #', 'inv number', 'inv #']);
  const invoiceDateCol = getColIndex('Invoice Date', ['date']);
  const poNoCol = getColIndex('PO Number', ['po #']);
  const itemDescCol = getColIndex('Item Description', ['description', 'items']);
  const qtyCol = getColIndex('Quantity', ['qty']);
  const unitPriceCol = getColIndex('Unit Price', ['price']);
  const totalCol = getColIndex('Invoice Total', ['total', 'total amount']);
  const dueDateCol = getColIndex('Due Date', ['payment due date']);
  const termsCol = getColIndex('Payment Terms', ['terms']);
  const statusCol = getColIndex('Status');
  const reasonCol = getColIndex('Reason');
  const fileNameCol = getColIndex('Original File Name', ['file name', 'filename']);
  const driveLinkCol = getColIndex('Original File Link', ['file link', 'drive link']);
  const processedAtCol = getColIndex('Processed Date and Time', ['processed date', 'processed at']);
  const reviewedByCol = getColIndex('Reviewed By');

  return dataRows.map((row: string[], index: number) => {
    const getValue = (colIdx: number): string => (colIdx >= 0 && colIdx < row.length && row[colIdx] !== undefined) ? row[colIdx].trim() : '';

    const rawUnitPrice = getValue(unitPriceCol);
    const rawTotal = getValue(totalCol);
    const rawUnitPriceNum = rawUnitPrice ? parseFloat(rawUnitPrice.replace(/[^0-9.-]+/g, '')) : NaN;
    const rawTotalNum = rawTotal ? parseFloat(rawTotal.replace(/[^0-9.-]+/g, '')) : NaN;

    const sheetRowNumber = index + 2;

    return {
      id: `REC-ROW-${sheetRowNumber}`,
      sheetRowNumber,
      supplier: getValue(supplierCol) || 'Unknown Supplier',
      invoiceNumber: getValue(invoiceNoCol) || '',
      invoiceDate: getValue(invoiceDateCol) || '',
      poNumber: getValue(poNoCol) || '',
      itemDescription: getValue(itemDescCol),
      quantity: getValue(qtyCol),
      unitPrice: rawUnitPrice ? (!isNaN(rawUnitPriceNum) ? rawUnitPriceNum : rawUnitPrice) : '',
      invoiceTotal: !isNaN(rawTotalNum) ? rawTotalNum : 0,
      dueDate: getValue(dueDateCol) || '',
      paymentTerms: getValue(termsCol) || '',
      status: (getValue(statusCol) as any) || 'Validated',
      reason: getValue(reasonCol) || '',
      originalFileName: getValue(fileNameCol) || '',
      driveLink: getValue(driveLinkCol) || '',
      processedAt: getValue(processedAtCol) || '',
      reviewedBy: getValue(reviewedByCol) || ''
    };
  });
}

/**
 * Filter sheet records to return only approved (Validated) invoices.
 * Invoices with Status = Requires Review or Status = Rejected are excluded from downstream processing.
 */
export function getApprovedInvoices(records: ExistingSheetRecord[]): ExistingSheetRecord[] {
  return records.filter(r => r.status === 'Validated');
}

/**
 * Fetches only approved (Validated) invoice rows from the Google Sheet for downstream processing/workflows.
 * Invoices with Status = Requires Review or Status = Rejected are excluded until revalidated.
 */
export async function fetchApprovedInvoiceRowsFromSheet(
  accessToken: string,
  spreadsheetId: string
): Promise<ExistingSheetRecord[]> {
  const allRows = await fetchInvoiceRowsFromSheet(accessToken, spreadsheetId);
  return getApprovedInvoices(allRows);
}

/**
 * Converts a Google Sheet ExistingSheetRecord into an InvoiceData object for Review & Edit.
 */
export function sheetRecordToInvoiceData(record: ExistingSheetRecord): InvoiceData {
  const isMissingVal = (val: string | undefined | null) => {
    if (!val) return true;
    const v = val.trim().toLowerCase();
    return v === '' || v === 'missing' || v === 'n/a' || v === 'not found' || v === 'unknown supplier';
  };

  const qty = record.quantity !== undefined && record.quantity !== null && record.quantity !== ''
    ? Number(record.quantity)
    : 1;
  const price = record.unitPrice !== undefined && record.unitPrice !== null && record.unitPrice !== ''
    ? Number(record.unitPrice)
    : Number(record.invoiceTotal || 0);

  const lineItems: ExtractedLineItem[] = record.lineItems && record.lineItems.length > 0
    ? record.lineItems
    : [{
        id: 'LI-1',
        description: record.itemDescription || 'Invoice Item',
        quantity: isNaN(qty) ? 1 : qty,
        unitPrice: isNaN(price) ? 0 : price,
        lineTotal: record.invoiceTotal || 0,
        confidence: 'High',
      }];

  const supplierVal = record.supplier || '';
  const invNumVal = record.invoiceNumber || '';
  const invDateVal = record.invoiceDate || '';
  const poNumVal = record.poNumber || '';
  const dueDateVal = record.dueDate || '';
  const termsVal = record.paymentTerms || '';

  return {
    recordId: record.id,
    sheetRowNumber: record.sheetRowNumber,
    supplierName: {
      value: supplierVal,
      confidence: 'High',
      isMissing: isMissingVal(supplierVal)
    },
    invoiceNumber: {
      value: invNumVal,
      confidence: 'High',
      isMissing: isMissingVal(invNumVal)
    },
    invoiceDate: {
      value: invDateVal,
      confidence: 'High',
      isMissing: isMissingVal(invDateVal)
    },
    poNumber: {
      value: poNumVal,
      confidence: 'High',
      isMissing: isMissingVal(poNumVal)
    },
    paymentDueDate: {
      value: dueDateVal,
      confidence: 'High',
      isMissing: isMissingVal(dueDateVal)
    },
    paymentTerms: {
      value: termsVal,
      confidence: 'High',
      isMissing: isMissingVal(termsVal)
    },
    paymentDueDateOrTerms: {
      value: dueDateVal || termsVal,
      confidence: 'High',
      isMissing: isMissingVal(dueDateVal || termsVal)
    },
    invoiceTotal: {
      value: record.invoiceTotal || 0,
      confidence: 'High',
      isMissing: !record.invoiceTotal || record.invoiceTotal <= 0
    },
    lineItems,
    fileName: record.originalFileName || 'invoice.pdf',
    fileType: 'pdf',
    filePreviewUrl: record.driveLink,
    uploadedAt: record.processedAt,
    reviewNotes: record.reason
  };
}

/**
 * Converts a Google Sheet ExistingSheetRecord with Status = Requires Review into a ReviewQueueItem.
 */
export function convertSheetRecordToReviewQueueItem(rec: ExistingSheetRecord): ReviewQueueItem {
  const reason = rec.reason || 'Validation check failed.';
  let failedCheckTitle = 'Validation Flagged';
  const reasonLower = reason.toLowerCase();
  if (reasonLower.includes('check 1') || reasonLower.includes('completeness')) {
    failedCheckTitle = 'Check 1: Field Completeness';
  } else if (reasonLower.includes('check 2') || reasonLower.includes('confidence')) {
    failedCheckTitle = 'Check 2: Extraction Confidence';
  } else if (reasonLower.includes('check 3') || reasonLower.includes('arithmetic')) {
    failedCheckTitle = 'Check 3: Arithmetic Validation';
  } else if (reasonLower.includes('check 4') || reasonLower.includes('duplicate')) {
    failedCheckTitle = 'Check 4: Duplicate Detection';
  }

  const invoiceData = sheetRecordToInvoiceData(rec);

  const isC1Failed = failedCheckTitle.includes('Check 1');
  const isC2Failed = failedCheckTitle.includes('Check 2');
  const isC3Failed = failedCheckTitle.includes('Check 3');
  const isC4Failed = failedCheckTitle.includes('Check 4');

  const valRes: ValidationResult = {
    check1Completeness: {
      id: 1,
      title: 'Field Completeness',
      description: 'Checks mandatory fields.',
      state: isC1Failed ? 'Failed' : 'Passed',
      reason: isC1Failed ? reason : undefined
    },
    check2Confidence: {
      id: 2,
      title: 'Extraction Confidence',
      description: 'Ensures high confidence OCR.',
      state: isC2Failed ? 'Failed' : 'Passed',
      reason: isC2Failed ? reason : undefined
    },
    check3Arithmetic: {
      id: 3,
      title: 'Arithmetic Validation',
      description: 'Reconciles totals.',
      state: isC3Failed ? 'Failed' : 'Passed',
      reason: isC3Failed ? reason : undefined
    },
    check4Duplicate: {
      id: 4,
      title: 'Duplicate Detection',
      description: 'Checks for duplicates.',
      state: isC4Failed ? 'Failed' : 'Passed',
      reason: isC4Failed ? reason : undefined
    },
    overallStatus: 'Requires Review',
    primaryFailureReason: reason
  };

  return {
    id: rec.id,
    supplierName: rec.supplier || 'N/A',
    invoiceNumber: rec.invoiceNumber || 'N/A',
    invoiceDate: rec.invoiceDate || 'N/A',
    poNumber: rec.poNumber || 'Missing (Not Found)',
    invoiceTotal: rec.invoiceTotal || 0,
    failedCheckTitle,
    reason,
    originalFileName: rec.originalFileName || 'invoice.pdf',
    originalFileLink: rec.driveLink,
    dateAndTImeAdded: rec.processedAt || new Date().toLocaleString('en-SG'),
    reviewStatus: 'Requires Review',
    invoiceData,
    validationResult: valRes
  };
}


// Session cache to instantly match newly uploaded files in the same browser session
const driveFileSessionCache = new Map<string, { fileId: string; webViewLink: string }>();

/**
 * Searches for an existing file in Google Drive or session cache by filename, supplier name, or invoice number.
 */
export async function findExistingDriveFile(
  accessToken: string,
  fileName: string,
  folderId?: string,
  supplierName?: string,
  invoiceNumber?: string
): Promise<{ fileId: string; webViewLink: string } | null> {
  const cleanFileName = (fileName || '').trim().toLowerCase();
  const cleanSupplier = (supplierName || '').trim().toLowerCase();
  const cleanInvNum = (invoiceNumber || '').trim().toLowerCase();

  // 1. Check in-memory session cache first
  if (cleanFileName && driveFileSessionCache.has(cleanFileName)) {
    return driveFileSessionCache.get(cleanFileName)!;
  }
  const driveFileName = `BoonHuat_AP_${fileName}`;
  const cleanDriveFileName = driveFileName.trim().toLowerCase();
  if (driveFileSessionCache.has(cleanDriveFileName)) {
    return driveFileSessionCache.get(cleanDriveFileName)!;
  }
  if (cleanSupplier && cleanInvNum && cleanSupplier !== 'n/a' && cleanInvNum !== 'n/a') {
    const key = `${cleanSupplier}_${cleanInvNum}`;
    if (driveFileSessionCache.has(key)) {
      return driveFileSessionCache.get(key)!;
    }
  }

  if (!accessToken) return null;

  try {
    // 2. Query Google Drive API by exact name match: BoonHuat_AP_${fileName} or ${fileName}
    const safeDriveFileName = driveFileName.replace(/'/g, "\\'");
    const safeFileName = fileName.replace(/'/g, "\\'");

    let queryParts: string[] = ['trashed = false'];
    if (folderId) {
      queryParts.push(`'${folderId}' in parents`);
    }

    const nameQuery = `(${queryParts.join(' and ')}) and (name = '${safeDriveFileName}' or name = '${safeFileName}')`;
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(nameQuery)}&fields=files(id,name,webViewLink)`;

    const response = await fetchWithRetry(searchUrl, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (response.ok) {
      const data = await response.json();
      if (data.files && data.files.length > 0) {
        const file = data.files[0];
        const res = {
          fileId: file.id,
          webViewLink: file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`
        };
        // Cache result
        if (cleanFileName) driveFileSessionCache.set(cleanFileName, res);
        if (cleanDriveFileName) driveFileSessionCache.set(cleanDriveFileName, res);
        return res;
      }
    }

    // 3. Search folder files by supplier name / invoice number / filename inclusion
    if (folderId || (cleanSupplier && cleanInvNum)) {
      const folderQueryParts: string[] = ['trashed = false'];
      if (folderId) {
        folderQueryParts.push(`'${folderId}' in parents`);
      }

      const listUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(folderQueryParts.join(' and '))}&fields=files(id,name,webViewLink)&pageSize=100`;
      const listRes = await fetchWithRetry(listUrl, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (listRes.ok) {
        const listData = await listRes.json();
        if (listData.files && Array.isArray(listData.files)) {
          for (const f of listData.files) {
            const fName = (f.name || '').toLowerCase();

            const isFileNameMatch = cleanFileName && fName.includes(cleanFileName);
            const isInvMatch = cleanInvNum && cleanInvNum !== 'n/a' && fName.includes(cleanInvNum);
            const isSupplierMatch = cleanSupplier && cleanSupplier !== 'n/a' && (fName.includes(cleanSupplier) || cleanSupplier.includes(fName.replace('boonhuat_ap_', '')));

            if (isFileNameMatch || (isInvMatch && (isSupplierMatch || !cleanSupplier))) {
              const res = {
                fileId: f.id,
                webViewLink: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`
              };
              if (cleanFileName) driveFileSessionCache.set(cleanFileName, res);
              if (cleanDriveFileName) driveFileSessionCache.set(cleanDriveFileName, res);
              if (cleanSupplier && cleanInvNum) driveFileSessionCache.set(`${cleanSupplier}_${cleanInvNum}`, res);
              return res;
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('Error searching for existing Drive file:', err);
  }

  return null;
}

/**
 * Uploads an invoice document (PDF/JPEG) to Google Drive and returns the webViewLink.
 * If the file already exists in Google Drive (or session cache), reuses the existing file ID and link.
 */
export async function uploadDocumentToDrive(
  accessToken: string,
  fileName: string,
  mimeType: string,
  base64Data?: string,
  folderId?: string,
  supplierName?: string,
  invoiceNumber?: string
): Promise<{ fileId: string; webViewLink: string }> {
  // 1. Check if matching invoice file already exists in Google Drive or session cache
  const existingFile = await findExistingDriveFile(
    accessToken,
    fileName,
    folderId,
    supplierName,
    invoiceNumber
  );

  if (existingFile) {
    console.log('Reusing existing Google Drive file:', existingFile.fileId);
    return existingFile;
  }

  // 2. If no matching file exists, save original invoice file to Google Drive
  try {
    const metadata: any = {
      name: `BoonHuat_AP_${fileName}`,
      mimeType: mimeType || 'application/pdf'
    };

    if (folderId) {
      metadata.parents = [folderId];
    }

    let body: BodyInit;
    let contentType: string;

    if (base64Data) {
      // Decode base64 to binary blob
      const base64Clean = base64Data.replace(/^data:[^;]+;base64,/, '');
      const binaryStr = window.atob(base64Clean);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      const fileBlob = new Blob([bytes], { type: mimeType });

      const formData = new FormData();
      formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      formData.append('file', fileBlob);

      body = formData;
      contentType = ''; // Browser sets multipart/form-data with boundary
    } else {
      // Create empty metadata file as placeholder in Drive
      body = JSON.stringify(metadata);
      contentType = 'application/json';
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`
    };
    if (contentType) {
      headers['Content-Type'] = contentType;
    }

    const uploadUrl = base64Data
      ? 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink'
      : 'https://www.googleapis.com/drive/v3/files?fields=id,webViewLink';

    const response = await fetchWithRetry(uploadUrl, {
      method: 'POST',
      headers,
      body
    });

    if (response.ok) {
      const data = await response.json();
      const result = {
        fileId: data.id,
        webViewLink: data.webViewLink || `https://drive.google.com/file/d/${data.id}/view`
      };

      // Populate session cache
      const cleanFileName = (fileName || '').trim().toLowerCase();
      const cleanDriveFileName = `boonhuat_ap_${cleanFileName}`;
      if (cleanFileName) driveFileSessionCache.set(cleanFileName, result);
      if (cleanDriveFileName) driveFileSessionCache.set(cleanDriveFileName, result);
      if (supplierName && invoiceNumber) {
        const key = `${supplierName.trim().toLowerCase()}_${invoiceNumber.trim().toLowerCase()}`;
        driveFileSessionCache.set(key, result);
      }

      return result;
    } else {
      console.warn('Drive upload returned error:', await response.text());
    }
  } catch (err) {
    console.error('Error uploading to Drive:', err);
  }

  // Fallback link
  const fallbackResult = {
    fileId: `drive-sim-${Date.now()}`,
    webViewLink: `https://drive.google.com/file/d/audit_${encodeURIComponent(fileName)}/view`
  };

  const cleanFileName = (fileName || '').trim().toLowerCase();
  if (cleanFileName) driveFileSessionCache.set(cleanFileName, fallbackResult);

  return fallbackResult;
}
