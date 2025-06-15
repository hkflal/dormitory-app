const admin = require('firebase-admin');
const { collection, getDocs, addDoc, query, where, orderBy, writeBatch } = require('firebase/firestore');

// Initialize Firebase Admin (you may need to adjust the path to your service account key)
const serviceAccount = require('../serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

const checkAndGenerateRenewalInvoices = async () => {
  console.log('🤖 Starting auto-generation check...');
  
  try {
    const today = new Date();
    const fourteenDaysFromNow = new Date(today.getTime() + (14 * 24 * 60 * 60 * 1000));
    
    console.log(`📅 Checking for invoices ending between ${today.toDateString()} and ${fourteenDaysFromNow.toDateString()}`);
    
    // Get all active invoices that are ending within 14 days
    const invoicesSnapshot = await db.collection('invoices').get();
    const candidateInvoices = [];
    
    invoicesSnapshot.forEach(doc => {
      const invoice = { id: doc.id, ...doc.data() };
      
      // Convert Firestore timestamp to Date
      let endDate = invoice.end_date;
      if (endDate && endDate.toDate) {
        endDate = endDate.toDate();
      } else if (endDate) {
        endDate = new Date(endDate);
      }
      
      // Check if invoice is ending within 14 days and is active
      if (endDate && 
          endDate >= today && 
          endDate <= fourteenDaysFromNow &&
          (invoice.status === 'paid' || invoice.status === 'pending') &&
          !invoice.is_deposit && // Don't auto-renew deposit invoices
          !invoice.auto_generated) { // Don't create renewals for already auto-generated invoices
        
        candidateInvoices.push({ ...invoice, end_date: endDate });
      }
    });
    
    console.log(`🔍 Found ${candidateInvoices.length} invoices that need renewal generation`);
    
    if (candidateInvoices.length === 0) {
      console.log('✅ No renewal invoices needed at this time');
      return;
    }
    
    const batch = admin.firestore().batch();
    let generatedCount = 0;
    
    for (const invoice of candidateInvoices) {
      try {
        // Check if renewal already exists
        const existingRenewalQuery = await db.collection('invoices')
          .where('contract_number', '==', invoice.contract_number)
          .where('renewal_source_id', '==', invoice.id)
          .get();
        
        if (!existingRenewalQuery.empty) {
          console.log(`⏭️  Renewal for ${invoice.invoice_number} already exists, skipping`);
          continue;
        }
        
        // Generate next invoice number
        const nextInvoiceNumber = await generateNextInvoiceNumber(invoice.contract_number, 'Z');
        
        // Calculate new dates (3-month period starting from current end date + 1 day)
        const newStartDate = new Date(invoice.end_date);
        newStartDate.setDate(newStartDate.getDate() + 1);
        
        const newEndDate = new Date(newStartDate);
        newEndDate.setMonth(newEndDate.getMonth() + 3);
        
        // Create renewal invoice
        const newInvoiceData = {
          invoice_number: nextInvoiceNumber,
          contract_number: invoice.contract_number,
          employee_names: invoice.employee_names,
          amount: invoice.amount, // Keep as unit price
          frequency: invoice.frequency || 1,
          n_employees: invoice.n_employees || invoice.employee_names?.length || 1,
          start_date: newStartDate,
          end_date: newEndDate,
          status: 'pending',
          is_deposit: false,
          auto_generated: true,
          renewal_tag: '續約 - 自動生成',
          property_name: invoice.property_name,
          room_number: invoice.room_number,
          notes: `自動生成的續約發票 (基於 ${invoice.invoice_number})`,
          created_at: new Date(),
          updated_at: new Date()
        };
        
        // Add to batch
        const newInvoiceRef = db.collection('invoices').doc();
        batch.set(newInvoiceRef, newInvoiceData);
        
        generatedCount++;
        console.log(`✨ Generated renewal: ${nextInvoiceNumber} for contract ${invoice.contract_number} (${newStartDate.toDateString()} - ${newEndDate.toDateString()})`);
        console.log(`  📄 Generated: ${nextInvoiceNumber} - Total: ${formatCurrency(newInvoiceData.amount * newInvoiceData.n_employees * newInvoiceData.frequency)}`);
        
      } catch (error) {
        console.error(`❌ Error generating renewal for ${invoice.invoice_number}:`, error);
      }
    }
    
    if (generatedCount > 0) {
      await batch.commit();
      console.log(`🎉 Successfully generated ${generatedCount} renewal invoices!`);
    } else {
      console.log('ℹ️  No new renewals were generated');
    }
    
  } catch (error) {
    console.error('💥 Error in auto-generation process:', error);
  }
};

// Helper function to generate next invoice number
const generateNextInvoiceNumber = async (contractNumber, type = 'Z') => {
  try {
    const invoicesSnapshot = await db.collection('invoices')
      .where('contract_number', '==', contractNumber)
      .get();
    
    const existingInvoices = [];
    invoicesSnapshot.forEach(doc => {
      existingInvoices.push(doc.data());
    });
    
    // Filter by type and find the highest number
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
  } catch (error) {
    console.error('Error generating invoice number:', error);
    return `${contractNumber}-${type}001`;
  }
};

// Run the check
checkAndGenerateRenewalInvoices()
  .then(() => {
    console.log('🏁 Auto-generation check completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Auto-generation check failed:', error);
    process.exit(1);
  });

// The auto-generation script doesn't need changes since the DOCX generation 
// is now handled automatically by the Firestore trigger when a new invoice is created

// But let's add a verification function
async function verifyDocxGeneration() {
    console.log('🔍 Checking DOCX generation status...');
    
    try {
        const invoicesSnapshot = await db.collection('invoices')
            .where('docx_url', '==', null)
            .limit(10)
            .get();
        
        if (invoicesSnapshot.empty) {
            console.log('✅ All invoices have DOCX files generated');
            return;
        }
        
        console.log(`⚠️  Found ${invoicesSnapshot.size} invoices without DOCX files:`);
        
        invoicesSnapshot.forEach(doc => {
            const data = doc.data();
            console.log(`   - ${data.invoice_number} (${doc.id})`);
        });
        
        console.log('\n💡 You can regenerate these using the regenerateInvoiceDocx function');
        
    } catch (error) {
        console.error('❌ Error checking DOCX generation:', error);
    }
}

// Add this to the end of your auto-generation script
// verifyDocxGeneration(); 