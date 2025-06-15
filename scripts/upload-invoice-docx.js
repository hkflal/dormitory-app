const fs = require('fs');
const path = require('path');
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
  storageBucket: 'dormitory-management-6c1a5.firebasestorage.app',
});
const db = admin.firestore();
const storage = new Storage({ credentials: serviceAccount });
const bucket = storage.bucket('dormitory-management-6c1a5.firebasestorage.app');

const DOCX_DIR = path.join(__dirname, '../generated_invoices');

async function uploadDocxToStorage(docxPath, destFileName) {
  await bucket.upload(docxPath, {
    destination: `invoices/${destFileName}`,
    public: true,
    metadata: {
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    },
  });
  // Get public URL
  return `https://storage.googleapis.com/dormitory-management-6c1a5.firebasestorage.app/invoices/${encodeURIComponent(destFileName)}`;
}

async function main() {
  const files = fs.readdirSync(DOCX_DIR).filter(f => f.endsWith('.docx'));
  for (const file of files) {
    const docxPath = path.join(DOCX_DIR, file);
    // Upload to Storage
    const docxUrl = await uploadDocxToStorage(docxPath, file);
    // Update Firestore
    // Try to find invoice by invoice_number (from file name)
    const invoiceNumber = file.replace(/\.docx$/, '');
    const snapshot = await db.collection('invoices').where('invoice_number', '==', invoiceNumber).limit(1).get();
    if (!snapshot.empty) {
      const docRef = snapshot.docs[0].ref;
      await docRef.update({ docxUrl });
      console.log(`Uploaded and updated Firestore for: ${invoiceNumber}`);
    } else {
      console.warn(`No Firestore invoice found for: ${invoiceNumber}`);
    }
  }
  console.log('All DOCX files uploaded and Firestore updated!');
}

main().catch(err => {
  console.error('Error uploading DOCX files:', err);
  process.exit(1);
}); 