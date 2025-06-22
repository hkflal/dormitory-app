const admin = require('firebase-admin');

// Initialize Firebase Admin (make sure serviceAccountKey.json exists)
const serviceAccount = require('../serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

const brokenInvoiceIds = [
  "PtGqUPzMgGMTrPvtIzJT",
  "YgpIDLpcjwlxB2Ex3r91", 
  "gY0aP4vbqOkPajV8Rawt",
  "jMiDCiXXimi8VOVOD7Qe",
  "jhsOKyAK1RFnkHdrUD9f",
  "nIaiSzYwIy01SwK9c19b",
  "pJtEgSHqDDOEK7mCR2dR"
];

async function fixBrokenInvoices() {
  console.log('🔄 Starting to fix broken invoices...');
  
  for (const invoiceId of brokenInvoiceIds) {
    try {
      console.log(`📄 Processing invoice: ${invoiceId}`);
      
      // Trigger regeneration by updating the document
      await db.collection('invoices').doc(invoiceId).update({
        docx_regeneration_requested: true,
        docx_regeneration_requested_at: admin.firestore.FieldValue.serverTimestamp()
      });
      
      console.log(`✅ Triggered regeneration for: ${invoiceId}`);
      
      // Wait a bit between requests
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      console.error(`❌ Failed to process ${invoiceId}:`, error.message);
    }
  }
  
  console.log('🎉 Regeneration requests sent for all invoices!');
  console.log('📊 Check Firebase Functions logs to monitor progress:');
  console.log('   firebase functions:log --only generateInvoiceDocxRegenerationTrigger');
}

fixBrokenInvoices().catch(console.error); 