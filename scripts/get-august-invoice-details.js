const admin = require('firebase-admin');
const serviceAccount = require('../dormitory-app-firebase-adminsdk-bnmoz-8a3bcd6e6f.json');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function getAugustInvoiceDetails() {
  console.log('🔍 Getting August 2025 Invoice Details...\n');
  
  try {
    // Fetch all invoices
    const invoicesSnapshot = await db.collection('invoices').get();
    const invoices = invoicesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    console.log(`Total invoices in database: ${invoices.length}\n`);
    
    // Filter for August 2025 invoices
    // Based on the dashboard logic, we need to find invoices that overlap with August 2025
    const august2025Start = new Date(2025, 7, 1); // August 1, 2025
    const august2025End = new Date(2025, 7, 31, 23, 59, 59); // August 31, 2025
    
    const augustInvoices = invoices.filter(inv => {
      if (!inv.start_date || !inv.end_date) return false;
      
      const startDate = inv.start_date?.toDate ? inv.start_date.toDate() : new Date(inv.start_date);
      const endDate = inv.end_date?.toDate ? inv.end_date.toDate() : new Date(inv.end_date);
      
      // Check if invoice period overlaps with August 2025
      return startDate <= august2025End && endDate >= august2025Start;
    });
    
    console.log(`Found ${augustInvoices.length} invoices overlapping with August 2025\n`);
    
    // Sort invoices by employee ID and then by amount
    augustInvoices.sort((a, b) => {
      const idA = a.employee_id || '';
      const idB = b.employee_id || '';
      if (idA !== idB) return idA.localeCompare(idB);
      return (parseFloat(a.amount) || 0) - (parseFloat(b.amount) || 0);
    });
    
    // Calculate total
    let totalAmount = 0;
    const invoiceDetails = [];
    
    // Process each invoice
    for (const invoice of augustInvoices) {
      const amount = parseFloat(invoice.amount) || 0;
      totalAmount += amount;
      
      // Get employee name and company
      const employeeName = invoice.employee_names && invoice.employee_names.length > 0 
        ? invoice.employee_names[0] 
        : 'Unknown';
      
      const company = invoice.company || 'N/A';
      const employeeId = invoice.employee_id || 'N/A';
      
      // Format amount with proper currency formatting
      const formattedAmount = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(amount);
      
      // Add to details array
      invoiceDetails.push({
        employeeId,
        employeeName,
        company,
        amount: formattedAmount,
        rawAmount: amount,
        invoiceNumber: invoice.invoice_number || 'N/A',
        startDate: invoice.start_date ? (invoice.start_date.toDate ? invoice.start_date.toDate() : new Date(invoice.start_date)) : null,
        endDate: invoice.end_date ? (invoice.end_date.toDate ? invoice.end_date.toDate() : new Date(invoice.end_date)) : null
      });
    }
    
    // Print detailed list in requested format
    console.log('===========================================');
    console.log('AUGUST 2025 INVOICE DETAILS');
    console.log('===========================================\n');
    
    for (const detail of invoiceDetails) {
      console.log(`${detail.employeeId} ${detail.employeeName} ${detail.company}  ${detail.amount}`);
    }
    
    console.log('\n===========================================');
    console.log('SUMMARY');
    console.log('===========================================');
    console.log(`Total Invoices: ${augustInvoices.length}`);
    console.log(`Total Amount: ${new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(totalAmount)}`);
    console.log('===========================================\n');
    
    // Also save to a file for reference
    const fs = require('fs');
    const path = require('path');
    const outputPath = path.join(__dirname, '..', 'august_invoices_detail.txt');
    
    let fileContent = 'AUGUST 2025 INVOICE DETAILS\n';
    fileContent += '===========================================\n\n';
    
    for (const detail of invoiceDetails) {
      fileContent += `${detail.employeeId} ${detail.employeeName} ${detail.company}  ${detail.amount}\n`;
    }
    
    fileContent += '\n===========================================\n';
    fileContent += `Total Invoices: ${augustInvoices.length}\n`;
    fileContent += `Total Amount: ${new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(totalAmount)}\n`;
    
    fs.writeFileSync(outputPath, fileContent);
    console.log(`✅ Details also saved to: ${outputPath}`);
    
    // Group by company for additional insights
    console.log('\n===========================================');
    console.log('BREAKDOWN BY COMPANY');
    console.log('===========================================\n');
    
    const companyBreakdown = {};
    for (const detail of invoiceDetails) {
      if (!companyBreakdown[detail.company]) {
        companyBreakdown[detail.company] = {
          count: 0,
          total: 0,
          invoices: []
        };
      }
      companyBreakdown[detail.company].count++;
      companyBreakdown[detail.company].total += detail.rawAmount;
      companyBreakdown[detail.company].invoices.push(detail);
    }
    
    // Sort companies by total amount
    const sortedCompanies = Object.entries(companyBreakdown)
      .sort((a, b) => b[1].total - a[1].total);
    
    for (const [company, data] of sortedCompanies) {
      console.log(`${company}:`);
      console.log(`  Invoices: ${data.count}`);
      console.log(`  Total: ${new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(data.total)}\n`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
  
  process.exit(0);
}

// Run the analysis
getAugustInvoiceDetails();
