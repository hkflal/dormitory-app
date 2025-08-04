import { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { 
  ArrowUpIcon, 
  ArrowDownIcon,
  CurrencyDollarIcon,
  BuildingOfficeIcon,
  UserGroupIcon,
  DocumentChartBarIcon,
} from '@heroicons/react/24/outline';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';

const StatCard = ({ title, value, change, changeType }) => (
  <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md border border-gray-200 dark:border-gray-700">
    <div className="flex justify-between items-start">
      <div>
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{title}</p>
        <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{value}</p>
      </div>
      {change && (
        <div className={`flex items-center text-sm font-semibold ${changeType === 'increase' ? 'text-green-500' : 'text-red-500'}`}>
          {changeType === 'increase' ? <ArrowUpIcon className="h-4 w-4" /> : <ArrowDownIcon className="h-4 w-4" />}
          <span className="ml-1">{change}</span>
        </div>
      )}
    </div>
  </div>
);

// Helper function: Check if employee needs to pay this month
const checkIfEmployeeNeedsToPayThisMonth = (employee, year, month) => {
  const paymentFrequency = employee.paymentFrequency || employee.frequency || 1; // Default monthly
  
  // For quarterly payment (frequency = 3), check if they have paid in the current quarter
  if (paymentFrequency === 3) {
    // Check if they paid in any month of the current quarter
    const currentQuarter = Math.floor(month / 3);
    const quarterStartMonth = currentQuarter * 3;
    const quarterMonths = [quarterStartMonth, quarterStartMonth + 1, quarterStartMonth + 2];
    
    // For quarterly payment, we consider them as "paid" if they paid any month in the quarter
    // This will be handled in the payment check function
    return true; // Always true for quarterly, but amount is divided by frequency
  }
  
  // For other frequencies, assume monthly for now
  return true;
};

// Helper function: Check if employee has paid this month
const checkIfEmployeeHasPaidThisMonth = (employee, invoices, year, month) => {
  const paymentFrequency = employee.paymentFrequency || employee.frequency || 1;
  
  if (paymentFrequency === 3) {
    // For quarterly payment, check if they paid in ANY month of the current quarter
    const currentQuarter = Math.floor(month / 3);
    const quarterStartMonth = currentQuarter * 3;
    const quarterMonths = [quarterStartMonth, quarterStartMonth + 1, quarterStartMonth + 2];
    
    const employeePaidInvoices = invoices.filter(inv => {
      if (inv.status !== 'paid') return false;
      
      // Check if invoice belongs to this employee
      const isEmployeeInvoice = inv.employeeId === employee.id || 
                              inv.employee_id === employee.id ||
                              inv.employeeName === employee.name;
      if (!isEmployeeInvoice) return false;
      
      // Check if invoice is for ANY month in the current quarter
      const issueDate = inv.issueDate?.toDate ? inv.issueDate.toDate() : new Date(inv.issueDate);
      if (issueDate.getFullYear() !== year) return false;
      
      return quarterMonths.includes(issueDate.getMonth());
    });

    return employeePaidInvoices.length > 0;
  } else {
    // For monthly payment, check current month only
    const employeePaidInvoices = invoices.filter(inv => {
      if (inv.status !== 'paid') return false;
      
      // Check if invoice belongs to this employee
      const isEmployeeInvoice = inv.employeeId === employee.id || 
                              inv.employee_id === employee.id ||
                              inv.employeeName === employee.name;
      if (!isEmployeeInvoice) return false;
      
      // Check if invoice is for current month
      const issueDate = inv.issueDate?.toDate ? inv.issueDate.toDate() : new Date(inv.issueDate);
      return issueDate.getFullYear() === year && issueDate.getMonth() === month;
    });

    return employeePaidInvoices.length > 0;
  }
};

// Calculate actual income based on housed employees who have paid this month
const calculateActualIncome = (employees, invoices, currentYear, currentMonth) => {
  return employees
    .filter(emp => emp.status === 'housed') // Only housed employees
    .reduce((total, emp) => {
      const empRent = parseFloat(emp.rent) || parseFloat(emp.monthlyRent) || 0;
      if (empRent === 0) return total;

      // empRent is already monthly rent, regardless of payment frequency
      const monthlyIncomeAmount = empRent;

      // Check if employee needs to pay this month
      const needsToPayThisMonth = checkIfEmployeeNeedsToPayThisMonth(emp, currentYear, currentMonth);
      if (!needsToPayThisMonth) return total;

      // Check if employee has paid this month (or quarter for quarterly payment)
      const hasPaidThisMonth = checkIfEmployeeHasPaidThisMonth(emp, invoices, currentYear, currentMonth);
      if (!hasPaidThisMonth) return total;

      return total + monthlyIncomeAmount;
    }, 0);
};

const FinancialsPage = () => {
  const [loading, setLoading] = useState(true);
  const [currentMonthStats, setCurrentMonthStats] = useState({});
  const [propertySummary, setPropertySummary] = useState([]);
  const [monthlyTrends, setMonthlyTrends] = useState([]);
  const [historicalData, setHistoricalData] = useState([]);
  const [housedEmployees, setHousedEmployees] = useState([]);

  // Currency formatting function
  const formatCurrency = (amount) => {
    const numericAmount = parseFloat(amount || 0);
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      useGrouping: true
    }).format(numericAmount);
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [invoicesSnapshot, propertiesSnapshot, employeesSnapshot] = await Promise.all([
          getDocs(collection(db, 'invoices')),
          getDocs(collection(db, 'properties')),
          getDocs(collection(db, 'employees')),
        ]);

        const invoices = invoicesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const properties = propertiesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const employees = employeesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();

        // 1. Current Month KPI Stats
        const currentMonthInvoices = invoices.filter(inv => {
          const issueDate = inv.issueDate?.toDate ? inv.issueDate.toDate() : new Date(inv.issueDate);
          return issueDate.getFullYear() === currentYear && issueDate.getMonth() === currentMonth;
        });

        const housedEmployeesData = employees.filter(emp => emp.status === 'housed');
        setHousedEmployees(housedEmployeesData);
        
        const theoreticalRevenue = housedEmployeesData.reduce((acc, emp) => {
            // Ensure rent is treated as a number, fallback to 0 if invalid
            return acc + (parseFloat(emp.rent) || parseFloat(emp.monthlyRent) || 0);
        }, 0);

        const rentCollected = calculateActualIncome(housedEmployeesData, currentMonthInvoices, currentYear, currentMonth);
        
        // 🔍 Debug logging for financial calculations
        console.log(`📊 Financial Debug - Current Month: ${currentYear}-${currentMonth + 1}`);
        console.log(`📊 Housed Employees: ${housedEmployeesData.length}`);
        console.log(`📊 Current Month Invoices: ${currentMonthInvoices.length}`);
        console.log(`📊 Theoretical Revenue: ${formatCurrency(theoreticalRevenue)}`);
        console.log(`📊 Actual Revenue (Paid Only): ${formatCurrency(rentCollected)}`);
        
        // Debug individual employee calculations
        console.log(`🔍 Analyzing payment status...`);
        console.log(`📊 Sample invoice data:`, currentMonthInvoices.slice(0, 2));
        console.log(`📊 Sample employee data:`, housedEmployeesData.slice(0, 2));
        
        let paidEmployeeCount = 0;
        let unpaidEmployeeCount = 0;
        
        housedEmployeesData.forEach(emp => {
          const empRent = parseFloat(emp.rent) || parseFloat(emp.monthlyRent) || 0;
          const paymentFrequency = emp.paymentFrequency || emp.frequency || 1;
          const monthlyAmount = empRent; // Already monthly rent
          
          // Detailed payment check
          const matchingInvoices = currentMonthInvoices.filter(inv => {
            const isEmployeeInvoice = inv.employeeId === emp.id || 
                                    inv.employee_id === emp.id ||
                                    inv.employeeName === emp.name;
            return isEmployeeInvoice;
          });
          
          const paidInvoices = matchingInvoices.filter(inv => inv.status === 'paid');
          const hasPaid = checkIfEmployeeHasPaidThisMonth(emp, currentMonthInvoices, currentYear, currentMonth);
          
          if (empRent > 0) {
            if (hasPaid) {
              paidEmployeeCount++;
              console.log(`✅ ${emp.name}: PAID - Rent=${empRent}, Invoices=${paidInvoices.length}`);
            } else {
              unpaidEmployeeCount++;
              console.log(`❌ ${emp.name}: UNPAID - Rent=${empRent}, Matching=${matchingInvoices.length}, Paid=${paidInvoices.length}`);
              if (matchingInvoices.length > 0) {
                console.log(`   - Invoice Status: ${matchingInvoices.map(i => i.status).join(', ')}`);
              }
            }
          }
        });
        
        console.log(`📊 Summary: ${paidEmployeeCount} paid, ${unpaidEmployeeCount} unpaid`);
        
        const totalRentalCost = properties.reduce((acc, prop) => acc + (parseFloat(prop.cost) || 0), 0);
        const otherCosts = 0; // Placeholder for other costs, set to 0 for now

        setCurrentMonthStats({
                  theoreticalRevenue: formatCurrency(theoreticalRevenue),
        rentCollected: formatCurrency(rentCollected),
        totalRentalCost: formatCurrency(totalRentalCost),
        otherCosts: formatCurrency(otherCosts),
        });

        // 2. Property-wise Summary
        const summary = properties.map(prop => {
          const propHousedEmployees = employees.filter(emp => emp.assigned_property_id === prop.id && emp.status === 'housed');
          
          const propTheoreticalRevenue = propHousedEmployees.reduce((acc, emp) => {
            return acc + (parseFloat(emp.rent) || parseFloat(emp.monthlyRent) || 0);
          }, 0);

          const propEmployeeIds = employees.filter(e => e.assigned_property_id === prop.id).map(e => e.id);
          const propInvoices = invoices.filter(inv => 
            (inv.employee_id && propEmployeeIds.includes(inv.employee_id))
          );

          // Calculate actual revenue for this property using the same logic
          const propActualRevenue = calculateActualIncome(
            propHousedEmployees,
            propInvoices,
            currentYear,
            currentMonth
          );
          
          const propCost = parseFloat(prop.cost) || 0;
          const theoreticalProfit = propTheoreticalRevenue - propCost;

          // Calculate actual occupancy (housed employees) for this property
          const actualOccupancy = employees.filter(emp => 
            emp.assigned_property_id === prop.id && emp.status === 'housed'
          ).length;
          
          // Use static capacity (bed capacity) for the property
          const staticCapacity = prop.capacity || 0;
          
          const occupancyRate = staticCapacity > 0 ? ((actualOccupancy / staticCapacity) * 100).toFixed(1) : 0;
          
          return {
            id: prop.id,
            name: prop.name,
            cost: propCost,
            theoreticalRevenue: propTheoreticalRevenue,
            actualRevenue: propActualRevenue,
            profit: theoreticalProfit,
            occupancy: `${actualOccupancy}/${staticCapacity} (${occupancyRate}%)`,
          };
        });
        setPropertySummary(summary);
        
        // 3. Monthly Trends & Historical Data
        // Calculate historical data for the last 6 months
        const history = [];
        const monthNames = ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"];
        const today = new Date();

        const totalMonthlyCost = properties.reduce((acc, prop) => acc + (parseFloat(prop.cost) || 0), 0);

        for (let i = 5; i >= 0; i--) {
            const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
            const year = date.getFullYear();
            const month = date.getMonth();

            const monthInvoices = invoices.filter(inv => {
                const issueDate = inv.issueDate?.toDate ? inv.issueDate.toDate() : new Date(inv.issueDate);
                if (isNaN(issueDate.getTime())) return false;
                return issueDate.getFullYear() === year && issueDate.getMonth() === month;
            });

            // Get employees who were housed during that month
            const monthHousedEmployees = employees.filter(emp => {
                const checkInDate = emp.checkInDate?.toDate ? emp.checkInDate.toDate() : (emp.checkInDate ? new Date(emp.checkInDate) : null);
                if (!checkInDate || isNaN(checkInDate.getTime())) return false; 
                return checkInDate <= date && emp.status === 'housed';
            });

            const rentCollected = calculateActualIncome(monthHousedEmployees, monthInvoices, year, month);
            
            // Note: Employee count is a snapshot of who had checked in by that month.
            // This assumes a 'checkInDate' field exists on employee documents.
            const employeeCount = employees.filter(emp => {
                const checkInDate = emp.checkInDate?.toDate ? emp.checkInDate.toDate() : (emp.checkInDate ? new Date(emp.checkInDate) : null);
                if (!checkInDate || isNaN(checkInDate.getTime())) return false; 
                return checkInDate <= date;
            }).length;

            const pnl = rentCollected - totalMonthlyCost;

            history.push({
                month: `${year} ${monthNames[month]}`,
                        rentCollected: formatCurrency(rentCollected),
        totalCosts: formatCurrency(totalMonthlyCost),
                pnl: pnl,
                employees: employeeCount,
                properties: properties.length 
            });
        }
        setHistoricalData(history.reverse());
        
        const trends = history.map(h => ({
          name: h.month.split(' ')[1], // e.g., "一月"
          PNL: h.pnl,
          Employees: h.employees,
          Properties: h.properties
        })).reverse(); // reverse back for chart order
        setMonthlyTrends(trends);

      } catch (error) {
        console.error("Error fetching financial data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 dark:bg-gray-900 min-h-screen p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">財務儀表板</h1>
          <p className="text-md text-gray-500 dark:text-gray-400 mt-1">
            當前月份現金流、物業表現及每月趨勢分析
          </p>
        </header>

        {/* KPI Cards */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard title="總應收租金 (理論)" value={currentMonthStats.theoreticalRevenue} />
          <StatCard title="總實收租金 (實際)" value={currentMonthStats.rentCollected} />
          <StatCard title="總物業成本" value={currentMonthStats.totalRentalCost} />
          <StatCard title="其他成本" value={currentMonthStats.otherCosts} />
        </section>

        {/* Charts and Property Summary */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
          <div className="lg:col-span-2 bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md border border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">每月趨勢</h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={monthlyTrends}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(128, 128, 128, 0.3)" />
                <XAxis dataKey="name" stroke="#9ca3af" />
                <YAxis yAxisId="left" stroke="#9ca3af" />
                <YAxis yAxisId="right" orientation="right" stroke="#9ca3af" />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'rgba(31, 41, 55, 0.8)', border: 'none', borderRadius: '0.5rem' }} 
                  labelStyle={{ color: '#f3f4f6' }}
                />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="PNL" stroke="#8884d8" strokeWidth={2} name="每月損益 (PNL)" />
                <Line yAxisId="right" type="monotone" dataKey="Employees" stroke="#82ca9d" strokeWidth={2} name="員工人數" />
                <Line yAxisId="right" type="monotone" dataKey="Properties" stroke="#ffc658" strokeWidth={2} name="物業數量" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md border border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">核心指標</h2>
            <div className="space-y-4">
               <div className="flex items-center">
                <BuildingOfficeIcon className="h-8 w-8 text-blue-500" />
                <div className="ml-4">
                  <p className="text-sm text-gray-500">總物業數</p>
                  <p className="text-2xl font-bold">{propertySummary.length}</p>
                </div>
              </div>
              <div className="flex items-center">
                <UserGroupIcon className="h-8 w-8 text-green-500" />
                <div className="ml-4">
                  <p className="text-sm text-gray-500">總員工人數 (已入住房) </p>
                  <p className="text-2xl font-bold">{housedEmployees.length}</p>
                </div>
              </div>
              <div className="flex items-center">
                <DocumentChartBarIcon className="h-8 w-8 text-yellow-500" />
                <div className="ml-4">
                  <p className="text-sm text-gray-500">平均損益 (六個月)</p>
                  <p className="text-2xl font-bold">{formatCurrency((monthlyTrends.reduce((acc, t) => acc + t.PNL, 0) / monthlyTrends.length))}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* P&L Charts */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Individual Property P&L Bar Chart */}
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md border border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">各物業損益分析</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={propertySummary.map(prop => ({
                  name: prop.name,
                  profit: prop.profit || 0,
                  cost: prop.cost || 0,
                  revenue: prop.theoreticalRevenue || 0
                }))}
                margin={{
                  top: 20,
                  right: 30,
                  left: 20,
                  bottom: 5,
                }}
              >
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis 
                  dataKey="name" 
                  tick={{ fontSize: 12 }}
                  className="text-gray-600 dark:text-gray-300"
                />
                <YAxis 
                  tick={{ fontSize: 12 }}
                  className="text-gray-600 dark:text-gray-300"
                />
                <Tooltip 
                  formatter={(value, name) => [
                    formatCurrency(value), 
                    name === 'profit' ? '淨利潤' : name === 'cost' ? '成本' : '理論收入'
                  ]}
                  labelFormatter={(label) => `物業: ${label}`}
                  contentStyle={{
                    backgroundColor: 'rgb(31 41 55)',
                    border: 'none',
                    borderRadius: '8px',
                    color: 'white'
                  }}
                />
                <Legend />
                <Bar dataKey="profit" name="淨利潤">
                  {propertySummary.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={(entry.profit || 0) >= 0 ? '#10b981' : '#ef4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Aggregated P&L Summary */}
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md border border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">整體損益摘要</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={[
                  {
                    name: '總計',
                    totalRevenue: propertySummary.reduce((acc, prop) => acc + (prop.theoreticalRevenue || 0), 0),
                    totalCost: propertySummary.reduce((acc, prop) => acc + (prop.cost || 0), 0),
                    totalProfit: propertySummary.reduce((acc, prop) => acc + (prop.profit || 0), 0)
                  }
                ]}
                margin={{
                  top: 20,
                  right: 30,
                  left: 20,
                  bottom: 5,
                }}
              >
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis 
                  dataKey="name" 
                  tick={{ fontSize: 12 }}
                  className="text-gray-600 dark:text-gray-300"
                />
                <YAxis 
                  tick={{ fontSize: 12 }}
                  className="text-gray-600 dark:text-gray-300"
                />
                <Tooltip 
                  formatter={(value, name) => [
                    formatCurrency(value), 
                    name === 'totalProfit' ? '總淨利潤' : name === 'totalCost' ? '總成本' : '總理論收入'
                  ]}
                  contentStyle={{
                    backgroundColor: 'rgb(31 41 55)',
                    border: 'none',
                    borderRadius: '8px',
                    color: 'white'
                  }}
                />
                <Legend />
                <Bar dataKey="totalRevenue" name="總理論收入" fill="#3b82f6" />
                <Bar dataKey="totalCost" name="總成本" fill="#ef4444" />
                <Bar dataKey="totalProfit" name="總淨利潤" fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Property-wise Financial Summary */}
        <section className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 mb-8">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">各物業財務摘要</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">物業</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">每月成本</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">總收入 (理論)</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">淨利潤/虧損</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">入住率</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {propertySummary.map((prop) => (
                    <tr key={prop.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{prop.name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-red-500">{formatCurrency(prop.cost || 0)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-green-500">{formatCurrency(prop.theoreticalRevenue || 0)}</td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm font-semibold ${(prop.profit || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {formatCurrency(prop.profit || 0)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{prop.occupancy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
        </section>

        {/* Historical Data Table */}
        <section className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md border border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">每月快照</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">月份</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">總實收租金</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">總成本</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">每月損益 (PNL)</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">員工人數</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">物業數量</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {historicalData.map((item) => (
                    <tr key={item.month}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{item.month}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{item.rentCollected}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{item.totalCosts}</td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm font-semibold ${item.pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {formatCurrency(item.pnl)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{item.employees}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{item.properties}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
        </section>
      </div>
    </div>
  );
};

export default FinancialsPage;