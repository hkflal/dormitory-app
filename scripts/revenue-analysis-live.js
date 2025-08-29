require('dotenv').config({ path: '.env.local' });
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, connectFirestoreEmulator } = require('firebase/firestore');
const { getAuth, signInAnonymously } = require('firebase/auth');
const fs = require('fs');
const path = require('path');

// Firebase configuration from environment
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

console.log('Firebase Config:', firebaseConfig);

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

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

async function analyzeRevenueDiscrepancy() {
  console.log('🔍 Starting Live Revenue Analysis for August 2025...\n');
  
  try {
    // Try anonymous authentication first
    console.log('🔑 Attempting anonymous authentication...');
    try {
      await signInAnonymously(auth);
      console.log('✅ Anonymous authentication successful');
    } catch (authError) {
      console.log('⚠️  Anonymous auth failed, proceeding without auth:', authError.message);
    }

    // Fetch live data from Firebase
    console.log('📊 Fetching live data from Firebase...');
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
    console.log(`📅 Upcoming employees with arrival dates: ${upcomingEmployees.length}`);
    
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
    
    if (housedEmployees.length < 150) {
      console.log('⚠️  WARNING: Only found ' + housedEmployees.length + ' housed employees.');
      console.log('   Expected ~199 employees. This suggests data access issues.');
      console.log('   Continuing with available data...\n');
    }
    
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
    
    // Process upcoming employees with August arrival
    for (const employee of upcomingEmployees) {
      const employeeRent = parseFloat(employee.rent) || parseFloat(employee.monthlyRent) || 0;
      if (employeeRent === 0 || !employee.arrival_at) continue;
      
      const arrivalDate = employee.arrival_at?.toDate ? employee.arrival_at.toDate() : new Date(employee.arrival_at);
      
      if (arrivalDate.getFullYear() === targetYear && arrivalDate.getMonth() === targetMonth) {
        const daysInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
        const arrivalDay = arrivalDate.getDate();
        const remainingDays = daysInMonth - arrivalDay + 1;
        const proratedRent = (remainingDays / daysInMonth) * employeeRent;
        
        // Find matching invoices
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
          assigned_property: employee.assigned_property_id || employee.assignedProperty || 'N/A',
          company: employee.company || 'N/A',
          theoretical_rent: proratedRent,
          invoice_count: employeeInvoices.length,
          invoice_amount: invoiceAmount,
          discrepancy_amount: difference,
          discrepancy_reason: discrepancyReason,
          invoice_numbers: employeeInvoices.map(inv => inv.invoice_number).join(', ') || 'N/A',
          arrival_date: formatDate(employee.arrival_at),
          contract_number: employee.contractNumber || employee.contract_number || 'N/A'
        });
      }
    }
    
    // Summary statistics
    const noInvoiceCount = detailedAnalysis.filter(emp => emp.discrepancy_reason.includes('No Invoice')).length;
    const amountMismatchCount = detailedAnalysis.filter(emp => emp.discrepancy_reason.includes('Mismatch')).length;
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
      .slice(0, 20);
    
    console.log('🔍 TOP 20 DISCREPANCIES');
    console.log('========================');
    topDiscrepancies.forEach((emp, index) => {
      console.log(`${index + 1}. ${emp.name} (${emp.employee_id})`);
      console.log(`   Company: ${emp.company}`);
      console.log(`   Contract: ${emp.contract_number}`);
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
    
    const outputPath = path.join(__dirname, '..', 'revenue_August_detail_LIVE.csv');
    fs.writeFileSync(outputPath, csvContent);
    
    console.log(`📄 Detailed report saved to: ${outputPath}`);
    console.log(`📊 Analysis complete! Found ${detailedAnalysis.length} employees in scope.`);
    
    console.log('\n🎯 KEY INSIGHTS (LIVE DATA)');
    console.log('=============================');
    if (discrepancy > 100000) {
      console.log('🚨 MAJOR DISCREPANCY DETECTED!');
      console.log(`   The $${formatCurrency(discrepancy)} difference suggests:`);
      console.log('   1. Many employees missing August invoices');
      console.log('   2. Possible invoice generation timing issues'); 
      console.log('   3. Data sync problems between employee and invoice systems');
    }
    
    if (noInvoiceCount > 0) {
      console.log(`⚠️  ${noInvoiceCount} housed employees have NO August invoices`);
      console.log('   → This likely explains most of the discrepancy');
    }
    
    if (housedEmployees.length < 180) {
      console.log(`🔍 EMPLOYEE COUNT ISSUE: Found ${housedEmployees.length} housed employees`);
      console.log('   → Expected ~199 employees according to dashboard');
      console.log('   → This suggests either:');
      console.log('     a) Data access permission issues');
      console.log('     b) Different filtering logic');
      console.log('     c) Recent status changes');
    }
    
  } catch (error) {
    console.error('❌ Error during analysis:', error);
    if (error.code === 'permission-denied') {
      console.error('🔒 This appears to be a permission issue.');
      console.error('   The script cannot access Firebase without proper authentication.');
      console.error('   This is why the backup data analysis showed different numbers.');
    }
  }
  
  process.exit(0);
}

// Run the analysis
analyzeRevenueDiscrepancy();