import { db } from '../../lib/firebase';
import { collection, query, where, getDocs, writeBatch } from 'firebase/firestore';

export default async function handler(req, res) {
  const { invoice_number } = req.query;

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  if (!invoice_number) {
    return res.status(400).json({ success: false, error: 'Invoice number is required' });
  }

  try {
    const invoicesRef = collection(db, 'invoices');
    const q = query(invoicesRef, where('invoice_number', '==', invoice_number));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      return res.status(404).json({ success: false, message: `No invoice found with number: ${invoice_number}` });
    }

    const batch = writeBatch(db);
    let docId = '';
    snapshot.forEach(doc => {
      docId = doc.id;
      batch.update(doc.ref, {
        docx_regeneration_requested: true,
        docx_generation_status: 'pending',
        docx_generation_error: null
      });
    });

    await batch.commit();

    res.status(200).json({ 
      success: true, 
      message: `Regeneration requested for invoice ${invoice_number} (Doc ID: ${docId}). Please monitor your Cloud Functions logs.` 
    });

  } catch (error) {
    console.error('Error in /api/retry-invoice:', error);
    res.status(500).json({ success: false, error: 'Failed to request invoice regeneration', details: error.message });
  }
} 