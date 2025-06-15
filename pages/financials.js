import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, getDocs, updateDoc, doc } from 'firebase/firestore';
import { 
  CurrencyDollarIcon, 
  ClockIcon, 
  ExclamationTriangleIcon,
  CheckCircleIcon,
  UserGroupIcon,
  BanknotesIcon
} from '@heroicons/react/24/outline';
import { format } from 'date-fns';

export default function Financials() {
  const [loading, setLoading] = useState(true);
  const [financialRecords, setFinancialRecords] = useState([]);
  const [actionableRecords, setActionableRecords] = useState([]);
  const [error, setError] = useState(null);
  const [updatingStatus, setUpdatingStatus] = useState({});
  
  // Real financial summary from actual data
  const [financialSummary, setFinancialSummary] = useState({
    totalMonthlyRevenue: 0,
    totalYearlyRevenue: 0,
    totalOverdueAmount: 0,
    totalPendingAmount: 0,
    totalActiveEmployees: 0,
    overdueCount: 0,
    pendingCount: 0,
    currentCount: 0
  });

  useEffect(() => {
    fetchFinancialData();
  }, []);

  const fetchFinancialData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Fetch financial records
      const financialSnapshot = await getDocs(collection(db, 'financial_records'));
      const financialList = financialSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Calculate current status for each record
      const updatedRecords = financialList.map(record => {
        const currentStatus = calculateCurrentStatus(record);
        return { ...record, ...currentStatus };
      });

      // Filter actionable records (overdue and pending payments)
      const actionable = updatedRecords.filter(record => 
        record.status === 'overdue' || record.status === 'due_soon' || record.status === 'pending'
      );

      setFinancialRecords(updatedRecords);
      setActionableRecords(actionable);
      
      // Calculate real summary from actual data
      const summary = calculateRealSummary(updatedRecords);
      setFinancialSummary(summary);
      
      setLoading(false);
    } catch (error) {
      console.error('Error fetching financial data:', error);
      setError('Failed to load financial data. Please check your connection and try again.');
      setLoading(false);
    }
  };

  const calculateCurrentStatus = (record) => {
    const today = new Date();
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    
    if (!record.rentEnd) {
      return {
        status: 'pending',
        isOverdue: false,
        needsNotification: false,
        daysUntilDue: null
      };
    }

    const rentEnd = record.rentEnd.toDate ? record.rentEnd.toDate() : new Date(record.rentEnd);
    const rentEndMidnight = new Date(rentEnd.getFullYear(), rentEnd.getMonth(), rentEnd.getDate());
    
    const timeDiff = rentEndMidnight - todayMidnight;
    const daysUntilDue = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
    
    const notificationDate = new Date(rentEnd);
    notificationDate.setDate(notificationDate.getDate() - 14);
    const notificationMidnight = new Date(notificationDate.getFullYear(), notificationDate.getMonth(), notificationDate.getDate());
    
    const isOverdue = todayMidnight > rentEndMidnight;
    const needsNotification = todayMidnight >= notificationMidnight && todayMidnight <= rentEndMidnight;
    
    let status = 'current';
    if (isOverdue) {
      status = 'overdue';
    } else if (needsNotification) {
      status = 'due_soon';
    }
    
    return {
      status,
      isOverdue,
      needsNotification,
      daysUntilDue,
      notificationDate
    };
  };

  const calculateRealSummary = (records) => {
    let summary = {
      totalMonthlyRevenue: 0,
      totalYearlyRevenue: 0,
      totalOverdueAmount: 0,
      totalPendingAmount: 0,
      totalActiveEmployees: 0,
      overdueCount: 0,
      pendingCount: 0,
      currentCount: 0
    };

    records.forEach(record => {
      if (record.monthlyRent > 0) {
        summary.totalActiveEmployees++;
        summary.totalMonthlyRevenue += record.monthlyRent;
        
        const amountDue = record.totalAmountDue || (record.monthlyRent * (record.paymentFrequency || 1));
        
        switch (record.status) {
          case 'overdue':
            summary.overdueCount++;
            summary.totalOverdueAmount += amountDue;
            break;
          case 'due_soon':
          case 'pending':
            summary.pendingCount++;
            summary.totalPendingAmount += amountDue;
            break;
          case 'current':
            summary.currentCount++;
            break;
        }
      }
    });

    summary.totalYearlyRevenue = summary.totalMonthlyRevenue * 12;
    return summary;
  };

  const handleStatusUpdate = async (recordId, newStatus) => {
    setUpdatingStatus(prev => ({ ...prev, [recordId]: true }));
    
    try {
      const recordRef = doc(db, 'financial_records', recordId);
      const updateData = {
        status: newStatus,
        lastUpdated: new Date()
      };

      if (newStatus === 'current') {
        updateData.paidDate = new Date();
      }

      await updateDoc(recordRef, updateData);
      
      // Refresh data after update
      await fetchFinancialData();
      
    } catch (error) {
      console.error('Error updating status:', error);
    } finally {
      setUpdatingStatus(prev => ({ ...prev, [recordId]: false }));
    }
  };

  const formatDate = (date) => {
    if (!date) return 'N/A';
    try {
      const d = date.toDate ? date.toDate() : new Date(date);
      return format(d, 'yyyy-MM-dd');
    } catch {
      return 'Invalid Date';
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('zh-TW', {
      style: 'currency',
      currency: 'TWD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount || 0);
  };

  const getStatusBadge = (status, daysUntilDue) => {
    switch (status) {
      case 'overdue':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400">
            <ExclamationTriangleIcon className="w-3 h-3 mr-1" />
            逾期
          </span>
        );
      case 'due_soon':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400">
            <ClockIcon className="w-3 h-3 mr-1" />
            即將到期 ({daysUntilDue}天)
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400">
            <ClockIcon className="w-3 h-3 mr-1" />
            待處理
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
            <CheckCircleIcon className="w-3 h-3 mr-1" />
            正常
          </span>
        );
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 mb-8">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-24 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg">
          <div className="flex">
            <ExclamationTriangleIcon className="h-5 w-5 text-red-400" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800 dark:text-red-200">
                載入錯誤
              </h3>
              <p className="mt-2 text-sm text-red-700 dark:text-red-300">
                {error}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">財務管理</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          租金收入總覽和付款狀態管理
        </p>
      </div>

      {/* Section 1: Rental Related Summary */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">租金財務總覽</h2>
        
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {/* Total Monthly Revenue */}
          <div className="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <CurrencyDollarIcon className="h-6 w-6 text-green-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
                      月租金收入
                    </dt>
                    <dd className="text-lg font-medium text-gray-900 dark:text-white">
                      {formatCurrency(financialSummary.totalMonthlyRevenue)}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          {/* Total Yearly Revenue */}
          <div className="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <BanknotesIcon className="h-6 w-6 text-blue-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
                      年租金收入
                    </dt>
                    <dd className="text-lg font-medium text-gray-900 dark:text-white">
                      {formatCurrency(financialSummary.totalYearlyRevenue)}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          {/* Overdue Amount */}
          <div className="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <ExclamationTriangleIcon className="h-6 w-6 text-red-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
                      逾期金額 ({financialSummary.overdueCount}筆)
                    </dt>
                    <dd className="text-lg font-medium text-red-600 dark:text-red-400">
                      {formatCurrency(financialSummary.totalOverdueAmount)}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          {/* Pending Amount */}
          <div className="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <ClockIcon className="h-6 w-6 text-yellow-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
                      待收金額 ({financialSummary.pendingCount}筆)
                    </dt>
                    <dd className="text-lg font-medium text-yellow-600 dark:text-yellow-400">
                      {formatCurrency(financialSummary.totalPendingAmount)}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          {/* Active Employees */}
          <div className="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <UserGroupIcon className="h-6 w-6 text-blue-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
                      活躍租客
                    </dt>
                    <dd className="text-lg font-medium text-gray-900 dark:text-white">
                      {financialSummary.totalActiveEmployees}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          {/* Current/Paid Count */}
          <div className="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <CheckCircleIcon className="h-6 w-6 text-green-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
                      已付款租客
                    </dt>
                    <dd className="text-lg font-medium text-green-600 dark:text-green-400">
                      {financialSummary.currentCount}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Section 2: Overdue & Pending Payments Management */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            逾期和待收付款管理
          </h2>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {actionableRecords.length} 筆需要處理
          </span>
        </div>

        {actionableRecords.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 text-center">
            <CheckCircleIcon className="mx-auto h-12 w-12 text-green-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">全部付款正常</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              目前沒有逾期或待處理的付款記錄
            </p>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 shadow overflow-hidden sm:rounded-md">
            <ul className="divide-y divide-gray-200 dark:divide-gray-700">
              {actionableRecords.map((record) => (
                <li key={record.id}>
                  <div className="px-4 py-4 sm:px-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {record.employeeName}
                          </p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            合約: {record.contractNumber}
                          </p>
                        </div>
                        <div>
                          {getStatusBadge(record.status, record.daysUntilDue)}
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-4">
                        <div className="text-right">
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {formatCurrency(record.totalAmountDue || (record.monthlyRent * (record.paymentFrequency || 1)))}
                          </p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            到期: {formatDate(record.rentEnd)}
                          </p>
                        </div>
                        
                        <div className="flex space-x-2">
                          <select
                            value={record.status}
                            onChange={(e) => handleStatusUpdate(record.id, e.target.value)}
                            disabled={updatingStatus[record.id]}
                            className="text-sm border-gray-300 dark:border-gray-600 rounded-md focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                          >
                            <option value="pending">待處理</option>
                            <option value="due_soon">即將到期</option>
                            <option value="overdue">逾期</option>
                            <option value="current">已付款</option>
                          </select>
                          
                          {updatingStatus[record.id] && (
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600"></div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}