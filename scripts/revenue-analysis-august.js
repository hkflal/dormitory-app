const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs } = require('firebase/firestore');
const fs = require('fs');
const path = require('path');

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDPbwDZ2a0cgbRoRZiuoO2Ywh5vq4xKGFo",
  authDomain: "dormitory-management-6c1a5.firebaseapp.com",
  projectId: "dormitory-management-6c1a5",
  storageBucket: "dormitory-management-6c1a5.firebasestorage.app",
  messagingSenderId: "600480501319",
  appId: "1:600480501319:web:eb1350c03dbcba3cbeeb62"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Helper functions (matching dashboard logic)
const calculateProjectedIncome = (employees, currentYear, currentMonth) => {
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  
  return employees.reduce((total, emp) => {
    const empRent = parseFloat(emp.rent) || parseFloat(emp.monthlyRent) || 0;
    if (empRent === 0) return total;

    if (emp.status === 'housed') {
      // Full rent for currently housed employees
      return total + empRent;
    } else if ((emp.status === 'approved' || emp.status === 'pending' || emp.status === 'pending_assignment') && emp.arrival_at) {
      // Prorated rent for upcoming employees based on arrival date
      const arrivalDate = emp.arrival_at.toDate ? emp.arrival_at.toDate() : new Date(emp.arrival_at);
      
      // Check if arrival date is in the current month
      if (arrivalDate.getFullYear() === currentYear && arrivalDate.getMonth() === currentMonth) {
        const arrivalDay = arrivalDate.getDate();
        const remainingDays = daysInMonth - arrivalDay + 1; // +1 to include arrival day
        const proratedRent = (remainingDays / daysInMonth) * empRent;
        
        return total + proratedRent;
      }
    }
    
    return total;
  }, 0);
};

const getCurrentMonthInvoices = (invoices, year, month) => {
  return invoices.filter(inv => {
    // Check if the target month falls within the invoice's coverage period
    if (!inv.start_date || !inv.end_date) {
      // Fallback to issueDate if start/end dates are missing
      const issueDate = inv.issueDate && inv.issueDate.toDate ? inv.issueDate.toDate() : new Date(inv.issueDate);
      return issueDate.getFullYear() === year && issueDate.getMonth() === month;
    }
    
    const startDate = inv.start_date.toDate ? inv.start_date.toDate() : new Date(inv.start_date);
    const endDate = inv.end_date.toDate ? inv.end_date.toDate() : new Date(inv.end_date);
    
    // Create target month date range
    const targetMonthStart = new Date(year, month, 1);
    const targetMonthEnd = new Date(year, month + 1, 0); // Last day of target month
    
    // Check if invoice period overlaps with target month
    return startDate <= targetMonthEnd && endDate >= targetMonthStart;
  });
};

const formatCurrency = (amount) => {
  const numericAmount = parseFloat(amount || 0);
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true
  }).format(numericAmount);
};

const formatDate = (date) => {
  if (!date) return 'N/A';
  const dateObj = date.toDate ? date.toDate() : new Date(date);
  return dateObj.toLocaleDateString('zh-HK');
};

async function analyzeRevenueDiscrepancy() {
  console.log('🔍 Starting Revenue Analysis for August 2025...\n');
  
  try {
    // Fetch data from Firebase
    console.log('📊 Fetching data from Firebase...');
    const [employeesSnapshot, invoicesSnapshot] = await Promise.all([
      getDocs(collection(db, 'employees')),
      getDocs(collection(db, 'invoices'))
    ]);

    const employees = employeesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const invoices = invoicesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    console.log(`✅ Loaded ${employees.length} employees and ${invoices.length} invoices\n`);

    // Analysis parameters
    const targetYear = 2025;
    const targetMonth = 7; // August (0-based)
    
    console.log('📋 CARD A ANALYSIS (Theoretical Rent)');
    console.log('=====================================');
    
    // Card A: Calculate theoretical rent (housed + upcoming employees)
    const housedEmployees = employees.filter(emp => emp.status === 'housed');
    const upcomingEmployees = employees.filter(emp => 
      ['approved', 'pending', 'pending_assignment'].includes(emp.status) && 
      emp.arrival_at
    );
    
    console.log(`🏠 Housed employees: ${housedEmployees.length}`);
    console.log(`📅 Upcoming employees: ${upcomingEmployees.length}`);
    
    // Calculate theoretical rent using dashboard logic
    const totalReceivableRent = calculateProjectedIncome(employees, targetYear, targetMonth);
    console.log(`💰 Card A - Total Receivable Rent: $${formatCurrency(totalReceivableRent)}\n`);
    
    console.log('📋 CARD B ANALYSIS (Invoiced Rent)');
    console.log('===================================');
    
    // Card B: Calculate invoiced amounts
    const augustInvoices = getCurrentMonthInvoices(invoices, targetYear, targetMonth);
    console.log(`📄 August invoices found: ${augustInvoices.length}`);
    
    const invoicedRent = augustInvoices.reduce((sum, inv) => {
      return sum + (parseFloat(inv.amount) || 0);
    }, 0);
    
    console.log(`💰 Card B - Total Invoiced Rent: $${formatCurrency(invoicedRent)}\n`);
    
    console.log('📊 DISCREPANCY ANALYSIS');
    console.log('========================');
    
    const discrepancy = totalReceivableRent - invoicedRent;
    const discrepancyPercent = totalReceivableRent > 0 ? (discrepancy / totalReceivableRent * 100) : 0;
    
    console.log(`❌ Discrepancy: $${formatCurrency(discrepancy)} (${discrepancyPercent.toFixed(1)}%)`);
    console.log(`📈 Card A: $${formatCurrency(totalReceivableRent)}`);
    console.log(`📉 Card B: $${formatCurrency(invoicedRent)}\n`);
    
    console.log('🔍 DETAILED EMPLOYEE ANALYSIS');
    console.log('===============================');
    
    // Create detailed comparison
    const detailedAnalysis = [];
    
    // Process housed employees
    for (const employee of housedEmployees) {
      const employeeRent = parseFloat(employee.rent) || parseFloat(employee.monthlyRent) || 0;
      
      // Find matching invoices for this employee
      const employeeInvoices = augustInvoices.filter(inv => 
        inv.employee_id === employee.id || 
        (inv.employee_names && inv.employee_names.some(name => 
          name === employee.name || name === employee.firstName || name === `${employee.firstName} ${employee.lastName}`
        ))
      );
      
      const invoiceAmount = employeeInvoices.reduce((sum, inv) => sum + (parseFloat(inv.amount) || 0), 0);
      const difference = employeeRent - invoiceAmount;
      
      let discrepancyReason = 'Match';
      if (employeeInvoices.length === 0) {
        discrepancyReason = 'No Invoice';
      } else if (Math.abs(difference) > 0.01) {
        discrepancyReason = 'Amount Mismatch';
      }
      
      detailedAnalysis.push({
        employee_id: employee.id,
        name: employee.name || employee.firstName || 'Unknown',
        status: employee.status,
        assigned_property: employee.assigned_property_id || 'N/A',
        theoretical_rent: employeeRent,
        invoice_count: employeeInvoices.length,
        invoice_amount: invoiceAmount,
        discrepancy_amount: difference,
        discrepancy_reason: discrepancyReason,
        invoice_numbers: employeeInvoices.map(inv => inv.invoice_number).join(', ') || 'N/A',
        arrival_date: employee.arrival_at ? formatDate(employee.arrival_at) : 'N/A'
      });
    }
    
    // Process upcoming employees with August arrival
    for (const employee of upcomingEmployees) {
      const employeeRent = parseFloat(employee.rent) || parseFloat(employee.monthlyRent) || 0;
      const arrivalDate = employee.arrival_at.toDate ? employee.arrival_at.toDate() : new Date(employee.arrival_at);
      
      if (arrivalDate.getFullYear() === targetYear && arrivalDate.getMonth() === targetMonth) {
        const daysInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
        const arrivalDay = arrivalDate.getDate();
        const remainingDays = daysInMonth - arrivalDay + 1;
        const proratedRent = (remainingDays / daysInMonth) * employeeRent;
        
        // Find matching invoices
        const employeeInvoices = augustInvoices.filter(inv => 
          inv.employee_id === employee.id || 
          (inv.employee_names && inv.employee_names.some(name => 
            name === employee.name || name === employee.firstName || name === `${employee.firstName} ${employee.lastName}`
          ))
        );
        
        const invoiceAmount = employeeInvoices.reduce((sum, inv) => sum + (parseFloat(inv.amount) || 0), 0);
        const difference = proratedRent - invoiceAmount;
        
        let discrepancyReason = 'Match';
        if (employeeInvoices.length === 0) {
          discrepancyReason = 'No Invoice (Prorated)';
        } else if (Math.abs(difference) > 0.01) {
          discrepancyReason = 'Prorated Amount Mismatch';
        }
        
        detailedAnalysis.push({
          employee_id: employee.id,
          name: employee.name || employee.firstName || 'Unknown',
          status: employee.status,
          assigned_property: employee.assigned_property_id || 'N/A',
          theoretical_rent: proratedRent,
          invoice_count: employeeInvoices.length,
          invoice_amount: invoiceAmount,
          discrepancy_amount: difference,
          discrepancy_reason: discrepancyReason,
          invoice_numbers: employeeInvoices.map(inv => inv.invoice_number).join(', ') || 'N/A',
          arrival_date: formatDate(employee.arrival_at)
        });
      }
    }
    
    // Summary statistics
    const noInvoiceCount = detailedAnalysis.filter(emp => emp.discrepancy_reason === 'No Invoice').length;
    const amountMismatchCount = detailedAnalysis.filter(emp => emp.discrepancy_reason === 'Amount Mismatch').length;
    const proratedIssues = detailedAnalysis.filter(emp => emp.discrepancy_reason.includes('Prorated')).length;
    const matchCount = detailedAnalysis.filter(emp => emp.discrepancy_reason === 'Match').length;
    
    console.log('📈 SUMMARY STATISTICS');
    console.log('=====================');
    console.log(`✅ Perfect matches: ${matchCount}`);
    console.log(`❌ No invoices: ${noInvoiceCount}`);
    console.log(`⚠️  Amount mismatches: ${amountMismatchCount}`);
    console.log(`📅 Prorated issues: ${proratedIssues}`);
    console.log(`📋 Total analyzed: ${detailedAnalysis.length}\n`);
    
    // Top discrepancies
    const topDiscrepancies = detailedAnalysis
      .filter(emp => Math.abs(emp.discrepancy_amount) > 0.01)
      .sort((a, b) => Math.abs(b.discrepancy_amount) - Math.abs(a.discrepancy_amount))
      .slice(0, 10);
    
    console.log('🔍 TOP 10 DISCREPANCIES');
    console.log('========================');
    topDiscrepancies.forEach((emp, index) => {
      console.log(`${index + 1}. ${emp.name} (${emp.employee_id})`);
      console.log(`   Theoretical: $${formatCurrency(emp.theoretical_rent)}`);
      console.log(`   Invoiced: $${formatCurrency(emp.invoice_amount)}`);
      console.log(`   Difference: $${formatCurrency(emp.discrepancy_amount)}`);
      console.log(`   Reason: ${emp.discrepancy_reason}\n`);
    });
    
    // Generate CSV report
    const csvHeader = [
      'employee_id',
      'name', 
      'status',
      'assigned_property',
      'theoretical_rent',
      'invoice_count',
      'invoice_amount',
      'discrepancy_amount',
      'discrepancy_reason',
      'invoice_numbers',
      'arrival_date'
    ].join(',');
    
    const csvRows = detailedAnalysis.map(emp => [
      emp.employee_id,
      `"${emp.name}"`,
      emp.status,
      emp.assigned_property,
      emp.theoretical_rent.toFixed(2),
      emp.invoice_count,
      emp.invoice_amount.toFixed(2),
      emp.discrepancy_amount.toFixed(2),
      `"${emp.discrepancy_reason}"`,
      `"${emp.invoice_numbers}"`,
      emp.arrival_date
    ].join(','));
    
    const csvContent = [csvHeader, ...csvRows].join('\n');
    
    const outputPath = path.join(__dirname, '..', 'revenue_August_detail.csv');
    fs.writeFileSync(outputPath, csvContent);
    
    console.log(`📄 Detailed report saved to: ${outputPath}`);
    console.log(`📊 Analysis complete! Found ${detailedAnalysis.length} employees in scope.`);
    
  } catch (error) {
    console.error('❌ Error during analysis:', error);
  }
  
  process.exit(0);
}

// Run the analysis
analyzeRevenueDiscrepancy();