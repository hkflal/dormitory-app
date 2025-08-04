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
        
        // Calculate computed fields for proper billing
        const employeeNames = invoice.employee_names || [];
        const nEmployees = Array.isArray(employeeNames) ? employeeNames.length : 0;
        const frequency = 3; // Standard 3-month renewal period
        const calculatedTotal = (invoice.amount || 0) * nEmployees * frequency;
        
        const renewalInvoice = {
          invoice_number: nextInvoiceNumber,
          contract_number: invoice.contract_number,
          employee_names: employeeNames,
          amount: invoice.amount || 0,
          total: calculatedTotal,
          // 🔧 FIX: Add critical computed fields for proper billing
          n_employees: nEmployees,
          frequency: frequency,
          n: nEmployees, // For template compatibility
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

// Management Fee Invoice Generation
exports.scheduledManagementFeeGeneration = functions.pubsub
  .schedule('0 9 24 * *') // Run on the 24th of each month at 9 AM (7 days before typical month end)
  .onRun(async (context) => {
    console.log('Starting scheduled management fee invoice generation...');
    
    const db = admin.firestore();
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    
    // Calculate next month's start and end dates
    const nextMonthStart = new Date(currentYear, currentMonth + 1, 1);
    const nextMonthEnd = new Date(currentYear, currentMonth + 2, 0); // Last day of next month
    
    try {
      // Get all contracts that have existing management fee invoices
      const existingManagementInvoices = await db.collection('invoices')
        .where('invoice_type', '==', 'management_fee')
        .get();
      
      // Group by contract number to find contracts with management fee history
      const contractsWithManagementFees = new Set();
      existingManagementInvoices.forEach(doc => {
        const invoice = doc.data();
        if (invoice.contract_number) {
          contractsWithManagementFees.add(invoice.contract_number);
        }
      });
      
      console.log(`Found ${contractsWithManagementFees.size} contracts with management fee history`);
      
      const batch = db.batch();
      let generatedCount = 0;
      
      for (const contractNumber of contractsWithManagementFees) {
        // Check if invoice for next month already exists
        const existingNextMonth = await db.collection('invoices')
          .where('contract_number', '==', contractNumber)
          .where('invoice_type', '==', 'management_fee')
          .where('start_date', '>=', admin.firestore.Timestamp.fromDate(nextMonthStart))
          .where('start_date', '<', admin.firestore.Timestamp.fromDate(new Date(currentYear, currentMonth + 2, 1)))
          .get();
        
        if (!existingNextMonth.empty) {
          console.log(`Management fee invoice for ${contractNumber} already exists for next month`);
          continue;
        }
        
        // Get active employees for this contract
        const employeesSnapshot = await db.collection('employees')
          .where('contract_number', '==', contractNumber)
          .where('status', 'in', ['active', 'newly_signed'])
          .get();
        
        if (employeesSnapshot.empty) {
          console.log(`No active employees found for contract ${contractNumber}`);
          continue;
        }
        
        const employees = [];
        let company = '';
        employeesSnapshot.forEach(doc => {
          const emp = doc.data();
          employees.push(emp.name || '');
          if (!company && emp.company) {
            company = emp.company;
          }
        });
        
        // Generate invoice number
        const nextInvoiceNumber = await generateNextInvoiceNumber(db, contractNumber, 'M');
        
        const managementFeeInvoice = {
          invoice_number: nextInvoiceNumber,
          contract_number: contractNumber,
          employee_names: employees,
          company: company,
          amount: 350, // Fixed management fee amount
          n_employees: employees.length,
          frequency: 1,
          total: 350 * employees.length,
          start_date: admin.firestore.Timestamp.fromDate(nextMonthStart),
          end_date: admin.firestore.Timestamp.fromDate(nextMonthEnd),
          status: 'pending',
          auto_generated: true,
          invoice_type: 'management_fee',
          template_type: 'management',
          notes: '管理費 - 自動生成',
          created_at: admin.firestore.Timestamp.fromDate(new Date()),
          updated_at: admin.firestore.Timestamp.fromDate(new Date())
        };
        
        const newInvoiceRef = db.collection('invoices').doc();
        batch.set(newInvoiceRef, managementFeeInvoice);
        generatedCount++;
      }
      
      if (generatedCount > 0) {
        await batch.commit();
        console.log(`Generated ${generatedCount} management fee invoices`);
      }
      
      return null;
    } catch (error) {
      console.error('Error in scheduled management fee generation:', error);
      throw error;
    }
  }); 