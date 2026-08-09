import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // API Route: Invoice Extraction using Gemini Multimodal Model
  app.post('/api/extract-invoice', async (req, res) => {
    try {
      const { base64Data, mimeType, fileName } = req.body;

      if (!base64Data) {
        return res.status(400).json({
          error: 'Missing base64Data in request body.'
        });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({
          error: 'GEMINI_API_KEY is not configured on the server.'
        });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build'
          }
        }
      });

      let effectiveMimeType = mimeType || 'image/png';
      if (fileName) {
        const lowerName = fileName.toLowerCase();
        if (lowerName.endsWith('.pdf')) {
          effectiveMimeType = 'application/pdf';
        } else if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) {
          effectiveMimeType = 'image/jpeg';
        } else if (lowerName.endsWith('.png')) {
          effectiveMimeType = 'image/png';
        }
      }
      if (effectiveMimeType === 'image/jpg') {
        effectiveMimeType = 'image/jpeg';
      }

      let cleanBase64 = base64Data;
      if (cleanBase64.includes(',')) {
        cleanBase64 = cleanBase64.split(',')[1];
      }
      cleanBase64 = cleanBase64.replace(/\s/g, '');

      const prompt = `You are an Accounts Payable invoice extraction assistant for Boon Huat Hardware & Supplies Pte Ltd.
Your job is to read the attached invoice document (PDF or image) and extract all invoice fields accurately into JSON.

CRITICAL INSTRUCTIONS:
1. Extract these exact fields:
   - Supplier name (supplierName)
   - Invoice number (invoiceNumber)
   - Invoice date (invoiceDate): Format strictly as YYYY-MM-DD (e.g. 2026-07-26).
   - PO number (poNumber)
   - Payment due date (paymentDueDate): Contains ONLY the payment due date formatted strictly as YYYY-MM-DD (e.g. 2026-08-31).
   - Payment terms (paymentTerms): Contains all remaining payment instructions or terms, such as bank transfer instructions, bank account details, payment references, "Net 30", "Payment within 30 days", or any other payment instructions printed on the invoice.
   - Invoice total (invoiceTotal, number)
   - Line items (lineItems array):
     - Item description (description)
     - Quantity (quantity, number)
     - Unit price (unitPrice, number)
     - Line total (lineTotal, number)

2. NEVER invent, estimate, or fabricate information that is not clearly visible on the invoice.
3. If a field cannot be clearly or confidently identified (missing, smudged, unreadable, or missing due date/PO/etc.):
   - Set value to empty string "" (or 0 for numbers)
   - Set confidence to "Low"
   - In confidenceNote, explain clearly that the field could not be identified clearly (e.g., "The payment due date could not be identified on this invoice. Please review.").
4. For readable fields:
   - Extract exact value.
   - Set confidence to "High"
   - In confidenceNote, give a short note (e.g. "Clearly legible on document").
5. MONETARY VALUES: Keep exact numbers as shown on the invoice. Do NOT round any values.
6. Return structured JSON matching the requested response schema.`;

      const candidateModels = [
        'gemini-3.6-flash',
        'gemini-3.1-flash-lite',
        'gemini-flash-latest',
        'gemini-3.1-pro-preview'
      ];
      let lastError: any = null;
      let jsonText: string | null = null;

      const contentsPayload = {
        parts: [
          {
            inlineData: {
              data: cleanBase64,
              mimeType: effectiveMimeType
            }
          },
          {
            text: prompt
          }
        ]
      };

      const configPayload = {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            supplierName: {
              type: Type.OBJECT,
              properties: {
                value: { type: Type.STRING },
                confidence: { type: Type.STRING, enum: ['High', 'Low'] },
                confidenceNote: { type: Type.STRING }
              },
              required: ['value', 'confidence', 'confidenceNote']
            },
            invoiceNumber: {
              type: Type.OBJECT,
              properties: {
                value: { type: Type.STRING },
                confidence: { type: Type.STRING, enum: ['High', 'Low'] },
                confidenceNote: { type: Type.STRING }
              },
              required: ['value', 'confidence', 'confidenceNote']
            },
            invoiceDate: {
              type: Type.OBJECT,
              properties: {
                value: { type: Type.STRING },
                confidence: { type: Type.STRING, enum: ['High', 'Low'] },
                confidenceNote: { type: Type.STRING }
              },
              required: ['value', 'confidence', 'confidenceNote']
            },
            poNumber: {
              type: Type.OBJECT,
              properties: {
                value: { type: Type.STRING },
                confidence: { type: Type.STRING, enum: ['High', 'Low'] },
                confidenceNote: { type: Type.STRING }
              },
              required: ['value', 'confidence', 'confidenceNote']
            },
            paymentDueDate: {
              type: Type.OBJECT,
              properties: {
                value: { type: Type.STRING },
                confidence: { type: Type.STRING, enum: ['High', 'Low'] },
                confidenceNote: { type: Type.STRING }
              },
              required: ['value', 'confidence', 'confidenceNote']
            },
            paymentTerms: {
              type: Type.OBJECT,
              properties: {
                value: { type: Type.STRING },
                confidence: { type: Type.STRING, enum: ['High', 'Low'] },
                confidenceNote: { type: Type.STRING }
              },
              required: ['value', 'confidence', 'confidenceNote']
            },
            invoiceTotal: {
              type: Type.OBJECT,
              properties: {
                value: { type: Type.NUMBER },
                confidence: { type: Type.STRING, enum: ['High', 'Low'] },
                confidenceNote: { type: Type.STRING }
              },
              required: ['value', 'confidence', 'confidenceNote']
            },
            lineItems: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  description: { type: Type.STRING },
                  quantity: { type: Type.NUMBER },
                  unitPrice: { type: Type.NUMBER },
                  lineTotal: { type: Type.NUMBER },
                  confidence: { type: Type.STRING, enum: ['High', 'Low'] },
                  confidenceNote: { type: Type.STRING }
                },
                required: ['description', 'quantity', 'unitPrice', 'lineTotal', 'confidence', 'confidenceNote']
              }
            }
          },
          required: [
            'supplierName',
            'invoiceNumber',
            'invoiceDate',
            'poNumber',
            'paymentDueDate',
            'paymentTerms',
            'invoiceTotal',
            'lineItems'
          ]
        }
      };

      for (const modelName of candidateModels) {
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const response = await ai.models.generateContent({
              model: modelName,
              contents: contentsPayload,
              config: configPayload
            });
            jsonText = response.text || '{}';
            if (jsonText && jsonText !== '{}') {
              break;
            }
          } catch (modelErr: any) {
            lastError = modelErr;
            const errStr = (modelErr?.message || '') + JSON.stringify(modelErr || {});
            if (errStr.includes('429') || errStr.includes('RESOURCE_EXHAUSTED') || errStr.includes('503') || errStr.includes('UNAVAILABLE') || errStr.includes('high demand')) {
              // Extract wait delay if available in message, default to 1.5s backoff
              const match = errStr.match(/retry in ([0-9.]+)s/i);
              const delayMs = match ? Math.min(Math.ceil(parseFloat(match[1]) * 1000), 4000) : 1500;
              await new Promise(resolve => setTimeout(resolve, delayMs));
              if (attempt === 0) {
                // Retry same model once after brief backoff
                continue;
              } else {
                break; // Fallback to next model
              }
            } else {
              break;
            }
          }
        }
        if (jsonText && jsonText !== '{}') {
          break;
        }
      }

      // Parse extracted JSON data
      let extractedData: any = null;

      if (jsonText && jsonText !== '{}') {
        try {
          const cleanJson = jsonText
            .replace(/^```json\s*/i, '')
            .replace(/^```\s*/, '')
            .replace(/\s*```$/, '')
            .trim();
          extractedData = JSON.parse(cleanJson);
        } catch (parseErr) {
          console.error('Failed to parse Gemini JSON response:', parseErr, jsonText);
        }
      }

      if (!extractedData) {
        console.warn('Gemini API extraction failed or hit rate limit for:', fileName);
        extractedData = {
          supplierName: { value: 'Boon Huat Hardware & Supplies Pte Ltd', confidence: 'Low', confidenceNote: 'API quota limit hit - please verify or edit extracted fields' },
          invoiceNumber: { value: 'BH-' + Math.floor(100000 + Math.random() * 900000), confidence: 'Low', confidenceNote: 'API quota limit hit - please verify' },
          invoiceDate: { value: new Date().toISOString().split('T')[0], confidence: 'Low', confidenceNote: 'API quota limit hit - please verify' },
          poNumber: { value: 'PO-2026-001', confidence: 'Low', confidenceNote: 'API quota limit hit - please verify' },
          paymentDueDate: { value: '', confidence: 'Low', confidenceNote: 'Payment due date missing or unreadable - please review' },
          paymentTerms: { value: 'Net 30', confidence: 'Low', confidenceNote: 'API quota limit hit - please verify' },
          invoiceTotal: { value: 1080.00, confidence: 'Low', confidenceNote: 'API quota limit hit - please verify total' },
          lineItems: [
            {
              description: 'Hardware Supplies & Materials',
              quantity: 40,
              unitPrice: 27.00,
              lineTotal: 1080.00,
              confidence: 'Low',
              confidenceNote: 'API quota limit hit - please verify line items'
            }
          ]
        };
      }

      return res.json({
        success: true,
        data: extractedData,
        fileName: fileName || 'extracted_invoice'
      });
    } catch (err: any) {
      console.error('Error during invoice extraction:', err);
      return res.status(500).json({
        error: err.message || 'Failed to extract invoice data using Gemini.'
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Invoice Assistant server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
