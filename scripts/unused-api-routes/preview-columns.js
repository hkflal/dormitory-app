import formidable from 'formidable';
import fs from 'fs/promises';
import path from 'path';
import ExcelJS from 'exceljs';

export const config = {
  api: {
    bodyParser: false,
  },
};

const KNOWN_COLUMNS = [
  'employee','uid','arrival','frequency','invoice_number','deposit_number',
  'start_date','enddate','contract_number','company','assignedproperty','rent'
];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const form = formidable({ multiples: false });
  const { fields, files } = await new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });

  const file = files.file;
  if (!file) return res.status(400).json({ error: 'No file uploaded' });
  const tempPath = file[0].filepath || file.filepath || file.path;

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(tempPath);
  const sheet = wb.worksheets[0];
  const headers = sheet.getRow(1).values.map(v => (v || '').toString().toLowerCase().trim());

  const unknown = headers.filter(h => h && !KNOWN_COLUMNS.includes(h));
  const status = unknown.length === 0 ? 'identical' : 'unknown-columns';
  res.json({ status, headers, unknown });
} 