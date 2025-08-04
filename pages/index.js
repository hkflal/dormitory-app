import { useState, useEffect } from 'react';
import { collection, getDocs, updateDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { 
  getCurrentMonthRentMetrics, 
  calculateTotalCosts, 
  getFinancialOverview,
  formatCurrency,
  formatPercentage 
} from '../lib/rentCalculations';
import { getActiveEmployees, getHousedEmployees } from '../lib/employeeFilters';
import {
  BuildingOfficeIcon,
  UserGroupIcon,
  HomeIcon,
  CurrencyDollarIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  CalendarDaysIcon,
  ExclamationCircleIcon,
  CheckCircleIcon,
  UserIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  EyeIcon,
  InformationCircleIcon
} from '@heroicons/react/24/outline';
import { useRouter } from 'next/router';

/**
 * Auto-update invoice status to 'overdue' for unpaid invoices past their end_date
 * @param {Array} invoices - Array of all invoice documents
 */
async function updateOverdueInvoices(invoices) {
  const today = new Date();
  today.setHours(23, 59, 59, 999); // Set to end of today for comparison
  
  const overdueUpdates = [];
  
  invoices.forEach(invoice => {
    // Only check unpaid invoices (pending, due)
    if (!['pending', 'due'].includes(invoice.status)) return;
    
    // Check if invoice has end_date
    if (!invoice.end_date) return;
    
    // Parse end_date
    const endDate = invoice.end_date?.toDate ? invoice.end_date.toDate() : new Date(invoice.end_date);
    
    // If end_date is before today, mark as overdue
    if (endDate < today) {
      overdueUpdates.push({
        id: invoice.id,
        ctr: invoice.ctr,
        endDate: endDate.toDateString(),
        currentStatus: invoice.status
      });
    }
  });
  
  // Update overdue invoices in batches
  if (overdueUpdates.length > 0) {
    console.log(`📊 Found ${overdueUpdates.length} invoices to mark as overdue:`);
    overdueUpdates.forEach(update => {
      console.log(`   - ${update.ctr}: ${update.currentStatus} → overdue (end: ${update.endDate})`);
    });
    
    // Update each invoice
    const updatePromises = overdueUpdates.map(update => 
      updateDoc(doc(db, 'invoices', update.id), { status: 'overdue' })
    );
    
    await Promise.all(updatePromises);
    console.log(`✅ Updated ${overdueUpdates.length} invoices to overdue status`);
  }
}

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalProperties: 0,
    activeProperties: 0,
    totalEmployees: 0,
    activeEmployees: 0,
    inHousedEmployees: 0,
    resignedEmployees: 0,
    arrivedEmployees: 0,
    assignedEmployees: 0,
    pendingEmployees: 0,
    occupancyRate: 0,
    assignmentRate: 0,
    // New KPI metrics
    totalReceivableRent: 0,
    receivedRent: 0,
    notYetReceivedRent: 0,
    collectionRate: 0,
    // Cost metrics (no operating costs)
    propertyCosts: 0,
    netIncome: 0,
    totalCapacity: 0,
    pendingInvoices: 0,
    overdueInvoices: 0,
    invoicedRent: 0 // Added invoicedRent
  });
  const [loading, setLoading] = useState(true);
  const [properties, setProperties] = useState([]);
  const [inProgressProperties, setInProgressProperties] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [showMobileTips, setShowMobileTips] = useState(false);
  const router = useRouter();

  const getCurrentMonthName = () => {
    const months = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
    return months[new Date().getMonth()];
  };

  const getCurrentDateString = () => {
    const now = new Date();
    const months = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
    return `${months[now.getMonth()]}${now.getDate()}日`;
  };

  const getLastDayOfCurrentMonth = () => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0);
  };

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const propertiesRef = collection(db, 'properties');
        const propertiesSnapshot = await getDocs(propertiesRef);
        let propertiesData = propertiesSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        // Ensure genderTypes is an array to handle data inconsistencies
        propertiesData = propertiesData.map(p => {
            const newP = { ...p };
            // Case 1: genderTypes is a string (from new data)
            if (typeof newP.genderTypes === 'string') {
                newP.genderTypes = [newP.genderTypes];
            } 
            // Case 2: genderTypes is missing, but old field target_gender_type exists
            else if (!newP.genderTypes && newP.target_gender_type) {
                newP.genderTypes = [newP.target_gender_type];
            }
            // Case 3: genderTypes is not an array for some other reason, safe fallback
            else if (!Array.isArray(newP.genderTypes)) {
                newP.genderTypes = [];
            }
            return newP;
        });

        const employeesRef = collection(db, 'employees');
        const employeesSnapshot = await getDocs(employeesRef);
        const employeesData = employeesSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        const invoicesRef = collection(db, 'invoices');
        const invoicesSnapshot = await getDocs(invoicesRef);
        const invoicesData = invoicesSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        // Auto-update overdue invoices
        await updateOverdueInvoices(invoicesData);
        
        // Reload invoice data after status updates
        const updatedInvoicesSnapshot = await getDocs(invoicesRef);
        const updatedInvoicesData = updatedInvoicesSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth();
        
        // Basic property and employee counts
        const totalProperties = propertiesData.length;
        const activeProperties = propertiesData.filter(p => p.status !== 'inactive').length;
        
        // Employee filtering using new functions
        const activeEmployees = getActiveEmployees(employeesData);
        const housedEmployees = getHousedEmployees(employeesData);
        const totalEmployees = activeEmployees.length;
        const resignedEmployees = employeesData.filter(emp => emp.status === 'resigned').length;
        
        // Current month rent metrics using new calculation functions
        const rentMetrics = getCurrentMonthRentMetrics(employeesData, updatedInvoicesData, currentYear, currentMonth);
        
        // Cost calculations (no operating costs)
        const costMetrics = calculateTotalCosts(propertiesData);
        
        // Net income = received rent - property costs
        const netIncome = rentMetrics.receivedRent - costMetrics.propertyCosts;
        
        // Employee counts for legacy compatibility
        const inHousedEmployees = housedEmployees.length;
        const assignedEmployees = activeEmployees.filter(emp => 
          (emp.assigned_property_id && emp.assigned_property_id !== '') ||
          (emp.assignedProperty && emp.assignedProperty !== '')
        ).length;
        const pendingEmployees = activeEmployees.filter(emp => emp.status === 'pending').length;
        const arrivedEmployees = inHousedEmployees;
        
        // Calculate total bed capacity
        const totalCapacity = propertiesData.reduce((sum, property) => 
          sum + (parseInt(property.capacity) || 
                 (property.rooms ? property.rooms.reduce((roomSum, room) => roomSum + (room.capacity || 0), 0) : 0)), 0);
        
        // Filter current month invoices for counts
        const currentMonthInvoices = updatedInvoicesData.filter(invoice => {
          const issueDate = invoice.issueDate?.toDate ? invoice.issueDate.toDate() : new Date(invoice.issueDate);
          return issueDate.getFullYear() === currentYear && issueDate.getMonth() === currentMonth;
        });
        
        // Invoice status counts - use ALL invoices, not just current month
        const pendingInvoices = updatedInvoicesData
          .filter(invoice => invoice.status === 'pending').length;
        const overdueInvoices = updatedInvoicesData
          .filter(invoice => ['due', 'overdue'].includes(invoice.status)).length;
        
        // Debug logging for invoice counts
        console.log(`📊 Invoice Status Counts:`);
        console.log(`   Total invoices: ${updatedInvoicesData.length}`);
        console.log(`   Pending invoices: ${pendingInvoices}`);
        console.log(`   Overdue invoices: ${overdueInvoices}`);
        console.log(`   Current month invoices: ${currentMonthInvoices.length}`);
        
        // Occupancy and assignment rates
        const occupancyRate = totalCapacity > 0 ? 
          Math.round((inHousedEmployees / totalCapacity) * 100) : 0;
        const assignmentRate = activeEmployees.length > 0 ? 
          Math.round((assignedEmployees / activeEmployees.length) * 100) : 0;

        const inProgress = getInProgressProperties(propertiesData, employeesData);

        setStats({
          totalProperties,
          activeProperties,
          totalEmployees,
          activeEmployees: activeEmployees.length,
          inHousedEmployees,
          resignedEmployees,
          arrivedEmployees,
          assignedEmployees,
          pendingEmployees,
          occupancyRate,
          assignmentRate,
          // New KPI metrics
          totalReceivableRent: rentMetrics.totalReceivableRent,
          receivedRent: rentMetrics.receivedRent,
          notYetReceivedRent: rentMetrics.notYetReceivedRent,
          collectionRate: rentMetrics.collectionRate,
          // Cost metrics (no operating costs)
          propertyCosts: costMetrics.propertyCosts,
          netIncome,
          totalCapacity,
          pendingInvoices,
          overdueInvoices,
          invoicedRent: rentMetrics.invoicedRent // Update invoicedRent
        });

        setProperties(propertiesData);
        setInProgressProperties(inProgress);
        setEmployees(employeesData);
        setInvoices(updatedInvoicesData);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  const getInProgressProperties = (propertiesData, employeesData) => {
    const today = new Date();
    return propertiesData.filter(prop => {
      // Calculate actual occupancy based on housed employees
      const actualOccupancy = employeesData.filter(emp => 
        emp.assigned_property_id === prop.id && 
        emp.status === 'housed'
      ).length;
      const capacity = prop.capacity || 0;
      const occupancyRate = capacity > 0 ? actualOccupancy / capacity : 0;
      const expectedDate = prop.expectedDate ? new Date(prop.expectedDate) : null;
      
      return occupancyRate < 1.0 && expectedDate && expectedDate > today;
    }).sort((a, b) => new Date(a.expectedDate) - new Date(b.expectedDate));
  };

  // formatCurrency function now imported from rentCalculations.js

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('zh-TW');
    } catch {
      return dateStr;
    }
  };

  // Function to render gender icons
  const getPropertyActualRevenue = (property) => {
    return employees
      .filter(emp => 
        emp.status === 'housed' && 
        emp.assigned_property_id === property.id
      )
      .reduce((sum, emp) => {
        return sum + (parseFloat(emp.rent) || parseFloat(emp.monthlyRent) || 0);
      }, 0);
  };

  const renderGenderIcons = (property) => {
    const genderTypes = property.genderTypes || (property.target_gender_type ? [property.target_gender_type] : []);
    
    if (genderTypes.length === 0) {
      return (
        <div className="flex items-center justify-center">
          <span className="text-gray-400 text-xs">不限</span>
        </div>
      );
    }
    
    return (
      <div className="flex items-center justify-center space-x-1">
        {genderTypes.map((gender, index) => {
          const normalizedGender = gender.toLowerCase();
          if (normalizedGender === 'male') {
            return (
              <UserIcon 
                key={index}
                className="h-5 w-5 text-blue-500" 
                title="男性"
              />
            );
          } else if (normalizedGender === 'female') {
            return (
              <UserIcon 
                key={index}
                className="h-5 w-5 text-pink-500" 
                title="女性"
              />
            );
          } else {
            return (
              <span key={index} className="text-gray-400 text-xs">不限</span>
            );
          }
        })}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  const currentMonth = getCurrentMonthName();
  const currentDateString = getCurrentDateString();

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6">
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 sm:p-6">
        <div className="flex flex-col space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">宿舍管理系統</h1>
              <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">經營概覽 & 營運指標</p>
            </div>
            <div className="text-right">
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">最後更新</p>
              <p className="text-xs sm:text-sm font-medium text-gray-900 dark:text-gray-100">{new Date().toLocaleString('zh-TW')}</p>
            </div>
          </div>

          <div className="lg:hidden">
            <button
              onClick={() => setShowMobileTips(!showMobileTips)}
              className="flex items-center space-x-2 text-blue-600 dark:text-blue-400 text-sm font-medium"
            >
              <InformationCircleIcon className="h-4 w-4" />
              <span>手機使用提示</span>
              {showMobileTips ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
            </button>
            {showMobileTips && (
              <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm text-blue-800 dark:text-blue-200">
                <ul className="space-y-1">
                  <li>• 點擊卡片展開更多詳細資訊</li>
                  <li>• 滑動查看完整的物業列表</li>
                  <li>• 長按卡片快速訪問管理功能</li>
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
        <div className="bg-gradient-to-r from-green-400 to-green-600 text-white p-4 sm:p-6 rounded-lg shadow-lg transform hover:scale-105 transition-transform">
          <div className="flex items-center">
            <CurrencyDollarIcon className="h-8 w-8 sm:h-10 sm:w-10 mr-3 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-green-100 text-xs sm:text-sm font-medium">{currentMonth}應收租金總額</p>
              <p className="text-xl sm:text-2xl font-bold truncate">{formatCurrency(stats.totalReceivableRent)}</p>
              <p className="text-green-100 text-xs mt-1">含預計入住員工</p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-r from-purple-400 to-purple-600 text-white p-4 sm:p-6 rounded-lg shadow-lg transform hover:scale-105 transition-transform">
          <div className="flex items-center">
            <CalendarDaysIcon className="h-8 w-8 sm:h-10 sm:w-10 mr-3 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-purple-100 text-xs sm:text-sm font-medium">至 {currentDateString} 已開票租金</p>
              <p className="text-xl sm:text-2xl font-bold truncate">{formatCurrency(stats.invoicedRent)}</p>
              <p className="text-purple-100 text-xs mt-1">已產生發票的租金總額</p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-r from-blue-400 to-blue-600 text-white p-4 sm:p-6 rounded-lg shadow-lg transform hover:scale-105 transition-transform">
          <div className="flex items-center">
            <CheckCircleIcon className="h-8 w-8 sm:h-10 sm:w-10 mr-3 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-blue-100 text-xs sm:text-sm font-medium">至 {currentDateString}本月已收租金</p>
              <p className="text-xl sm:text-2xl font-bold truncate">{formatCurrency(stats.receivedRent)}</p>
              <p className="text-blue-100 text-xs mt-1">收款率: {stats.collectionRate.toFixed(1)}%</p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-r from-orange-400 to-orange-600 text-white p-4 sm:p-6 rounded-lg shadow-lg transform hover:scale-105 transition-transform">
          <div className="flex items-center">
            <ClockIcon className="h-8 w-8 sm:h-10 sm:w-10 mr-3 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-orange-100 text-xs sm:text-sm font-medium">至 {currentDateString}本月未收租金</p>
              <p className="text-xl sm:text-2xl font-bold truncate">{formatCurrency(stats.notYetReceivedRent)}</p>
              <p className="text-orange-100 text-xs mt-1">待收款發票金額</p>
            </div>
          </div>
        </div>
      </div>

      {/* Expanded 8-card grid for detailed statistics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3 sm:gap-4 lg:gap-3 xl:gap-2">
        <div className="bg-white dark:bg-gray-800 p-3 lg:p-2 xl:p-3 rounded-lg shadow">
          <div className="flex flex-col items-center text-center">
            <HomeIcon className="h-6 w-6 lg:h-5 lg:w-5 text-blue-500 mb-2" />
            <p className="text-xs lg:text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">床位率</p>
            <p className="text-lg lg:text-base xl:text-lg font-bold text-gray-900 dark:text-white">{stats.occupancyRate}%</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{stats.inHousedEmployees}/{stats.totalCapacity}</p>
          </div>
        </div>
        
        <div className="bg-white dark:bg-gray-800 p-3 lg:p-2 xl:p-3 rounded-lg shadow">
          <div className="flex flex-col items-center text-center">
            <UserGroupIcon className="h-6 w-6 lg:h-5 lg:w-5 text-green-500 mb-2" />
            <p className="text-xs lg:text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">分配率</p>
            <p className="text-lg lg:text-base xl:text-lg font-bold text-gray-900 dark:text-white">{stats.assignmentRate}%</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{stats.assignedEmployees}/{stats.activeEmployees}</p>
          </div>
        </div>
        
        <div className="bg-white dark:bg-gray-800 p-3 lg:p-2 xl:p-3 rounded-lg shadow">
          <div className="flex flex-col items-center text-center">
            <BuildingOfficeIcon className="h-6 w-6 lg:h-5 lg:w-5 text-purple-500 mb-2" />
            <p className="text-xs lg:text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">物業數</p>
            <p className="text-lg lg:text-base xl:text-lg font-bold text-gray-900 dark:text-white">{stats.totalProperties}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{stats.activeProperties}間活躍</p>
          </div>
        </div>
        
        <div className="bg-white dark:bg-gray-800 p-3 lg:p-2 xl:p-3 rounded-lg shadow">
          <div className="flex flex-col items-center text-center">
            <UserIcon className="h-6 w-6 lg:h-5 lg:w-5 text-orange-500 mb-2" />
            <p className="text-xs lg:text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">員工數</p>
            <p className="text-lg lg:text-base xl:text-lg font-bold text-gray-900 dark:text-white">{stats.totalEmployees}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{stats.pendingEmployees}位待處理</p>
          </div>
        </div>
        
        <div className="bg-white dark:bg-gray-800 p-3 lg:p-2 xl:p-3 rounded-lg shadow">
          <div className="flex flex-col items-center text-center">
            <CheckCircleIcon className="h-6 w-6 lg:h-5 lg:w-5 text-green-600 mb-2" />
            <p className="text-xs lg:text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">已入住</p>
            <p className="text-lg lg:text-base xl:text-lg font-bold text-gray-900 dark:text-white">{stats.inHousedEmployees}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">已到達</p>
          </div>
        </div>
        
        <div className="bg-white dark:bg-gray-800 p-3 lg:p-2 xl:p-3 rounded-lg shadow">
          <div className="flex flex-col items-center text-center">
            <ExclamationTriangleIcon className="h-6 w-6 lg:h-5 lg:w-5 text-gray-500 mb-2" />
            <p className="text-xs lg:text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">已離職</p>
            <p className="text-lg lg:text-base xl:text-lg font-bold text-gray-900 dark:text-white">{stats.resignedEmployees}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">不計入租金</p>
          </div>
        </div>
        
        <div className="bg-white dark:bg-gray-800 p-3 lg:p-2 xl:p-3 rounded-lg shadow">
          <div className="flex flex-col items-center text-center">
            <ExclamationCircleIcon className="h-6 w-6 lg:h-5 lg:w-5 text-red-500 mb-2" />
            <p className="text-xs lg:text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">逾期票</p>
            <p className="text-lg lg:text-base xl:text-lg font-bold text-gray-900 dark:text-white">{stats.overdueInvoices}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">需跟進</p>
          </div>
        </div>
        
        <div className="bg-white dark:bg-gray-800 p-3 lg:p-2 xl:p-3 rounded-lg shadow">
          <div className="flex flex-col items-center text-center">
            <CalendarDaysIcon className="h-6 w-6 lg:h-5 lg:w-5 text-indigo-500 mb-2" />
            <p className="text-xs lg:text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">待付票</p>
            <p className="text-lg lg:text-base xl:text-lg font-bold text-gray-900 dark:text-white">{stats.pendingInvoices}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">等付款</p>
          </div>
        </div>
      </div>

      {/* Cost Analysis Section */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
        <div className="p-4 sm:p-6 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center">
            <CurrencyDollarIcon className="h-5 w-5 mr-2" />
            財務概覽
          </h3>
        </div>
        
        <div className="p-4 sm:p-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <div className="text-center p-4 sm:p-6 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
              <p className="text-red-600 dark:text-red-400 text-sm font-medium mb-2">物業成本</p>
              <p className="text-2xl sm:text-3xl font-bold text-red-700 dark:text-red-300">{formatCurrency(stats.propertyCosts)}</p>
              <p className="text-red-500 dark:text-red-400 text-xs mt-1">我們支付的房租/貸款</p>
            </div>
            <div className="text-center p-4 sm:p-6 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
              <p className="text-green-600 dark:text-green-400 text-sm font-medium mb-2">收款率</p>
              <p className="text-2xl sm:text-3xl font-bold text-green-700 dark:text-green-300">{stats.collectionRate.toFixed(1)}%</p>
              <p className="text-green-500 dark:text-green-400 text-xs mt-1">已收租金 / 應收租金</p>
            </div>
            <div className="text-center p-4 sm:p-6 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <p className="text-blue-600 dark:text-blue-400 text-sm font-medium mb-2">淨收益</p>
              <p className={`text-2xl sm:text-3xl font-bold ${stats.netIncome >= 0 ? 'text-blue-700 dark:text-blue-300' : 'text-red-700 dark:text-red-300'}`}>{formatCurrency(stats.netIncome)}</p>
              <p className="text-blue-500 dark:text-blue-400 text-xs mt-1">已收租金 - 物業成本</p>
            </div>
          </div>
        </div>
      </div>

      {/* Properties Overview - Mobile-First Card Design */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
        <div className="p-4 sm:p-6 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center">
              <BuildingOfficeIcon className="h-5 w-5 mr-2" />
              物業概覽
            </h3>
            <button
              onClick={() => router.push('/properties')}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center space-x-1 min-h-[44px] transition-colors"
            >
              <span>管理物業</span>
              <span>→</span>
            </button>
          </div>
        </div>
        
        {/* Mobile-First Properties Cards */}
        <div className="p-4 sm:p-6">
          {properties.length === 0 ? (
            <div className="text-center py-12">
              <BuildingOfficeIcon className="h-12 w-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400 text-lg mb-2">暫無物業資料</p>
              <p className="text-gray-400 dark:text-gray-500 text-sm mb-4">請先添加物業以開始管理</p>
              <button
                onClick={() => router.push('/properties')}
                className="bg-primary-600 hover:bg-primary-700 text-white px-6 py-3 rounded-lg font-medium min-h-[44px] transition-colors"
              >
                新增第一個物業
              </button>
            </div>
          ) : (
            <>
              {/* Desktop Table View */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">物業名稱</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">地址</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">入住狀況</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">入住率</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">月租金</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">性別類型</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">狀態</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">待收租金</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {properties.map((property) => {
                      // Calculate actual occupancy based on housed employees
                      const actualOccupancy = employees.filter(emp => 
                        emp.assigned_property_id === property.id && 
                        emp.status === 'housed'
                      ).length;
                      const capacity = property.capacity || 0;
                      const occupancyRate = capacity > 0 ? Math.round((actualOccupancy / capacity) * 100) : 0;
                      
                      const getPropertyStatus = () => {
                        const expectedDate = property.expectedDate;
                        const today = new Date();
                        const isExpectedDatePassed = expectedDate && new Date(expectedDate) < today;
                        
                        if (isExpectedDatePassed || occupancyRate >= 100) {
                          return {
                            label: '運營中',
                            className: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
                            rowColor: 'bg-green-50 dark:bg-green-900/10'
                          };
                        } else {
                          const formattedDate = expectedDate ? 
                            new Date(expectedDate).toLocaleDateString('zh-HK', { 
                              day: 'numeric', 
                              month: 'short' 
                            }) : '待定';
                          
                          return {
                            label: `預計 ${formattedDate}`,
                            className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400',
                            rowColor: 'bg-yellow-50 dark:bg-yellow-900/10'
                          };
                        }
                      };

                      const status = getPropertyStatus();
                      const assignedEmployees = employees.filter(emp => 
                        emp.assigned_property_id === property.id || 
                        emp.assignedProperty === property.name
                      );

                      // FIXED: Calculate real outstanding rent based on actual invoices
                      const employeesWithRentDue = assignedEmployees.filter(emp => {
                        // Find invoices for this employee that are unpaid
                        const employeeInvoices = invoices.filter(invoice => 
                          invoice.employee_id === emp.id || 
                          (invoice.employee_names && invoice.employee_names.includes(emp.name || emp.firstName))
                        );
                        
                        // Check if employee has any pending or overdue invoices
                        const hasOutstandingInvoices = employeeInvoices.some(invoice => 
                          invoice.status === 'pending' || 
                          invoice.status === 'overdue' || 
                          invoice.status === 'due'
                        );
                        
                        return hasOutstandingInvoices;
                      }).length;

                      return (
                        <tr 
                          key={property.id}
                          onClick={() => router.push(`/property-detail?id=${property.id}`)}
                          className={`hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors ${status.rowColor}`}
                        >
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div>
                              <div className="text-sm font-bold text-gray-900 dark:text-gray-100">
                                {property.name || '未命名物業'}
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                {assignedEmployees.length} 名員工
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                              {property.address}
                            </div>
                            <div className="text-xs text-gray-400 dark:text-gray-500">
                              {property.location}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              {actualOccupancy}/{capacity}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div className="flex-1">
                                <div className={`text-sm font-medium ${
                                  occupancyRate >= 90 ? 'text-green-600 dark:text-green-400' :
                                  occupancyRate >= 70 ? 'text-yellow-600 dark:text-yellow-400' :
                                  'text-red-600 dark:text-red-400'
                                }`}>
                                  {occupancyRate}%
                                </div>
                                <div className="w-16 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 mt-1">
                                  <div
                                    className={`h-1.5 rounded-full transition-all duration-300 ${
                                      occupancyRate >= 90 ? 'bg-green-500' :
                                      occupancyRate >= 70 ? 'bg-yellow-500' :
                                      'bg-red-500'
                                    }`}
                                    style={{ width: `${occupancyRate}%` }}
                                  />
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900 dark:text-gray-100">
                              {formatCurrency(getPropertyActualRevenue(property))}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {renderGenderIcons(property)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${status.className}`}>
                              {status.label}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            {employeesWithRentDue > 0 ? (
                              <div className="text-red-600 dark:text-red-400 font-medium text-sm">
                                {employeesWithRentDue} 筆
                              </div>
                            ) : (
                              <div className="text-green-600 dark:text-green-400 text-sm">
                                ✓
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="lg:hidden space-y-4">
                {properties.map((property) => {
                  // Calculate actual occupancy based on housed employees
                  const actualOccupancy = employees.filter(emp => 
                    emp.assigned_property_id === property.id && 
                    emp.status === 'housed'
                  ).length;
                  const capacity = property.capacity || 0;
                  const occupancyRate = capacity > 0 ? Math.round((actualOccupancy / capacity) * 100) : 0;
                  
                  const getPropertyStatus = () => {
                    const expectedDate = property.expectedDate;
                    const today = new Date();
                    const isExpectedDatePassed = expectedDate && new Date(expectedDate) < today;
                    
                    if (isExpectedDatePassed || occupancyRate >= 100) {
                      return {
                        label: '運營中',
                        className: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
                        borderColor: 'border-green-200 dark:border-green-800'
                      };
                    } else {
                      const formattedDate = expectedDate ? 
                        new Date(expectedDate).toLocaleDateString('zh-HK', { 
                          day: 'numeric', 
                          month: 'short' 
                        }) : '待定';
                      
                      return {
                        label: `預計 ${formattedDate}`,
                        className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400',
                        borderColor: 'border-yellow-200 dark:border-yellow-800'
                      };
                    }
                  };

                  const status = getPropertyStatus();
                  const assignedEmployees = employees.filter(emp => 
                    emp.assigned_property_id === property.id || 
                    emp.assignedProperty === property.name
                  );

                  // FIXED: Calculate real outstanding rent based on actual invoices
                  const employeesWithRentDue = assignedEmployees.filter(emp => {
                    // Find invoices for this employee that are unpaid
                    const employeeInvoices = invoices.filter(invoice => 
                      invoice.employee_id === emp.id || 
                      (invoice.employee_names && invoice.employee_names.includes(emp.name || emp.firstName))
                    );
                    
                    // Check if employee has any pending or overdue invoices
                    const hasOutstandingInvoices = employeeInvoices.some(invoice => 
                      invoice.status === 'pending' || 
                      invoice.status === 'overdue' || 
                      invoice.status === 'due'
                    );
                    
                    return hasOutstandingInvoices;
                  }).length;

                  return (
                    <div 
                      key={property.id}
                      className={`bg-white dark:bg-gray-800 border-2 ${status.borderColor} rounded-xl shadow-lg overflow-hidden transform hover:scale-105 transition-transform active:scale-95`}
                    >
                      {/* Card Header */}
                      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate">
                            {property.name || '未命名物業'}
                          </h4>
                          <span className={`inline-flex px-3 py-1 text-xs font-semibold rounded-full ${status.className}`}>
                            {status.label}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">{property.address}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-500">{property.location}</p>
                      </div>

                      {/* Card Content */}
                      <div className="p-4 space-y-4">
                        {/* Occupancy Rate */}
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">入住率</span>
                          <div className="flex items-center space-x-2">
                            <span className={`text-sm font-bold ${
                              occupancyRate >= 90 ? 'text-green-600 dark:text-green-400' :
                              occupancyRate >= 70 ? 'text-yellow-600 dark:text-yellow-400' :
                              'text-red-600 dark:text-red-400'
                            }`}>
                              {occupancyRate}%
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              ({actualOccupancy}/{capacity})
                            </span>
                          </div>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all duration-300 ${
                              occupancyRate >= 90 ? 'bg-green-500' :
                              occupancyRate >= 70 ? 'bg-yellow-500' :
                              'bg-red-500'
                            }`}
                            style={{ width: `${occupancyRate}%` }}
                          />
                        </div>

                        {/* Key Metrics Grid */}
                        <div className="grid grid-cols-2 gap-4">
                          <div className="text-center p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                            <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">月租金</p>
                            <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
                              {formatCurrency(getPropertyActualRevenue(property))}
                            </p>
                          </div>
                          <div className="text-center p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                            <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">員工數</p>
                            <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
                              {assignedEmployees.length} 名
                            </p>
                          </div>
                        </div>

                        {/* Additional Info */}
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600 dark:text-gray-400">
                            {renderGenderIcons(property)}
                          </span>
                          <div className="flex items-center space-x-1">
                            {employeesWithRentDue > 0 ? (
                              <>
                                <ExclamationCircleIcon className="h-4 w-4 text-red-500" />
                                <span className="text-red-600 dark:text-red-400 font-medium text-sm">
                                  {employeesWithRentDue} 筆待收
                                </span>
                              </>
                            ) : (
                              <>
                                <CheckCircleIcon className="h-4 w-4 text-green-500" />
                                <span className="text-green-600 dark:text-green-400 text-sm">
                                  租金已收
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Card Footer - Action Button */}
                      <div className="p-4 bg-gray-50 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-600">
                        <button
                          onClick={() => router.push(`/property-detail?id=${property.id}`)}
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-lg text-sm font-medium flex items-center justify-center space-x-2 min-h-[44px] transition-colors active:bg-blue-800"
                        >
                          <EyeIcon className="h-4 w-4" />
                          <span>查看詳情</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* In Progress Properties - Direct Access Section */}
      {inProgressProperties.length > 0 && (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
          <div className="p-4 sm:p-6 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center">
              <CalendarDaysIcon className="h-5 w-5 mr-2 text-blue-500" />
              進行中的物業安排
              <span className="ml-2 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 text-xs rounded-full">
                {inProgressProperties.length}
              </span>
            </h3>
          </div>
          
          <div className="p-4 sm:p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {inProgressProperties.slice(0, 6).map((property) => (
                <button
                  key={property.id}
                  onClick={() => router.push(`/property-detail?id=${property.id}`)}
                  className="flex items-center justify-between p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors text-left w-full"
                >
                  <div className="flex-1 min-w-0">
                    <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">{property.name}</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400 truncate">{property.address}</p>
                    <div className="flex items-center mt-2 space-x-2">
                      <span className="text-xs text-gray-500 dark:text-gray-400">預計完成:</span>
                      <span className="font-semibold text-blue-600 dark:text-blue-400 text-xs">{formatDate(property.expectedDate)}</span>
                    </div>
                  </div>
                  <div className="ml-4 flex-shrink-0">
                    <EyeIcon className="h-5 w-5 text-blue-500" />
                  </div>
                </button>
              ))}
            </div>
            
            {inProgressProperties.length > 6 && (
              <div className="mt-4 text-center">
                <button
                  onClick={() => router.push('/properties')}
                  className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm font-medium"
                >
                  查看全部 {inProgressProperties.length} 個進行中物業 →
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
} 