const { collection, getDocs } = require('firebase/firestore');
const { db } = require('./lib/firebase');

/**
 * AUDIT: September 2025 Paid Amount Calculation
 * Verify if $589,289.90 is the correct paid amount
 */

// Helper function to calculate proportional amount (same logic as payment-details)
const calculateProportionalAmount = (startDate, endDate, monthYear, totalInvoiceAmount, employeeMonthlyRent, employeeName = '') => {
  const targetYear = parseInt(monthYear.split('-')[0]);
  const targetMonth = parseInt(monthYear.split('-')[1]);
  
  // Get the first and last day of the target month
  const monthStart = new Date(targetYear, targetMonth - 1, 1);
  const monthEnd = new Date(targetYear, targetMonth, 0); // Last day of month
  
  // Get overlap period
  const overlapStart = new Date(Math.max(startDate.getTime(), monthStart.getTime()));
  const overlapEnd = new Date(Math.min(endDate.getTime(), monthEnd.getTime()));
  
  if (overlapStart > overlapEnd) {
    return 0; // No overlap
  }
  
  // Calculate days of overlap
  const overlapDays = Math.ceil((overlapEnd - overlapStart) / (1000 * 60 * 60 * 24)) + 1;
  const monthDays = monthEnd.getDate();
  
  // Use employee's actual monthly rent for calculations
  const actualMonthlyRent = employeeMonthlyRent > 0 ? employeeMonthlyRent : 3500;
  
  // Check if this invoice covers the FULL month
  const coversFullMonth = (startDate <= monthStart && endDate >= monthEnd);
  
  // For full month coverage: exactly the employee's monthly rent
  if (coversFullMonth) {
    return actualMonthlyRent;
  }
  
  // For partial months: proportional calculation
  let partialAmount = (overlapDays / monthDays) * actualMonthlyRent;
  
  // VALIDATION: No single month contribution should exceed employee's monthly rent
  if (partialAmount > actualMonthlyRent) {
    partialAmount = actualMonthlyRent;
  }
  
  return partialAmount;
};

async function auditSeptemberPayments() {
  console.log('🔍 AUDIT: September 2025 Paid Amount Calculation');
  console.log('='.repeat(80));
  
  try {
    // Fetch all data
    const [employeesSnapshot, invoicesSnapshot] = await Promise.all([
      getDocs(collection(db, 'employees')),
      getDocs(collection(db, 'invoices'))
    ]);

    const employees = employeesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const invoices = invoicesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    console.log(`📊 Data loaded: ${employees.length} employees, ${invoices.length} invoices`);
    
    // Filter housed employees only (same as payment-details)
    const housedEmployees = employees.filter(emp => emp.status === 'housed' && emp.status !== 'resigned');
    console.log(`🏠 Housed employees: ${housedEmployees.length}`);
    
    // Track September calculations
    let totalSeptemberPaid = 0;
    let totalSeptemberUnpaid = 0;
    let totalSeptemberInvoiced = 0;
    const auditDetails = [];
    
    console.log('\n📋 DETAILED AUDIT:');
    console.log('-'.repeat(80));
    
    // Process each housed employee
    housedEmployees.forEach((employee, empIndex) => {
      // Find all invoices for this employee (excluding deposits)
      const employeeInvoices = invoices.filter(inv => {
        // Check if it's for this employee
        const isForEmployee = inv.employee_id === employee.id || 
          (inv.employee_names && Array.isArray(inv.employee_names) && inv.employee_names.some(name => {
            const empName = employee.name || employee.firstName || '';
            return name && empName && (name.includes(empName) || empName.includes(name));
          }));
        
        if (!isForEmployee) return false;
        
        // Filter out deposit invoices
        const invoiceNumber = (inv.invoice_number || '').toLowerCase();
        const description = (inv.description || '').toLowerCase();
        const type = (inv.type || '').toLowerCase();
        const notes = (inv.notes || '').toLowerCase();
        
        const depositKeywords = ['deposit', 'deposite', '按金', '押金', 'security', '-a001', '-a002', '-a003'];
        const isDeposit = depositKeywords.some(keyword => 
          invoiceNumber.includes(keyword) || 
          description.includes(keyword) || 
          type.includes(keyword) ||
          notes.includes(keyword)
        );
        
        return !isDeposit;
      });
      
      // Calculate September contribution for this employee
      let employeeSeptemberPaid = 0;
      let employeeSeptemberUnpaid = 0;
      let employeeSeptemberTotal = 0;
      const employeeInvoiceDetails = [];
      
      employeeInvoices.forEach(invoice => {
        if (!invoice.start_date || !invoice.end_date) return;

        const startDate = invoice.start_date?.toDate ? invoice.start_date.toDate() : new Date(invoice.start_date);
        const endDate = invoice.end_date?.toDate ? invoice.end_date.toDate() : new Date(invoice.end_date);
        const totalInvoiceAmount = parseFloat(invoice.amount) || 0;
        const employeeMonthlyRent = parseFloat(employee.rent) || parseFloat(employee.monthlyRent) || 0;
        const isPaid = invoice.status === 'paid';
        const isIssued = invoice.is_issued === true;
        
        // Calculate proportional amount for September 2025
        const proportionalAmount = calculateProportionalAmount(
          startDate, 
          endDate, 
          '2025-09', 
          totalInvoiceAmount,
          employeeMonthlyRent,
          employee.name
        );
        
        if (proportionalAmount > 0 && isIssued) {
          employeeSeptemberTotal += proportionalAmount;
          
          if (isPaid) {
            employeeSeptemberPaid += proportionalAmount;
          } else {
            employeeSeptemberUnpaid += proportionalAmount;
          }
          
          employeeInvoiceDetails.push({
            invoiceNumber: invoice.invoice_number,
            status: invoice.status,
            totalAmount: totalInvoiceAmount,
            proportionalAmount: proportionalAmount,
            startDate: startDate.toLocaleDateString(),
            endDate: endDate.toLocaleDateString(),
            isPaid: isPaid,
            isIssued: isIssued
          });
        }
      });
      
      // Add to totals if employee has September data
      if (employeeSeptemberTotal > 0) {
        totalSeptemberPaid += employeeSeptemberPaid;
        totalSeptemberUnpaid += employeeSeptemberUnpaid;
        totalSeptemberInvoiced += employeeSeptemberTotal;
        
        auditDetails.push({
          employeeName: employee.name || employee.firstName || 'Unknown',
          employeeId: employee.id,
          company: employee.company || 'N/A',
          monthlyRent: parseFloat(employee.rent) || parseFloat(employee.monthlyRent) || 0,
          septemberPaid: employeeSeptemberPaid,
          septemberUnpaid: employeeSeptemberUnpaid,
          septemberTotal: employeeSeptemberTotal,
          invoiceCount: employeeInvoiceDetails.length,
          invoices: employeeInvoiceDetails
        });
        
        console.log(`${empIndex + 1}. ${employee.name || 'Unknown'} (${employee.company || 'N/A'})`);
        console.log(`   Rent: $${(parseFloat(employee.rent) || parseFloat(employee.monthlyRent) || 0).toLocaleString()}`);
        console.log(`   September Total: $${employeeSeptemberTotal.toFixed(2)}`);
        console.log(`   September Paid: $${employeeSeptemberPaid.toFixed(2)}`);
        console.log(`   September Unpaid: $${employeeSeptemberUnpaid.toFixed(2)}`);
        console.log(`   Invoices: ${employeeInvoiceDetails.length}`);
        
        // Show invoice details for employees with significant amounts
        if (employeeSeptemberTotal > 1000) {
          employeeInvoiceDetails.forEach(inv => {
            console.log(`     - ${inv.invoiceNumber}: $${inv.proportionalAmount.toFixed(2)} (${inv.status}) [${inv.startDate} to ${inv.endDate}]`);
          });
        }
        console.log('');
      }
    });
    
    console.log('\n📊 AUDIT SUMMARY:');
    console.log('='.repeat(80));
    console.log(`Total September Paid: $${totalSeptemberPaid.toFixed(2)}`);
    console.log(`Total September Unpaid: $${totalSeptemberUnpaid.toFixed(2)}`);
    console.log(`Total September Invoiced: $${totalSeptemberInvoiced.toFixed(2)}`);
    console.log(`Collection Rate: ${(totalSeptemberPaid / totalSeptemberInvoiced * 100).toFixed(2)}%`);
    console.log(`Employees with September data: ${auditDetails.length}`);
    
    console.log('\n🔍 VERIFICATION:');
    console.log(`Expected Paid Amount: $589,289.90`);
    console.log(`Calculated Paid Amount: $${totalSeptemberPaid.toFixed(2)}`);
    console.log(`Difference: $${(589289.90 - totalSeptemberPaid).toFixed(2)}`);
    console.log(`Match: ${Math.abs(589289.90 - totalSeptemberPaid) < 0.01 ? '✅ YES' : '❌ NO'}`);
    
    // Top 10 highest paid amounts for verification
    console.log('\n🔝 TOP 10 HIGHEST SEPTEMBER PAYMENTS:');
    const sortedByPaid = auditDetails.sort((a, b) => b.septemberPaid - a.septemberPaid).slice(0, 10);
    sortedByPaid.forEach((emp, index) => {
      console.log(`${index + 1}. ${emp.employeeName} (${emp.company}): $${emp.septemberPaid.toFixed(2)}`);
    });
    
    return {
      totalPaid: totalSeptemberPaid,
      totalUnpaid: totalSeptemberUnpaid,
      totalInvoiced: totalSeptemberInvoiced,
      employeeCount: auditDetails.length,
      details: auditDetails
    };
    
  } catch (error) {
    console.error('❌ Audit Error:', error);
    throw error;
  }
}

// Run the audit
if (require.main === module) {
  auditSeptemberPayments()
    .then(result => {
      console.log('\n✅ Audit completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Audit failed:', error);
      process.exit(1);
    });
}

module.exports = { auditSeptemberPayments };