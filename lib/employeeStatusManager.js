import { db } from './firebase';
import { collection, doc, getDocs, updateDoc, writeBatch } from 'firebase/firestore';

/**
 * Employee Status Constants
 */
export const EMPLOYEE_STATUSES = {
  HOUSED: 'housed',
  PENDING: 'pending', 
  PENDING_ASSIGNMENT: 'pending_assignment',
  TERMINATED: 'terminated',
  PENDING_RESIGN: 'pending_resign',
  RESIGNED: 'resigned'
};

/**
 * Status display configurations
 */
export const STATUS_CONFIG = {
  [EMPLOYEE_STATUSES.HOUSED]: {
    label: '已入住',
    color: 'green',
    bgColor: 'bg-green-100',
    textColor: 'text-green-800',
    icon: '🏠'
  },
  [EMPLOYEE_STATUSES.PENDING]: {
    label: '未入住',
    color: 'yellow',
    bgColor: 'bg-yellow-100',
    textColor: 'text-yellow-800',
    icon: '⏳'
  },
  [EMPLOYEE_STATUSES.PENDING_ASSIGNMENT]: {
    label: '待分配',
    color: 'blue',
    bgColor: 'bg-blue-100',
    textColor: 'text-blue-800',
    icon: '📋'
  },
  [EMPLOYEE_STATUSES.TERMINATED]: {
    label: '已終止',
    color: 'red',
    bgColor: 'bg-red-100',
    textColor: 'text-red-800',
    icon: '❌'
  },
  [EMPLOYEE_STATUSES.PENDING_RESIGN]: {
    label: '即將離職',
    color: 'orange',
    bgColor: 'bg-orange-100',
    textColor: 'text-orange-800',
    icon: '📅'
  },
  [EMPLOYEE_STATUSES.RESIGNED]: {
    label: '已離職',
    color: 'gray',
    bgColor: 'bg-gray-100',
    textColor: 'text-gray-800',
    icon: '👋'
  }
};

/**
 * Get status badge configuration
 * @param {string} status - Employee status
 * @returns {Object} Status configuration object
 */
export const getStatusBadge = (status) => {
  return STATUS_CONFIG[status] || STATUS_CONFIG[EMPLOYEE_STATUSES.PENDING_ASSIGNMENT];
};

/**
 * Check if employee status is active (not resigned)
 * @param {string} status - Employee status
 * @returns {boolean} True if status is active
 */
export const isActiveStatus = (status) => {
  return status !== EMPLOYEE_STATUSES.RESIGNED;
};

/**
 * Check if employee is housed (and not resigned)
 * @param {Object} employee - Employee document
 * @returns {boolean} True if employee is housed and active
 */
export const isHousedAndActive = (employee) => {
  return employee.status === EMPLOYEE_STATUSES.HOUSED && employee.status !== EMPLOYEE_STATUSES.RESIGNED;
};

/**
 * Validate departure date for pending_resign status
 * @param {Date} departureDate - Departure date to validate
 * @param {string} status - Employee status
 * @returns {Object} Validation result
 */
export const validateDepartureDate = (departureDate, status) => {
  const issues = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  if (status === EMPLOYEE_STATUSES.PENDING_RESIGN) {
    if (!departureDate) {
      issues.push('即將離職狀態需要設定離職日期');
    } else {
      const depDate = new Date(departureDate);
      depDate.setHours(0, 0, 0, 0);
      
      if (depDate <= today) {
        issues.push('離職日期必須是未來日期');
      }
    }
  }
  
  if (status === EMPLOYEE_STATUSES.RESIGNED) {
    if (departureDate) {
      const depDate = new Date(departureDate);
      depDate.setHours(0, 0, 0, 0);
      
      if (depDate > today) {
        issues.push('已離職員工的離職日期不應該是未來日期');
      }
    }
  }
  
  return {
    isValid: issues.length === 0,
    issues
  };
};

/**
 * Update employee status with validation
 * @param {string} employeeId - Employee document ID
 * @param {string} newStatus - New status to set
 * @param {Object} additionalData - Additional data (departure_date, departure_reason, etc.)
 * @returns {Promise<Object>} Update result
 */
export const updateEmployeeStatus = async (employeeId, newStatus, additionalData = {}) => {
  try {
    // Validation for departure date
    if (additionalData.departure_date) {
      const validation = validateDepartureDate(additionalData.departure_date, newStatus);
      if (!validation.isValid) {
        return {
          success: false,
          error: validation.issues.join(', ')
        };
      }
    }
    
    const updateData = {
      status: newStatus,
      updatedAt: new Date()
    };
    
    // Add additional fields based on status
    if (newStatus === EMPLOYEE_STATUSES.PENDING_RESIGN || newStatus === EMPLOYEE_STATUSES.RESIGNED) {
      if (additionalData.departure_date) {
        updateData.departure_date = additionalData.departure_date;
      }
      if (additionalData.departure_reason) {
        updateData.departure_reason = additionalData.departure_reason;
      }
    }
    
    // Set actual departure date for resigned status
    if (newStatus === EMPLOYEE_STATUSES.RESIGNED && !additionalData.actual_departure_date) {
      updateData.actual_departure_date = additionalData.departure_date || new Date();
    }
    
    const employeeRef = doc(db, 'employees', employeeId);
    await updateDoc(employeeRef, updateData);
    
    console.log(`✅ Employee ${employeeId} status updated to ${newStatus}`);
    
    return {
      success: true,
      message: `員工狀態已更新為 ${getStatusBadge(newStatus).label}`
    };
    
  } catch (error) {
    console.error(`❌ Error updating employee status:`, error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Check and update employee statuses (pending_resign → resigned)
 * Run this function daily to check for status transitions
 * @returns {Promise<Object>} Update results
 */
export const checkAndUpdateEmployeeStatuses = async () => {
  try {
    console.log('🔄 Checking employee status transitions...');
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const employeesSnapshot = await getDocs(collection(db, 'employees'));
    const employees = employeesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    const batch = writeBatch(db);
    let updatedCount = 0;
    const statusChanges = [];
    
    employees.forEach(employee => {
      // Check if pending_resign should become resigned
      if (employee.status === EMPLOYEE_STATUSES.PENDING_RESIGN && employee.departure_date) {
        const departureDate = employee.departure_date.toDate ? 
          employee.departure_date.toDate() : new Date(employee.departure_date);
        departureDate.setHours(0, 0, 0, 0);
        
        if (departureDate <= today) {
          const employeeRef = doc(db, 'employees', employee.id);
          batch.update(employeeRef, {
            status: EMPLOYEE_STATUSES.RESIGNED,
            actual_departure_date: employee.actual_departure_date || departureDate,
            updatedAt: new Date()
          });
          
          statusChanges.push({
            employeeId: employee.id,
            employeeName: employee.name || employee.firstName || 'Unknown',
            oldStatus: EMPLOYEE_STATUSES.PENDING_RESIGN,
            newStatus: EMPLOYEE_STATUSES.RESIGNED,
            departureDate: departureDate
          });
          
          updatedCount++;
        }
      }
    });
    
    if (updatedCount > 0) {
      await batch.commit();
      console.log(`✅ Updated ${updatedCount} employee statuses`);
      
      // Log all changes
      statusChanges.forEach(change => {
        console.log(`👤 ${change.employeeName}: ${getStatusBadge(change.oldStatus).label} → ${getStatusBadge(change.newStatus).label}`);
      });
    } else {
      console.log('ℹ️ No employee status updates needed');
    }
    
    return {
      success: true,
      updatedCount,
      statusChanges,
      message: `檢查完成，更新了 ${updatedCount} 個員工狀態`
    };
    
  } catch (error) {
    console.error('❌ Error checking employee statuses:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Get employees by status
 * @param {string} status - Status to filter by
 * @returns {Promise<Array>} Array of employee documents
 */
export const getEmployeesByStatus = async (status) => {
  try {
    const employeesSnapshot = await getDocs(collection(db, 'employees'));
    const employees = employeesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    return employees.filter(emp => emp.status === status);
  } catch (error) {
    console.error('❌ Error fetching employees by status:', error);
    throw error;
  }
};

/**
 * Get status transition statistics
 * @returns {Promise<Object>} Status statistics
 */
export const getStatusStatistics = async () => {
  try {
    const employeesSnapshot = await getDocs(collection(db, 'employees'));
    const employees = employeesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    const statusCounts = {};
    Object.values(EMPLOYEE_STATUSES).forEach(status => {
      statusCounts[status] = 0;
    });
    
    employees.forEach(emp => {
      const status = emp.status || EMPLOYEE_STATUSES.PENDING_ASSIGNMENT;
      if (statusCounts.hasOwnProperty(status)) {
        statusCounts[status]++;
      }
    });
    
    // Calculate active vs inactive
    const activeCount = employees.filter(emp => isActiveStatus(emp.status)).length;
    const resignedCount = statusCounts[EMPLOYEE_STATUSES.RESIGNED];
    
    // Pending resignation count
    const pendingResignCount = statusCounts[EMPLOYEE_STATUSES.PENDING_RESIGN];
    
    return {
      totalEmployees: employees.length,
      activeEmployees: activeCount,
      resignedEmployees: resignedCount,
      pendingResignEmployees: pendingResignCount,
      statusBreakdown: statusCounts,
      statusPercentages: Object.keys(statusCounts).reduce((acc, status) => {
        acc[status] = employees.length > 0 ? 
          Math.round((statusCounts[status] / employees.length) * 100) : 0;
        return acc;
      }, {})
    };
    
  } catch (error) {
    console.error('❌ Error calculating status statistics:', error);
    throw error;
  }
};

/**
 * Get employees approaching departure (pending_resign within specified days)
 * @param {number} daysAhead - Number of days to look ahead (default: 7)
 * @returns {Promise<Array>} Array of employees approaching departure
 */
export const getEmployeesApproachingDeparture = async (daysAhead = 7) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const futureDate = new Date(today);
    futureDate.setDate(today.getDate() + daysAhead);
    
    const employeesSnapshot = await getDocs(collection(db, 'employees'));
    const employees = employeesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    return employees.filter(emp => {
      if (emp.status !== EMPLOYEE_STATUSES.PENDING_RESIGN || !emp.departure_date) {
        return false;
      }
      
      const departureDate = emp.departure_date.toDate ? 
        emp.departure_date.toDate() : new Date(emp.departure_date);
      departureDate.setHours(0, 0, 0, 0);
      
      return departureDate >= today && departureDate <= futureDate;
    }).map(emp => {
      const departureDate = emp.departure_date.toDate ? 
        emp.departure_date.toDate() : new Date(emp.departure_date);
      
      const daysUntilDeparture = Math.ceil((departureDate - today) / (1000 * 60 * 60 * 24));
      
      return {
        ...emp,
        daysUntilDeparture,
        formattedDepartureDate: departureDate.toLocaleDateString('zh-TW')
      };
    }).sort((a, b) => a.daysUntilDeparture - b.daysUntilDeparture);
    
  } catch (error) {
    console.error('❌ Error fetching employees approaching departure:', error);
    throw error;
  }
};

/**
 * Bulk update employee statuses
 * @param {Array} updates - Array of {employeeId, status, additionalData}
 * @returns {Promise<Object>} Bulk update results
 */
export const bulkUpdateEmployeeStatuses = async (updates) => {
  try {
    const batch = writeBatch(db);
    const results = [];
    
    for (const update of updates) {
      const { employeeId, status, additionalData = {} } = update;
      
      // Validate each update
      if (additionalData.departure_date) {
        const validation = validateDepartureDate(additionalData.departure_date, status);
        if (!validation.isValid) {
          results.push({
            employeeId,
            success: false,
            error: validation.issues.join(', ')
          });
          continue;
        }
      }
      
      const updateData = {
        status,
        updatedAt: new Date(),
        ...additionalData
      };
      
      const employeeRef = doc(db, 'employees', employeeId);
      batch.update(employeeRef, updateData);
      
      results.push({
        employeeId,
        success: true,
        newStatus: status
      });
    }
    
    if (results.some(r => r.success)) {
      await batch.commit();
      console.log(`✅ Bulk updated ${results.filter(r => r.success).length} employee statuses`);
    }
    
    return {
      totalUpdates: updates.length,
      successfulUpdates: results.filter(r => r.success).length,
      failedUpdates: results.filter(r => !r.success).length,
      results
    };
    
  } catch (error) {
    console.error('❌ Error in bulk update employee statuses:', error);
    throw error;
  }
}; 