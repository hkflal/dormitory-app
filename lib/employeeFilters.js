import { EMPLOYEE_STATUSES, isActiveStatus } from './employeeStatusManager';

/**
 * Get all active employees (exclude resigned)
 * @param {Array} employees - Array of employee documents
 * @returns {Array} Array of active employees
 */
export const getActiveEmployees = (employees) => {
  return employees.filter(emp => isActiveStatus(emp.status));
};

/**
 * Get resigned employees only
 * @param {Array} employees - Array of employee documents
 * @returns {Array} Array of resigned employees
 */
export const getResignedEmployees = (employees) => {
  return employees.filter(emp => emp.status === EMPLOYEE_STATUSES.RESIGNED);
};

/**
 * Get housed employees (exclude resigned)
 * @param {Array} employees - Array of employee documents
 * @returns {Array} Array of housed employees
 */
export const getHousedEmployees = (employees) => {
  return employees.filter(emp => 
    emp.status === EMPLOYEE_STATUSES.HOUSED && emp.status !== EMPLOYEE_STATUSES.RESIGNED
  );
};

/**
 * Get employees by multiple statuses
 * @param {Array} employees - Array of employee documents
 * @param {Array} statuses - Array of status strings to filter by
 * @returns {Array} Array of filtered employees
 */
export const getEmployeesByStatuses = (employees, statuses) => {
  return employees.filter(emp => statuses.includes(emp.status));
};

/**
 * Filter employees by search term
 * @param {Array} employees - Array of employee documents
 * @param {string} searchTerm - Search term to match against
 * @returns {Array} Array of matching employees
 */
export const filterEmployeesBySearch = (employees, searchTerm) => {
  if (!searchTerm || searchTerm.trim() === '') {
    return employees;
  }
  
  const term = searchTerm.toLowerCase().trim();
  
  return employees.filter(emp => {
    // Search in multiple fields
    const searchableFields = [
      emp.name,
      emp.firstName,
      emp.lastName,
      emp.email,
      emp.phone,
      emp.company,
      emp.department,
      emp.assigned_property_name,
      emp.assigned_property_id
    ];
    
    return searchableFields.some(field => 
      field && field.toString().toLowerCase().includes(term)
    );
  });
};

/**
 * Filter employees by company
 * @param {Array} employees - Array of employee documents
 * @param {string} company - Company to filter by
 * @returns {Array} Array of employees from specified company
 */
export const filterEmployeesByCompany = (employees, company) => {
  if (!company || company === 'all') {
    return employees;
  }
  
  return employees.filter(emp => emp.company === company);
};

/**
 * Filter employees by property
 * @param {Array} employees - Array of employee documents
 * @param {string} propertyId - Property ID to filter by
 * @returns {Array} Array of employees assigned to specified property
 */
export const filterEmployeesByProperty = (employees, propertyId) => {
  if (!propertyId || propertyId === 'all') {
    return employees;
  }
  
  return employees.filter(emp => emp.assigned_property_id === propertyId);
};

/**
 * Advanced employee filtering with multiple criteria
 * @param {Array} employees - Array of employee documents
 * @param {Object} filters - Filter criteria object
 * @param {string} filters.search - Search term
 * @param {Array} filters.statuses - Array of statuses to include
 * @param {string} filters.company - Company filter
 * @param {string} filters.property - Property ID filter
 * @param {boolean} filters.showResigned - Whether to include resigned employees
 * @returns {Array} Array of filtered employees
 */
export const filterEmployees = (employees, filters = {}) => {
  let filteredEmployees = [...employees];
  
  // Apply resigned filter first
  if (!filters.showResigned) {
    filteredEmployees = getActiveEmployees(filteredEmployees);
  }
  
  // Apply status filter
  if (filters.statuses && filters.statuses.length > 0) {
    filteredEmployees = getEmployeesByStatuses(filteredEmployees, filters.statuses);
  }
  
  // Apply search filter
  if (filters.search) {
    filteredEmployees = filterEmployeesBySearch(filteredEmployees, filters.search);
  }
  
  // Apply company filter
  if (filters.company) {
    filteredEmployees = filterEmployeesByCompany(filteredEmployees, filters.company);
  }
  
  // Apply property filter
  if (filters.property) {
    filteredEmployees = filterEmployeesByProperty(filteredEmployees, filters.property);
  }
  
  return filteredEmployees;
};

/**
 * Sort employees by specified criteria
 * @param {Array} employees - Array of employee documents
 * @param {string} sortBy - Field to sort by
 * @param {string} sortOrder - 'asc' or 'desc'
 * @returns {Array} Array of sorted employees
 */
export const sortEmployees = (employees, sortBy = 'name', sortOrder = 'asc') => {
  const sorted = [...employees].sort((a, b) => {
    let aValue = a[sortBy];
    let bValue = b[sortBy];
    
    // Handle different data types
    if (sortBy === 'name' && (!aValue || aValue === '')) {
      aValue = a.firstName || '';
    }
    if (sortBy === 'name' && (!bValue || bValue === '')) {
      bValue = b.firstName || '';
    }
    
    // Handle dates
    if (sortBy.includes('date') || sortBy.includes('time')) {
      aValue = aValue ? (aValue.toDate ? aValue.toDate() : new Date(aValue)) : new Date(0);
      bValue = bValue ? (bValue.toDate ? bValue.toDate() : new Date(bValue)) : new Date(0);
    }
    
    // Handle numbers
    if (sortBy === 'rent' || sortBy === 'monthlyRent') {
      aValue = parseFloat(aValue) || 0;
      bValue = parseFloat(bValue) || 0;
    }
    
    // Handle strings
    if (typeof aValue === 'string' && typeof bValue === 'string') {
      aValue = aValue.toLowerCase();
      bValue = bValue.toLowerCase();
    }
    
    // Compare values
    if (aValue < bValue) {
      return sortOrder === 'asc' ? -1 : 1;
    }
    if (aValue > bValue) {
      return sortOrder === 'asc' ? 1 : -1;
    }
    return 0;
  });
  
  return sorted;
};

/**
 * Get unique companies from employees list
 * @param {Array} employees - Array of employee documents
 * @returns {Array} Array of unique company names
 */
export const getUniqueCompanies = (employees) => {
  const companies = employees
    .map(emp => emp.company)
    .filter(company => company && company.trim() !== '')
    .filter((company, index, arr) => arr.indexOf(company) === index);
  
  return companies.sort();
};

/**
 * Get unique properties from employees list
 * @param {Array} employees - Array of employee documents
 * @returns {Array} Array of unique property objects {id, name}
 */
export const getUniqueProperties = (employees) => {
  const propertyMap = new Map();
  
  employees.forEach(emp => {
    if (emp.assigned_property_id && emp.assigned_property_name) {
      propertyMap.set(emp.assigned_property_id, emp.assigned_property_name);
    }
  });
  
  return Array.from(propertyMap.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
};

/**
 * Get employee statistics for filtered results
 * @param {Array} filteredEmployees - Array of filtered employee documents
 * @param {Array} allEmployees - Array of all employee documents (for comparison)
 * @returns {Object} Statistics object
 */
export const getFilterStatistics = (filteredEmployees, allEmployees) => {
  const statusCounts = {};
  Object.values(EMPLOYEE_STATUSES).forEach(status => {
    statusCounts[status] = 0;
  });
  
  filteredEmployees.forEach(emp => {
    const status = emp.status || EMPLOYEE_STATUSES.PENDING_ASSIGNMENT;
    if (statusCounts.hasOwnProperty(status)) {
      statusCounts[status]++;
    }
  });
  
  const totalRent = filteredEmployees
    .filter(emp => emp.status === EMPLOYEE_STATUSES.HOUSED && emp.status !== EMPLOYEE_STATUSES.RESIGNED)
    .reduce((sum, emp) => sum + (parseFloat(emp.rent) || parseFloat(emp.monthlyRent) || 0), 0);
  
  return {
    totalFiltered: filteredEmployees.length,
    totalAll: allEmployees.length,
    statusCounts,
    totalRentFromFiltered: totalRent,
    filterRatio: allEmployees.length > 0 ? 
      Math.round((filteredEmployees.length / allEmployees.length) * 100) : 0
  };
};

/**
 * Export options for filtered employees
 * @param {Array} employees - Array of employee documents to export
 * @param {Array} fields - Array of field names to include in export
 * @returns {Array} Array of objects suitable for CSV export
 */
export const prepareEmployeesForExport = (employees, fields = null) => {
  const defaultFields = [
    'name',
    'firstName',
    'email',
    'phone',
    'company',
    'status',
    'assigned_property_name',
    'rent',
    'departure_date',
    'departure_reason'
  ];
  
  const exportFields = fields || defaultFields;
  
  return employees.map(emp => {
    const exportData = {};
    
    exportFields.forEach(field => {
      let value = emp[field];
      
      // Format special fields
      if (field === 'status') {
        value = emp.status || EMPLOYEE_STATUSES.PENDING_ASSIGNMENT;
      }
      
      if (field === 'name' && (!value || value === '')) {
        value = emp.firstName || '';
      }
      
      if (field.includes('date') && value) {
        value = value.toDate ? 
          value.toDate().toLocaleDateString('zh-TW') : 
          new Date(value).toLocaleDateString('zh-TW');
      }
      
      if (field === 'rent' || field === 'monthlyRent') {
        value = parseFloat(value) || 0;
      }
      
      exportData[field] = value || '';
    });
    
    return exportData;
  });
};

/**
 * Paginate employees array
 * @param {Array} employees - Array of employee documents
 * @param {number} page - Page number (1-based)
 * @param {number} pageSize - Number of items per page
 * @returns {Object} Pagination result with data and metadata
 */
export const paginateEmployees = (employees, page = 1, pageSize = 20) => {
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedData = employees.slice(startIndex, endIndex);
  
  return {
    data: paginatedData,
    pagination: {
      currentPage: page,
      pageSize,
      totalItems: employees.length,
      totalPages: Math.ceil(employees.length / pageSize),
      hasNext: endIndex < employees.length,
      hasPrevious: page > 1,
      startIndex: startIndex + 1,
      endIndex: Math.min(endIndex, employees.length)
    }
  };
}; 