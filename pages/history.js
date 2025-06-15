import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy, limit, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { 
  ClockIcon,
  UserIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  CheckCircleIcon,
  XCircleIcon,
  EyeIcon,
  DocumentTextIcon
} from '@heroicons/react/24/outline';
import Modal from '../components/Modal';

export default function History() {
  const [logs, setLogs] = useState([]);
  const [filteredLogs, setFilteredLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [showLogModal, setShowLogModal] = useState(false);
  const [selectedLog, setSelectedLog] = useState(null);

  // Get unique users and actions for filter dropdowns
  const [uniqueUsers, setUniqueUsers] = useState([]);
  const [uniqueActions, setUniqueActions] = useState([]);

  useEffect(() => {
    fetchLogs();
    cleanupOldLogs();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [logs, searchTerm, actionFilter, userFilter, dateFilter]);

  useEffect(() => {
    // Extract unique users and actions from logs
    const users = [...new Set(logs.map(log => log.user).filter(Boolean))].sort();
    const actions = [...new Set(logs.map(log => log.action).filter(Boolean))].sort();
    setUniqueUsers(users);
    setUniqueActions(actions);
  }, [logs]);

  const fetchLogs = async () => {
    try {
      const logsRef = collection(db, 'history_logs');
      const logsQuery = query(logsRef, orderBy('timestamp', 'desc'), limit(1000));
      const logsSnapshot = await getDocs(logsQuery);
      const logsData = logsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setLogs(logsData);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching logs:', error);
      setLoading(false);
    }
  };

  const cleanupOldLogs = async () => {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const logsRef = collection(db, 'history_logs');
      const oldLogsQuery = query(logsRef, where('timestamp', '<', thirtyDaysAgo));
      const oldLogsSnapshot = await getDocs(oldLogsQuery);
      
      const deletePromises = oldLogsSnapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deletePromises);
      
      console.log(`Cleaned up ${oldLogsSnapshot.docs.length} logs older than 30 days`);
    } catch (error) {
      console.error('Error cleaning up old logs:', error);
    }
  };

  const applyFilters = () => {
    let filtered = [...logs];

    if (searchTerm) {
      filtered = filtered.filter(log => 
        log.action?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.user?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.targetName?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (actionFilter) {
      filtered = filtered.filter(log => log.action === actionFilter);
    }

    if (userFilter) {
      filtered = filtered.filter(log => log.user === userFilter);
    }

    if (dateFilter) {
      const filterDate = new Date(dateFilter);
      filtered = filtered.filter(log => {
        const logDate = log.timestamp?.toDate ? log.timestamp.toDate() : new Date(log.timestamp);
        return logDate.toDateString() === filterDate.toDateString();
      });
    }

    setFilteredLogs(filtered);
  };

  const getActionIcon = (action) => {
    const actionIcons = {
      'CREATE_EMPLOYEE': UserIcon,
      'UPDATE_EMPLOYEE': UserIcon,
      'DELETE_EMPLOYEE': UserIcon,
      'CREATE_PROPERTY': DocumentTextIcon,
      'UPDATE_PROPERTY': DocumentTextIcon,
      'DELETE_PROPERTY': DocumentTextIcon,
      'ASSIGN_EMPLOYEE': ArrowPathIcon,
      'UNASSIGN_EMPLOYEE': ArrowPathIcon,
      'CREATE_INVOICE': DocumentTextIcon,
      'UPDATE_INVOICE': DocumentTextIcon,
      'DELETE_INVOICE': DocumentTextIcon,
      'CREATE_MAINTENANCE': ExclamationTriangleIcon,
      'UPDATE_MAINTENANCE': ExclamationTriangleIcon,
      'DELETE_MAINTENANCE': ExclamationTriangleIcon,
      'CREATE_ROOM': DocumentTextIcon,
      'UPDATE_ROOM': DocumentTextIcon,
      'DELETE_ROOM': DocumentTextIcon
    };
    
    return actionIcons[action] || InformationCircleIcon;
  };

  const getActionColor = (action) => {
    const actionColors = {
      'CREATE_EMPLOYEE': 'text-green-600 bg-green-100',
      'UPDATE_EMPLOYEE': 'text-blue-600 bg-blue-100',
      'DELETE_EMPLOYEE': 'text-red-600 bg-red-100',
      'CREATE_PROPERTY': 'text-green-600 bg-green-100',
      'UPDATE_PROPERTY': 'text-blue-600 bg-blue-100',
      'DELETE_PROPERTY': 'text-red-600 bg-red-100',
      'ASSIGN_EMPLOYEE': 'text-purple-600 bg-purple-100',
      'UNASSIGN_EMPLOYEE': 'text-orange-600 bg-orange-100',
      'CREATE_INVOICE': 'text-green-600 bg-green-100',
      'UPDATE_INVOICE': 'text-blue-600 bg-blue-100',
      'DELETE_INVOICE': 'text-red-600 bg-red-100',
      'CREATE_MAINTENANCE': 'text-yellow-600 bg-yellow-100',
      'UPDATE_MAINTENANCE': 'text-blue-600 bg-blue-100',
      'DELETE_MAINTENANCE': 'text-red-600 bg-red-100',
      'CREATE_ROOM': 'text-green-600 bg-green-100',
      'UPDATE_ROOM': 'text-blue-600 bg-blue-100',
      'DELETE_ROOM': 'text-red-600 bg-red-100'
    };
    
    return actionColors[action] || 'text-gray-600 bg-gray-100';
  };

  const formatTimestamp = (timestamp) => {
    const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString('zh-HK', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const openLogModal = (log) => {
    setSelectedLog(log);
    setShowLogModal(true);
  };

  const canRevert = (log) => {
    // Only allow reversion for certain actions and within 24 hours
    const revertableActions = ['DELETE_EMPLOYEE', 'DELETE_PROPERTY', 'DELETE_INVOICE', 'DELETE_MAINTENANCE', 'DELETE_ROOM'];
    const logDate = log.timestamp?.toDate ? log.timestamp.toDate() : new Date(log.timestamp);
    const hoursSince = (new Date() - logDate) / (1000 * 60 * 60);
    
    return revertableActions.includes(log.action) && hoursSince <= 24 && !log.reverted;
  };

  const handleRevert = async (log) => {
    if (!canRevert(log)) return;
    
    if (!window.confirm(`Are you sure you want to revert this action: ${log.description}?`)) {
      return;
    }

    try {
      // Mark as reverted
      await updateDoc(doc(db, 'history_logs', log.id), {
        reverted: true,
        revertedAt: new Date(),
        revertedBy: 'Admin' // You can get current user email here
      });

      // Create revert log entry
      await addDoc(collection(db, 'history_logs'), {
        action: 'REVERT_ACTION',
        description: `Reverted action: ${log.description}`,
        user: 'Admin', // You can get current user email here
        timestamp: new Date(),
        originalLogId: log.id,
        targetId: log.targetId,
        targetType: log.targetType,
        targetName: log.targetName
      });

      fetchLogs();
      alert('Action reverted successfully. Note: This only marks the action as reverted in history. Manual data restoration may be required.');
    } catch (error) {
      console.error('Error reverting action:', error);
      alert('Failed to revert action');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">歷史記錄</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          查看所有系統操作記錄（保留30天）
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow mb-6 p-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              搜尋
            </label>
            <div className="relative">
              <MagnifyingGlassIcon className="h-5 w-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                placeholder="搜尋操作記錄..."
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              操作類型
            </label>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              <option value="">全部操作</option>
              {uniqueActions.map((action) => (
                <option key={action} value={action}>
                  {action.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              操作用戶
            </label>
            <select
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              <option value="">全部用戶</option>
              {uniqueUsers.map((user) => (
                <option key={user} value={user}>
                  {user}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              日期
            </label>
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </div>

          <div className="flex items-end">
            <button
              onClick={() => {
                setSearchTerm('');
                setActionFilter('');
                setUserFilter('');
                setDateFilter('');
              }}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 bg-white dark:bg-gray-700"
            >
              清除篩選
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="flex items-center">
            <ClockIcon className="h-8 w-8 text-blue-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">總記錄數</p>
              <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{logs.length}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="flex items-center">
            <InformationCircleIcon className="h-8 w-8 text-green-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">今日操作</p>
              <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
                {logs.filter(log => {
                  const logDate = log.timestamp?.toDate ? log.timestamp.toDate() : new Date(log.timestamp);
                  return logDate.toDateString() === new Date().toDateString();
                }).length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="flex items-center">
            <UserIcon className="h-8 w-8 text-purple-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">活躍用戶</p>
              <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{uniqueUsers.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="flex items-center">
            <ArrowPathIcon className="h-8 w-8 text-orange-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">可撤銷操作</p>
              <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
                {logs.filter(log => canRevert(log)).length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* History List */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">
            操作記錄 ({filteredLogs.length})
          </h2>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="text-center py-12">
            <ClockIcon className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
            <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">沒有找到記錄</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              請調整搜尋或篩選條件。
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    時間
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    操作
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    描述
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    用戶
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    對象
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {filteredLogs.map((log) => {
                  const ActionIcon = getActionIcon(log.action);
                  const actionColor = getActionColor(log.action);
                  
                  return (
                    <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {formatTimestamp(log.timestamp)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className={`flex-shrink-0 p-2 rounded-full ${actionColor}`}>
                            <ActionIcon className="h-4 w-4" />
                          </div>
                          <div className="ml-3">
                            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              {log.action.replace(/_/g, ' ')}
                            </div>
                            {log.reverted && (
                              <div className="text-xs text-red-600 dark:text-red-400">
                                已撤銷
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100">
                        <div className="max-w-xs truncate" title={log.description}>
                          {log.description}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {log.user || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {log.targetName || log.targetId || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex space-x-2">
                          <button
                            onClick={() => openLogModal(log)}
                            className="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300"
                            title="查看詳情"
                          >
                            <EyeIcon className="h-4 w-4" />
                          </button>
                          {canRevert(log) && (
                            <button
                              onClick={() => handleRevert(log)}
                              className="text-orange-600 dark:text-orange-400 hover:text-orange-900 dark:hover:text-orange-300"
                              title="撤銷操作"
                            >
                              <ArrowPathIcon className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Log Detail Modal */}
      <Modal
        isOpen={showLogModal}
        onClose={() => setShowLogModal(false)}
        title="操作記錄詳情"
        size="max-w-2xl"
      >
        {selectedLog && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">操作類型</label>
                <p className="text-sm text-gray-900">{selectedLog.action.replace(/_/g, ' ')}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">時間</label>
                <p className="text-sm text-gray-900">{formatTimestamp(selectedLog.timestamp)}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">用戶</label>
                <p className="text-sm text-gray-900">{selectedLog.user || '-'}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">對象類型</label>
                <p className="text-sm text-gray-900">{selectedLog.targetType || '-'}</p>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
              <p className="text-sm text-gray-900 bg-gray-50 p-3 rounded-md">{selectedLog.description}</p>
            </div>

            {selectedLog.oldData && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">舊數據</label>
                <pre className="text-xs text-gray-900 bg-gray-50 p-3 rounded-md overflow-auto max-h-32">
                  {JSON.stringify(selectedLog.oldData, null, 2)}
                </pre>
              </div>
            )}

            {selectedLog.newData && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">新數據</label>
                <pre className="text-xs text-gray-900 bg-gray-50 p-3 rounded-md overflow-auto max-h-32">
                  {JSON.stringify(selectedLog.newData, null, 2)}
                </pre>
              </div>
            )}

            {selectedLog.reverted && (
              <div className="bg-red-50 border border-red-200 rounded-md p-4">
                <div className="flex">
                  <XCircleIcon className="h-5 w-5 text-red-400" />
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-800">操作已撤銷</h3>
                    <div className="mt-2 text-sm text-red-700">
                      <p>撤銷時間: {formatTimestamp(selectedLog.revertedAt)}</p>
                      <p>撤銷用戶: {selectedLog.revertedBy}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
} 