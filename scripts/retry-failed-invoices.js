const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, writeBatch } = require('firebase-admin/firestore');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env.local') });

// --- Service Account Setup ---
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

if (!serviceAccountPath) {
    console.error('Error: FIREBASE_SERVICE_ACCOUNT_PATH is not set in your .env.local file.');
    process.exit(1);
}
const absoluteServiceAccountPath = path.resolve(__dirname, '..', serviceAccountPath);
if (!fs.existsSync(absoluteServiceAccountPath)) {
    console.error(`Error: Service account file not found at path: ${absoluteServiceAccountPath}`);
    process.exit(1);
}
const serviceAccount = require(absoluteServiceAccountPath);

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function retryFailedInvoicesByNumber(invoiceNumbers) {
    if (!invoiceNumbers || invoiceNumbers.length === 0) {
        console.error('Please provide at least one invoice number as an argument.');
        console.log('Usage: node scripts/retry-failed-invoices.js <Number1> <Number2> ...');
        return;
    }

    console.log(`Searching for invoices with numbers: ${invoiceNumbers.join(', ')}`);
    const batch = db.batch();
    const invoicesRef = db.collection('invoices');
    const q = invoicesRef.where('invoice_number', 'in', invoiceNumbers);
    const snapshot = await q.get();

    if (snapshot.empty) {
        console.error('❌ No invoices found with the provided numbers.');
        return;
    }

    let foundCount = 0;
    snapshot.forEach(doc => {
        console.log(`Found invoice with ID: ${doc.id} for number: ${doc.data().invoice_number}. Requesting regeneration...`);
        batch.update(doc.ref, { 
            docx_regeneration_requested: true,
            docx_generation_status: 'pending', 
            docx_generation_error: null 
        });
        foundCount++;
    });

    if (foundCount > 0) {
        try {
            await batch.commit();
            console.log(`\n✅ Successfully sent regeneration requests for ${foundCount} invoice(s).`);
            console.log('Please check your Firebase console to monitor the function triggers.');
        } catch (error) {
            console.error('❌ Error requesting invoice regeneration:', error);
        }
    } else {
        console.log('No matching invoices were updated.');
    }
}

// Get invoice numbers from command-line arguments
const invoiceNumbers = process.argv.slice(2);

retryFailedInvoicesByNumber(invoiceNumbers)
  .then(() => {
    console.log('Script finished.');
    process.exit(0);
  })
  .catch(err => {
    console.error("An unexpected error occurred:", err);
    process.exit(1);
  }); 