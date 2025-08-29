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
  const { contract_number } = req.query;

  if (!contract_number) {
    return res.status(400).json({ error: 'Contract number is required' });
  }

  try {
    const invoicesRef = collection(db, 'invoices');
    const q = query(invoicesRef, where('contract_number', '==', contract_number));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      return res.status(404).json({ message: `No invoices found for contract number: ${contract_number}` });
    }

    const invoices = [];
    snapshot.forEach(doc => {
        const invoiceData = doc.data();
        const serializedData = JSON.parse(JSON.stringify(invoiceData, (key, value) => {
            if (value && value.toDate) {
                return value.toDate().toISOString();
            }
            return value;
        }));
        invoices.push(serializedData);
    });
    
    invoices.sort((a, b) => (a.invoice_number > b.invoice_number) ? 1 : -1);

    res.status(200).json(invoices);
  } catch (error) {
    console.error('Error fetching invoices by contract:', error);
    res.status(500).json({ error: 'Failed to fetch invoices', details: error.message });
  }
} 