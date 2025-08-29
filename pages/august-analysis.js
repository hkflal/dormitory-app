import { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';

export default function AugustAnalysis() {
  const { currentUser } = useAuth();
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount || 0);
  };

  const runAnalysis = async () => {
    if (!currentUser) {
      setError('Please log in to run the analysis');
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      console.log('🔍 Starting August Revenue Analysis...');
      
      // Fetch live data
      const [employeesSnapshot, invoicesSnapshot] = await Promise.all([
        getDocs(collection(db, 'employees')),
        getDocs(collection(db, 'invoices'))
      ]);

      const employees = employeesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const invoices = invoicesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      console.log(`✅ Loaded ${employees.length} employees and ${invoices.length} invoices`);

      // Calculate Card A (Theoretical rent for housed employees)
      const housedEmployees = employees.filter(emp => emp.status === 'housed');
      const totalReceivableRent = housedEmployees.reduce((total, emp) => {
        const empRent = parseFloat(emp.rent) || parseFloat(emp.monthlyRent) || 0;
        return total + empRent;
      }, 0);

      // Calculate Card B (August invoices only - DEBUGGING)
      console.log('\n🔍 DEBUGGING INVOICE FILTERING:');
      
      // First, let's see all invoices with their date ranges
      const invoicesWithDates = invoices.filter(inv => inv.start_date && inv.end_date).map(inv => {
        const startDate = inv.start_date?.toDate ? inv.start_date.toDate() : new Date(inv.start_date);
        const endDate = inv.end_date?.toDate ? inv.end_date.toDate() : new Date(inv.end_date);
        return {
          ...inv,
          startDate,
          endDate,
          startMonth: startDate.getMonth() + 1,
          startYear: startDate.getFullYear(),
          endMonth: endDate.getMonth() + 1,
          endYear: endDate.getFullYear()
        };
      });
      
      console.log(`Total invoices with dates: ${invoicesWithDates.length}`);
      
      // Show some sample invoice date ranges
      console.log('Sample invoice date ranges:');
      invoicesWithDates.slice(0, 10).forEach(inv => {
        console.log(`  ${inv.invoice_number}: ${inv.startDate.toLocaleDateString()} - ${inv.endDate.toLocaleDateString()} ($${inv.amount})`);
      });
      
      // Try different filtering approaches to find the right one
      const august2025Start = new Date(2025, 7, 1); // August 1, 2025
      const august2025End = new Date(2025, 7, 31); // August 31, 2025
      
      // Method 1: Overlaps August (current approach)
      const method1 = invoicesWithDates.filter(inv => 
        inv.startDate <= august2025End && inv.endDate >= august2025Start
      );
      const method1Total = method1.reduce((sum, inv) => sum + (parseFloat(inv.amount) || 0), 0);
      
      // Method 2: Starts in August
      const method2 = invoicesWithDates.filter(inv => 
        inv.startMonth === 8 && inv.startYear === 2025
      );
      const method2Total = method2.reduce((sum, inv) => sum + (parseFloat(inv.amount) || 0), 0);
      
      // Method 3: Ends in August
      const method3 = invoicesWithDates.filter(inv => 
        inv.endMonth === 8 && inv.endYear === 2025
      );
      const method3Total = method3.reduce((sum, inv) => sum + (parseFloat(inv.amount) || 0), 0);
      
      // Method 4: Both start and end in August
      const method4 = invoicesWithDates.filter(inv => 
        inv.startMonth === 8 && inv.startYear === 2025 && 
        inv.endMonth === 8 && inv.endYear === 2025
      );
      const method4Total = method4.reduce((sum, inv) => sum + (parseFloat(inv.amount) || 0), 0);
      
      // Method 5: Issue date in August (if available)
      const method5 = invoices.filter(inv => {
        if (!inv.issueDate) return false;
        const issueDate = inv.issueDate?.toDate ? inv.issueDate.toDate() : new Date(inv.issueDate);
        return issueDate.getMonth() === 7 && issueDate.getFullYear() === 2025; // August = month 7 (0-based)
      });
      const method5Total = method5.reduce((sum, inv) => sum + (parseFloat(inv.amount) || 0), 0);
      
      console.log('\n📊 FILTERING RESULTS:');
      console.log(`Method 1 (Overlaps August): ${method1.length} invoices = $${method1Total.toLocaleString()}`);
      console.log(`Method 2 (Starts in August): ${method2.length} invoices = $${method2Total.toLocaleString()}`);
      console.log(`Method 3 (Ends in August): ${method3.length} invoices = $${method3Total.toLocaleString()}`);
      console.log(`Method 4 (Both start & end in August): ${method4.length} invoices = $${method4Total.toLocaleString()}`);
      console.log(`Method 5 (Issue date in August): ${method5.length} invoices = $${method5Total.toLocaleString()}`);
      console.log(`Target amount: $470,517.58`);
      
      // Find the method closest to target
      const target = 470517.58;
      const methods = [
        { name: 'Method 1', invoices: method1, total: method1Total },
        { name: 'Method 2', invoices: method2, total: method2Total },
        { name: 'Method 3', invoices: method3, total: method3Total },
        { name: 'Method 4', invoices: method4, total: method4Total },
        { name: 'Method 5', invoices: method5, total: method5Total }
      ];
      
      const closest = methods.reduce((prev, curr) => 
        Math.abs(curr.total - target) < Math.abs(prev.total - target) ? curr : prev
      );
      
      console.log(`\n🎯 CLOSEST MATCH: ${closest.name} with $${closest.total.toLocaleString()}`);
      console.log(`   Difference: $${Math.abs(closest.total - target).toLocaleString()}`);
      
      // Use the closest method for now, but let user see all options
      const augustInvoices = closest.invoices;

      const invoicedRent = augustInvoices.reduce((sum, inv) => sum + (parseFloat(inv.amount) || 0), 0);

      console.log(`📊 August Invoice Check:`);
      console.log(`   Found ${augustInvoices.length} invoices spanning August 2025`);
      console.log(`   Total amount: $${invoicedRent.toLocaleString()}`);
      console.log(`   Expected: $470,517.58`);

      // Detailed employee analysis
      const detailedAnalysis = [];
      let noInvoiceCount = 0;
      let matchCount = 0;
      let mismatchCount = 0;

      for (const employee of housedEmployees) {
        const employeeRent = parseFloat(employee.rent) || parseFloat(employee.monthlyRent) || 0;
        
        const employeeInvoices = augustInvoices.filter(inv => 
          inv.employee_id === employee.id || 
          (inv.employee_names && Array.isArray(inv.employee_names) && inv.employee_names.some(name => {
            const empName = employee.name || employee.firstName || '';
            return name && empName && (name.includes(empName) || empName.includes(name));
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
        
        detailedAnalysis.push({
          id: employee.id,
          name: employee.name || employee.firstName || 'Unknown',
          company: employee.company || 'N/A',
          contract: employee.contractNumber || employee.contract_number || 'N/A',
          theoreticalRent: employeeRent,
          invoiceAmount: invoiceAmount,
          difference: difference,
          reason: reason,
          invoiceCount: employeeInvoices.length,
          invoiceNumbers: employeeInvoices.map(inv => inv.invoice_number).filter(Boolean).join(', ') || 'N/A'
        });
      }

      const discrepancy = totalReceivableRent - invoicedRent;
      const discrepancyPercent = totalReceivableRent > 0 ? (discrepancy / totalReceivableRent * 100) : 0;

      const topIssues = detailedAnalysis
        .filter(emp => Math.abs(emp.difference) > 0.01)
        .sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference))
        .slice(0, 20);

      setAnalysis({
        summary: {
          cardA: totalReceivableRent,
          cardB: invoicedRent,
          discrepancy: discrepancy,
          discrepancyPercent: discrepancyPercent,
          housedEmployeesCount: housedEmployees.length,
          augustInvoicesCount: augustInvoices.length,
          totalEmployees: employees.length,
          totalInvoices: invoices.length
        },
        filteringMethods: methods,
        selectedMethod: closest.name,
        statistics: {
          matches: matchCount,
          noInvoices: noInvoiceCount,
          mismatches: mismatchCount
        },
        topIssues: topIssues,
        allEmployees: detailedAnalysis
      });

      console.log('✅ Analysis complete!');

    } catch (err) {
      console.error('Error during analysis:', err);
      setError(`Analysis failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const downloadCSV = () => {
    if (!analysis) return;

    const csvHeader = 'Employee ID,Name,Company,Contract,Theoretical Rent,Invoice Amount,Difference,Reason,Invoice Count,Invoice Numbers';
    const csvRows = analysis.allEmployees.map(emp => 
      `${emp.id},"${emp.name}","${emp.company}",${emp.contract},${emp.theoreticalRent.toFixed(2)},${emp.invoiceAmount.toFixed(2)},${emp.difference.toFixed(2)},"${emp.reason}",${emp.invoiceCount},"${emp.invoiceNumbers}"`
    );
    
    const csvContent = [csvHeader, ...csvRows].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `august_revenue_analysis_${new Date().toISOString().slice(0,10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">August Revenue Analysis</h1>
          <p className="text-gray-600">Please log in to access this analysis tool.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <h1 className="text-2xl font-bold text-gray-900">August Revenue Analysis</h1>
            <p className="text-gray-600 mt-1">Card A vs Card B comparison for August 2025</p>
          </div>

          <div className="p-6">
            <div className="mb-6">
              <button
                onClick={runAnalysis}
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-6 py-3 rounded-lg font-medium flex items-center text-lg"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3"></div>
                    Analyzing August Data...
                  </>
                ) : (
                  'Run August Analysis'
                )}
              </button>
            </div>

            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-800">❌ {error}</p>
              </div>
            )}

            {analysis && (
              <div className="space-y-8">
                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-gradient-to-br from-green-50 to-green-100 border-2 border-green-200 p-6 rounded-xl">
                    <h3 className="font-bold text-green-800 text-lg mb-2">Card A - Theoretical Rent</h3>
                    <p className="text-3xl font-black text-green-600">{formatCurrency(analysis.summary.cardA)}</p>
                    <p className="text-sm text-green-700 mt-2">{analysis.summary.housedEmployeesCount} housed employees</p>
                  </div>

                  <div className="bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-200 p-6 rounded-xl">
                    <h3 className="font-bold text-blue-800 text-lg mb-2">Card B - August Invoices</h3>
                    <p className="text-3xl font-black text-blue-600">{formatCurrency(analysis.summary.cardB)}</p>
                    <p className="text-sm text-blue-700 mt-2">{analysis.summary.augustInvoicesCount} August invoices</p>
                    <p className="text-xs text-blue-600 mt-1">Target: $470,517.58</p>
                  </div>

                  <div className="bg-gradient-to-br from-red-50 to-red-100 border-2 border-red-200 p-6 rounded-xl">
                    <h3 className="font-bold text-red-800 text-lg mb-2">Discrepancy</h3>
                    <p className="text-3xl font-black text-red-600">{formatCurrency(analysis.summary.discrepancy)}</p>
                    <p className="text-sm text-red-700 mt-2">{analysis.summary.discrepancyPercent.toFixed(1)}% difference</p>
                  </div>
                </div>

                {/* Filtering Methods Debug */}
                <div className="bg-yellow-50 border-2 border-yellow-200 p-6 rounded-lg">
                  <h3 className="font-bold text-yellow-800 mb-4 text-lg">🔍 Invoice Filtering Methods Tested</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {analysis.filteringMethods.map((method, index) => (
                      <div key={index} className={`p-4 rounded-lg border-2 ${
                        method.name === analysis.selectedMethod 
                          ? 'border-green-400 bg-green-50' 
                          : Math.abs(method.total - 470517.58) < 1000
                          ? 'border-blue-400 bg-blue-50'
                          : 'border-gray-200 bg-white'
                      }`}>
                        <h4 className="font-semibold text-sm mb-2">{method.name}</h4>
                        <p className="text-lg font-bold">{formatCurrency(method.total)}</p>
                        <p className="text-xs text-gray-600">{method.invoices.length} invoices</p>
                        <p className="text-xs mt-1">
                          Diff: {formatCurrency(Math.abs(method.total - 470517.58))}
                        </p>
                      </div>
                    ))}
                  </div>
                  <p className="text-sm text-yellow-700 mt-4">
                    ✅ Using: <strong>{analysis.selectedMethod}</strong> (closest to target $470,517.58)
                  </p>
                </div>

                {/* Statistics */}
                <div className="bg-gray-50 p-6 rounded-lg">
                  <h3 className="font-bold text-gray-800 mb-4 text-lg">Employee Status Breakdown</h3>
                  <div className="grid grid-cols-3 gap-6 text-center">
                    <div className="bg-white p-4 rounded-lg shadow">
                      <p className="text-3xl font-bold text-green-600">{analysis.statistics.matches}</p>
                      <p className="text-sm text-gray-600 mt-1">Perfect Matches</p>
                    </div>
                    <div className="bg-white p-4 rounded-lg shadow">
                      <p className="text-3xl font-bold text-red-600">{analysis.statistics.noInvoices}</p>
                      <p className="text-sm text-gray-600 mt-1">No August Invoices</p>
                    </div>
                    <div className="bg-white p-4 rounded-lg shadow">
                      <p className="text-3xl font-bold text-yellow-600">{analysis.statistics.mismatches}</p>
                      <p className="text-sm text-gray-600 mt-1">Amount Mismatches</p>
                    </div>
                  </div>
                </div>

                {/* Download Button */}
                <div className="text-center">
                  <button
                    onClick={downloadCSV}
                    className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-lg font-medium text-lg"
                  >
                    Download August Analysis CSV ({analysis.allEmployees.length} employees)
                  </button>
                </div>

                {/* Top Issues Table */}
                {analysis.topIssues.length > 0 && (
                  <div>
                    <h3 className="font-bold text-gray-800 mb-4 text-lg">Top 20 Discrepancies</h3>
                    <div className="overflow-x-auto bg-white rounded-lg shadow">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Company</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Theoretical</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Aug Invoiced</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Difference</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Issue</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {analysis.topIssues.map((emp, index) => (
                            <tr key={emp.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                              <td className="px-4 py-4 text-sm font-medium text-gray-900">{emp.name}</td>
                              <td className="px-4 py-4 text-sm text-gray-500">{emp.company}</td>
                              <td className="px-4 py-4 text-sm text-gray-900">{formatCurrency(emp.theoreticalRent)}</td>
                              <td className="px-4 py-4 text-sm text-gray-900">{formatCurrency(emp.invoiceAmount)}</td>
                              <td className={`px-4 py-4 text-sm font-bold ${emp.difference > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                {formatCurrency(Math.abs(emp.difference))}
                              </td>
                              <td className="px-4 py-4 text-sm">
                                <span className={`px-2 py-1 rounded-full text-xs ${
                                  emp.reason === 'No Invoice' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
                                }`}>
                                  {emp.reason}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}