import { db } from './firebase';
import { collection, getDocs } from 'firebase/firestore';

/**
 * Get current month rent metrics for dashboard KPIs
 * @param {Array} employees - Array of employee documents
 * @param {Array} invoices - Array of invoice documents
 * @param {number} year - Target year
 * @param {number} month - Target month (0-based)
 * @returns {Object} Current month rent metrics
 */
export const getCurrentMonthRentMetrics = (employees, invoices, year, month) => {
  // 1. Total Receivable Rent = Sum of rent from housed employees (exclude resigned)
  const totalReceivableRent = employees
    .filter(emp => emp.status === 'housed' && emp.status !== 'resigned')
    .reduce((sum, emp) => sum + (parseFloat(emp.rent) || parseFloat(emp.monthlyRent) || 0), 0);
  
  // 2. Current Month Invoices - filter by coverage period, not issue date
  const currentMonthInvoices = invoices.filter(inv => {
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
    // Invoice covers target month if: start_date <= target_month_end AND end_date >= target_month_start
    return startDate <= targetMonthEnd && endDate >= targetMonthStart;
  });
  
  // 3. Received Rent = Paid invoices for current month
  const receivedRent = currentMonthInvoices
    .filter(inv => inv.status === 'paid')
    .reduce((sum, inv) => sum + (parseFloat(inv.amount) || 0), 0);
  
  // 4. Not Yet Received = Pending/Due/Overdue invoices
  const notYetReceivedRent = currentMonthInvoices
    .filter(inv => ['pending', 'due', 'overdue'].includes(inv.status))
    .reduce((sum, inv) => sum + (parseFloat(inv.amount) || 0), 0);
  
  // 5. Collection rate
  const collectionRate = totalReceivableRent > 0 ? (receivedRent / totalReceivableRent * 100) : 0;
  
  // 6. Invoiced Rent = Total amount that has been invoiced (received + not yet received)
  const invoicedRent = receivedRent + notYetReceivedRent;
  
  return {
    totalReceivableRent,
    receivedRent,
    notYetReceivedRent,
    collectionRate: Math.round(collectionRate * 100) / 100,
    invoicedRent
  };
};

/**
 * Calculate total costs (exclude operating costs)
 * @param {Array} properties - Array of property documents
 * @returns {Object} Cost calculations
 */
export const calculateTotalCosts = (properties) => {
  // Only property costs (rent/mortgage we pay)
  const propertyCosts = properties.reduce((sum, property) => 
    sum + (parseFloat(property.cost) || 0), 0);
  
  // Remove: operatingCosts = totalBookRevenue * 0.1;
  
  return {
    propertyCosts,
    totalCosts: propertyCosts // Only property costs now
  };
};

/**
 * Calculate rent from active employees (exclude resigned)
 * @param {Array} employees - Array of employee documents
 * @returns {number} Total rent from active employees
 */
export const calculateRentFromActiveEmployees = (employees) => {
  return employees
    .filter(emp => emp.status === 'housed' && emp.status !== 'resigned')
    .reduce((sum, emp) => sum + (parseFloat(emp.rent) || parseFloat(emp.monthlyRent) || 0), 0);
};

/**
 * Get financial overview for dashboard
 * @returns {Promise<Object>} Financial overview data
 */
export const getFinancialOverview = async () => {
  try {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    
    // Fetch all required data
    const [employeesSnapshot, propertiesSnapshot, invoicesSnapshot] = await Promise.all([
      getDocs(collection(db, 'employees')),
      getDocs(collection(db, 'properties')),
      getDocs(collection(db, 'invoices'))
    ]);

    const employees = employeesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const properties = propertiesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const invoices = invoicesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Current month metrics
    const rentMetrics = getCurrentMonthRentMetrics(employees, invoices, currentYear, currentMonth);
    
    // Cost calculations
    const costMetrics = calculateTotalCosts(properties);
    
    // Employee statistics
    const activeEmployees = employees.filter(emp => emp.status !== 'resigned');
    const housedEmployees = employees.filter(emp => emp.status === 'housed' && emp.status !== 'resigned');
    const resignedEmployees = employees.filter(emp => emp.status === 'resigned');
    
    // Property occupancy
    const totalBeds = properties.reduce((sum, prop) => sum + (parseInt(prop.beds) || 0), 0);
    const occupiedBeds = housedEmployees.length;
    const occupancyRate = totalBeds > 0 ? (occupiedBeds / totalBeds * 100) : 0;
    
    // Net income calculation (received rent - property costs)
    const netIncome = rentMetrics.receivedRent - costMetrics.propertyCosts;
    
    return {
      // Rent metrics
      totalReceivableRent: rentMetrics.totalReceivableRent,
      receivedRent: rentMetrics.receivedRent,
      notYetReceivedRent: rentMetrics.notYetReceivedRent,
      collectionRate: rentMetrics.collectionRate,
      
      // Cost metrics
      propertyCosts: costMetrics.propertyCosts,
      totalCosts: costMetrics.totalCosts,
      
      // Income metrics
      netIncome,
      
      // Employee metrics
      totalEmployees: employees.length,
      activeEmployees: activeEmployees.length,
      housedEmployees: housedEmployees.length,
      resignedEmployees: resignedEmployees.length,
      
      // Property metrics
      totalProperties: properties.length,
      totalBeds,
      occupiedBeds,
      occupancyRate: Math.round(occupancyRate * 100) / 100,
      
      // Date information
      calculationDate: today,
      calculationPeriod: `${currentYear}年${currentMonth + 1}月`
    };
    
  } catch (error) {
    console.error('❌ Error calculating financial overview:', error);
    throw error;
  }
};

/**
 * Get invoice statistics for current month
 * @returns {Promise<Object>} Invoice statistics
 */
export const getCurrentMonthInvoiceStats = async () => {
  try {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    
    const invoicesSnapshot = await getDocs(collection(db, 'invoices'));
    const invoices = invoicesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // Filter current month invoices
    const currentMonthInvoices = invoices.filter(inv => {
      const issueDate = inv.issueDate?.toDate ? inv.issueDate.toDate() : new Date(inv.issueDate);
      return issueDate.getFullYear() === currentYear && issueDate.getMonth() === currentMonth;
    });
    
    // Group by status
    const statusCounts = {
      paid: 0,
      pending: 0,
      due: 0,
      overdue: 0,
      cancelled: 0
    };
    
    const statusAmounts = {
      paid: 0,
      pending: 0,
      due: 0,
      overdue: 0,
      cancelled: 0
    };
    
    currentMonthInvoices.forEach(inv => {
      const status = inv.status || 'pending';
      const amount = parseFloat(inv.amount) || 0;
      
      if (statusCounts.hasOwnProperty(status)) {
        statusCounts[status]++;
        statusAmounts[status] += amount;
      }
    });
    
    return {
      totalInvoices: currentMonthInvoices.length,
      totalAmount: currentMonthInvoices.reduce((sum, inv) => sum + (parseFloat(inv.amount) || 0), 0),
      statusCounts,
      statusAmounts,
      period: `${currentYear}年${currentMonth + 1}月`
    };
    
  } catch (error) {
    console.error('❌ Error calculating invoice statistics:', error);
    throw error;
  }
};

/**
 * Format currency for display
 * @param {number} amount - Amount to format
 * @returns {string} Formatted currency string
 */
export const formatCurrency = (amount) => {
  return new Intl.NumberFormat('zh-TW', { 
    style: 'currency', 
    currency: 'TWD',
    minimumFractionDigits: 0 
  }).format(amount || 0);
};

/**
 * Format percentage for display
 * @param {number} percentage - Percentage to format
 * @returns {string} Formatted percentage string
 */
export const formatPercentage = (percentage) => {
  return `${Math.round((percentage || 0) * 100) / 100}%`;
};

/**
 * Get year-to-date financial summary
 * @returns {Promise<Object>} YTD financial summary
 */
export const getYearToDateSummary = async () => {
  try {
    const today = new Date();
    const currentYear = today.getFullYear();
    
    const invoicesSnapshot = await getDocs(collection(db, 'invoices'));
    const invoices = invoicesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // Filter YTD invoices
    const ytdInvoices = invoices.filter(inv => {
      const issueDate = inv.issueDate?.toDate ? inv.issueDate.toDate() : new Date(inv.issueDate);
      return issueDate.getFullYear() === currentYear;
    });
    
    // Calculate monthly totals
    const monthlyTotals = {};
    for (let month = 0; month < 12; month++) {
      monthlyTotals[month] = {
        receivable: 0,
        received: 0,
        pending: 0
      };
    }
    
    ytdInvoices.forEach(inv => {
      const issueDate = inv.issueDate?.toDate ? inv.issueDate.toDate() : new Date(inv.issueDate);
      const month = issueDate.getMonth();
      const amount = parseFloat(inv.amount) || 0;
      
      monthlyTotals[month].receivable += amount;
      
      if (inv.status === 'paid') {
        monthlyTotals[month].received += amount;
      } else if (['pending', 'due', 'overdue'].includes(inv.status)) {
        monthlyTotals[month].pending += amount;
      }
    });
    
    return {
      year: currentYear,
      monthlyTotals,
      ytdTotal: {
        receivable: Object.values(monthlyTotals).reduce((sum, month) => sum + month.receivable, 0),
        received: Object.values(monthlyTotals).reduce((sum, month) => sum + month.received, 0),
        pending: Object.values(monthlyTotals).reduce((sum, month) => sum + month.pending, 0)
      }
    };
    
  } catch (error) {
    console.error('❌ Error calculating YTD summary:', error);
    throw error;
  }
}; 