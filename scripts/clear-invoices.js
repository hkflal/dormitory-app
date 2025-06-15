const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, writeBatch } = require('firebase/firestore');

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

async function deleteAllInvoices() {
    console.log("Attempting to delete all invoices...");
    const invoicesRef = collection(db, 'invoices');
    const snapshot = await getDocs(invoicesRef);

    if (snapshot.empty) {
        console.log("No invoices found to delete.");
        return;
    }

    // Firestore allows batches of up to 500
    const batch = writeBatch(db);
    let count = 0;
    snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
        count++;
    });

    await batch.commit();
    console.log(`Successfully deleted ${count} invoices.`);
}

deleteAllInvoices().catch(err => {
    console.error("Error deleting invoices:", err);
}); 