import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';
import { initializeApp, getApps, getApp } from 'firebase/app';

// Your Firebase configuration
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase
let app;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}
const db = getFirestore(app);

export default async function handler(req, res) {
  const { invoice_number } = req.query;

  if (!invoice_number) {
    return res.status(400).json({ error: 'Invoice number is required' });
  }

  try {
    const invoicesRef = collection(db, 'invoices');
    const q = query(invoicesRef, where('invoice_number', '==', invoice_number));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      return res.status(404).json({ message: `No invoice found with number: ${invoice_number}` });
    }

    const invoiceData = snapshot.docs[0].data();
    
    // Firestore Timestamps are not directly serializable to JSON
    const serializedData = JSON.parse(JSON.stringify(invoiceData, (key, value) => {
      if (value && value.toDate) {
        return value.toDate().toISOString();
      }
      return value;
    }));

    res.status(200).json(serializedData);
  } catch (error) {
    console.error('Error fetching invoice:', error);
    res.status(500).json({ error: 'Failed to fetch invoice', details: error.message });
  }
} 