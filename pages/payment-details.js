import { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';

export default function PaymentDetails() {
  const { currentUser, userRole } = useAuth();
  
  // Admin permission check
  if (userRole !== 'admin') {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h1>
          <p className="text-gray-600">You need admin permissions to access this page.</p>
        </div>
      </div>
    );
  }
  const [paymentData, setPaymentData] = useState(null);
  const [allPaymentData, setAllPaymentData] = useState(null); // Store unfiltered data
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hoveredInvoice, setHoveredInvoice] = useState(null);
  const [showReceiptModal, setShowReceiptModal] = useState(null); // For receipt selection modal
  const [hoveredSummary, setHoveredSummary] = useState(null); // For summary cell tooltip
  const [monthSummaries, setMonthSummaries] = useState({}); // Pre-calculated monthly summaries
  
  // Filter states
  const [selectedStatus, setSelectedStatus] = useState(['housed']); // Default to housed only
  const [selectedCompany, setSelectedCompany] = useState('all'); // Single company selection
  const [availableCompanies, setAvailableCompanies] = useState([]);

  // Generate months starting from 3 months before current date
  const generateMonthColumns = () => {
    const months = [];
    const currentDate = new Date();
    
    // Start from 3 months before current month
    for (let i = -3; i <= 8; i++) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth() + i, 1);
      months.push({
        key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
        label: `${date.toLocaleDateString('zh-TW', { month: 'short' })}-${date.getFullYear()}`,
        year: date.getFullYear(),
        month: date.getMonth() + 1
      });
    }
    
    return months;
  };

  const months = generateMonthColumns();

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
    
    // For partial months: proportional calculation (days/total days × employee's monthly rent)
    let partialAmount = (overlapDays / monthDays) * actualMonthlyRent;
    
    // VALIDATION: No single month contribution should exceed employee's monthly rent
    if (partialAmount > actualMonthlyRent) {
      console.error(`🚨 CALCULATION ERROR: ${employeeName} - ${monthYear}`, {
        calculatedAmount: partialAmount.toFixed(2),
        invoicePeriod: `${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}`,
        overlapDays,
        monthDays,
        calculation: `${overlapDays}/${monthDays} × $${actualMonthlyRent} = ${partialAmount.toFixed(2)}`,
        employeeRent: actualMonthlyRent,
        issue: 'Partial amount exceeds employee monthly rent!',
        coversFullMonth
      });
      
      // Cap at employee's monthly rent
      console.warn(`⚠️ CAPPING ${employeeName} - ${monthYear} from $${partialAmount.toFixed(2)} to $${actualMonthlyRent}`);
      partialAmount = actualMonthlyRent;
    }
    
    // Debug for specific employees and high amounts
    if (employeeName === '呂文燕' || employeeName === '黃悅婷' || partialAmount > actualMonthlyRent) {
      console.log(`💰 ${employeeName} - ${monthYear}: ${overlapDays}/${monthDays} days × $${actualMonthlyRent} = $${partialAmount.toFixed(2)} ${coversFullMonth ? '(FULL MONTH)' : '(PARTIAL)'}`);
    }
    
    return partialAmount;
  };

  // Filter data based on selected criteria
  const applyFilters = () => {
    if (!allPaymentData) return;

    let filtered = allPaymentData.filter(employeeData => {
      const employee = employeeData.employee;
      
      // Status filter - match dashboard logic exactly
      const statusMatch = selectedStatus.length === 0 || 
        (selectedStatus.includes('housed') && employee.status === 'housed' && employee.status !== 'resigned') ||
        (selectedStatus.includes('other') && (employee.status !== 'housed' || employee.status === 'resigned'));
      
      // Company filter
      const companyMatch = selectedCompany === 'all' || employee.company === selectedCompany;
      
      return statusMatch && companyMatch;
    });

    // Sort by UID in ascending order (extract and sort by UID)
    filtered.sort((a, b) => {
      const uidA = a.employee.id || '';
      const uidB = b.employee.id || '';
      return uidA.localeCompare(uidB);
    });

    setPaymentData(filtered);
    
    // Pre-calculate monthly summaries for hover tooltips
    calculateMonthlySummaries(filtered);
  };

  // Pre-calculate monthly summaries for efficient hover display
  const calculateMonthlySummaries = (filteredData) => {
    const summaries = {};
    
    months.forEach(month => {
      const monthTotal = filteredData.reduce((total, employeeData) => {
        const monthPayment = employeeData.monthlyPayments[month.key];
        return total + (monthPayment?.amount || 0);
      }, 0);

      const paidData = filteredData.reduce((acc, employeeData) => {
        const monthPayment = employeeData.monthlyPayments[month.key];
        if (monthPayment && monthPayment.invoices && monthPayment.invoices.length > 0) {
          monthPayment.invoices.forEach(inv => {
            const amount = inv.amount || 0;
            if (inv.isPaid === true) {
              acc.paidAmount += amount;
              acc.paidCount += 1;
            } else {
              acc.unpaidAmount += amount;
              acc.unpaidCount += 1;
            }
          });
        }
        return acc;
      }, { paidAmount: 0, unpaidAmount: 0, paidCount: 0, unpaidCount: 0 });

      summaries[month.key] = {
        total: monthTotal,
        paid: paidData.paidAmount,
        unpaid: paidData.unpaidAmount,
        paidCount: paidData.paidCount,
        unpaidCount: paidData.unpaidCount,
        employeeCount: filteredData.reduce((count, emp) => 
          count + (emp.monthlyPayments[month.key]?.invoices?.length > 0 ? 1 : 0), 0
        )
      };
    });
    
    setMonthSummaries(summaries);
    
    // Debug logging for verification
    console.log('📊 Pre-calculated Monthly Summaries:', {
      'July 2025': summaries['2025-07'],
      'August 2025': summaries['2025-08']
    });
  };

  // Update filters
  const handleStatusChange = (status) => {
    setSelectedStatus(prev => 
      prev.includes(status) 
        ? prev.filter(s => s !== status)
        : [...prev, status]
    );
  };

  const handleCompanyChange = (company) => {
    setSelectedCompany(company);
  };

  // Handle receipt viewing
  const handleViewReceipt = (invoice) => {
    if (!invoice.isPaid || !invoice.receiptUrls || invoice.receiptUrls.length === 0) {
      return;
    }

    if (invoice.receiptUrls.length === 1) {
      // Single receipt - open directly
      window.open(invoice.receiptUrls[0], '_blank');
    } else {
      // Multiple receipts - show selection modal
      setShowReceiptModal({
        invoiceNumber: invoice.number,
        receiptUrls: invoice.receiptUrls,
        totalAmount: invoice.totalInvoiceAmount
      });
    }
  };

  const loadPaymentData = async () => {
    if (!currentUser) {
      setError('Please log in to view payment details');
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      console.log('📊 Loading payment timeline data...');
      
      const [employeesSnapshot, invoicesSnapshot] = await Promise.all([
        getDocs(collection(db, 'employees')),
        getDocs(collection(db, 'invoices'))
      ]);

      const employees = employeesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const invoices = invoicesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      console.log(`✅ Loaded ${employees.length} employees and ${invoices.length} invoices`);

      // Get all unique companies for filter options
      const companies = [...new Set(employees.map(emp => emp.company || 'N/A').filter(Boolean))].sort();
      setAvailableCompanies(companies);
      
      // Get housed employees using the same logic as dashboard
      const housedEmployees = employees.filter(emp => 
        emp.status === 'housed' && emp.status !== 'resigned'
      );
      const allEmployees = employees; // Keep all employees for filtering
      
      // Process each employee's payment timeline
      const paymentTimeline = allEmployees.map(employee => {
        // Find all invoices for this employee (excluding deposits)
        const employeeInvoices = invoices.filter(inv => {
          // First check if it's for this employee
          const isForEmployee = inv.employee_id === employee.id || 
            (inv.employee_names && Array.isArray(inv.employee_names) && inv.employee_names.some(name => {
              const empName = employee.name || employee.firstName || '';
              return name && empName && (name.includes(empName) || empName.includes(name));
            }));
          
          if (!isForEmployee) return false;
          
          // Filter out deposit invoices with comprehensive checks
          const invoiceNumber = (inv.invoice_number || '').toLowerCase();
          const description = (inv.description || '').toLowerCase();
          const type = (inv.type || '').toLowerCase();
          const notes = (inv.notes || '').toLowerCase();
          
          // Check for various deposit-related keywords (including A001, A002 patterns)
          const depositKeywords = ['deposit', 'deposite', '按金', '押金', 'security', '-a001', '-a002', '-a003'];
          const isDeposit = depositKeywords.some(keyword => 
            invoiceNumber.toLowerCase().includes(keyword) || 
            description.toLowerCase().includes(keyword) || 
            type.toLowerCase().includes(keyword) ||
            notes.toLowerCase().includes(keyword)
          );
          
          if (isDeposit) {
            console.log(`Filtered out deposit invoice: ${inv.invoice_number} - ${description}`);
            return false;
          }
          
          return true;
        });

        // Calculate payments for each month
        const monthlyPayments = {};
        const invoiceSpans = [];

        months.forEach(month => {
          monthlyPayments[month.key] = {
            amount: 0,
            invoices: []
          };
        });

        // Process each invoice with proper capping and redistribution
        employeeInvoices.forEach(invoice => {
          if (!invoice.start_date || !invoice.end_date) return;

          const startDate = invoice.start_date?.toDate ? invoice.start_date.toDate() : new Date(invoice.start_date);
          const endDate = invoice.end_date?.toDate ? invoice.end_date.toDate() : new Date(invoice.end_date);
          const totalInvoiceAmount = parseFloat(invoice.amount) || 0;
          const employeeMonthlyRent = parseFloat(employee.rent) || parseFloat(employee.monthlyRent) || 0;
          const isPaid = invoice.status === 'paid';

          // Debug specific employee calculations
          if (employee.name === '呂文燕') {
            console.log(`🔍 呂文燕 Invoice: ${invoice.invoice_number}`);
            console.log(`   Period: ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`);
            console.log(`   Total Amount: $${totalInvoiceAmount}`);
            console.log(`   Monthly Rent: $${employeeMonthlyRent}`);
          }

          // Find which months this invoice spans
          let spanStart = -1;
          let spanEnd = -1;
          const invoiceMonths = [];
          
          for (let i = 0; i < months.length; i++) {
            const monthDate = new Date(parseInt(months[i].key.split('-')[0]), parseInt(months[i].key.split('-')[1]) - 1, 1);
            const monthEnd = new Date(parseInt(months[i].key.split('-')[0]), parseInt(months[i].key.split('-')[1]), 0);
            
            if (startDate <= monthEnd && endDate >= monthDate) {
              if (spanStart === -1) spanStart = i;
              spanEnd = i;
              invoiceMonths.push({
                index: i,
                key: months[i].key,
                monthDate: monthDate,
                monthEnd: monthEnd
              });
            }
          }

          if (invoiceMonths.length > 0) {
            // Simple proportional calculation for each month
            invoiceMonths.forEach(monthInfo => {
              const proportionalAmount = calculateProportionalAmount(
                startDate, 
                endDate, 
                monthInfo.key, 
                totalInvoiceAmount,
                employeeMonthlyRent,
                employee.name
              );
              
              if (proportionalAmount > 0) {
                monthlyPayments[monthInfo.key].amount += proportionalAmount;
                monthlyPayments[monthInfo.key].invoices.push({
                  id: invoice.id,
                  number: invoice.invoice_number,
                  amount: proportionalAmount,
                  isPaid: isPaid,
                  startDate: startDate.toLocaleDateString('zh-TW'),
                  endDate: endDate.toLocaleDateString('zh-TW'),
                  receiptUrls: invoice.receipt_urls || invoice.receiptUrls || [],
                  totalInvoiceAmount: totalInvoiceAmount
                });
              }
            });

            // Store invoice span info
            invoiceSpans.push({
              id: invoice.id,
              number: invoice.invoice_number,
              startMonth: spanStart,
              endMonth: spanEnd,
              isPaid: isPaid,
              totalAmount: totalInvoiceAmount,
              startDate: startDate.toLocaleDateString('zh-TW'),
              endDate: endDate.toLocaleDateString('zh-TW')
            });
          }
        });

        // FINAL STEP: Apply monthly caps and redistribute excess across all months
        const employeeRentCap = parseFloat(employee.rent) || parseFloat(employee.monthlyRent) || 3500;
        
        // Store original amounts before any redistribution
        const originalAmounts = {};
        months.forEach(month => {
          originalAmounts[month.key] = monthlyPayments[month.key].amount;
        });
        
        // Collect all months with payments and their totals
        const monthsWithPayments = [];
        let totalExcessAfterCapping = 0;
        
        months.forEach(month => {
          const monthPayment = monthlyPayments[month.key];
          if (monthPayment.amount > 0) {
            // Add original amount tracking
            monthPayment.originalAmount = monthPayment.amount;
            monthPayment.redistributedAmount = 0; // Track redistributed portion
            
            if (monthPayment.amount > employeeRentCap) {
              // This month exceeds the cap
              const excess = monthPayment.amount - employeeRentCap;
              totalExcessAfterCapping += excess;
              monthPayment.amount = employeeRentCap; // Cap it
              monthPayment.wasCapped = true;
              monthPayment.excessAmount = excess;
              
              // Adjust individual invoice amounts proportionally in this month
              const originalTotal = monthPayment.invoices.reduce((sum, inv) => sum + inv.amount, 0);
              if (originalTotal > 0) {
                monthPayment.invoices.forEach(inv => {
                  inv.amount = (inv.amount / originalTotal) * employeeRentCap;
                });
              }
              
              monthsWithPayments.push({
                key: month.key,
                payment: monthPayment,
                wasCapped: true,
                originalAmount: monthPayment.originalAmount
              });
            } else {
              monthsWithPayments.push({
                key: month.key,
                payment: monthPayment,
                wasCapped: false,
                availableSpace: employeeRentCap - monthPayment.amount
              });
            }
          }
        });
        
        // Redistribute the excess to months that have space
        if (totalExcessAfterCapping > 0) {
          const monthsWithSpace = monthsWithPayments.filter(m => !m.wasCapped && m.availableSpace > 0);
          
          if (monthsWithSpace.length > 0) {
            const totalAvailableSpace = monthsWithSpace.reduce((sum, m) => sum + m.availableSpace, 0);
            
            if (totalAvailableSpace >= totalExcessAfterCapping) {
              // We have enough space to redistribute everything
              monthsWithSpace.forEach(monthData => {
                const redistributionRatio = monthData.availableSpace / totalAvailableSpace;
                const redistributeAmount = totalExcessAfterCapping * redistributionRatio;
                
                // Track the redistributed portion separately
                monthData.payment.redistributedAmount = redistributeAmount;
                monthData.payment.amount += redistributeAmount;
                
                // Add a virtual invoice entry for the redistributed amount
                monthData.payment.invoices.push({
                  id: 'redistributed',
                  number: `重新分配 (${monthsWithPayments.filter(m => m.wasCapped).map(m => m.key.split('-')[1] + '月').join(', ')})`,
                  amount: redistributeAmount,
                  isPaid: true,
                  startDate: '重新分配',
                  endDate: '重新分配',
                  receiptUrls: [],
                  totalInvoiceAmount: redistributeAmount
                });
              });
            }
          }
        }


        // Debug: Verify total amounts for specific employees
        if (employee.name === '黃悅婷') {
          const calculatedTotal = Object.values(monthlyPayments).reduce((sum, month) => sum + month.amount, 0);
          const actualInvoiceTotal = employeeInvoices.reduce((sum, inv) => sum + (parseFloat(inv.amount) || 0), 0);
          console.log(`🔍 黃悅婷 TOTAL CHECK:`, {
            calculatedMonthlyTotal: calculatedTotal.toFixed(2),
            actualInvoiceTotal: actualInvoiceTotal.toFixed(2),
            difference: Math.abs(calculatedTotal - actualInvoiceTotal).toFixed(2),
            shouldEqual: actualInvoiceTotal === calculatedTotal ? '✅ MATCH' : '❌ MISMATCH'
          });
        }

        if (employee.name === '呂文燕') {
          const calculatedTotal = Object.values(monthlyPayments).reduce((sum, month) => sum + month.amount, 0);
          const actualInvoiceTotal = employeeInvoices.reduce((sum, inv) => sum + (parseFloat(inv.amount) || 0), 0);
          console.log(`🔍 呂文燕 TOTAL CHECK:`, {
            calculatedMonthlyTotal: calculatedTotal.toFixed(2),
            actualInvoiceTotal: actualInvoiceTotal.toFixed(2),
            difference: Math.abs(calculatedTotal - actualInvoiceTotal).toFixed(2),
            shouldEqual: actualInvoiceTotal === calculatedTotal ? '✅ MATCH' : '❌ MISMATCH',
            monthlyRent: parseFloat(employee.rent) || parseFloat(employee.monthlyRent) || 0,
            invoiceCount: employeeInvoices.length
          });
          
          console.log(`🔍 呂文燕 Monthly Breakdown:`);
          Object.entries(monthlyPayments).forEach(([month, payment]) => {
            if (payment.amount > 0) {
              console.log(`   ${month}: $${payment.amount.toFixed(2)} (${payment.invoices.length} invoices)`);
            }
          });
        }

        return {
          employee: {
            id: employee.id,
            name: employee.name || employee.firstName || 'Unknown',
            company: employee.company || 'N/A',
            contract: employee.contractNumber || employee.contract_number || 'N/A',
            status: employee.status || 'unknown'
          },
          monthlyPayments,
          invoiceSpans,
          totalInvoices: employeeInvoices.length
        };
      });

      // DEBUG: Calculate August totals to find discrepancy
      const august2025 = months.find(m => m.month === 8 && m.year === 2025);
      if (august2025) {
        const augustTotal = paymentTimeline.reduce((total, empData) => {
          const augustPayment = empData.monthlyPayments[august2025.key];
          return total + (augustPayment ? augustPayment.amount : 0);
        }, 0);
        
        // Also calculate direct invoice total for August
        const directAugustInvoices = invoices.filter(inv => {
          if (!inv.start_date || !inv.end_date) return false;
          const startDate = inv.start_date?.toDate ? inv.start_date.toDate() : new Date(inv.start_date);
          const endDate = inv.end_date?.toDate ? inv.end_date.toDate() : new Date(inv.end_date);
          const august2025Start = new Date(2025, 7, 1);
          const august2025End = new Date(2025, 7, 31);
          return startDate <= august2025End && endDate >= august2025Start;
        });
        
        const directAugustTotal = directAugustInvoices.reduce((sum, inv) => sum + (parseFloat(inv.amount) || 0), 0);
        
        console.log(`🔍 AUGUST TOTAL DISCREPANCY CHECK:`, {
          proportionalCalculationTotal: `$${augustTotal.toLocaleString()}`,
          directInvoiceTotal: `$${directAugustTotal.toLocaleString()}`,
          dashboardExpected: '$447,017.58',
          paymentPageShowing: '$580,206',
          directInvoicesCount: directAugustInvoices.length,
          difference: `$${Math.abs(augustTotal - 447017.58).toLocaleString()}`
        });
        
        // Show sample direct invoices
        console.log('Sample August invoices (direct):');
        directAugustInvoices.slice(0, 5).forEach(inv => {
          const start = inv.start_date?.toDate ? inv.start_date.toDate().toLocaleDateString() : inv.start_date;
          const end = inv.end_date?.toDate ? inv.end_date.toDate().toLocaleDateString() : inv.end_date;
          console.log(`  ${inv.invoice_number}: $${inv.amount} (${start} - ${end})`);
        });
      }

      setAllPaymentData(paymentTimeline);
      console.log('✅ Payment timeline data processed');

    } catch (err) {
      console.error('Error loading payment data:', err);
      setError(`Failed to load payment data: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPaymentData();
  }, [currentUser]);

  // Apply filters when data or filter criteria change
  useEffect(() => {
    applyFilters();
  }, [allPaymentData, selectedStatus, selectedCompany]);

  const formatCurrency = (amount) => {
    if (amount === 0) return '';
    return new Intl.NumberFormat('zh-TW', {
      style: 'currency',
      currency: 'TWD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">付款明細</h1>
          <p className="text-gray-600">請先登入以查看付款明細</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50" style={{ zIndex: 9999 }}>
      <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 py-8" style={{ zIndex: 9999 }}>
        <div className="bg-white shadow rounded-lg" style={{ zIndex: 9999 }}>
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">💰 付款明細</h1>
                <p className="text-gray-600 mt-1">員工付款時間表 - 基於發票期間的比例分配</p>
              </div>
              {!loading && paymentData && (
                <div className="text-sm text-gray-500">
                  共 {paymentData.length} 名已入住員工
                </div>
              )}
            </div>
          </div>

          <div className="p-6">
            {loading && (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mr-3"></div>
                <span>載入付款資料中...</span>
              </div>
            )}

            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-800">❌ {error}</p>
              </div>
            )}

            {paymentData && (
              <div className="space-y-6">
                {/* Filters */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Status Filter */}
                    <div>
                      <h4 className="font-semibold text-gray-700 mb-3">員工狀態</h4>
                      <div className="space-y-2">
                        <label className="flex items-center space-x-3">
                          <input
                            type="checkbox"
                            checked={selectedStatus.includes('housed')}
                            onChange={() => handleStatusChange('housed')}
                            className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                          />
                          <span className="text-sm">已入住 (Housed)</span>
                        </label>
                        <label className="flex items-center space-x-3">
                          <input
                            type="checkbox"
                            checked={selectedStatus.includes('other')}
                            onChange={() => handleStatusChange('other')}
                            className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                          />
                          <span className="text-sm">其他狀態</span>
                        </label>
                      </div>
                    </div>

                    {/* Company Filter */}
                    <div>
                      <h4 className="font-semibold text-gray-700 mb-3">公司篩選</h4>
                      <select
                        value={selectedCompany}
                        onChange={(e) => handleCompanyChange(e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded-md bg-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="all">所有公司</option>
                        {availableCompanies.map(company => (
                          <option key={company} value={company}>
                            {company}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  
                  {/* Clear Filters Button */}
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <button
                      onClick={() => {
                        setSelectedStatus(['housed']);
                        setSelectedCompany('all');
                      }}
                      className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                    >
                      重置篩選
                    </button>
                    <span className="text-sm text-gray-500 ml-4">
                      顯示 {paymentData.length} 名員工
                    </span>
                  </div>
                </div>

                {/* Legend */}
                <div className="flex items-center space-x-4 p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 bg-green-200 border-2 border-green-400 rounded"></div>
                    <span className="text-sm">已付款</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 bg-yellow-200 border-2 border-yellow-400 rounded"></div>
                    <span className="text-sm">未付款</span>
                  </div>
                  <div className="text-sm text-gray-600">
                    * 金額基於發票期間與該月重疊天數按比例計算
                  </div>
                </div>

                {/* Payment Timeline Table */}
                <div className="relative overflow-x-auto border rounded-lg">
                  <div className="min-w-max relative">
                    
                    {/* Table Header */}
                    <div className="grid gap-1 mb-2 bg-gray-50 p-2" style={{ gridTemplateColumns: '40px 80px 260px ' + `repeat(${months.length}, 120px)` }}>
                      {/* Index Header */}
                      <div className="bg-gray-100 p-3 font-semibold border rounded-lg text-center text-xs">
                        #
                      </div>
                      
                      {/* UID Header */}
                      <div className="bg-gray-100 p-3 font-semibold border rounded-lg text-center text-xs">
                        UID
                      </div>
                      
                      {/* Employee Info Header */}
                      <div className="bg-gray-100 p-3 font-semibold border rounded-lg">
                        員工資訊
                      </div>
                      
                      {/* Month Headers */}
                      {months.map(month => {
                        const currentDate = new Date();
                        const isCurrentMonth = month.year === currentDate.getFullYear() && 
                                             month.month === (currentDate.getMonth() + 1);
                        
                        return (
                          <div key={month.key} className={`p-3 text-center font-semibold border rounded-lg text-sm relative ${
                            isCurrentMonth 
                              ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg border-blue-400' 
                              : 'bg-blue-50 text-gray-700 border-gray-200'
                          }`}>
                            {month.label}
                            {isCurrentMonth && (
                              <div className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-400 rounded-full border-2 border-white shadow-sm"></div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Employee Rows */}
                    {paymentData.map((employeeData, rowIndex) => (
                      <div key={employeeData.employee.id} className="relative">
                        {/* Row Container */}
                        <div className="grid gap-1 mb-1 bg-white" style={{ gridTemplateColumns: '40px 80px 260px ' + `repeat(${months.length}, 120px)` }}>
                          {/* Index Display */}
                          <div className="bg-white border p-1 h-12 flex flex-col items-center justify-center text-xs">
                            <div className="font-bold text-gray-600 text-xs">
                              {rowIndex + 1}
                            </div>
                          </div>
                          
                          {/* UID Display */}
                          <div className="bg-white border p-1 h-12 flex flex-col items-center justify-center text-xs">
                            <div className="font-bold text-blue-600 text-xs leading-tight">
                              {employeeData.employee.id}
                            </div>
                          </div>
                          
                          {/* Employee Info */}
                          <div className="bg-white border p-2 h-12 flex items-center">
                            <div className="flex-1">
                              <div className="font-semibold text-xs">{employeeData.employee.name}</div>
                              <div className="text-xs text-gray-500">
                                {employeeData.employee.company} | {employeeData.totalInvoices}發票
                              </div>
                            </div>
                          </div>

                          {/* Monthly Payment Cells */}
                          {months.map((month, colIndex) => {
                            const paymentInfo = employeeData.monthlyPayments[month.key];
                            const currentDate = new Date();
                            const isCurrentMonth = month.year === currentDate.getFullYear() && 
                                                 month.month === (currentDate.getMonth() + 1);
                            
                            // Determine cell color based on payment status
                            let cellColorClass = '';
                            let borderColorClass = 'border-gray-200';
                            
                            if (paymentInfo.amount > 0) {
                              const allPaid = paymentInfo.invoices.every(inv => inv.isPaid);
                              const anyPaid = paymentInfo.invoices.some(inv => inv.isPaid);
                              
                              if (allPaid) {
                                // All invoices paid - green
                                cellColorClass = isCurrentMonth 
                                  ? 'bg-green-50 hover:bg-green-100' 
                                  : 'bg-green-50 hover:bg-green-100';
                                borderColorClass = 'border-green-400 border-2';
                              } else if (anyPaid) {
                                // Partially paid - orange/yellow mix  
                                cellColorClass = isCurrentMonth 
                                  ? 'bg-yellow-50 hover:bg-yellow-100' 
                                  : 'bg-yellow-50 hover:bg-yellow-100';
                                borderColorClass = 'border-yellow-400 border-2';
                              } else {
                                // None paid - yellow
                                cellColorClass = isCurrentMonth 
                                  ? 'bg-yellow-50 hover:bg-yellow-100' 
                                  : 'bg-yellow-50 hover:bg-yellow-100';
                                borderColorClass = 'border-yellow-400 border-2';
                              }
                            } else {
                              // No payment
                              cellColorClass = isCurrentMonth 
                                ? 'bg-blue-50 hover:bg-blue-100' 
                                : 'bg-gray-50 hover:bg-gray-100';
                            }

                            return (
                              <div 
                                key={month.key} 
                                className={`p-1 h-12 relative flex items-center justify-center text-xs transition-all duration-200 cursor-pointer group ${cellColorClass} ${borderColorClass} hover:shadow-md`}
                                onMouseEnter={(e) => {
                                  if (paymentInfo.amount > 0) {
                                    setHoveredInvoice({
                                      employee: employeeData.employee.name,
                                      month: month.label,
                                      amount: paymentInfo.amount,
                                      invoices: paymentInfo.invoices,
                                      x: e.clientX,
                                      y: e.clientY
                                    });
                                  }
                                }}
                                onMouseLeave={() => setHoveredInvoice(null)}
                                onClick={() => {
                                  if (paymentInfo.amount > 0) {
                                    console.log(`${employeeData.employee.name} - ${month.label}:`, paymentInfo.invoices);
                                  }
                                }}
                              >
                                {paymentInfo.amount > 0 && (
                                  <div className="text-center leading-tight">
                                    <div className="font-semibold text-xs group-hover:text-blue-600 transition-colors">
                                      {paymentInfo.redistributedAmount && paymentInfo.redistributedAmount > 0 ? (
                                        // Show A+B format for redistributed amounts
                                        <div>
                                          <span>{formatCurrency(paymentInfo.amount - paymentInfo.redistributedAmount)}</span>
                                          <span className="text-orange-600">+{formatCurrency(paymentInfo.redistributedAmount)}</span>
                                        </div>
                                      ) : paymentInfo.wasCapped ? (
                                        // Show capped amount with indicator
                                        <div>
                                          <span>{formatCurrency(paymentInfo.amount)}</span>
                                          <span className="text-red-500 text-xs ml-1">CAPPED</span>
                                        </div>
                                      ) : (
                                        // Normal amount
                                        formatCurrency(paymentInfo.amount)
                                      )}
                                    </div>
                                    <div className="text-gray-500 text-xs group-hover:text-gray-700 transition-colors">
                                      {paymentInfo.invoices.length}發票
                                    </div>
                                    {/* Hover indicator */}
                                    <div className="absolute inset-0 bg-blue-500 opacity-0 group-hover:opacity-5 transition-opacity rounded"></div>
                                  </div>
                                )}
                                {paymentInfo.amount === 0 && (
                                  <div className="text-gray-300 text-xs">—</div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                      </div>
                    ))}
                  </div>
                  
                  {/* Monthly Summary Row */}
                  <div className="mt-4 border-t-2 border-gray-300 pt-4">
                    <div className="grid gap-1" style={{ gridTemplateColumns: '40px 80px 260px ' + `repeat(${months.length}, 120px)` }}>
                      {/* Empty cell for Index column */}
                      <div className="bg-blue-100 border rounded-lg"></div>
                      
                      {/* Empty cell for UID column */}
                      <div className="bg-blue-100 border rounded-lg"></div>
                      
                      {/* Summary Label */}
                      <div className="bg-blue-100 p-3 font-bold border rounded-lg">
                        📊 月度總計
                      </div>
                      
                      {/* Monthly Totals */}
                      {months.map(month => {
                        const currentDate = new Date();
                        const isCurrentMonth = month.year === currentDate.getFullYear() && 
                                             month.month === (currentDate.getMonth() + 1);
                        
                        // Use pre-calculated summary data
                        const summary = monthSummaries[month.key] || {
                          total: 0,
                          paid: 0,
                          unpaid: 0,
                          paidCount: 0,
                          unpaidCount: 0,
                          employeeCount: 0
                        };
                        
                        return (
                          <div 
                            key={month.key} 
                            className={`relative border rounded-lg p-2 text-center cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-105 ${
                              isCurrentMonth 
                                ? 'bg-gradient-to-br from-blue-100 to-purple-100 border-blue-300 shadow-md' 
                                : 'bg-blue-50 border-gray-200'
                            }`}
                            onMouseEnter={(e) => setHoveredSummary({
                              month: month.label,
                              monthKey: month.key,
                              summary: summary,
                              x: e.currentTarget.getBoundingClientRect().left,
                              y: e.currentTarget.getBoundingClientRect().top
                            })}
                            onMouseLeave={() => setHoveredSummary(null)}
                          >
                            <div className={`font-bold text-sm ${
                              isCurrentMonth ? 'text-blue-900' : 'text-blue-800'
                            }`}>
                              {formatCurrency(summary.total)}
                            </div>
                            <div className={`text-xs ${
                              isCurrentMonth ? 'text-blue-700' : 'text-blue-600'
                            }`}>
                              {summary.employeeCount} 人
                            </div>
                            <div className={`text-xs mt-1 ${
                              isCurrentMonth ? 'text-green-700' : 'text-green-600'
                            }`}>
                              ✓{summary.paidCount} ✗{summary.unpaidCount}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modern Tooltip for hovered invoice */}
      {hoveredInvoice && (
        <div 
          className="fixed bg-white border border-gray-200 rounded-xl p-4 shadow-2xl z-50 max-w-md backdrop-blur-sm bg-white/95"
          style={{
            left: `${hoveredInvoice.x + 10}px`,
            top: `${hoveredInvoice.y - 10}px`,
            transform: 'translateY(-100%)',
            minWidth: '350px'
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-100">
            <h3 className="font-bold text-gray-800 text-sm">{hoveredInvoice.employee}</h3>
            <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-full">
              {hoveredInvoice.month}
            </span>
          </div>

          {/* Total Amount */}
          <div className="mb-3">
            <div className="text-lg font-bold text-green-600">
              {formatCurrency(hoveredInvoice.amount)}
            </div>
            <div className="text-xs text-gray-500">
              來自 {hoveredInvoice.invoices.length} 張發票
            </div>
          </div>

          {/* Invoice Details */}
          <div className="space-y-3">
            {hoveredInvoice.invoices.map((invoice, idx) => (
              <div key={idx} className="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1">
                    <div className="font-medium text-sm text-gray-800 mb-1">{invoice.number}</div>
                    <div className="flex items-center space-x-2">
                      <div className={`text-xs ${
                        invoice.isPaid ? 'text-green-600' : 'text-yellow-600'
                      }`}>
                        {invoice.isPaid ? '✅ 已付款' : '⏳ 未付款'}
                      </div>
                      {invoice.isPaid && invoice.receiptUrls && invoice.receiptUrls.length > 0 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewReceipt(invoice);
                          }}
                          className="text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 px-2 py-1 rounded-full transition-colors"
                        >
                          📄 收據 {invoice.receiptUrls.length > 1 && `(${invoice.receiptUrls.length})`}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-gray-600 ml-3">
                    {formatCurrency(invoice.amount)}
                  </div>
                </div>
                
                {/* Invoice Period */}
                <div className="bg-white p-2 rounded border text-xs mt-2">
                  <div className="flex items-center justify-between text-gray-600">
                    <span className="text-gray-500 font-medium">期間:</span>
                    <div className="flex items-center space-x-2">
                      <span className="font-mono bg-blue-50 px-2 py-1 rounded text-xs">{invoice.startDate}</span>
                      <span className="text-gray-400">→</span>
                      <span className="font-mono bg-blue-50 px-2 py-1 rounded text-xs">{invoice.endDate}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Click hint */}
          <div className="mt-3 pt-2 border-t border-gray-100 text-xs text-gray-400 text-center">
            點擊查看詳細信息
          </div>
        </div>
      )}

      {/* Summary Tooltip for monthly totals */}
      {hoveredSummary && hoveredSummary.summary && (
        <div 
          className="fixed bg-white border border-gray-200 rounded-xl p-4 shadow-2xl z-50 backdrop-blur-sm bg-white/95"
          style={{
            left: `${hoveredSummary.x + 10}px`,
            top: `${hoveredSummary.y - 10}px`,
            transform: 'translateY(-100%)',
            minWidth: '320px'
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-100">
            <h3 className="font-bold text-gray-800 text-sm">月度付款詳情</h3>
            <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-full">
              {hoveredSummary.month}
            </span>
          </div>

          {/* Payment Breakdown */}
          <div className="space-y-3">
            {/* Total */}
            <div className="flex justify-between items-center p-2 bg-blue-50 rounded-lg">
              <span className="text-sm font-medium text-gray-700">總計金額</span>
              <span className="text-lg font-bold text-blue-600">{formatCurrency(hoveredSummary.summary.total)}</span>
            </div>
            
            {/* Paid */}
            <div className="flex justify-between items-center p-2 bg-green-50 rounded-lg border-l-4 border-green-400">
              <span className="text-sm text-green-700 flex items-center font-medium">
                <span className="w-3 h-3 bg-green-500 rounded-full mr-2"></span>
                已付款
              </span>
              <div className="text-right">
                <div className="text-lg font-bold text-green-600">
                  {formatCurrency(hoveredSummary.summary.paid)}
                </div>
                <div className="text-xs text-green-500">
                  {hoveredSummary.summary.paidCount} 張發票
                </div>
              </div>
            </div>
            
            {/* Unpaid */}
            <div className="flex justify-between items-center p-2 bg-orange-50 rounded-lg border-l-4 border-orange-400">
              <span className="text-sm text-orange-700 flex items-center font-medium">
                <span className="w-3 h-3 bg-orange-500 rounded-full mr-2"></span>
                未付款
              </span>
              <div className="text-right">
                <div className="text-lg font-bold text-orange-600">
                  {formatCurrency(hoveredSummary.summary.unpaid)}
                </div>
                <div className="text-xs text-orange-500">
                  {hoveredSummary.summary.unpaidCount} 張發票
                </div>
              </div>
            </div>
            
            {/* Employee Count */}
            <div className="flex justify-between items-center pt-2 border-t border-gray-100">
              <span className="text-xs text-gray-500">參與員工數</span>
              <span className="text-xs font-medium text-gray-700">{hoveredSummary.summary.employeeCount} 人</span>
            </div>
          </div>
        </div>
      )}

      {/* Receipt Selection Modal */}
      {showReceiptModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-200">
              <div>
                <h3 className="font-bold text-lg text-gray-800">{showReceiptModal.invoiceNumber}</h3>
                <p className="text-sm text-gray-600">選擇要查看的收據</p>
              </div>
              <button
                onClick={() => setShowReceiptModal(null)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Receipt List */}
            <div className="space-y-3 mb-6">
              {showReceiptModal.receiptUrls.map((url, index) => {
                // Extract filename from URL for display
                const filename = url.split('/').pop() || `收據 ${index + 1}`;
                const displayName = filename.includes(showReceiptModal.invoiceNumber) 
                  ? filename 
                  : `${showReceiptModal.invoiceNumber} - 收據 ${index + 1}`;
                
                return (
                  <button
                    key={index}
                    onClick={() => {
                      window.open(url, '_blank');
                      setShowReceiptModal(null);
                    }}
                    className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-blue-50 hover:border-blue-200 border border-gray-200 rounded-lg transition-all duration-200 group"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-blue-100 rounded-full group-hover:bg-blue-200 transition-colors">
                        📄
                      </div>
                      <div className="text-left">
                        <div className="font-medium text-gray-800 text-sm">{displayName}</div>
                        <div className="text-xs text-gray-500">點擊查看收據</div>
                      </div>
                    </div>
                    <div className="text-blue-600 group-hover:text-blue-700">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end">
              <button
                onClick={() => setShowReceiptModal(null)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}