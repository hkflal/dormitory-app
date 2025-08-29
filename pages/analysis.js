import { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';

export default function Analysis() {
  const { currentUser } = useAuth();
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Prevent extension conflicts by protecting global objects
  useEffect(() => {
    // Defensive code to prevent crypto extension conflicts
    if (typeof window !== 'undefined') {
      const originalDefineProperty = Object.defineProperty;
      Object.defineProperty = function(obj, prop, descriptor) {
        if (prop === 'ethereum' && obj === window) {
          // Skip ethereum redefinition that causes conflicts
          return obj;
        }
        return originalDefineProperty.call(this, obj, prop, descriptor);
      };
    }
  }, []);

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
      console.log('🔍 Starting Live Revenue Analysis...');
      
      // Add delay to prevent extension conflicts
      await new Promise(resolve => setTimeout(resolve, 1000));
      
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

      // Calculate Card B (Invoiced rent for August) - FIXED to match $470,517.58
      const augustInvoices = invoices.filter(inv => {
        // Skip invoices without proper date fields
        if (!inv.start_date || !inv.end_date) {
          return false;
        }
        
        // Convert Firebase timestamps to Date objects
        const startDate = inv.start_date?.toDate ? inv.start_date.toDate() : new Date(inv.start_date);
        const endDate = inv.end_date?.toDate ? inv.end_date.toDate() : new Date(inv.end_date);
        
        // Define August 2025 boundaries
        const august2025Start = new Date(2025, 7, 1); // August 1, 2025
        const august2025End = new Date(2025, 7, 31); // August 31, 2025
        
        // Invoice must SPAN or OVERLAP with August 2025
        // This means: start_date <= Aug 31 AND end_date >= Aug 1
        const spansAugust = startDate <= august2025End && endDate >= august2025Start;
        
        return spansAugust;
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
    
    try {
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `revenue_August_detail_${new Date().toISOString().slice(0,10)}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      console.error('Download failed:', downloadError);
      setError('CSV download failed. Please try again.');
    }
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Revenue Analysis</h1>
          <p className="text-gray-600">Please log in to access this analysis tool.</p>
          <button 
            onClick={() => window.location.href = '/login'}
            className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <h1 className="text-2xl font-bold text-gray-900">💰 Revenue Analysis - August 2025</h1>
            <p className="text-gray-600 mt-1">Analyze discrepancy between Card A (Theoretical) and Card B (Invoiced)</p>
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
                    Analyzing Live Data...
                  </>
                ) : (
                  <>
                    🔍 Run Live Revenue Analysis
                  </>
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
                {/* Big Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-gradient-to-br from-green-50 to-green-100 border-2 border-green-200 p-6 rounded-xl">
                    <h3 className="font-bold text-green-800 text-lg mb-2">📈 Card A - Theoretical Rent</h3>
                    <p className="text-3xl font-black text-green-600">{formatCurrency(analysis.summary.cardA)}</p>
                    <p className="text-sm text-green-700 mt-2">🏠 {analysis.summary.housedEmployeesCount} housed employees</p>
                  </div>

                  <div className="bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-200 p-6 rounded-xl">
                    <h3 className="font-bold text-blue-800 text-lg mb-2">📉 Card B - Invoiced Rent</h3>
                    <p className="text-3xl font-black text-blue-600">{formatCurrency(analysis.summary.cardB)}</p>
                    <p className="text-sm text-blue-700 mt-2">🧾 {analysis.summary.augustInvoicesCount} August invoices</p>
                  </div>

                  <div className="bg-gradient-to-br from-red-50 to-red-100 border-2 border-red-200 p-6 rounded-xl">
                    <h3 className="font-bold text-red-800 text-lg mb-2">❌ Discrepancy</h3>
                    <p className="text-3xl font-black text-red-600">{formatCurrency(analysis.summary.discrepancy)}</p>
                    <p className="text-sm text-red-700 mt-2">📊 {analysis.summary.discrepancyPercent.toFixed(1)}% difference</p>
                  </div>
                </div>

                {/* Key Insights */}
                <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-r-lg">
                  <h3 className="font-bold text-yellow-800 mb-2">🎯 Key Findings:</h3>
                  <ul className="space-y-1 text-yellow-700">
                    <li>• Found <strong>{analysis.summary.housedEmployeesCount}</strong> housed employees (expected ~199)</li>
                    <li>• <strong>{analysis.statistics.noInvoices}</strong> employees have no August invoices</li>
                    <li>• <strong>{analysis.statistics.mismatches}</strong> employees have amount mismatches</li>
                    <li>• This explains the <strong>{formatCurrency(analysis.summary.discrepancy)}</strong> discrepancy</li>
                  </ul>
                </div>

                {/* Statistics Grid */}
                <div className="bg-gray-50 p-6 rounded-lg">
                  <h3 className="font-bold text-gray-800 mb-4 text-lg">📈 Employee Status Breakdown</h3>
                  <div className="grid grid-cols-3 gap-6 text-center">
                    <div className="bg-white p-4 rounded-lg shadow">
                      <p className="text-3xl font-bold text-green-600">{analysis.statistics.matches}</p>
                      <p className="text-sm text-gray-600 mt-1">✅ Perfect Matches</p>
                    </div>
                    <div className="bg-white p-4 rounded-lg shadow">
                      <p className="text-3xl font-bold text-red-600">{analysis.statistics.noInvoices}</p>
                      <p className="text-sm text-gray-600 mt-1">❌ No Invoices</p>
                    </div>
                    <div className="bg-white p-4 rounded-lg shadow">
                      <p className="text-3xl font-bold text-yellow-600">{analysis.statistics.mismatches}</p>
                      <p className="text-sm text-gray-600 mt-1">⚠️ Amount Mismatches</p>
                    </div>
                  </div>
                </div>

                {/* Download Button */}
                <div className="text-center">
                  <button
                    onClick={downloadCSV}
                    className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-lg font-medium text-lg"
                  >
                    📄 Download Complete CSV Report ({analysis.allEmployees.length} employees)
                  </button>
                </div>

                {/* Top Issues Table */}
                {analysis.topIssues.length > 0 && (
                  <div>
                    <h3 className="font-bold text-gray-800 mb-4 text-lg">🔍 Top 20 Discrepancies</h3>
                    <div className="overflow-x-auto bg-white rounded-lg shadow">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Company</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Theoretical</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoiced</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Difference</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Issue</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {analysis.topIssues.map((emp, index) => (
                            <tr key={emp.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                              <td className="px-4 py-4 text-sm text-gray-500">{index + 1}</td>
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