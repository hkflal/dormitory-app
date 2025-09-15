import { useState, useEffect, useMemo } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  CalendarDaysIcon,
  HomeIcon,
  UsersIcon,
  FunnelIcon,
  ArrowDownTrayIcon,
  EyeIcon,
  ChartBarIcon,
  ArrowLeftIcon
} from '@heroicons/react/24/outline';
import Link from 'next/link';
import TimelineTable from '../components/employee-v2/TimelineTable';

export default function EmployeeV2() {
  const [employees, setEmployees] = useState([]);
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    gender: '',
    propertyStatus: '',
    timeRange: '12'
  });

  // Handle browser extension conflicts (like crypto wallets)
  useEffect(() => {
    const handleExtensionError = (event) => {
      const isExtensionError = event.message && (
        event.message.includes('ethereum') || 
        event.message.includes('Cannot redefine property') ||
        event.filename?.includes('chrome-extension://') ||
        event.filename?.includes('moz-extension://') ||
        event.error?.stack?.includes('chrome-extension://')
      );

      if (isExtensionError) {
        event.preventDefault();
        event.stopImmediatePropagation();
        console.warn('🛡️ Extension error blocked:', event.message);
        return false;
      }
    };

    // Add multiple layers of error handling
    window.addEventListener('error', handleExtensionError, { capture: true, passive: false });
    window.addEventListener('unhandledrejection', (event) => {
      const isExtensionError = event.reason?.message?.includes('ethereum') ||
                              event.reason?.stack?.includes('chrome-extension://');
      if (isExtensionError) {
        event.preventDefault();
        console.warn('🛡️ Extension promise rejection blocked');
      }
    });

    // Protect against Object.defineProperty calls
    try {
      const originalDefineProperty = Object.defineProperty;
      Object.defineProperty = function(obj, prop, descriptor) {
        if (prop === 'ethereum' && obj === window && window.hasOwnProperty?.('ethereum')) {
          console.warn('🛡️ Ethereum redefinition blocked');
          return obj;
        }
        return originalDefineProperty.call(this, obj, prop, descriptor);
      };

      // Restore after component unmounts
      return () => {
        try {
          Object.defineProperty = originalDefineProperty;
          window.removeEventListener('error', handleExtensionError, { capture: true });
        } catch (e) {
          console.warn('Error during cleanup:', e);
        }
      };
    } catch (e) {
      console.warn('Could not override Object.defineProperty:', e);
      return () => {
        window.removeEventListener('error', handleExtensionError, { capture: true });
      };
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [employeesSnapshot, propertiesSnapshot] = await Promise.all([
        getDocs(collection(db, 'employees')),
        getDocs(collection(db, 'properties'))
      ]);

      const employeesData = employeesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const propertiesData = propertiesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Process employees to ensure proper date handling
      const processedEmployees = employeesData.map(emp => ({
        ...emp,
        arrival_at: emp.arrival_at?.toDate ? emp.arrival_at.toDate() : new Date(emp.arrival_at),
        departure_date: emp.departure_date?.toDate ? emp.departure_date.toDate() : (emp.departure_date ? new Date(emp.departure_date) : null)
      }));

      // Process properties to ensure capacity is a number
      const processedProperties = propertiesData.map(prop => ({
        ...prop,
        capacity: parseInt(prop.capacity) || (prop.rooms ? prop.rooms.reduce((sum, room) => sum + (room.capacity || 0), 0) : 0)
      }));

      setEmployees(processedEmployees);
      setProperties(processedProperties);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Calculate timeline months
  const timelineMonths = useMemo(() => {
    if (employees.length === 0) return [];

    const now = new Date();
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    // Find latest arrival date
    const latestArrival = employees.reduce((latest, emp) => {
      if (!emp.arrival_at) return latest;
      const arrivalDate = new Date(emp.arrival_at);
      return arrivalDate > latest ? arrivalDate : latest;
    }, currentMonth);

    // End exactly at the month of latest arrival (no buffer)
    const endMonth = new Date(latestArrival.getFullYear(), latestArrival.getMonth(), 1);
    
    // Apply time range filter only if it's shorter than natural end
    const maxMonths = parseInt(filters.timeRange);
    const maxEndMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + maxMonths, 1);
    const finalEndMonth = endMonth < maxEndMonth ? endMonth : maxEndMonth;

    const months = [];
    let current = new Date(currentMonth);
    
    while (current <= finalEndMonth) {
      months.push({
        id: `${current.getFullYear()}-${current.getMonth()}`,
        year: current.getFullYear(),
        month: current.getMonth() + 1,
        date: new Date(current),
        label: `${current.getFullYear()}年${current.getMonth() + 1}月`
      });
      current.setMonth(current.getMonth() + 1);
    }

    return months;
  }, [employees, filters.timeRange]);

  // Filter properties based on filters
  const filteredProperties = useMemo(() => {
    return properties.filter(prop => {
      if (filters.gender && filters.gender !== 'all') {
        const propGender = prop.target_gender_type?.toLowerCase();
        if (filters.gender === 'male' && propGender !== 'male') return false;
        if (filters.gender === 'female' && propGender !== 'female') return false;
        if (filters.gender === 'any' && propGender !== 'any') return false;
      }
      
      if (filters.propertyStatus && filters.propertyStatus !== 'all') {
        if (filters.propertyStatus !== prop.status) return false;
      }
      
      return true;
    });
  }, [properties, filters]);

  // Calculate availability matrix
  const availabilityMatrix = useMemo(() => {
    const matrix = {};
    
    timelineMonths.forEach(month => {
      matrix[month.id] = {};
      
      filteredProperties.forEach(property => {
        const monthStart = new Date(month.year, month.month - 1, 1);
        const monthEnd = new Date(month.year, month.month, 0);
        
        // Count employees assigned to this property in this month
        const occupiedCount = employees.filter(emp => {
          const isAssignedToProperty = emp.assigned_property_id === property.id;
          
          if (!isAssignedToProperty) return false;
          
          // Employee has arrived by this month
          const arrivalDate = emp.arrival_at ? new Date(emp.arrival_at) : null;
          const hasArrived = arrivalDate && arrivalDate <= monthEnd;
          
          // Employee hasn't left yet
          const departureDate = emp.departure_date ? new Date(emp.departure_date) : null;
          const hasNotLeft = !departureDate || departureDate > monthStart;
          
          // Employee is in active status
          const isActiveStatus = ['housed', 'pending'].includes(emp.status);
          
          return hasArrived && hasNotLeft && isActiveStatus;
        }).length;
        
        matrix[month.id][property.id] = {
          occupied: occupiedCount,
          available: Math.max(0, property.capacity - occupiedCount),
          capacity: property.capacity,
          occupancyRate: property.capacity > 0 ? (occupiedCount / property.capacity) * 100 : 0
        };
      });
    });
    
    return matrix;
  }, [timelineMonths, filteredProperties, employees]);

  // Calculate demand by month
  const demandByMonth = useMemo(() => {
    const demand = {};
    
    timelineMonths.forEach(month => {
      const monthStart = new Date(month.year, month.month - 1, 1);
      const monthEnd = new Date(month.year, month.month, 0);
      
      const arrivingEmployees = employees.filter(emp => {
        const arrivalDate = emp.arrival_at ? new Date(emp.arrival_at) : null;
        if (!arrivalDate) return false;
        
        return arrivalDate >= monthStart && arrivalDate <= monthEnd;
      });
      
      demand[month.id] = {
        total: arrivingEmployees.length,
        male: arrivingEmployees.filter(emp => emp.gender === 'male').length,
        female: arrivingEmployees.filter(emp => emp.gender === 'female').length,
        employees: arrivingEmployees
      };
    });
    
    return demand;
  }, [timelineMonths, employees]);

  // Calculate total beds by month
  const totalsByMonth = useMemo(() => {
    const totals = {};
    
    timelineMonths.forEach(month => {
      let maleTotal = 0;
      let femaleTotal = 0;
      let mixedTotal = 0;
      
      filteredProperties.forEach(property => {
        const available = availabilityMatrix[month.id]?.[property.id]?.available || 0;
        const genderType = property.target_gender_type?.toLowerCase();
        
        if (genderType === 'male') {
          maleTotal += available;
        } else if (genderType === 'female') {
          femaleTotal += available;
        } else {
          mixedTotal += available;
        }
      });
      
      totals[month.id] = {
        male: maleTotal,
        female: femaleTotal,
        mixed: mixedTotal,
        total: maleTotal + femaleTotal + mixedTotal
      };
    });
    
    return totals;
  }, [timelineMonths, filteredProperties, availabilityMatrix]);

  const handleExportData = () => {
    try {
      // Prepare CSV data
      const csvData = [];
      
      // Header row
      const headers = [
        '月份',
        '總床位(男)',
        '總床位(女)', 
        '需求(男)',
        '需求(女)',
        ...filteredProperties.map(prop => `${prop.name}(可用)`)
      ];
      csvData.push(headers);
      
      // Data rows
      timelineMonths.forEach(month => {
        const totals = totalsByMonth[month.id] || {};
        const demand = demandByMonth[month.id] || {};
        
        const row = [
          month.label,
          totals.male || 0,
          totals.female || 0,
          // Calculate net demand for CSV (availability - demand)
          (totals.male || 0) - (demand.male || 0), // Male net demand
          (totals.female || 0) - (demand.female || 0), // Female net demand
          ...filteredProperties.map(prop => 
            availabilityMatrix[month.id]?.[prop.id]?.available || 0
          )
        ];
        csvData.push(row);
      });
      
      // Convert to CSV string
      const csvContent = csvData.map(row => 
        row.map(field => `"${field}"`).join(',')
      ).join('\n');
      
      // Create and download file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `employee-v2-timeline-${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      console.log('CSV export completed successfully');
    } catch (error) {
      console.error('Error exporting data:', error);
      alert('導出數據時發生錯誤，請重試。');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="max-w-full mx-auto px-2 py-2">
      {/* Header */}
      <div className="mb-3 bg-white dark:bg-gray-800 rounded-lg shadow p-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0">
          <div className="flex items-center space-x-3">
            <Link href="/employees">
              <button className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
                <ArrowLeftIcon className="h-6 w-6" />
              </button>
            </Link>
            <ChartBarIcon className="h-8 w-8 text-blue-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">員工管理 v2</h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                宿舍可用空間時間線視圖 - 跨物業容量規劃
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={handleExportData}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 font-medium transition-colors"
            >
              <ArrowDownTrayIcon className="h-5 w-5" />
              <span>導出數據</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow mb-3 p-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              性別類型
            </label>
            <select
              value={filters.gender}
              onChange={(e) => setFilters(prev => ({ ...prev, gender: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              <option value="">所有性別</option>
              <option value="male">男性宿舍</option>
              <option value="female">女性宿舍</option>
              <option value="any">混合宿舍</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              物業狀態
            </label>
            <select
              value={filters.propertyStatus}
              onChange={(e) => setFilters(prev => ({ ...prev, propertyStatus: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              <option value="">所有狀態</option>
              <option value="active">營運中</option>
              <option value="pending">籌備中</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              時間範圍
            </label>
            <select
              value={filters.timeRange}
              onChange={(e) => setFilters(prev => ({ ...prev, timeRange: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              <option value="6">6個月</option>
              <option value="12">12個月</option>
              <option value="18">18個月</option>
              <option value="24">24個月</option>
            </select>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="text-sm">
              <div className="flex items-center space-x-2">
                <HomeIcon className="h-4 w-4 text-gray-500" />
                <span className="text-gray-600 dark:text-gray-400">
                  物業: {filteredProperties.length}
                </span>
              </div>
              <div className="flex items-center space-x-2 mt-1">
                <UsersIcon className="h-4 w-4 text-gray-500" />
                <span className="text-gray-600 dark:text-gray-400">
                  員工: {employees.length}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Timeline Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <TimelineTable
          months={timelineMonths}
          properties={filteredProperties}
          employees={employees}
          availabilityMatrix={availabilityMatrix}
          demandByMonth={demandByMonth}
          totalsByMonth={totalsByMonth}
        />
      </div>

      {/* Summary Stats */}
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <HomeIcon className="h-8 w-8 text-blue-500" />
            </div>
            <div className="ml-4">
              <div className="text-sm font-medium text-gray-500 dark:text-gray-400">總物業數量</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{filteredProperties.length}</div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <UsersIcon className="h-8 w-8 text-green-500" />
            </div>
            <div className="ml-4">
              <div className="text-sm font-medium text-gray-500 dark:text-gray-400">活躍員工</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {employees.filter(emp => ['housed', 'pending'].includes(emp.status)).length}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <CalendarDaysIcon className="h-8 w-8 text-purple-500" />
            </div>
            <div className="ml-4">
              <div className="text-sm font-medium text-gray-500 dark:text-gray-400">時間線月份</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{timelineMonths.length}</div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <EyeIcon className="h-8 w-8 text-orange-500" />
            </div>
            <div className="ml-4">
              <div className="text-sm font-medium text-gray-500 dark:text-gray-400">總床位容量</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {filteredProperties.reduce((sum, prop) => sum + prop.capacity, 0)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}