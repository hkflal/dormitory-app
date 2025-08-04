import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { 
  PlusIcon, 
  PencilIcon, 
  TrashIcon,
  UserGroupIcon,
  MagnifyingGlassIcon,
  ListBulletIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  InformationCircleIcon,
  UserIcon,
  BuildingOfficeIcon,
  PhoneIcon,
  CalendarDaysIcon,
  Squares2X2Icon
} from '@heroicons/react/24/outline';
import Modal from '../components/Modal';
import { 
  logEmployeeCreate, 
  logEmployeeUpdate, 
  logEmployeeDelete 
} from '../lib/historyLogger';
import {
  EMPLOYEE_STATUSES,
  STATUS_CONFIG,
  getStatusBadge,
  updateEmployeeStatus,
  validateDepartureDate
} from '../lib/employeeStatusManager';
import {
  getActiveEmployees,
  getResignedEmployees,
  filterEmployees,
  sortEmployees
} from '../lib/employeeFilters';

export default function Employees() {
  const [employees, setEmployees] = useState([]);
  const [properties, setProperties] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [filteredEmployees, setFilteredEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [groupBy, setGroupBy] = useState('none');
  const [showMobileTips, setShowMobileTips] = useState(false);
  const [showResigned, setShowResigned] = useState(false);

  // Form state for adding/editing employee
  const [employeeForm, setEmployeeForm] = useState({
    name: '',
    arrival_at: '',
    gender: 'male',
    company: '',
    assigned_property_id: '',
    assigned_room_name: '',
    status: 'pending_assignment',
    contact_info: '',
    notes: '',
    departure_date: '',
    departure_reason: '',
  });

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [employees, searchTerm, statusFilter, companyFilter, showResigned]);

  const fetchData = async () => {
    try {
      const [employeesSnapshot, propertiesSnapshot, invoicesSnapshot] = await Promise.all([
        getDocs(collection(db, 'employees')),
        getDocs(collection(db, 'properties')),
        getDocs(collection(db, 'invoices'))
      ]);

      const employeesData = employeesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const propertiesData = propertiesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const invoicesData = invoicesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      setEmployees(employeesData);
      setProperties(propertiesData);
      setInvoices(invoicesData);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getPropertyName = (propertyId) => {
    if (!propertyId) return null;
    const property = properties.find(p => p.id === propertyId);
    return property ? property.name : propertyId;
  };

  // Check if employee has paid invoice covering next month's 1st day
  const hasCurrentMonthPayment = (employee, invoices) => {
    const today = new Date();
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1); // 1st of next month
    
    return invoices.some(inv => {
      // Skip deposit records - check multiple indicators
      const isDepositRecord = (
        // Check if description/title contains deposit keywords
        (inv.description && inv.description.toLowerCase().includes('deposit')) ||
        (inv.title && inv.title.toLowerCase().includes('deposit')) ||
        (inv.description && inv.description.includes('按金')) ||
        (inv.title && inv.title.includes('按金')) ||
        // Check if type field indicates deposit
        (inv.type && inv.type.toLowerCase() === 'deposit') ||
        (inv.invoice_type && inv.invoice_type.toLowerCase() === 'deposit')
      );
      
      if (isDepositRecord) {
        return false;
      }
      
      // Check if invoice belongs to this employee
      const isEmployeeInvoice = inv.employeeId === employee.id || 
                              inv.employee_id === employee.id ||
                              inv.employeeName === employee.name ||
                              (inv.employee_names && inv.employee_names.includes(employee.name));
      
      if (!isEmployeeInvoice || inv.status !== 'paid') return false;
      
      // Check if invoice covers 1st of next month
      if (inv.start_date && inv.end_date) {
        const startDate = inv.start_date?.toDate ? inv.start_date.toDate() : new Date(inv.start_date);
        const endDate = inv.end_date?.toDate ? inv.end_date.toDate() : new Date(inv.end_date);
        
        // Invoice covers next month's 1st if start_date <= next_month_1st <= end_date
        return startDate <= nextMonth && endDate >= nextMonth;
      }
      
      return false;
    });
  };

  // Get current month name in Chinese
  const getCurrentMonthName = () => {
    const monthNames = ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"];
    const today = new Date();
    return monthNames[today.getMonth()];
  };

  const getPropertyCapacity = (propertyName) => {
    const property = properties.find(p => p.name === propertyName);
    if (!property) return 0;
    // Use stored capacity or calculate from room capacities
    return property.capacity || property.static_room_capacity ||
           (property.rooms ? property.rooms.reduce((sum, room) => sum + (room.capacity || 0), 0) : 0);
  };

  // For property grouping, calculate housed employees for accurate occupancy
  const getGroupOccupancy = (groupKey, groupEmployees) => {
    if (groupBy === 'property') {
      return groupEmployees.filter(emp => emp.status === 'housed').length;
    }
    return groupEmployees.length;
  };

  const calculateEmployeeStatus = (employeeData) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Check if employee is assigned to a property
    const hasPropertyAssignment = employeeData.assigned_property_id && employeeData.assigned_property_id !== '';
    
    // Parse arrival date
    let arrivalDate = null;
    if (employeeData.arrival_at) {
      if (employeeData.arrival_at instanceof Date) {
        arrivalDate = new Date(employeeData.arrival_at);
      } else if (employeeData.arrival_at.seconds) {
        // Firestore Timestamp
        arrivalDate = new Date(employeeData.arrival_at.seconds * 1000);
      } else if (typeof employeeData.arrival_at === 'string') {
        arrivalDate = new Date(employeeData.arrival_at);
      }
      arrivalDate.setHours(0, 0, 0, 0);
    }
    
    // Calculate status based on assignment and arrival
    if (!hasPropertyAssignment) {
      return 'pending_assignment'; // 待分配
    } else if (arrivalDate && arrivalDate <= today) {
      return 'housed'; // 已入住
    } else {
      return 'pending'; // 未入住
    }
  };

  const getUniqueCompanies = () => {
    return [...new Set(employees.map(e => e.company).filter(Boolean))].sort();
  };

  const applyFilters = () => {
    // Use the new filtering function from employeeFilters.js
    const filters = {
      search: searchTerm,
      statuses: statusFilter ? [statusFilter] : [],
      company: companyFilter,
      showResigned: showResigned
    };

    const filtered = filterEmployees(employees, filters);
    setFilteredEmployees(filtered);
  };

  const getGroupedEmployees = () => {
    if (groupBy === 'none') {
      return { 'All Employees': filteredEmployees };
    }

    const grouped = filteredEmployees.reduce((acc, employee) => {
      let groupKey;
      switch(groupBy) {
        case 'company':
          groupKey = employee.company || '未指定公司';
          break;
        case 'property':
          groupKey = getPropertyName(employee.assigned_property_id) || '未分配物業';
          break;
        case 'arrival':
          if (employee.arrival_at) {
            const date = employee.arrival_at.toDate ? employee.arrival_at.toDate() : new Date(employee.arrival_at);
            groupKey = !isNaN(date) ? `${date.getFullYear()}年${date.getMonth() + 1}月` : '無效日期';
          } else {
            groupKey = '未指定到達日期';
          }
          break;
        default:
          groupKey = 'Uncategorized';
      }
      
      if (!acc[groupKey]) {
        acc[groupKey] = [];
      }
      acc[groupKey].push(employee);
      return acc;
    }, {});

    return Object.fromEntries(Object.entries(grouped).sort(([keyA], [keyB]) => keyA.localeCompare(keyB)));
  };

  const resetForm = () => {
    setEmployeeForm({
      name: '',
      arrival_at: '',
      gender: 'male',
      company: '',
      assigned_property_id: '',
      assigned_room_name: '',
      status: 'pending_assignment',
      contact_info: '',
      notes: '',
    });
  };

  const handleAddEmployee = async (e) => {
    e.preventDefault();
    
    // Validate departure date for resignation statuses
    if (employeeForm.status === 'pending_resign' || employeeForm.status === 'resigned') {
      if (!employeeForm.departure_date) {
        alert('請輸入離職日期');
        return;
      }
      
      const departureDate = new Date(employeeForm.departure_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if (employeeForm.status === 'pending_resign' && departureDate <= today) {
        alert('即將離職的員工必須設定未來的離職日期');
        return;
      }
    }
    
    try {
      const data = {
        ...employeeForm,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      if (data.arrival_at) {
        data.arrival_at = new Date(data.arrival_at);
      }
      
      if (data.departure_date) {
        data.departure_date = new Date(data.departure_date);
      }
      
      // Only auto-calculate status for non-resignation statuses
      if (data.status !== 'pending_resign' && data.status !== 'resigned') {
        data.status = calculateEmployeeStatus(data);
      }
      
      const docRef = await addDoc(collection(db, 'employees'), data);
      await logEmployeeCreate(docRef.id, data);
      fetchData();
      setShowAddModal(false);
    } catch (error) {
      console.error('Error adding employee:', error);
    }
  };

  const handleEditEmployee = async (e) => {
    e.preventDefault();
    if (!editingEmployee) return;
    
    // Validate departure date for resignation statuses
    if (employeeForm.status === 'pending_resign' || employeeForm.status === 'resigned') {
      if (!employeeForm.departure_date) {
        alert('請輸入離職日期');
        return;
      }
      
      const departureDate = new Date(employeeForm.departure_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if (employeeForm.status === 'pending_resign' && departureDate <= today) {
        alert('即將離職的員工必須設定未來的離職日期');
        return;
      }
    }
    
    try {
      const updatedData = { 
        ...employeeForm, 
        updatedAt: new Date() 
      };
      
      if (updatedData.arrival_at) {
        updatedData.arrival_at = new Date(updatedData.arrival_at);
      }
      
      if (updatedData.departure_date) {
        updatedData.departure_date = new Date(updatedData.departure_date);
      }
      
      // Only auto-calculate status for non-resignation statuses
      if (updatedData.status !== 'pending_resign' && updatedData.status !== 'resigned') {
        updatedData.status = calculateEmployeeStatus(updatedData);
      }
      
      await updateDoc(doc(db, 'employees', editingEmployee.id), updatedData);
      await logEmployeeUpdate(editingEmployee.id, editingEmployee, updatedData);
      fetchData();
      setShowEditModal(false);
    } catch (error) {
      console.error('Error updating employee:', error);
    }
  };

  const handleDeleteEmployee = async (employeeId) => {
    if (window.confirm('確定要刪除這名員工嗎？')) {
      try {
        const toDelete = employees.find(e => e.id === employeeId);
        await deleteDoc(doc(db, 'employees', employeeId));
        await logEmployeeDelete(employeeId, toDelete);
        fetchData();
      } catch (error) {
        console.error('Error deleting employee:', error);
      }
    }
  };

  const openEditModal = (employee) => {
    const arrivalDate = employee.arrival_at?.toDate ? employee.arrival_at.toDate() : new Date(employee.arrival_at);
    const departureDate = employee.departure_date?.toDate ? employee.departure_date.toDate() : (employee.departure_date ? new Date(employee.departure_date) : null);
    
    setEditingEmployee(employee);
    setEmployeeForm({
      name: employee.name || '',
      arrival_at: employee.arrival_at && !isNaN(arrivalDate) ? arrivalDate.toISOString().split('T')[0] : '',
      gender: employee.gender || 'male',
      company: employee.company || '',
      assigned_property_id: employee.assigned_property_id || '',
      assigned_room_name: employee.assigned_room_name || '',
      status: employee.status || 'pending_assignment',
      contact_info: employee.contact_info || '',
      notes: employee.notes || '',
      departure_date: departureDate && !isNaN(departureDate) ? departureDate.toISOString().split('T')[0] : '',
      departure_reason: employee.departure_reason || '',
    });
    setShowEditModal(true);
  };
  
  const getStatusBadge = (status) => {
    const config = {
      pending_assignment: { bg: 'bg-yellow-100 dark:bg-yellow-900/20', text: 'text-yellow-800 dark:text-yellow-400', label: '待分配' },
      housed: { bg: 'bg-green-100 dark:bg-green-900/20', text: 'text-green-800 dark:text-green-400', label: '已入住' },
      terminated: { bg: 'bg-gray-100 dark:bg-gray-900/20', text: 'text-gray-800 dark:text-gray-400', label: '已終止' },
      pending: { bg: 'bg-blue-100 dark:bg-blue-900/20', text: 'text-blue-800 dark:text-blue-400', label: '未入住' },
      pending_resign: { bg: 'bg-orange-100 dark:bg-orange-900/20', text: 'text-orange-800 dark:text-orange-400', label: '即將離職' },
      resigned: { bg: 'bg-red-100 dark:bg-red-900/20', text: 'text-red-800 dark:text-red-400', label: '已離職' }
    }[status] || { bg: 'bg-gray-100', text: 'text-gray-800', label: '未知' };
    return <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${config.bg} ${config.text}`}>{config.label}</span>;
  };

  if (loading) return <div className="flex items-center justify-center h-screen"><div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div></div>;

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-8 py-4 sm:py-6">
      <div className="mb-6 bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">員工管理</h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">管理所有員工資料，快速篩選與查詢。</p>
            </div>
            <button onClick={() => { resetForm(); setShowAddModal(true); }} className="bg-primary-600 hover:bg-primary-700 text-white px-6 py-3 sm:px-4 sm:py-2 rounded-lg flex items-center justify-center space-x-2 font-medium min-h-[44px] transition-colors active:bg-primary-800">
                <PlusIcon className="h-5 w-5" />
                <span>新增員工</span>
            </button>
          </div>
      </div>
      
      {/* Filters are now always visible */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow mb-6 p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center"><MagnifyingGlassIcon className="h-5 w-5 mr-2" />搜尋與篩選</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" placeholder="搜尋姓名、公司等..."/>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
            <option value="">所有狀態</option>
            <option value="pending_assignment">待分配</option>
            <option value="pending">未入住</option>
            <option value="housed">已入住</option>
            <option value="terminated">已終止</option>
            <option value="pending_resign">即將離職</option>
            <option value="resigned">已離職</option>
          </select>
          <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)} className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
            <option value="">所有公司</option>
            {getUniqueCompanies().map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className="flex items-center">
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={showResigned}
                onChange={(e) => setShowResigned(e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">顯示已離職員工</span>
            </label>
          </div>
        </div>
      </div>

      <div className="mb-6 bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">分組方式:</span>
            <button onClick={() => setGroupBy('none')} className={`flex items-center space-x-1 px-4 py-2 text-sm font-medium rounded-lg transition-colors min-h-[44px] ${groupBy === 'none' ? 'bg-primary-600 text-white shadow-md' : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border'}`}>無</button>
            <button onClick={() => setGroupBy('company')} className={`flex items-center space-x-1 px-4 py-2 text-sm font-medium rounded-lg transition-colors min-h-[44px] ${groupBy === 'company' ? 'bg-primary-600 text-white shadow-md' : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border'}`}><Squares2X2Icon className="h-4 w-4 mr-1"/><span>公司</span></button>
            <button onClick={() => setGroupBy('property')} className={`flex items-center space-x-1 px-4 py-2 text-sm font-medium rounded-lg transition-colors min-h-[44px] ${groupBy === 'property' ? 'bg-primary-600 text-white shadow-md' : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border'}`}><BuildingOfficeIcon className="h-4 w-4 mr-1"/><span>物業</span></button>
            <button onClick={() => setGroupBy('arrival')} className={`flex items-center space-x-1 px-4 py-2 text-sm font-medium rounded-lg transition-colors min-h-[44px] ${groupBy === 'arrival' ? 'bg-primary-600 text-white shadow-md' : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border'}`}><CalendarDaysIcon className="h-4 w-4 mr-1"/><span>到達月份</span></button>
        </div>
      </div>

      <div className="space-y-6">
        {(() => {
          const grouped = getGroupedEmployees();
          const keys = Object.keys(grouped);
          if (filteredEmployees.length === 0) return <div className="text-center py-12"><UserGroupIcon className="mx-auto h-12 w-12 text-gray-400" /><h3 className="mt-2 text-lg font-medium text-gray-900 dark:text-gray-100">找不到員工</h3><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">請調整搜尋或篩選條件。</p></div>;
          
          return keys.map(key => (
            <div key={key} className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
              <div className="px-4 sm:px-6 py-4 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">{key} <span className={`px-3 py-1 text-sm rounded-full ${
                  groupBy === 'property' && getGroupOccupancy(key, grouped[key]) >= getPropertyCapacity(key) 
                    ? 'bg-red-200 dark:bg-red-700 text-red-800 dark:text-red-200' 
                    : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300'
                }`}>{groupBy === 'property' ? `${getGroupOccupancy(key, grouped[key])}/${getPropertyCapacity(key)}` : grouped[key].length}</span></h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">姓名</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">UID</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">公司</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">狀態</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">分配情況</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">到達日期</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">操作</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {grouped[key].map(employee => (
                      <tr key={employee.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center space-x-2">
                            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{employee.name || 'N/A'}</div>
                            {hasCurrentMonthPayment(employee, invoices) && (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                                {getCurrentMonthName()}已付
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className={`text-xs font-mono text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded border-2 ${
                            employee.gender === 'female' ? 'border-pink-300 dark:border-pink-500 shadow-lg shadow-pink-200 dark:shadow-pink-800' : 
                            'border-blue-300 dark:border-blue-500 shadow-lg shadow-blue-200 dark:shadow-blue-800'
                          }`}>
                            {employee.uid || employee.id}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap"><div className="text-sm text-gray-500 dark:text-gray-400">{employee.company || 'N/A'}</div></td>
                        <td className="px-6 py-4 whitespace-nowrap">{getStatusBadge(employee.status)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{getPropertyName(employee.assigned_property_id) || '未分配'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {employee.arrival_at ? 
                            (employee.arrival_at.toDate ? employee.arrival_at.toDate().toLocaleDateString() : new Date(employee.arrival_at).toLocaleDateString())
                            : 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <button onClick={() => openEditModal(employee)} className="text-primary-600 hover:text-primary-900 p-2"><PencilIcon className="h-5 w-5"/></button>
                          <button onClick={() => handleDeleteEmployee(employee.id)} className="text-red-600 hover:text-red-900 p-2"><TrashIcon className="h-5 w-5"/></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ));
        })()}
      </div>

      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="新增員工">
        <EmployeeForm employeeForm={employeeForm} setEmployeeForm={setEmployeeForm} onSubmit={handleAddEmployee} onCancel={() => setShowAddModal(false)} submitLabel="新增員工" properties={properties} />
      </Modal>
      <Modal isOpen={showEditModal} onClose={() => setShowEditModal(false)} title="編輯員工">
        <EmployeeForm employeeForm={employeeForm} setEmployeeForm={setEmployeeForm} onSubmit={handleEditEmployee} onCancel={() => setShowEditModal(false)} submitLabel="更新員工" properties={properties} />
      </Modal>
    </div>
  );
}

function EmployeeForm({ employeeForm, setEmployeeForm, onSubmit, onCancel, submitLabel, properties }) {
  const handleInputChange = (e) => {
    const { id, value } = e.target;
    setEmployeeForm(prev => ({ ...prev, [id]: value }));
  };

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="grid grid-cols-1 gap-y-4 gap-x-4 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">姓名</label>
          <input type="text" id="name" value={employeeForm.name} onChange={handleInputChange} className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600"/>
        </div>
        <div>
          <label htmlFor="company" className="block text-sm font-medium text-gray-700 dark:text-gray-300">公司</label>
          <input type="text" id="company" value={employeeForm.company} onChange={handleInputChange} className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600"/>
        </div>
        <div>
          <label htmlFor="gender" className="block text-sm font-medium text-gray-700 dark:text-gray-300">性別</label>
          <select id="gender" value={employeeForm.gender} onChange={handleInputChange} className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600">
            <option value="male">男</option>
            <option value="female">女</option>
          </select>
        </div>
        <div>
          <label htmlFor="status" className="block text-sm font-medium text-gray-700 dark:text-gray-300">狀態</label>
          <select id="status" value={employeeForm.status} onChange={handleInputChange} className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600">
            <option value="pending_assignment">待分配</option>
            <option value="pending">未入住</option>
            <option value="housed">已入住</option>
            <option value="terminated">已終止</option>
            <option value="pending_resign">即將離職</option>
            <option value="resigned">已離職</option>
          </select>
        </div>
        <div>
            <label htmlFor="assigned_property_id" className="block text-sm font-medium text-gray-700 dark:text-gray-300">分配物業</label>
            <select id="assigned_property_id" value={employeeForm.assigned_property_id} onChange={handleInputChange} className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600">
                <option value="">未分配</option>
                {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
        </div>
        <div>
          <label htmlFor="contact_info" className="block text-sm font-medium text-gray-700 dark:text-gray-300">聯絡方式</label>
          <input type="text" id="contact_info" value={employeeForm.contact_info} onChange={handleInputChange} className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600"/>
        </div>
        <div>
          <label htmlFor="arrival_at" className="block text-sm font-medium text-gray-700 dark:text-gray-300">入職日期</label>
          <input type="date" id="arrival_at" value={employeeForm.arrival_at} onChange={handleInputChange} className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600"/>
        </div>
        
        {/* Departure fields - only show for resignation statuses */}
        {(employeeForm.status === 'pending_resign' || employeeForm.status === 'resigned') && (
          <>
            <div>
              <label htmlFor="departure_date" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                {employeeForm.status === 'pending_resign' ? '預計離職日期' : '實際離職日期'}
              </label>
              <input 
                type="date" 
                id="departure_date" 
                value={employeeForm.departure_date || ''} 
                onChange={handleInputChange} 
                className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600"
                min={employeeForm.status === 'pending_resign' ? new Date().toISOString().split('T')[0] : undefined}
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {employeeForm.status === 'pending_resign' ? '必須為未來日期' : '員工實際離職的日期'}
              </p>
            </div>
            <div>
              <label htmlFor="departure_reason" className="block text-sm font-medium text-gray-700 dark:text-gray-300">離職原因 (選填)</label>
              <input 
                type="text" 
                id="departure_reason" 
                value={employeeForm.departure_reason || ''} 
                onChange={handleInputChange} 
                placeholder="例：合約到期、個人因素等..."
                className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600"
              />
            </div>
          </>
        )}
        
        <div className="sm:col-span-2">
          <label htmlFor="notes" className="block text-sm font-medium text-gray-700 dark:text-gray-300">備註</label>
          <textarea id="notes" value={employeeForm.notes} onChange={handleInputChange} rows={3} className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600"></textarea>
        </div>
      </div>
      <div className="pt-5">
        <div className="flex justify-end">
          <button type="button" onClick={onCancel} className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-600">取消</button>
          <button type="submit" className="ml-3 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">{submitLabel}</button>
        </div>
      </div>
    </form>
  );
}