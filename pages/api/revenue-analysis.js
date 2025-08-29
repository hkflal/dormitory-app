import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';

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

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    console.log('🔍 Starting Live Revenue Analysis for August 2025...');
    
    // Fetch live data from Firebase
    const [employeesSnapshot, invoicesSnapshot] = await Promise.all([
      getDocs(collection(db, 'employees')),
      getDocs(collection(db, 'invoices'))
    ]);

    const employees = employeesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const invoices = invoicesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    console.log(`✅ Loaded ${employees.length} employees and ${invoices.length} invoices`);

    // Analysis parameters
    const targetYear = 2025;
    const targetMonth = 7; // August (0-based)
    
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
    
    // Card B: Calculate invoiced amounts
    const augustInvoices = getCurrentMonthInvoices(invoices, targetYear, targetMonth);
    const invoicedRent = augustInvoices.reduce((sum, inv) => {
      return sum + (parseFloat(inv.amount) || 0);
    }, 0);
    
    // Discrepancy calculation
    const discrepancy = totalReceivableRent - invoicedRent;
    const discrepancyPercent = totalReceivableRent > 0 ? (discrepancy / totalReceivableRent * 100) : 0;
    
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
    
    // Company breakdown
    const companyBreakdown = {};
    detailedAnalysis.forEach(emp => {
      const company = emp.company || 'Unknown';
      if (!companyBreakdown[company]) {
        companyBreakdown[company] = {
          count: 0,
          theoretical: 0,
          invoiced: 0,
          discrepancy: 0
        };
      }
      companyBreakdown[company].count++;
      companyBreakdown[company].theoretical += emp.theoretical_rent;
      companyBreakdown[company].invoiced += emp.invoice_amount;
      companyBreakdown[company].discrepancy += emp.discrepancy_amount;
    });
    
    // Top discrepancies
    const topDiscrepancies = detailedAnalysis
      .filter(emp => Math.abs(emp.discrepancy_amount) > 0.01)
      .sort((a, b) => Math.abs(b.discrepancy_amount) - Math.abs(a.discrepancy_amount))
      .slice(0, 20);
    
    console.log('✅ Analysis complete!');
    
    // Return comprehensive analysis
    res.status(200).json({
      summary: {
        cardA_totalReceivableRent: totalReceivableRent,
        cardB_invoicedRent: invoicedRent,
        discrepancy: discrepancy,
        discrepancyPercent: discrepancyPercent.toFixed(1),
        housedEmployeesCount: housedEmployees.length,
        upcomingEmployeesCount: upcomingEmployees.length,
        augustInvoicesCount: augustInvoices.length,
        totalEmployeesAnalyzed: detailedAnalysis.length
      },
      statistics: {
        perfectMatches: matchCount,
        noInvoices: noInvoiceCount,
        amountMismatches: amountMismatchCount,
        proratedIssues: proratedIssues
      },
      companyBreakdown,
      topDiscrepancies,
      detailedAnalysis,
      metadata: {
        analysisDate: new Date().toISOString(),
        targetYear: targetYear,
        targetMonth: targetMonth + 1, // Convert back to 1-based for display
        totalEmployees: employees.length,
        totalInvoices: invoices.length
      }
    });

  } catch (error) {
    console.error('❌ Error during analysis:', error);
    res.status(500).json({ 
      error: 'Analysis failed', 
      message: error.message 
    });
  }
}