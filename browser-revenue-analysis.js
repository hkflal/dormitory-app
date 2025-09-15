// ========================================================================
// LIVE REVENUE ANALYSIS - BROWSER CONSOLE SCRIPT
// ========================================================================
// Instructions:
// 1. Open your dormitory dashboard in the browser
// 2. Log in with your credentials  
// 3. Open browser Developer Tools (F12)
// 4. Go to Console tab
// 5. Copy and paste this entire script
// 6. Press Enter to execute
// 7. Wait for analysis to complete
// 8. The results will be logged to console and downloaded as CSV
// ========================================================================

(async function analyzeRevenueWithLiveData() {
  console.log('🔍 Starting LIVE Revenue Analysis for August 2025...\n');
  console.log('📊 This script will access live Firebase data using your authenticated session');
  
  // Import Firebase functions (assuming they're available globally)
  const { collection, getDocs } = window.firebase?.firestore || {};
  const db = window.db || (window.firebase?.firestore?.getFirestore && window.firebase.firestore.getFirestore());
  
  if (!db) {
    console.error('❌ Firebase is not available. Make sure you are on the dashboard page.');
    return;
  }

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
        const arrivalDate = emp.arrival_at?.toDate ? emp.arrival_at.toDate() : new Date(emp.arrival_at);
        
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
        const issueDate = inv.issueDate?.toDate ? inv.issueDate.toDate() : new Date(inv.issueDate);
        return issueDate.getFullYear() === year && issueDate.getMonth() === month;
      }
      
      const startDate = inv.start_date?.toDate ? inv.start_date.toDate() : new Date(inv.start_date);
      const endDate = inv.end_date?.toDate ? inv.end_date.toDate() : new Date(inv.end_date);
      
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
    const dateObj = date?.toDate ? date.toDate() : new Date(date);
    return dateObj.toLocaleDateString('zh-HK');
  };

  const downloadCSV = (content, filename) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  try {
    // Fetch live data from Firebase
    console.log('📊 Fetching LIVE data from Firebase...');
    
    // Use the same Firebase calls as the dashboard
    const employeesRef = window.firebase.firestore().collection('employees');
    const invoicesRef = window.firebase.firestore().collection('invoices');
    
    const [employeesSnapshot, invoicesSnapshot] = await Promise.all([
      employeesRef.get(),
      invoicesRef.get()
    ]);

    const employees = employeesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const invoices = invoicesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    console.log(`✅ SUCCESS! Loaded ${employees.length} employees and ${invoices.length} invoices`);

    // Analysis parameters
    const targetYear = 2025;
    const targetMonth = 7; // August (0-based)
    
    console.log('\n📋 CARD A ANALYSIS (Theoretical Rent)');
    console.log('=====================================');
    
    // Card A: Calculate theoretical rent (housed + upcoming employees)
    const housedEmployees = employees.filter(emp => emp.status === 'housed');
    const upcomingEmployees = employees.filter(emp => 
      ['approved', 'pending', 'pending_assignment'].includes(emp.status) && 
      emp.arrival_at
    );
    
    console.log(`🏠 Housed employees: ${housedEmployees.length}`);
    console.log(`📅 Upcoming employees with arrival dates: ${upcomingEmployees.length}`);
    
    // Calculate theoretical rent using dashboard logic
    const totalReceivableRent = calculateProjectedIncome(employees, targetYear, targetMonth);
    console.log(`💰 Card A - Total Receivable Rent: $${formatCurrency(totalReceivableRent)}`);
    
    console.log('\n📋 CARD B ANALYSIS (Invoiced Rent)');
    console.log('===================================');
    
    // Card B: Calculate invoiced amounts
    const augustInvoices = getCurrentMonthInvoices(invoices, targetYear, targetMonth);
    console.log(`📄 August invoices found: ${augustInvoices.length}`);
    
    const invoicedRent = augustInvoices.reduce((sum, inv) => {
      return sum + (parseFloat(inv.amount) || 0);
    }, 0);
    
    console.log(`💰 Card B - Total Invoiced Rent: $${formatCurrency(invoicedRent)}`);
    
    console.log('\n📊 DISCREPANCY ANALYSIS');
    console.log('========================');
    
    const discrepancy = totalReceivableRent - invoicedRent;
    const discrepancyPercent = totalReceivableRent > 0 ? (discrepancy / totalReceivableRent * 100) : 0;
    
    console.log(`❌ Discrepancy: $${formatCurrency(discrepancy)} (${discrepancyPercent.toFixed(1)}%)`);
    console.log(`📈 Card A: $${formatCurrency(totalReceivableRent)}`);
    console.log(`📉 Card B: $${formatCurrency(invoicedRent)}`);
    
    // Verify we have the expected number of employees
    if (housedEmployees.length >= 180) {
      console.log(`✅ EMPLOYEE COUNT VERIFIED: ${housedEmployees.length} housed employees (expected ~199)`);
    } else {
      console.log(`⚠️  EMPLOYEE COUNT: ${housedEmployees.length} housed employees (lower than expected ~199)`);
    }
    
    console.log('\n🔍 DETAILED EMPLOYEE ANALYSIS');
    console.log('===============================');
    
    // Create detailed comparison
    const detailedAnalysis = [];
    
    // Process housed employees
    for (const employee of housedEmployees) {
      const employeeRent = parseFloat(employee.rent) || parseFloat(employee.monthlyRent) || 0;
      
      // Find matching invoices for this employee
      const employeeInvoices = augustInvoices.filter(inv => 
        inv.employee_id === employee.id || 
        (inv.employee_names && inv.employee_names.some(name => {
          const employeeName = employee.name || employee.firstName || '';
          return name === employeeName || 
                 name.includes(employeeName) || 
                 employeeName.includes(name);
        }))
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
        assigned_property: employee.assigned_property_id || employee.assignedProperty || 'N/A',
        company: employee.company || 'N/A',
        theoretical_rent: employeeRent,
        invoice_count: employeeInvoices.length,
        invoice_amount: invoiceAmount,
        discrepancy_amount: difference,
        discrepancy_reason: discrepancyReason,
        invoice_numbers: employeeInvoices.map(inv => inv.invoice_number).join(', ') || 'N/A',
        arrival_date: employee.arrival_at ? formatDate(employee.arrival_at) : 'N/A',
        contract_number: employee.contractNumber || employee.contract_number || 'N/A'
      });
    }
    
    // Summary statistics
    const noInvoiceCount = detailedAnalysis.filter(emp => emp.discrepancy_reason.includes('No Invoice')).length;
    const amountMismatchCount = detailedAnalysis.filter(emp => emp.discrepancy_reason.includes('Mismatch')).length;
    const matchCount = detailedAnalysis.filter(emp => emp.discrepancy_reason === 'Match').length;
    
    console.log('\n📈 SUMMARY STATISTICS');
    console.log('=====================');
    console.log(`✅ Perfect matches: ${matchCount}`);
    console.log(`❌ No invoices: ${noInvoiceCount}`);
    console.log(`⚠️  Amount mismatches: ${amountMismatchCount}`);
    console.log(`📋 Total analyzed: ${detailedAnalysis.length}`);
    
    // Top discrepancies
    const topDiscrepancies = detailedAnalysis
      .filter(emp => Math.abs(emp.discrepancy_amount) > 0.01)
      .sort((a, b) => Math.abs(b.discrepancy_amount) - Math.abs(a.discrepancy_amount))
      .slice(0, 10);
    
    console.log('\n🔍 TOP 10 DISCREPANCIES');
    console.log('========================');
    topDiscrepancies.forEach((emp, index) => {
      console.log(`${index + 1}. ${emp.name} - $${formatCurrency(emp.discrepancy_amount)} (${emp.discrepancy_reason})`);
    });
    
    // Generate CSV content
    const csvHeader = [
      'employee_id',
      'name', 
      'status',
      'company',
      'contract_number',
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
      `"${emp.company}"`,
      emp.contract_number,
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
    
    // Download CSV
    downloadCSV(csvContent, `revenue_August_detail_LIVE_${new Date().toISOString().slice(0,10)}.csv`);
    
    console.log('\n📄 CSV file has been automatically downloaded!');
    console.log('\n🎯 FINAL ANALYSIS SUMMARY');
    console.log('==========================');
    console.log(`🏠 Total housed employees: ${housedEmployees.length}`);
    console.log(`💰 Card A (Theoretical): $${formatCurrency(totalReceivableRent)}`);
    console.log(`🧾 Card B (Invoiced): $${formatCurrency(invoicedRent)}`);
    console.log(`❌ Discrepancy: $${formatCurrency(discrepancy)} (${discrepancyPercent.toFixed(1)}%)`);
    console.log(`📋 Employees missing invoices: ${noInvoiceCount}`);
    
    if (discrepancy > 100000) {
      console.log('\n🚨 MAJOR ISSUE CONFIRMED!');
      console.log(`The $${formatCurrency(discrepancy)} discrepancy is primarily due to:`);
      console.log(`• ${noInvoiceCount} employees without August invoices`);
      console.log('• Possible invoice generation system delays');
    }
    
    console.log('\n✅ LIVE ANALYSIS COMPLETE!');
    console.log('Check your Downloads folder for the detailed CSV report.');
    
    // Return analysis object for further inspection
    return {
      summary: {
        cardA: totalReceivableRent,
        cardB: invoicedRent,
        discrepancy: discrepancy,
        housedEmployees: housedEmployees.length
      },
      details: detailedAnalysis,
      topIssues: topDiscrepancies
    };
    
  } catch (error) {
    console.error('❌ Error during analysis:', error);
    console.error('Make sure you are logged into the dashboard and Firebase is initialized.');
  }
})();