import { db } from './firebase';
import { collection, getDocs } from 'firebase/firestore';
import { getCurrentMonthFromPaymentDetails } from './paymentDetailsCalculation';

/**
 * Calculate projected income including housed employees and prorated upcoming employees
 * @param {Array} employees - Array of employee documents
 * @param {number} currentYear - Target year
 * @param {number} currentMonth - Target month (0-based)
 * @returns {number} Projected income total
 */
export const calculateProjectedIncome = (employees, currentYear, currentMonth) => {
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

/**
 * Calculate proportional amount for cross-month invoices (same logic as payment-details)
 * @param {Date} startDate - Invoice start date
 * @param {Date} endDate - Invoice end date  
 * @param {number} year - Target year
 * @param {number} month - Target month (0-based)
 * @param {number} totalInvoiceAmount - Full invoice amount
 * @param {number} employeeMonthlyRent - Employee's monthly rent
 * @returns {number} Proportional amount for the target month
 */
const calculateProportionalAmount = (startDate, endDate, year, month, totalInvoiceAmount, employeeMonthlyRent) => {
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);
  
  // Calculate overlap period
  const overlapStart = new Date(Math.max(startDate.getTime(), monthStart.getTime()));
  const overlapEnd = new Date(Math.min(endDate.getTime(), monthEnd.getTime()));
  
  if (overlapStart > overlapEnd) return 0;
  
  // Check if covers full month
  const coversFullMonth = (startDate <= monthStart && endDate >= monthEnd);
  if (coversFullMonth && employeeMonthlyRent > 0) {
    return employeeMonthlyRent; // Exactly monthly rent for full months
  }
  
  // Calculate proportional amount based on days
  const totalInvoiceDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
  const overlapDays = Math.ceil((overlapEnd - overlapStart) / (1000 * 60 * 60 * 24)) + 1;
  
  return (overlapDays / totalInvoiceDays) * totalInvoiceAmount;
};

/**
 * Get current month rent metrics for dashboard KPIs - now using shared payment-details service
 * @param {Array} employees - Array of employee documents (not used - kept for compatibility)
 * @param {Array} invoices - Array of invoice documents (not used - kept for compatibility)
 * @param {number} year - Target year (not used - kept for compatibility)
 * @param {number} month - Target month (not used - kept for compatibility)
 * @returns {Object} Current month rent metrics from payment-details service
 */
export const getCurrentMonthRentMetrics = (employees, invoices, year, month) => {
  console.log('🔄 Dashboard using shared payment-details service...');
  
  try {
    // Get current month data directly from payment-details calculation
    const result = getCurrentMonthFromPaymentDetails(employees, invoices);
    
    console.log('✅ Dashboard synced with payment-details service');
    return result;
    
  } catch (error) {
    console.error('❌ Error syncing dashboard with payment-details:', error);
    
    // Fallback to basic calculation if service fails
    return {
      totalReceivableRent: 0,
      invoicedRent: 0,
      receivedRent: 0,
      notYetReceivedRent: 0,
      collectionRate: 0
    };
  }
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