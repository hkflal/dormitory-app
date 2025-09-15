// ========================================================================
// SIMPLE REVENUE ANALYSIS - BROWSER CONSOLE SCRIPT (Extension-Safe)
// ========================================================================
// Instructions: 
// 1. Open dashboard, login, press F12, go to Console tab
// 2. Paste this script and press Enter
// ========================================================================

console.log('🔍 Starting Simple Revenue Analysis...');

// Avoid conflicts with extensions by using a different approach
setTimeout(async () => {
  try {
    console.log('📊 Accessing Firebase data...');
    
    // Get Firebase instance from the page
    const firestore = window.firebase?.firestore();
    if (!firestore) {
      console.error('❌ Firebase not found. Make sure you are on the dashboard page and logged in.');
      return;
    }

    console.log('✅ Firebase found, fetching data...');

    // Fetch employees and invoices
    const employeesRef = firestore.collection('employees');
    const invoicesRef = firestore.collection('invoices');
    
    const [employeesSnap, invoicesSnap] = await Promise.all([
      employeesRef.get(),
      invoicesRef.get()
    ]);

    const employees = [];
    const invoices = [];
    
    employeesSnap.forEach(doc => {
      employees.push({ id: doc.id, ...doc.data() });
    });
    
    invoicesSnap.forEach(doc => {
      invoices.push({ id: doc.id, ...doc.data() });
    });
    
    console.log(`✅ Data loaded: ${employees.length} employees, ${invoices.length} invoices`);

    // Analysis for August 2025
    const targetYear = 2025;
    const targetMonth = 7; // August (0-based)

    // Find housed employees
    const housedEmployees = employees.filter(emp => emp.status === 'housed');
    console.log(`🏠 Housed employees found: ${housedEmployees.length}`);

    // Calculate Card A (Total theoretical rent)
    let totalReceivableRent = 0;
    housedEmployees.forEach(emp => {
      const rent = parseFloat(emp.rent) || parseFloat(emp.monthlyRent) || 0;
      totalReceivableRent += rent;
    });

    console.log(`💰 Card A - Total Receivable Rent: $${totalReceivableRent.toLocaleString()}`);

    // Find August invoices - FIXED to match $470,517.58
    const augustInvoices = invoices.filter(inv => {
      // Skip invoices without proper date fields
      if (!inv.start_date || !inv.end_date) {
        return false;
      }
      
      // Convert Firebase timestamps to Date objects
      const startDate = inv.start_date.toDate ? inv.start_date.toDate() : new Date(inv.start_date);
      const endDate = inv.end_date.toDate ? inv.end_date.toDate() : new Date(inv.end_date);
      
      // Define August 2025 boundaries
      const august2025Start = new Date(2025, 7, 1); // August 1, 2025
      const august2025End = new Date(2025, 7, 31); // August 31, 2025
      
      // Invoice must SPAN or OVERLAP with August 2025
      // This means: start_date <= Aug 31 AND end_date >= Aug 1
      const spansAugust = startDate <= august2025End && endDate >= august2025Start;
      
      return spansAugust;
    });

    console.log(`📄 August invoices found: ${augustInvoices.length}`);

    // Calculate Card B (Total invoiced rent)
    let invoicedRent = 0;
    augustInvoices.forEach(inv => {
      invoicedRent += parseFloat(inv.amount) || 0;
    });

    console.log(`💰 Card B - Total Invoiced Rent: $${invoicedRent.toLocaleString()}`);

    // Calculate discrepancy
    const discrepancy = totalReceivableRent - invoicedRent;
    const discrepancyPercent = totalReceivableRent > 0 ? (discrepancy / totalReceivableRent * 100) : 0;

    console.log('\n📊 ANALYSIS RESULTS');
    console.log('===================');
    console.log(`📈 Card A (Theoretical): $${totalReceivableRent.toLocaleString()}`);
    console.log(`📉 Card B (Invoiced): $${invoicedRent.toLocaleString()}`);
    console.log(`❌ Discrepancy: $${discrepancy.toLocaleString()} (${discrepancyPercent.toFixed(1)}%)`);

    // Detailed analysis
    console.log('\n🔍 Detailed Employee Analysis...');
    
    const results = [];
    let noInvoiceCount = 0;
    let matchCount = 0;
    let mismatchCount = 0;

    housedEmployees.forEach(employee => {
      const employeeRent = parseFloat(employee.rent) || parseFloat(employee.monthlyRent) || 0;
      
      // Find invoices for this employee
      const employeeInvoices = augustInvoices.filter(inv => 
        inv.employee_id === employee.id || 
        (inv.employee_names && inv.employee_names.some(name => {
          const empName = employee.name || employee.firstName || '';
          return name.includes(empName) || empName.includes(name);
        }))
      );
      
      const invoiceAmount = employeeInvoices.reduce((sum, inv) => sum + (parseFloat(inv.amount) || 0), 0);
      const difference = employeeRent - invoiceAmount;
      
      let reason = 'Match';
      if (employeeInvoices.length === 0) {
        reason = 'No Invoice';
        noInvoiceCount++;
      } else if (Math.abs(difference) > 0.01) {
        reason = 'Amount Mismatch';
        mismatchCount++;
      } else {
        matchCount++;
      }
      
      results.push({
        id: employee.id,
        name: employee.name || employee.firstName || 'Unknown',
        company: employee.company || 'N/A',
        contract: employee.contractNumber || employee.contract_number || 'N/A',
        theoreticalRent: employeeRent,
        invoiceAmount: invoiceAmount,
        difference: difference,
        reason: reason,
        invoiceCount: employeeInvoices.length
      });
    });

    console.log('\n📈 SUMMARY');
    console.log('==========');
    console.log(`✅ Perfect matches: ${matchCount}`);
    console.log(`❌ No invoices: ${noInvoiceCount}`);
    console.log(`⚠️  Amount mismatches: ${mismatchCount}`);
    console.log(`📋 Total employees: ${results.length}`);

    // Show top issues
    const topIssues = results
      .filter(r => Math.abs(r.difference) > 0.01)
      .sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference))
      .slice(0, 15);

    console.log('\n🔍 TOP 15 ISSUES:');
    console.log('================');
    topIssues.forEach((emp, i) => {
      console.log(`${i+1}. ${emp.name} (${emp.company}): $${emp.difference.toFixed(2)} - ${emp.reason}`);
    });

    // Generate simple CSV data
    console.log('\n📄 Generating CSV data...');
    
    const csvHeader = 'Employee ID,Name,Company,Contract,Theoretical Rent,Invoice Amount,Difference,Reason,Invoice Count';
    const csvRows = results.map(r => 
      `${r.id},"${r.name}","${r.company}",${r.contract},${r.theoreticalRent.toFixed(2)},${r.invoiceAmount.toFixed(2)},${r.difference.toFixed(2)},"${r.reason}",${r.invoiceCount}`
    );
    
    const csvContent = [csvHeader, ...csvRows].join('\n');
    
    // Simple download
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `revenue_analysis_${new Date().getFullYear()}-${(new Date().getMonth()+1).toString().padStart(2,'0')}-${new Date().getDate().toString().padStart(2,'0')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log('✅ CSV file downloaded to your Downloads folder!');
    
    console.log('\n🎯 KEY FINDINGS:');
    console.log('===============');
    if (housedEmployees.length >= 180) {
      console.log(`✅ Employee count confirmed: ${housedEmployees.length} housed employees`);
    } else {
      console.log(`⚠️  Employee count: ${housedEmployees.length} (expected ~199)`);
    }
    
    if (noInvoiceCount > 50) {
      console.log(`🚨 MAJOR ISSUE: ${noInvoiceCount} employees have no August invoices!`);
      console.log('   This explains most of the discrepancy.');
    }
    
    console.log('\n✅ Analysis Complete!');
    console.log('Check your Downloads folder for the detailed CSV report.');
    
    // Make results available for further inspection
    window.revenueAnalysisResults = {
      cardA: totalReceivableRent,
      cardB: invoicedRent,
      discrepancy: discrepancy,
      employees: results,
      topIssues: topIssues
    };
    
    console.log('📊 Results also saved to: window.revenueAnalysisResults');

  } catch (error) {
    console.error('❌ Error:', error);
    console.log('Make sure you are logged into the dashboard and try again.');
  }
}, 1000); // 1 second delay to avoid extension conflicts