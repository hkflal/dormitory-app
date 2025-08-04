const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function fixInvoiceComputedFields() {
  console.log('🔧 Starting to fix invoice computed fields...\n');
  
  try {
    // Get all invoices
    const invoicesSnapshot = await db.collection('invoices').get();
    
    let totalInvoices = 0;
    let fixedInvoices = 0;
    let problematicInvoices = [];
    
    // Analyze all invoices
    for (const doc of invoicesSnapshot.docs) {
      const invoice = doc.data();
      totalInvoices++;
      
      // Check if this invoice has the computed fields issue
      const employeeCount = Array.isArray(invoice.employee_names) ? 
        invoice.employee_names.filter(name => name && name.trim().length > 0).length : 0;
      
      const hasIssue = employeeCount > 1 && (!invoice.n_employees || invoice.n_employees !== employeeCount);
      
      if (hasIssue) {
        problematicInvoices.push({
          id: doc.id,
          invoice_number: invoice.invoice_number,
          contract_number: invoice.contract_number,
          employee_names: invoice.employee_names,
          old_n_employees: invoice.n_employees || 'missing',
          actual_employee_count: employeeCount,
          amount: invoice.amount,
          auto_generated: invoice.auto_generated || false
        });
      }
    }
    
    console.log(`📊 Analysis Results:`);
    console.log(`   Total invoices: ${totalInvoices}`);
    console.log(`   Invoices with issues: ${problematicInvoices.length}`);
    console.log(`   Percentage affected: ${(problematicInvoices.length / totalInvoices * 100).toFixed(1)}%\n`);
    
    if (problematicInvoices.length === 0) {
      console.log('✅ No invoices need fixing!');
      return;
    }
    
    // Show problematic invoices
    console.log('🚨 Problematic invoices found:\n');
    problematicInvoices.forEach(inv => {
      console.log(`   Invoice: ${inv.invoice_number} (${inv.auto_generated ? 'AUTO-GENERATED' : 'MANUAL'})`);
      console.log(`   Contract: ${inv.contract_number}`);
      console.log(`   Employees: ${inv.employee_names.join(', ')}`);
      console.log(`   Current n_employees: ${inv.old_n_employees}`);
      console.log(`   Actual employee count: ${inv.actual_employee_count}`);
      console.log(`   Amount per person: HK$${inv.amount}`);
      console.log(`   ❌ LOST REVENUE: HK$${inv.amount * (inv.actual_employee_count - 1)} per billing period\n`);
    });
    
    // Fix the invoices
    console.log('\n🔧 Fixing invoices...\n');
    
    const batch = db.batch();
    let batchCount = 0;
    
    for (const doc of invoicesSnapshot.docs) {
      const invoice = doc.data();
      
      // Calculate correct values
      const employeeNames = Array.isArray(invoice.employee_names) ? invoice.employee_names : [];
      const nEmployees = employeeNames.filter(name => name && name.trim().length > 0).length;
      
      // Calculate frequency based on date range
      let frequency = 1;
      if (invoice.start_date && invoice.end_date) {
        const startDate = invoice.start_date.toDate ? invoice.start_date.toDate() : new Date(invoice.start_date);
        const endDate = invoice.end_date.toDate ? invoice.end_date.toDate() : new Date(invoice.end_date);
        const diffTime = Math.abs(endDate - startDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays <= 45) {
          frequency = 1;
        } else if (diffDays <= 135) {
          frequency = 3;
        } else {
          frequency = Math.round(diffDays / 30);
        }
      }
      
      // Calculate correct total
      const amount = parseFloat(invoice.amount) || 0;
      const calculatedTotal = amount * nEmployees * frequency;
      
      // Update if needed
      const needsUpdate = !invoice.n_employees || 
                         invoice.n_employees !== nEmployees || 
                         !invoice.frequency || 
                         invoice.frequency !== frequency ||
                         !invoice.n;
      
      if (needsUpdate) {
        batch.update(doc.ref, {
          n_employees: nEmployees,
          frequency: frequency,
          n: nEmployees, // For template compatibility
          total: calculatedTotal,
          computed_fields_fixed: admin.firestore.FieldValue.serverTimestamp(),
          computed_fields_fixed_note: 'Fixed missing n_employees and frequency fields'
        });
        
        fixedInvoices++;
        batchCount++;
        
        console.log(`   ✅ Fixed: ${invoice.invoice_number} - Set n_employees=${nEmployees}, frequency=${frequency}, total=HK$${calculatedTotal}`);
        
        // Commit batch every 400 documents (Firestore limit is 500)
        if (batchCount >= 400) {
          await batch.commit();
          console.log(`   📦 Committed batch of ${batchCount} updates`);
          batchCount = 0;
        }
      }
    }
    
    // Commit remaining updates
    if (batchCount > 0) {
      await batch.commit();
      console.log(`   📦 Committed final batch of ${batchCount} updates`);
    }
    
    console.log(`\n✅ Fix complete!`);
    console.log(`   Total invoices processed: ${totalInvoices}`);
    console.log(`   Invoices fixed: ${fixedInvoices}`);
    console.log(`   Success rate: ${(fixedInvoices / problematicInvoices.length * 100).toFixed(1)}%`);
    
    // Verify specific invoice mentioned by user
    console.log(`\n🔍 Verifying invoice D10106-Z008...`);
    const specificInvoice = await db.collection('invoices')
      .where('invoice_number', '==', 'D10106-Z008')
      .get();
    
    if (!specificInvoice.empty) {
      const inv = specificInvoice.docs[0].data();
      console.log(`   Invoice: ${inv.invoice_number}`);
      console.log(`   Employees: ${inv.employee_names.join(', ')}`);
      console.log(`   n_employees: ${inv.n_employees}`);
      console.log(`   frequency: ${inv.frequency}`);
      console.log(`   amount: HK$${inv.amount}`);
      console.log(`   total: HK$${inv.total}`);
      console.log(`   Calculation: HK$${inv.amount} × ${inv.n_employees} × ${inv.frequency} = HK$${inv.total}`);
    } else {
      console.log(`   ⚠️ Invoice D10106-Z008 not found`);
    }
    
  } catch (error) {
    console.error('❌ Error fixing invoices:', error);
  } finally {
    process.exit();
  }
}

// Run the fix
fixInvoiceComputedFields(); 