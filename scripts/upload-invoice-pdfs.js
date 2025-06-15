const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');
const puppeteer = require('puppeteer');
const admin = require('firebase-admin');
const { Storage } = require('@google-cloud/storage');

// Load Firebase service account key
const serviceAccountPath = path.join(__dirname, '../serviceAccountKey.json');
if (!fs.existsSync(serviceAccountPath)) {
  console.error('Missing serviceAccountKey.json. Download it from Firebase Console and place it in the project root.');
  process.exit(1);
}
const serviceAccount = require(serviceAccountPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'dormitory-management-6c1a5.appspot.com',
});
const db = admin.firestore();
const storage = new Storage({ credentials: serviceAccount });
const bucket = storage.bucket('dormitory-management-6c1a5.appspot.com');

const DOCX_DIR = path.join(__dirname, '../generated_invoices');

async function docxToPdf(docxPath, pdfPath) {
  // Convert DOCX to HTML
  const docxBuffer = fs.readFileSync(docxPath);
  const { value: html } = await mammoth.convertToHtml({ buffer: docxBuffer });
  // Convert HTML to PDF using Puppeteer
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.pdf({ path: pdfPath, format: 'A4' });
  await browser.close();
}

async function uploadPdfToStorage(pdfPath, destFileName) {
  await bucket.upload(pdfPath, {
    destination: `invoices/${destFileName}`,
    public: true,
    metadata: {
      contentType: 'application/pdf',
    },
  });
  // Get public URL
  return `https://storage.googleapis.com/${bucket.name}/invoices/${encodeURIComponent(destFileName)}`;
}

async function main() {
  const files = fs.readdirSync(DOCX_DIR).filter(f => f.endsWith('.docx'));
  for (const file of files) {
    const docxPath = path.join(DOCX_DIR, file);
    const pdfFileName = file.replace(/\.docx$/, '.pdf');
    const pdfPath = path.join(DOCX_DIR, pdfFileName);
    // Convert to PDF
    await docxToPdf(docxPath, pdfPath);
    // Upload to Storage
    const pdfUrl = await uploadPdfToStorage(pdfPath, pdfFileName);
    // Update Firestore
    // Try to find invoice by invoice_number (from file name)
    const invoiceNumber = file.replace(/\.docx$/, '');
    const snapshot = await db.collection('invoices').where('invoice_number', '==', invoiceNumber).limit(1).get();
    if (!snapshot.empty) {
      const docRef = snapshot.docs[0].ref;
      await docRef.update({ pdfUrl });
      console.log(`Uploaded and updated Firestore for: ${invoiceNumber}`);
    } else {
      console.warn(`No Firestore invoice found for: ${invoiceNumber}`);
    }
  }
  console.log('All PDFs uploaded and Firestore updated!');
}

main().catch(err => {
  console.error('Error uploading PDFs:', err);
  process.exit(1);
}); 