const functions = require('firebase-functions');
const admin = require('firebase-admin');

exports.scheduledInvoiceGeneration = functions.pubsub
  .schedule('0 9 * * *') // Run daily at 9 AM
  .onRun(async (context) => {
    console.log('Starting scheduled invoice generation...');
    
    const db = admin.firestore();
    const today = new Date();
    const fourteenDaysFromNow = new Date(today.getTime() + (14 * 24 * 60 * 60 * 1000));
    
    try {
      // Get all invoices that need renewal
      const invoicesSnapshot = await db.collection('invoices').get();
      const candidateInvoices = [];
      
      invoicesSnapshot.forEach(doc => {
        const invoice = { id: doc.id, ...doc.data() };
        
        let endDate = invoice.end_date;
        if (endDate && endDate.toDate) {
          endDate = endDate.toDate();
        } else if (endDate) {
          endDate = new Date(endDate);
        }
        
        if (endDate && 
            endDate >= today && 
            endDate <= fourteenDaysFromNow &&
            (invoice.status === 'paid' || invoice.status === 'pending') &&
            !invoice.is_deposit &&
            !invoice.auto_generated) {
          
          candidateInvoices.push({ ...invoice, end_date: endDate });
        }
      });
      
      console.log(`Found ${candidateInvoices.length} invoices that need renewal`);
      
      const batch = db.batch();
      let generatedCount = 0;
      
      for (const invoice of candidateInvoices) {
        // Check if renewal already exists
        const existingRenewal = await db.collection('invoices')
          .where('contract_number', '==', invoice.contract_number)
          .where('renewal_source_id', '==', invoice.id)
          .get();
        
        if (!existingRenewal.empty) {
          continue;
        }
        
        // Generate renewal invoice
        const nextInvoiceNumber = await generateNextInvoiceNumber(db, invoice.contract_number, 'Z');
        
        const newStartDate = new Date(invoice.end_date);
        newStartDate.setDate(newStartDate.getDate() + 1);
        
        const newEndDate = new Date(newStartDate);
        newEndDate.setMonth(newEndDate.getMonth() + 3);
        
        const renewalInvoice = {
          invoice_number: nextInvoiceNumber,
          contract_number: invoice.contract_number,
          employee_names: invoice.employee_names || [],
          amount: invoice.amount || 0,
          total: invoice.total || invoice.amount || 0,
          start_date: admin.firestore.Timestamp.fromDate(newStartDate),
          end_date: admin.firestore.Timestamp.fromDate(newEndDate),
          status: 'pending',
          auto_generated: true,
          renewal_tag: '續約 - 自動生成',
          renewal_source_id: invoice.id,
          template_type: 'invoice',
          is_deposit: false,
          created_at: admin.firestore.Timestamp.fromDate(new Date()),
          updated_at: admin.firestore.Timestamp.fromDate(new Date()),
          notes: `自動生成的續約發票 (基於 ${invoice.invoice_number})`
        };
        
        const newInvoiceRef = db.collection('invoices').doc();
        batch.set(newInvoiceRef, renewalInvoice);
        generatedCount++;
      }
      
      if (generatedCount > 0) {
        await batch.commit();
        console.log(`Generated ${generatedCount} renewal invoices`);
      }
      
      return null;
    } catch (error) {
      console.error('Error in scheduled invoice generation:', error);
      throw error;
    }
  });

const generateNextInvoiceNumber = async (db, contractNumber, type = 'Z') => {
  const invoicesSnapshot = await db.collection('invoices')
    .where('contract_number', '==', contractNumber)
    .get();
  
  const existingInvoices = [];
  invoicesSnapshot.forEach(doc => {
    existingInvoices.push(doc.data());
  });
  
  const typeInvoices = existingInvoices.filter(inv => 
    inv.invoice_number && inv.invoice_number.includes(`-${type}`)
  );
  
  if (typeInvoices.length === 0) {
    return `${contractNumber}-${type}001`;
  }
  
  const numbers = typeInvoices.map(inv => {
    const parts = inv.invoice_number.split('-')[1];
    if (parts && parts.startsWith(type)) {
      return parseInt(parts.substring(1));
    }
    return 0;
  }).filter(num => !isNaN(num));
  
  const maxNumber = Math.max(...numbers);
  const nextNumber = maxNumber + 1;
  
  return `${contractNumber}-${type}${String(nextNumber).padStart(3, '0')}`;
}; 