import { db } from './firebase';
import { collection, doc, getDocs, setDoc, getDoc, query, where, orderBy, limit } from 'firebase/firestore';

/**
 * Calculate monthly financial snapshot data
 * @param {number} year - Target year
 * @param {number} month - Target month (0-based)
 * @returns {Promise<Object>} Calculated snapshot data
 */
export const calculateMonthlySnapshot = async (year, month) => {
  try {
    console.log(`📊 Calculating monthly snapshot for ${year}-${month + 1}`);
    
    // Fetch all required data
    const [employeesSnapshot, propertiesSnapshot, invoicesSnapshot] = await Promise.all([
      getDocs(collection(db, 'employees')),
      getDocs(collection(db, 'properties')),
      getDocs(collection(db, 'invoices'))
    ]);

    const employees = employeesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const properties = propertiesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const invoices = invoicesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // 1. Total Rent Cost = Sum of all property costs
    const total_rent_cost = properties.reduce((sum, prop) => 
      sum + (parseFloat(prop.cost) || 0), 0);
    
    // 2. Total Receivable Rent = Sum of rent from housed employees (exclude resigned)
    const total_receivable_rent = employees
      .filter(emp => emp.status === 'housed' && emp.status !== 'resigned')
      .reduce((sum, emp) => sum + (parseFloat(emp.rent) || parseFloat(emp.monthlyRent) || 0), 0);
    
    // 3. Actual Received Rent = Sum of paid invoices covering the target month
    const actual_received_rent = invoices
      .filter(inv => {
        // Only count paid invoices
        if (inv.status !== 'paid') return false;
        
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
      })
      .reduce((sum, inv) => sum + (parseFloat(inv.amount) || 0), 0);
    
    // 4. Number of Employees = Count of housed employees (exclude resigned)
    const number_of_employees = employees
      .filter(emp => emp.status === 'housed' && emp.status !== 'resigned').length;
    
    // 5. Collection rate calculation
    const collection_rate = total_receivable_rent > 0 ? 
      (actual_received_rent / total_receivable_rent * 100) : 0;

    return {
      total_rent_cost,
      total_receivable_rent,
      actual_received_rent,
      number_of_employees,
      properties_count: properties.length,
      collection_rate: Math.round(collection_rate * 100) / 100
    };
  } catch (error) {
    console.error('❌ Error calculating monthly snapshot:', error);
    throw error;
  }
};

/**
 * Create a monthly snapshot document
 * @param {number} year - Target year
 * @param {number} month - Target month (0-based)
 * @param {boolean} isManual - Whether this is a manual creation
 * @param {string} notes - Optional notes
 * @returns {Promise<Object>} Created snapshot document
 */
export const createMonthlySnapshot = async (year, month, isManual = false, notes = '') => {
  try {
    const snapshotId = `${year}-${String(month + 1).padStart(2, '0')}-31`;
    
    // Check if snapshot already exists
    const existingDoc = await getDoc(doc(db, 'monthly_financial_snapshots', snapshotId));
    if (existingDoc.exists() && !isManual) {
      console.log(`⚠️ Snapshot for ${snapshotId} already exists`);
      return existingDoc.data();
    }

    // Calculate snapshot data
    const snapshotData = await calculateMonthlySnapshot(year, month);
    
    // Create snapshot document
    const snapshot = {
      id: snapshotId,
      year,
      month,
      snapshot_date: new Date(),
      data: {
        ...snapshotData,
        notes: notes || `${new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: 'long' })} 月度快照`
      },
      created_at: new Date(),
      calculation_method: isManual ? 'manual' : 'auto'
    };

    // Save to Firestore
    await setDoc(doc(db, 'monthly_financial_snapshots', snapshotId), snapshot);
    
    console.log(`✅ Monthly snapshot created for ${snapshotId}`);
    return snapshot;
  } catch (error) {
    console.error('❌ Error creating monthly snapshot:', error);
    throw error;
  }
};

/**
 * Get all monthly snapshots, ordered by date descending
 * @param {number} limitCount - Maximum number of snapshots to return
 * @returns {Promise<Array>} Array of snapshot documents
 */
export const getMonthlySnapshots = async (limitCount = 12) => {
  try {
    const snapshotsQuery = query(
      collection(db, 'monthly_financial_snapshots'),
      orderBy('year', 'desc'),
      orderBy('month', 'desc'),
      limit(limitCount)
    );
    
    const snapshot = await getDocs(snapshotsQuery);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('❌ Error fetching monthly snapshots:', error);
    throw error;
  }
};

/**
 * Get a specific monthly snapshot
 * @param {number} year - Target year
 * @param {number} month - Target month (0-based)
 * @returns {Promise<Object|null>} Snapshot document or null if not found
 */
export const getMonthlySnapshot = async (year, month) => {
  try {
    const snapshotId = `${year}-${String(month + 1).padStart(2, '0')}-31`;
    const snapshotDoc = await getDoc(doc(db, 'monthly_financial_snapshots', snapshotId));
    
    return snapshotDoc.exists() ? { id: snapshotDoc.id, ...snapshotDoc.data() } : null;
  } catch (error) {
    console.error('❌ Error fetching monthly snapshot:', error);
    throw error;
  }
};

/**
 * Validate snapshot data integrity
 * @param {Object} snapshotData - Snapshot data to validate
 * @returns {Object} Validation result with issues array
 */
export const validateSnapshotData = (snapshotData) => {
  const issues = [];
  
  // Check for negative values
  if (snapshotData.total_rent_cost < 0) {
    issues.push('總租金成本不能為負數');
  }
  
  if (snapshotData.total_receivable_rent < 0) {
    issues.push('應收租金總額不能為負數');
  }
  
  if (snapshotData.actual_received_rent < 0) {
    issues.push('實際收到租金不能為負數');
  }
  
  // Check logical consistency
  if (snapshotData.actual_received_rent > snapshotData.total_receivable_rent * 1.1) {
    issues.push('實際收到租金明顯超過應收租金，請檢查資料');
  }
  
  if (snapshotData.number_of_employees === 0 && snapshotData.total_receivable_rent > 0) {
    issues.push('沒有員工但有應收租金，請檢查員工狀態');
  }
  
  return {
    isValid: issues.length === 0,
    issues
  };
};

/**
 * Format snapshot data for display
 * @param {Object} snapshot - Snapshot document
 * @returns {Object} Formatted snapshot data
 */
export const formatSnapshotForDisplay = (snapshot) => {
  const data = snapshot.data;
  const month = snapshot.month + 1; // Convert from 0-based to 1-based
  
  return {
    ...snapshot,
    formatted: {
      title: `${snapshot.year}年${month}月`,
      total_rent_cost: new Intl.NumberFormat('zh-TW', { 
        style: 'currency', 
        currency: 'TWD',
        minimumFractionDigits: 0 
      }).format(data.total_rent_cost),
      total_receivable_rent: new Intl.NumberFormat('zh-TW', { 
        style: 'currency', 
        currency: 'TWD',
        minimumFractionDigits: 0 
      }).format(data.total_receivable_rent),
      actual_received_rent: new Intl.NumberFormat('zh-TW', { 
        style: 'currency', 
        currency: 'TWD',
        minimumFractionDigits: 0 
      }).format(data.actual_received_rent),
      collection_rate: `${data.collection_rate}%`,
      number_of_employees: `${data.number_of_employees} 人`,
      properties_count: `${data.properties_count} 間`
    }
  };
};

/**
 * Generate month-over-month comparison data
 * @param {Array} snapshots - Array of snapshot documents (sorted by date desc)
 * @returns {Array} Array of comparison data
 */
export const generateSnapshotComparisons = (snapshots) => {
  if (snapshots.length < 2) return [];
  
  return snapshots.slice(0, -1).map((current, index) => {
    const previous = snapshots[index + 1];
    const currentData = current.data;
    const previousData = previous.data;
    
    const calculateChange = (current, previous) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous * 100);
    };
    
    return {
      current_period: `${current.year}年${current.month + 1}月`,
      previous_period: `${previous.year}年${previous.month + 1}月`,
      changes: {
        total_receivable_rent: calculateChange(currentData.total_receivable_rent, previousData.total_receivable_rent),
        actual_received_rent: calculateChange(currentData.actual_received_rent, previousData.actual_received_rent),
        collection_rate: currentData.collection_rate - previousData.collection_rate,
        number_of_employees: currentData.number_of_employees - previousData.number_of_employees
      }
    };
  });
}; 