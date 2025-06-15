const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, orderBy, query } = require('firebase/firestore');

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

async function listAllInvoices() {
    console.log("Fetching all invoices from the database...");
    const invoicesRef = collection(db, 'invoices');
    const q = query(invoicesRef, orderBy('invoice_number'));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
        console.log("The 'invoices' collection is empty.");
        return;
    }

    console.log("--- Found Invoices ---");
    snapshot.docs.forEach(doc => {
        const data = doc.data();
        console.log(`- Invoice Number: ${data.invoice_number}, Status: ${data.status}`);
    });
    console.log("----------------------");
}

listAllInvoices().catch(err => {
    console.error("Error listing invoices:", err);
}); 