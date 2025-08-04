const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, query, where } = require('firebase/firestore');
require('dotenv').config({ path: '.env.local' });

// Load the Firebase config from the environment variables
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function getInvoiceDetails(invoiceNumber) {
    if (!invoiceNumber) {
        console.error("Please provide an invoice number.");
        process.exit(1);
    }

    console.log(`Fetching details for invoice: ${invoiceNumber}...`);
    const invoicesRef = collection(db, 'invoices');
    const q = query(invoicesRef, where('invoice_number', '==', invoiceNumber));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
        console.log(`No invoice found with number: ${invoiceNumber}`);
        return;
    }

    console.log("--- Invoice Details ---");
    snapshot.docs.forEach(doc => {
        console.log(JSON.stringify(doc.data(), null, 2));
    });
    console.log("----------------------");
}

const invoiceNumber = process.argv[2];
getInvoiceDetails(invoiceNumber).then(() => {
    setTimeout(() => process.exit(0), 1000);
}).catch(err => {
    console.error("Error fetching invoice details:", err);
    process.exit(1);
}); 