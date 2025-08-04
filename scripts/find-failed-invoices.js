const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env.local') });


// Use a service account for admin access
// This script now expects a file path in the environment variable
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

if (!serviceAccountPath) {
    console.error('Error: FIREBASE_SERVICE_ACCOUNT_PATH is not set in your .env.local file.');
    console.error('Please set it to the path of your service account JSON file (e.g., firebase-service-account.json).');
    process.exit(1);
}

const absoluteServiceAccountPath = path.resolve(__dirname, '..', serviceAccountPath);

if (!fs.existsSync(absoluteServiceAccountPath)) {
    console.error(`Error: Service account file not found at path: ${absoluteServiceAccountPath}`);
    console.error(`Please make sure the path in .env.local is correct and the file exists.`);
    process.exit(1);
}

const serviceAccount = require(absoluteServiceAccountPath);


initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function findFailedInvoices() {
    console.log("Searching for invoices with docx_generation_status = 'failed'...");
    
    const failedInvoicesRef = db.collection('invoices');
    const q = failedInvoicesRef.where('docx_generation_status', '==', 'failed');
    const snapshot = await q.get();

    if (snapshot.empty) {
        console.log("✅ No failed invoices found.");
        return;
    }

    console.log(`--- ❗ Found ${snapshot.size} Failed Invoices ---`);
    snapshot.docs.forEach(doc => {
        const data = doc.data();
        console.log(`- ID: ${doc.id}, Number: ${data.invoice_number}, Error: ${data.docx_generation_error}`);
    });
    console.log("-------------------------------------------");
    console.log("You can now use these IDs in the retry script.");
}

findFailedInvoices()
  .then(() => {
    console.log('Script finished.');
    process.exit(0);
  })
  .catch(err => {
    console.error("Error finding failed invoices:", err);
    process.exit(1);
}); 