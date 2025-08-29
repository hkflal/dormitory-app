import { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';

export default function RevenueAnalysis() {
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

  const formatDate = (date) => {
    if (!date) return 'N/A';
    const dateObj = date?.toDate ? date.toDate() : new Date(date);
    return dateObj.toLocaleDateString('zh-HK');
  };

  const runAnalysis = async () => {
    if (!currentUser) {
      setError('Please log in to run the analysis');
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      console.log('🔍 Starting Live Revenue Analysis...');
      
      // Fetch live data
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
      
      // Calculate Card A (Theoretical rent)
      const housedEmployees = employees.filter(emp => emp.status === 'housed');
      const totalReceivableRent = housedEmployees.reduce((total, emp) => {
        const empRent = parseFloat(emp.rent) || parseFloat(emp.monthlyRent) || 0;
        return total + empRent;
      }, 0);

      // Calculate Card B (Invoiced rent for August)
      const augustInvoices = invoices.filter(inv => {
        if (!inv.start_date || !inv.end_date) {
          const issueDate = inv.issueDate?.toDate ? inv.issueDate.toDate() : new Date(inv.issueDate);
          return issueDate.getFullYear() === targetYear && issueDate.getMonth() === targetMonth;
        }
        
        const startDate = inv.start_date?.toDate ? inv.start_date.toDate() : new Date(inv.start_date);
        const endDate = inv.end_date?.toDate ? inv.end_date.toDate() : new Date(inv.end_date);
        
        const targetMonthStart = new Date(targetYear, targetMonth, 1);
        const targetMonthEnd = new Date(targetYear, targetMonth + 1, 0);
        
        return startDate <= targetMonthEnd && endDate >= targetMonthStart;
      });

      const invoicedRent = augustInvoices.reduce((sum, inv) => sum + (parseFloat(inv.amount) || 0), 0);

      // Detailed employee analysis
      const detailedAnalysis = [];
      let noInvoiceCount = 0;
      let matchCount = 0;
      let mismatchCount = 0;

      for (const employee of housedEmployees) {
        const employeeRent = parseFloat(employee.rent) || parseFloat(employee.monthlyRent) || 0;
        
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
          invoiceNumbers: employeeInvoices.map(inv => inv.invoice_number).join(', ') || 'N/A'
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
    link.setAttribute('download', `revenue_August_detail_${new Date().toISOString().slice(0,10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Revenue Analysis</h1>
          <p className="text-gray-600">Please log in to access this analysis tool.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h1 className="text-2xl font-bold text-gray-900">Revenue Analysis - August 2025</h1>
          <p className="text-gray-600">Analyze discrepancy between Card A (Theoretical) and Card B (Invoiced)</p>
        </div>

        <div className="p-6">
          <div className="mb-6">
            <button
              onClick={runAnalysis}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-6 py-3 rounded-lg font-medium flex items-center"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Analyzing...
                </>
              ) : (
                'Run Live Revenue Analysis'
              )}
            </button>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-800">❌ {error}</p>
            </div>
          )}

          {analysis && (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-green-50 border border-green-200 p-4 rounded-lg">
                  <h3 className="font-semibold text-green-800">Card A - Theoretical Rent</h3>
                  <p className="text-2xl font-bold text-green-600">{formatCurrency(analysis.summary.cardA)}</p>
                  <p className="text-sm text-green-700">{analysis.summary.housedEmployeesCount} housed employees</p>
                </div>

                <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
                  <h3 className="font-semibold text-blue-800">Card B - Invoiced Rent</h3>
                  <p className="text-2xl font-bold text-blue-600">{formatCurrency(analysis.summary.cardB)}</p>
                  <p className="text-sm text-blue-700">{analysis.summary.augustInvoicesCount} August invoices</p>
                </div>

                <div className="bg-red-50 border border-red-200 p-4 rounded-lg">
                  <h3 className="font-semibold text-red-800">Discrepancy</h3>
                  <p className="text-2xl font-bold text-red-600">{formatCurrency(analysis.summary.discrepancy)}</p>
                  <p className="text-sm text-red-700">{analysis.summary.discrepancyPercent.toFixed(1)}% difference</p>
                </div>
              </div>

              {/* Statistics */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-semibold text-gray-800 mb-2">Employee Statistics</h3>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-bold text-green-600">{analysis.statistics.matches}</p>
                    <p className="text-sm text-gray-600">Perfect Matches</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-red-600">{analysis.statistics.noInvoices}</p>
                    <p className="text-sm text-gray-600">No Invoices</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-yellow-600">{analysis.statistics.mismatches}</p>
                    <p className="text-sm text-gray-600">Amount Mismatches</p>
                  </div>
                </div>
              </div>

              {/* Download Button */}
              <div>
                <button
                  onClick={downloadCSV}
                  className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-medium"
                >
                  📄 Download Detailed CSV Report
                </button>
              </div>

              {/* Top Issues */}
              {analysis.topIssues.length > 0 && (
                <div>
                  <h3 className="font-semibold text-gray-800 mb-4">Top 20 Discrepancies</h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Company</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contract</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Theoretical</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoiced</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Difference</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {analysis.topIssues.map((emp, index) => (
                          <tr key={emp.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{emp.name}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{emp.company}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{emp.contract}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatCurrency(emp.theoreticalRent)}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatCurrency(emp.invoiceAmount)}</td>
                            <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${emp.difference > 0 ? 'text-red-600' : 'text-green-600'}`}>
                              {formatCurrency(Math.abs(emp.difference))}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{emp.reason}</td>
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
  );
}