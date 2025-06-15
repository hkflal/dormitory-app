import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { 
  PlusIcon, 
  PencilIcon, 
  TrashIcon,
  UserGroupIcon,
  MagnifyingGlassIcon,
  DocumentTextIcon,
  Squares2X2Icon,
  ListBulletIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  InformationCircleIcon,
  UserIcon,
  BuildingOfficeIcon,
  PhoneIcon,
  EyeIcon
} from '@heroicons/react/24/outline';
import Modal from '../components/Modal';
import { 
  logEmployeeCreate, 
  logEmployeeUpdate, 
  logEmployeeDelete 
} from '../lib/historyLogger';
import { startOfDay } from 'date-fns';

export default function Employees() {
  const [employees, setEmployees] = useState([]);
  const [properties, setProperties] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [filteredEmployees, setFilteredEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showInvoiceDetailModal, setShowInvoiceDetailModal] = useState(false);
  const [selectedInvoiceForDetail, setSelectedInvoiceForDetail] = useState(null);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [selectedEmployeeForInvoice, setSelectedEmployeeForInvoice] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [groupBy, setGroupBy] = useState('none');
  const [showMobileTips, setShowMobileTips] = useState(false);
  const [viewMode, setViewMode] = useState('cards'); // 'cards' or 'table'

  // Form state for adding/editing employee
  const [employeeForm, setEmployeeForm] = useState({
    name: '',
    arrival_time: '',
    gender: 'male',
    company: '',
    assigned_property_id: '',
    assigned_room_name: '',
    status: 'pending_assignment',
    contact_info: '',
    notes: '',
    linked_invoices: []
  });

  // ... existing useEffect and functions remain the same ...
  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [employees, searchTerm, statusFilter, companyFilter]);

  const fetchData = async () => {
    try {
      // Fetch employees
      const employeesRef = collection(db, 'employees');
      const employeesSnapshot = await getDocs(employeesRef);
      const employeesData = employeesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Fetch properties
      const propertiesRef = collection(db, 'properties');
      const propertiesSnapshot = await getDocs(propertiesRef);
      const propertiesData = propertiesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Fetch invoices
      const invoicesRef = collection(db, 'invoices');
      const invoicesSnapshot = await getDocs(invoicesRef);
      let invoicesData = invoicesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Auto-update invoice statuses
      const today = startOfDay(new Date());
      const batch = writeBatch(db);
      let updatesMade = 0;

      invoicesData = invoicesData.map(invoice => {
        const startDate = invoice.start_date?.toDate ? invoice.start_date.toDate() : new Date(invoice.start_date || null);
        
        if (startDate && startDate < today && invoice.status !== 'paid') {
          console.log(`Employee Page: Invoice ${invoice.invoice_number} has start date before today. Auto-updating status to 'paid'.`);
          
          const invoiceRef = doc(db, 'invoices', invoice.id);
          batch.update(invoiceRef, { status: 'paid', lastUpdated: new Date() });
          updatesMade++;
          
          return { ...invoice, status: 'paid' };
        }
        
        return invoice;
      });
      
      if (updatesMade > 0) {
        console.log(`Employee Page: Committing ${updatesMade} status updates to the database...`);
        await batch.commit();
        console.log("Employee Page: Database updated successfully.");
      }

      setEmployees(employeesData);
      setProperties(propertiesData);
      setInvoices(invoicesData);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching data:', error);
      setLoading(false);
    }
  };

  const getPropertyName = (propertyId) => {
    if (!propertyId) return null;
    const property = properties.find(p => p.id === propertyId);
    return property ? property.name : propertyId;
  };

  const getUniqueCompanies = () => {
    const companies = employees
      .map(emp => emp.company)
      .filter(company => company && company.trim() !== '')
      .filter((company, index, array) => array.indexOf(company) === index)
      .sort();
    return companies;
  };

  const applyFilters = () => {
    let filtered = [...employees];

    if (searchTerm) {
      filtered = filtered.filter(emp => 
        emp.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.company?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.contact_info?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        getPropertyName(emp.assigned_property_id)?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (statusFilter) {
      filtered = filtered.filter(emp => emp.status === statusFilter);
    }

    if (companyFilter) {
      filtered = filtered.filter(emp => emp.company === companyFilter);
    }

    setFilteredEmployees(filtered);
  };

  const getGroupedEmployees = () => {
    if (groupBy === 'none') {
      return { '': filteredEmployees };
    }

    const grouped = {};
    
    filteredEmployees.forEach(employee => {
      let groupKey = '';
      
      if (groupBy === 'company') {
        groupKey = employee.company || '未指定公司';
      } else if (groupBy === 'property') {
        groupKey = getPropertyName(employee.assigned_property_id) || '未分配物業';
      }
      
      if (!grouped[groupKey]) {
        grouped[groupKey] = [];
      }
      grouped[groupKey].push(employee);
    });

    const sortedKeys = Object.keys(grouped).sort((a, b) => {
      if (a.includes('未') && !b.includes('未')) return 1;
      if (!a.includes('未') && b.includes('未')) return -1;
      return a.localeCompare(b);
    });

    const sortedGrouped = {};
    sortedKeys.forEach(key => {
      sortedGrouped[key] = grouped[key];
    });

    return sortedGrouped;
  };

  const resetForm = () => {
    setEmployeeForm({
      name: '',
      arrival_time: '',
      gender: 'male',
      company: '',
      assigned_property_id: '',
      assigned_room_name: '',
      status: 'pending_assignment',
      contact_info: '',
      notes: '',
      linked_invoices: []
    });
  };

  const handleAddEmployee = async (e) => {
    e.preventDefault();
    try {
      const docRef = await addDoc(collection(db, 'employees'), {
        ...employeeForm,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      await logEmployeeCreate(docRef.id, employeeForm);
      await fetchData();
      setShowAddModal(false);
      resetForm();
    } catch (error) {
      console.error('Error adding employee:', error);
    }
  };

  const handleEditEmployee = async (e) => {
    e.preventDefault();
    try {
      const employeeRef = doc(db, 'employees', editingEmployee.id);
      await updateDoc(employeeRef, {
        ...employeeForm,
        updatedAt: new Date()
      });
      
      await logEmployeeUpdate(editingEmployee.id, editingEmployee, employeeForm);
      await fetchData();
      setShowEditModal(false);
      setEditingEmployee(null);
      resetForm();
    } catch (error) {
      console.error('Error updating employee:', error);
    }
  };

  const handleDeleteEmployee = async (employeeId) => {
    if (window.confirm('確定要刪除這名員工嗎？')) {
      try {
        const employeeToDelete = employees.find(emp => emp.id === employeeId);
        await deleteDoc(doc(db, 'employees', employeeId));
        
        await logEmployeeDelete(employeeId, employeeToDelete);
        await fetchData();
      } catch (error) {
        console.error('Error deleting employee:', error);
      }
    }
  };

  const openEditModal = (employee) => {
    setEditingEmployee(employee);
    setEmployeeForm({
      name: employee.name || '',
      arrival_time: employee.arrival_time || '',
      gender: employee.gender || 'male',
      company: employee.company || '',
      assigned_property_id: employee.assigned_property_id || '',
      assigned_room_name: employee.assigned_room_name || '',
      status: employee.status || 'pending_assignment',
      contact_info: employee.contact_info || '',
      notes: employee.notes || '',
      linked_invoices: employee.linked_invoices || []
    });
    setShowEditModal(true);
  };

  const openInvoiceModal = (employee) => {
    setSelectedEmployeeForInvoice(employee);
    setShowInvoiceModal(true);
  };

  const openInvoiceDetailModal = (invoice) => {
    setSelectedInvoiceForDetail(invoice);
    setShowInvoiceDetailModal(true);
  };

  const getEmployeeInvoices = (employeeId) => {
    return invoices.filter(invoice => {
      if (invoice.linked_employee_ids && Array.isArray(invoice.linked_employee_ids)) {
        return invoice.linked_employee_ids.includes(employeeId);
      }
      return false;
    });
  };

  const linkInvoiceToEmployee = async (employeeId, invoiceId, action = 'link') => {
    try {
      const invoiceRef = doc(db, 'invoices', invoiceId);
      const invoice = invoices.find(inv => inv.id === invoiceId);
      
      let updatedLinkedEmployees = invoice.linked_employee_ids || [];
      
      if (action === 'link') {
        if (!updatedLinkedEmployees.includes(employeeId)) {
          updatedLinkedEmployees.push(employeeId);
        }
      } else if (action === 'unlink') {
        updatedLinkedEmployees = updatedLinkedEmployees.filter(id => id !== employeeId);
      }
      
      await updateDoc(invoiceRef, {
        linked_employee_ids: updatedLinkedEmployees,
        updatedAt: new Date()
      });
      
      await fetchData();
    } catch (error) {
      console.error('Error linking/unlinking invoice:', error);
    }
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      'pending_assignment': { bg: 'bg-yellow-100 dark:bg-yellow-900/20', text: 'text-yellow-800 dark:text-yellow-400', label: '待分配' },
      'housed': { bg: 'bg-green-100 dark:bg-green-900/20', text: 'text-green-800 dark:text-green-400', label: '已入住' },
      'departed': { bg: 'bg-gray-100 dark:bg-gray-900/20', text: 'text-gray-800 dark:text-gray-400', label: '已離開' },
      'active': { bg: 'bg-blue-100 dark:bg-blue-900/20', text: 'text-blue-800 dark:text-blue-400', label: '活躍' }
    };
    
    const config = statusConfig[status] || statusConfig['pending_assignment'];
    
    return (
      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${config.bg} ${config.text}`}>
        {config.label}
      </span>
    );
  };

  const getGenderBadge = (gender) => {
    if (gender === 'female') {
      return <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-pink-100 dark:bg-pink-900/20 text-pink-800 dark:text-pink-400">女性</span>;
    }
    return <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-400">男性</span>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-8 py-4 sm:py-6">
      {/* Mobile-First Header */}
      <div className="mb-6 bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
        <div className="flex flex-col space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center">
                <UserGroupIcon className="h-6 w-6 sm:h-8 sm:w-8 mr-3" />
                員工管理
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                管理員工記錄及分配 ({filteredEmployees.length} 名員工)
              </p>
            </div>
            <button
              onClick={() => {
                resetForm();
                setShowAddModal(true);
              }}
              className="bg-primary-600 hover:bg-primary-700 text-white px-6 py-3 sm:px-4 sm:py-2 rounded-lg flex items-center justify-center space-x-2 font-medium min-h-[44px] transition-colors active:bg-primary-800"
            >
              <PlusIcon className="h-5 w-5" />
              <span>新增員工</span>
            </button>
          </div>
          
          {/* Context-Aware Mobile Help */}
          <div className="md:hidden">
            <button
              onClick={() => setShowMobileTips(!showMobileTips)}
              className="flex items-center space-x-1 text-blue-600 dark:text-blue-400 text-sm"
            >
              <InformationCircleIcon className="h-4 w-4" />
              <span>手機使用提示</span>
              {showMobileTips ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
            </button>
            {showMobileTips && (
              <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm text-blue-800 dark:text-blue-200">
                <ul className="space-y-1">
                  <li>• 點擊員工卡片查看完整資訊</li>
                  <li>• 使用篩選器快速找到特定員工</li>
                  <li>• 長按動作按鈕進行快速操作</li>
                  <li>• 滑動表格查看更多欄位</li>
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Enhanced Mobile-First Filters */}
      <details className="bg-white dark:bg-gray-800 rounded-lg shadow mb-6 overflow-hidden">
        <summary className="cursor-pointer p-4 sm:p-6 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center">
              <MagnifyingGlassIcon className="h-5 w-5 mr-2" />
              搜尋與篩選
            </h3>
            <ChevronDownIcon className="h-5 w-5 text-gray-500 transform transition-transform duration-200" />
          </div>
        </summary>
        
        <div className="p-4 sm:p-6 space-y-4">
          {/* Search Bar */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              搜尋員工
            </label>
            <div className="relative">
              <MagnifyingGlassIcon className="h-5 w-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                placeholder="搜尋姓名、公司、聯絡方式或物業..."
              />
            </div>
          </div>

          {/* Filter Chips - Mobile Optimized */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                狀態篩選
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setStatusFilter('')}
                  className={`px-4 py-2 text-sm font-medium rounded-full transition-colors min-h-[44px] ${
                    statusFilter === ''
                      ? 'bg-primary-600 text-white shadow-sm'
                      : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                  }`}
                >
                  所有狀態
                </button>
                <button
                  onClick={() => setStatusFilter('pending_assignment')}
                  className={`px-4 py-2 text-sm font-medium rounded-full transition-colors min-h-[44px] ${
                    statusFilter === 'pending_assignment'
                      ? 'bg-primary-600 text-white shadow-sm'
                      : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                  }`}
                >
                  待分配
                </button>
                <button
                  onClick={() => setStatusFilter('housed')}
                  className={`px-4 py-2 text-sm font-medium rounded-full transition-colors min-h-[44px] ${
                    statusFilter === 'housed'
                      ? 'bg-primary-600 text-white shadow-sm'
                      : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                  }`}
                >
                  已入住
                </button>
                <button
                  onClick={() => setStatusFilter('departed')}
                  className={`px-4 py-2 text-sm font-medium rounded-full transition-colors min-h-[44px] ${
                    statusFilter === 'departed'
                      ? 'bg-primary-600 text-white shadow-sm'
                      : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                  }`}
                >
                  已離開
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  公司篩選
                </label>
                <select
                  value={companyFilter}
                  onChange={(e) => setCompanyFilter(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  <option value="">所有公司</option>
                  {getUniqueCompanies().map((company) => (
                    <option key={company} value={company}>
                      {company}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-end">
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setStatusFilter('');
                    setCompanyFilter('');
                    setGroupBy('none');
                  }}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 bg-white dark:bg-gray-700 transition-colors min-h-[44px]"
                >
                  清除篩選
                </button>
              </div>
            </div>
          </div>
        </div>
      </details>

      {/* View Mode Toggle & Grouping */}
      <div className="mb-6 bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
          {/* View Mode Toggle */}
          <div className="flex items-center space-x-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
            <button
              onClick={() => setViewMode('cards')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-colors min-h-[44px] ${
                viewMode === 'cards'
                  ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
              }`}
            >
              <Squares2X2Icon className="h-4 w-4" />
              <span>卡片檢視</span>
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-colors min-h-[44px] ${
                viewMode === 'table'
                  ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
              }`}
            >
              <ListBulletIcon className="h-4 w-4" />
              <span>表格檢視</span>
            </button>
          </div>

          {/* Grouping Options */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setGroupBy('company')}
              className={`flex items-center space-x-1 px-4 py-2 text-sm font-medium rounded-lg transition-colors min-h-[44px] ${
                groupBy === 'company'
                  ? 'bg-primary-600 text-white shadow-md'
                  : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
              }`}
            >
              <Squares2X2Icon className="h-4 w-4" />
              <span>按公司分組</span>
            </button>
            <button
              onClick={() => setGroupBy('property')}
              className={`flex items-center space-x-1 px-4 py-2 text-sm font-medium rounded-lg transition-colors min-h-[44px] ${
                groupBy === 'property'
                  ? 'bg-primary-600 text-white shadow-md'
                  : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
              }`}
            >
              <BuildingOfficeIcon className="h-4 w-4" />
              <span>按物業分組</span>
            </button>
            {(groupBy === 'company' || groupBy === 'property') && (
              <button
                onClick={() => setGroupBy('none')}
                className="px-4 py-2 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors min-h-[44px]"
              >
                取消分組
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Employee List */}
      <div className="space-y-6">
        {(() => {
          const groupedEmployees = getGroupedEmployees();
          const groupKeys = Object.keys(groupedEmployees);

          if (filteredEmployees.length === 0) {
            return (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
                <div className="text-center py-12">
                  <UserGroupIcon className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
                  <h3 className="mt-2 text-lg font-medium text-gray-900 dark:text-gray-100">找不到員工</h3>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 mb-4">
                    {employees.length === 0 
                      ? "請先新增您的第一位員工。"
                      : "請調整搜尋或篩選條件。"
                    }
                  </p>
                  {employees.length === 0 && (
                    <button
                      onClick={() => {
                        resetForm();
                        setShowAddModal(true);
                      }}
                      className="bg-primary-600 hover:bg-primary-700 text-white px-6 py-3 rounded-lg font-medium min-h-[44px] transition-colors"
                    >
                      新增第一位員工
                    </button>
                  )}
                </div>
              </div>
            );
          }

          return groupKeys.map((groupKey, groupIndex) => {
            const employeesInGroup = groupedEmployees[groupKey];
            const isGrouped = groupBy !== 'none';

            return (
              <div key={groupKey || 'ungrouped'} className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                {isGrouped && (
                  <div className="px-4 sm:px-6 py-4 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                    <div className="flex items-center space-x-2">
                      {groupBy === 'company' ? (
                        <Squares2X2Icon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                      ) : (
                        <BuildingOfficeIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                      )}
                      <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                        {groupKey}
                      </h3>
                      <span className="bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 px-3 py-1 text-sm rounded-full">
                        {employeesInGroup.length}
                      </span>
                    </div>
                  </div>
                )}

                {!isGrouped && (
                  <div className="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                    <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                      員工列表 ({filteredEmployees.length})
                    </h2>
                  </div>
                )}

                {/* Render based on view mode */}
                {viewMode === 'cards' ? (
                  // Mobile-First Card View
                  <div className="p-4 sm:p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {employeesInGroup.map((employee) => (
                        <div key={employee.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg overflow-hidden transform hover:scale-105 transition-transform active:scale-95">
                          {/* Card Header */}
                          <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-gray-700 dark:to-gray-600 border-b border-gray-200 dark:border-gray-600">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center space-x-3">
                                <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full flex items-center justify-center">
                                  <UserIcon className="h-5 w-5 text-white" />
                                </div>
                                <div>
                                  <h4 className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate">
                                    {employee.name || '未命名員工'}
                                  </h4>
                                  <p className="text-sm text-gray-600 dark:text-gray-400">
                                    {employee.company || '未指定公司'}
                                  </p>
                                </div>
                              </div>
                              {getStatusBadge(employee.status)}
                            </div>
                          </div>

                          {/* Card Content */}
                          <div className="p-4 space-y-3">
                            {/* Basic Info */}
                            <div className="grid grid-cols-2 gap-3">
                              <div className="flex items-center space-x-2">
                                <span className="text-xs text-gray-500 dark:text-gray-400">性別:</span>
                                {getGenderBadge(employee.gender)}
                              </div>
                              {employee.contact_info && (
                                <div className="flex items-center space-x-2">
                                  <PhoneIcon className="h-4 w-4 text-gray-400" />
                                  <span className="text-sm text-gray-600 dark:text-gray-400 truncate">
                                    {employee.contact_info}
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Assignment Info */}
                            <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg">
                              {employee.assigned_property_id ? (
                                <div className="space-y-1">
                                  <div className="flex items-center space-x-2">
                                    <BuildingOfficeIcon className="h-4 w-4 text-blue-500" />
                                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                      {getPropertyName(employee.assigned_property_id)}
                                    </span>
                                  </div>
                                  {employee.assigned_room_name && (
                                    <p className="text-sm text-gray-600 dark:text-gray-400 ml-6">
                                      房間: {employee.assigned_room_name}
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <div className="text-center">
                                  <span className="text-sm text-orange-600 dark:text-orange-400 font-medium">未分配物業</span>
                                  {employee.arrival_time && (
                                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                                      到達: {employee.arrival_time.seconds ? 
                                        new Date(employee.arrival_time.seconds * 1000).toLocaleDateString('zh-HK') :
                                        new Date(employee.arrival_time).toLocaleDateString('zh-HK')
                                      }
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Invoice Info */}
                            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
                              {(() => {
                                const employeeInvoices = getEmployeeInvoices(employee.id);
                                if (employeeInvoices.length === 0) {
                                  return <span className="text-sm text-gray-500 dark:text-gray-400">無相關發票</span>;
                                }
                                
                                const sortedInvoices = employeeInvoices.sort((a, b) => {
                                  const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
                                  const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
                                  return dateB - dateA;
                                });
                                
                                const recentInvoice = sortedInvoices[0];
                                const totalAmount = employeeInvoices.reduce((sum, inv) => sum + (inv.amount || 0), 0);
                                const statusCounts = {
                                  paid: employeeInvoices.filter(inv => inv.status === 'paid').length,
                                  pending: employeeInvoices.filter(inv => inv.status === 'pending').length,
                                  overdue: employeeInvoices.filter(inv => inv.status === 'overdue').length,
                                  newly_signed: employeeInvoices.filter(inv => inv.status === 'newly_signed').length
                                };
                                
                                return (
                                  <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                      <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
                                        {employeeInvoices.length} 張發票
                                      </span>
                                      <span className="text-sm font-bold text-blue-900 dark:text-blue-100">
                                        HK${totalAmount.toLocaleString()}
                                      </span>
                                    </div>
                                    <div className="text-xs text-blue-700 dark:text-blue-300">
                                      最新: 
                                      <button
                                        onClick={() => openInvoiceDetailModal(recentInvoice)}
                                        className="ml-1 underline hover:no-underline"
                                      >
                                        {recentInvoice.invoice_number}
                                      </button>
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                      {statusCounts.paid > 0 && (
                                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
                                          已付 {statusCounts.paid}
                                        </span>
                                      )}
                                      {statusCounts.pending > 0 && (
                                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400">
                                          待付 {statusCounts.pending}
                                        </span>
                                      )}
                                      {statusCounts.overdue > 0 && (
                                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400">
                                          逾期 {statusCounts.overdue}
                                        </span>
                                      )}
                                      {statusCounts.newly_signed > 0 && (
                                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400">
                                          新簽約 {statusCounts.newly_signed}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          </div>

                          {/* Card Footer - Action Buttons */}
                          <div className="p-4 bg-gray-50 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-600">
                            <div className="flex space-x-2">
                              <button
                                onClick={() => openEditModal(employee)}
                                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-3 rounded-lg text-sm font-medium flex items-center justify-center space-x-1 min-h-[44px] transition-colors active:bg-blue-800"
                                title="編輯員工"
                              >
                                <PencilIcon className="h-4 w-4" />
                                <span>編輯</span>
                              </button>
                              <button
                                onClick={() => openInvoiceModal(employee)}
                                className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 px-3 rounded-lg text-sm font-medium flex items-center justify-center space-x-1 min-h-[44px] transition-colors active:bg-green-800"
                                title="管理發票"
                              >
                                <DocumentTextIcon className="h-4 w-4" />
                                <span>發票</span>
                              </button>
                              <button
                                onClick={() => handleDeleteEmployee(employee.id)}
                                className="bg-red-600 hover:bg-red-700 text-white py-2 px-3 rounded-lg text-sm font-medium flex items-center justify-center min-h-[44px] transition-colors active:bg-red-800"
                                title="刪除員工"
                              >
                                <TrashIcon className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  // Table View (Desktop)
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                      <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">姓名</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">公司</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">性別</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">狀態</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">分配情況</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">相關發票</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">操作</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {employeesInGroup.map((employee) => (
                          <tr key={employee.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div>
                                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                  {employee.name || '未命名員工'}
                                </div>
                                {employee.contact_info && (
                                  <div className="text-sm text-gray-500 dark:text-gray-400">
                                    {employee.contact_info}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                              {employee.company || '-'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {getGenderBadge(employee.gender)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {getStatusBadge(employee.status)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                              {employee.assigned_property_id ? (
                                <div>
                                  <div>物業: {getPropertyName(employee.assigned_property_id)}</div>
                                  // ... continuing from where we left off ...

                                  {employee.assigned_room_name && (
                                    <div className="text-gray-500 dark:text-gray-400">房間: {employee.assigned_room_name}</div>
                                  )}
                                </div>
                              ) : (
                                <div>
                                  <span className="text-gray-500 dark:text-gray-400">未分配</span>
                                  {employee.arrival_time && (
                                    <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                                      到達: {employee.arrival_time.seconds ? 
                                        new Date(employee.arrival_time.seconds * 1000).toLocaleDateString('zh-HK') :
                                        new Date(employee.arrival_time).toLocaleDateString('zh-HK')
                                      }
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                              {(() => {
                                const employeeInvoices = getEmployeeInvoices(employee.id);
                                if (employeeInvoices.length === 0) {
                                  return <span className="text-gray-500 dark:text-gray-400">無發票</span>;
                                }
                                
                                const sortedInvoices = employeeInvoices.sort((a, b) => {
                                  const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
                                  const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
                                  return dateB - dateA;
                                });
                                
                                const recentInvoice = sortedInvoices[0];
                                const totalAmount = employeeInvoices.reduce((sum, inv) => sum + (inv.amount || 0), 0);
                                const statusCounts = {
                                  paid: employeeInvoices.filter(inv => inv.status === 'paid').length,
                                  pending: employeeInvoices.filter(inv => inv.status === 'pending').length,
                                  overdue: employeeInvoices.filter(inv => inv.status === 'overdue').length,
                                  newly_signed: employeeInvoices.filter(inv => inv.status === 'newly_signed').length
                                };
                                
                                return (
                                  <div className="space-y-1">
                                    <div className="flex items-center space-x-2">
                                      <span className="text-sm font-medium">
                                        {employeeInvoices.length} 張發票
                                      </span>
                                    </div>
                                    <div className="text-xs text-gray-600 dark:text-gray-400">
                                      最新: <button
                                        onClick={() => openInvoiceDetailModal(recentInvoice)}
                                        className="text-blue-600 hover:text-blue-800 underline"
                                        title="查看發票詳情"
                                      >
                                        {recentInvoice.invoice_number}
                                      </button>
                                    </div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400">
                                      總額: HK${totalAmount.toLocaleString()}
                                    </div>
                                    <div className="flex space-x-1">
                                      {statusCounts.paid > 0 && (
                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
                                          已付 {statusCounts.paid}
                                        </span>
                                      )}
                                      {statusCounts.pending > 0 && (
                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400">
                                          待付 {statusCounts.pending}
                                        </span>
                                      )}
                                      {statusCounts.overdue > 0 && (
                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400">
                                          逾期 {statusCounts.overdue}
                                        </span>
                                      )}
                                      {statusCounts.newly_signed > 0 && (
                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400">
                                          新簽約 {statusCounts.newly_signed}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })()}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                              <div className="flex space-x-2">
                                <button
                                  onClick={() => openEditModal(employee)}
                                  className="text-primary-600 dark:text-primary-400 hover:text-primary-900 dark:hover:text-primary-300 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                                  title="編輯員工"
                                >
                                  <PencilIcon className="h-5 w-5" />
                                </button>
                                <button
                                  onClick={() => openInvoiceModal(employee)}
                                  className="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                                  title="管理發票"
                                >
                                  <DocumentTextIcon className="h-5 w-5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteEmployee(employee.id)}
                                  className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                                  title="刪除員工"
                                >
                                  <TrashIcon className="h-5 w-5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          });
        })()}
      </div>

      {/* Add Employee Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="新增員工"
        size="max-w-2xl"
      >
        <EmployeeForm
          employeeForm={employeeForm}
          setEmployeeForm={setEmployeeForm}
          onSubmit={handleAddEmployee}
          onCancel={() => setShowAddModal(false)}
          submitLabel="新增員工"
        />
      </Modal>

      {/* Edit Employee Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="編輯員工"
        size="max-w-2xl"
      >
        <EmployeeForm
          employeeForm={employeeForm}
          setEmployeeForm={setEmployeeForm}
          onSubmit={handleEditEmployee}
          onCancel={() => setShowEditModal(false)}
          submitLabel="更新員工"
        />
      </Modal>

      {/* Invoice Modal */}
      <Modal
        isOpen={showInvoiceModal}
        onClose={() => setShowInvoiceModal(false)}
        title="員工發票"
        size="max-w-2xl"
      >
        {selectedEmployeeForInvoice && (
          <InvoiceModal
            employee={selectedEmployeeForInvoice}
            invoices={getEmployeeInvoices(selectedEmployeeForInvoice.id)}
            allInvoices={invoices}
            onLink={(invoiceId) => linkInvoiceToEmployee(selectedEmployeeForInvoice.id, invoiceId)}
            onUnlink={(invoiceId) => linkInvoiceToEmployee(selectedEmployeeForInvoice.id, invoiceId, 'unlink')}
          />
        )}
      </Modal>

      {/* Invoice Detail Modal */}
      <Modal
        isOpen={showInvoiceDetailModal}
        onClose={() => setShowInvoiceDetailModal(false)}
        title="發票詳情"
        size="max-w-lg"
      >
        {selectedInvoiceForDetail && (
          <InvoiceDetailModal
            invoice={selectedInvoiceForDetail}
            onClose={() => setShowInvoiceDetailModal(false)}
          />
        )}
      </Modal>
    </div>
  );
}

// Enhanced Mobile-First Employee Form Component
function EmployeeForm({ employeeForm, setEmployeeForm, onSubmit, onCancel, submitLabel }) {
  const [properties, setProperties] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchProperties = async () => {
    try {
      const propertiesRef = collection(db, 'properties');
      const snapshot = await getDocs(propertiesRef);
      const propertiesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setProperties(propertiesData);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching properties:', error);
      setLoading(false);
    }
  };

  const fetchRooms = async (propertyId) => {
    if (!propertyId) {
      setRooms([]);
      return;
    }
    
    try {
      const roomsRef = collection(db, 'rooms');
      const snapshot = await getDocs(roomsRef);
      const roomsData = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(room => room.property_id === propertyId);
      setRooms(roomsData);
    } catch (error) {
      console.error('Error fetching rooms:', error);
      setRooms([]);
    }
  };

  useEffect(() => {
    fetchProperties();
  }, []);

  useEffect(() => {
    if (employeeForm.assigned_property_id) {
      fetchRooms(employeeForm.assigned_property_id);
    } else {
      setRooms([]);
    }
  }, [employeeForm.assigned_property_id]);

  const handleInputChange = (field, value) => {
    setEmployeeForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* Mobile-First Form Layout */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
        {/* Name Field */}
        <div className="col-span-1 sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            姓名 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={employeeForm.name}
            onChange={(e) => handleInputChange('name', e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            placeholder="請輸入員工姓名"
            required
          />
        </div>

        {/* Company Field */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            公司
          </label>
          <input
            type="text"
            value={employeeForm.company}
            onChange={(e) => handleInputChange('company', e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            placeholder="請輸入公司名稱"
          />
        </div>

        {/* Gender Field */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            性別
          </label>
          <select
            value={employeeForm.gender}
            onChange={(e) => handleInputChange('gender', e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          >
            <option value="male">男性</option>
            <option value="female">女性</option>
          </select>
        </div>

        {/* Contact Info Field */}
        <div className="col-span-1 sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            聯絡資訊
          </label>
          <input
            type="text"
            value={employeeForm.contact_info}
            onChange={(e) => handleInputChange('contact_info', e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            placeholder="電話、郵箱或其他聯絡方式"
          />
        </div>

        {/* Arrival Time Field */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            到達時間
          </label>
          <input
            type="date"
            value={employeeForm.arrival_time}
            onChange={(e) => handleInputChange('arrival_time', e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          />
        </div>

        {/* Status Field */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            狀態
          </label>
          <select
            value={employeeForm.status}
            onChange={(e) => handleInputChange('status', e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          >
            <option value="pending_assignment">待分配</option>
            <option value="housed">已入住</option>
            <option value="departed">已離開</option>
            <option value="active">活躍</option>
          </select>
        </div>

        {/* Property Assignment */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            分配物業
          </label>
          <select
            value={employeeForm.assigned_property_id}
            onChange={(e) => handleInputChange('assigned_property_id', e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          >
            <option value="">選擇物業</option>
            {properties.map((property) => (
              <option key={property.id} value={property.id}>
                {property.name}
              </option>
            ))}
          </select>
        </div>

        {/* Room Assignment */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            分配房間
          </label>
          <select
            value={employeeForm.assigned_room_name}
            onChange={(e) => handleInputChange('assigned_room_name', e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            disabled={!employeeForm.assigned_property_id}
          >
            <option value="">選擇房間</option>
            {rooms.map((room) => (
              <option key={room.id} value={room.name}>
                {room.name}
              </option>
            ))}
          </select>
        </div>

        {/* Notes Field */}
        <div className="col-span-1 sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            備註
          </label>
          <textarea
            value={employeeForm.notes}
            onChange={(e) => handleInputChange('notes', e.target.value)}
            rows={3}
            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            placeholder="任何額外的備註..."
          />
        </div>
      </div>

      {/* Enhanced Mobile-First Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 pt-6 border-t border-gray-200 dark:border-gray-600">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-6 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors min-h-[44px] font-medium"
        >
          取消
        </button>
        <button
          type="submit"
          className="flex-1 px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors min-h-[44px] font-medium"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

// Enhanced Invoice Modal Component
function InvoiceModal({ employee, invoices, allInvoices, onLink, onUnlink }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const getInvoiceStatusBadge = (status) => {
    const statusConfig = {
      'paid': { bg: 'bg-green-100 dark:bg-green-900/20', text: 'text-green-800 dark:text-green-400', label: '已付款' },
      'pending': { bg: 'bg-yellow-100 dark:bg-yellow-900/20', text: 'text-yellow-800 dark:text-yellow-400', label: '待付款' },
      'overdue': { bg: 'bg-red-100 dark:bg-red-900/20', text: 'text-red-800 dark:text-red-400', label: '逾期' },
      'newly_signed': { bg: 'bg-blue-100 dark:bg-blue-900/20', text: 'text-blue-800 dark:text-blue-400', label: '新簽約' }
    };
    
    const config = statusConfig[status] || statusConfig['pending'];
    
    return (
      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${config.bg} ${config.text}`}>
        {config.label}
      </span>
    );
  };

  const availableInvoices = allInvoices.filter(invoice => {
    const isLinked = invoice.linked_employee_ids && invoice.linked_employee_ids.includes(employee.id);
    const matchesSearch = !searchTerm || 
      invoice.invoice_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.contract_number?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = !statusFilter || invoice.status === statusFilter;
    
    return !isLinked && matchesSearch && matchesStatus;
  });

  const linkedInvoices = invoices.filter(invoice => {
    const matchesSearch = !searchTerm || 
      invoice.invoice_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.contract_number?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = !statusFilter || invoice.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Employee Info */}
      <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
        <h3 className="font-semibold text-blue-900 dark:text-blue-100">
          {employee.name} 的發票管理
        </h3>
        <p className="text-sm text-blue-700 dark:text-blue-300">
          {employee.company && `${employee.company} • `}
          {linkedInvoices.length} 張已連結發票
        </p>
      </div>

      {/* Search and Filter */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            搜尋發票
          </label>
          <div className="relative">
            <MagnifyingGlassIcon className="h-5 w-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              placeholder="搜尋發票號碼或合約號碼..."
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            狀態篩選
          </label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          >
            <option value="">所有狀態</option>
            <option value="paid">已付款</option>
            <option value="pending">待付款</option>
            <option value="overdue">逾期</option>
            <option value="newly_signed">新簽約</option>
          </select>
        </div>
      </div>

      {/* Linked Invoices */}
      <div>
        <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3">
          已連結發票 ({linkedInvoices.length})
        </h4>
        <div className="space-y-3 max-h-48 overflow-y-auto">
          {linkedInvoices.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-sm italic">尚未連結任何發票</p>
          ) : (
            linkedInvoices.map((invoice) => (
              <div key={invoice.id} className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2 mb-1">
                    <span className="font-medium text-green-900 dark:text-green-100">
                      {invoice.invoice_number}
                    </span>
                    {getInvoiceStatusBadge(invoice.status)}
                  </div>
                  <p className="text-sm text-green-700 dark:text-green-300">
                    合約: {invoice.contract_number} • HK${invoice.amount?.toLocaleString() || 0}
                  </p>
                </div>
                <button
                  onClick={() => onUnlink(invoice.id)}
                  className="ml-3 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors min-h-[44px] text-sm font-medium"
                >
                  解除連結
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Available Invoices */}
      <div>
        <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3">
          可連結發票 ({availableInvoices.length})
        </h4>
        <div className="space-y-3 max-h-64 overflow-y-auto">
          {availableInvoices.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-sm italic">
              {searchTerm || statusFilter ? '找不到符合條件的發票' : '沒有可連結的發票'}
            </p>
          ) : (
            availableInvoices.map((invoice) => (
              <div key={invoice.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2 mb-1">
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {invoice.invoice_number}
                    </span>
                    {getInvoiceStatusBadge(invoice.status)}
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    合約: {invoice.contract_number} • HK${invoice.amount?.toLocaleString() || 0}
                  </p>
                </div>
                <button
                  onClick={() => onLink(invoice.id)}
                  className="ml-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors min-h-[44px] text-sm font-medium"
                >
                  連結
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// Enhanced Invoice Detail Modal Component
function InvoiceDetailModal({ invoice, onClose }) {
  const formatDate = (date) => {
    if (!date) return 'N/A';
    if (date.toDate) {
      return date.toDate().toLocaleDateString('zh-HK');
    }
    return new Date(date).toLocaleDateString('zh-HK');
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      'paid': { bg: 'bg-green-100 dark:bg-green-900/20', text: 'text-green-800 dark:text-green-400', label: '已付款' },
      'pending': { bg: 'bg-yellow-100 dark:bg-yellow-900/20', text: 'text-yellow-800 dark:text-yellow-400', label: '待付款' },
      'overdue': { bg: 'bg-red-100 dark:bg-red-900/20', text: 'text-red-800 dark:text-red-400', label: '逾期' },
      'newly_signed': { bg: 'bg-blue-100 dark:bg-blue-900/20', text: 'text-blue-800 dark:text-blue-400', label: '新簽約' }
    };
    
    const config = statusConfig[status] || statusConfig['pending'];
    
    return (
      <span className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${config.bg} ${config.text}`}>
        {config.label}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-bold text-blue-900 dark:text-blue-100">
            {invoice.invoice_number}
          </h3>
          {getStatusBadge(invoice.status)}
        </div>
        <p className="text-sm text-blue-700 dark:text-blue-300">
          合約號碼: {invoice.contract_number}
        </p>
      </div>

      {/* Invoice Details */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              發票金額
            </label>
            <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
              HK${invoice.amount?.toLocaleString() || 0}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              開始日期
            </label>
            <p className="text-gray-900 dark:text-gray-100">
              {formatDate(invoice.start_date)}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              結束日期
            </label>
            <p className="text-gray-900 dark:text-gray-100">
              {formatDate(invoice.end_date)}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              建立日期
            </label>
            <p className="text-gray-900 dark:text-gray-100">
              {formatDate(invoice.createdAt)}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              最後更新
            </label>
            <p className="text-gray-900 dark:text-gray-100">
              {formatDate(invoice.updatedAt)}
            </p>
          </div>

          {invoice.notes && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                備註
              </label>
              <p className="text-gray-900 dark:text-gray-100 text-sm bg-gray-50 dark:bg-gray-700 p-3 rounded-lg">
                {invoice.notes}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Action Button */}
      <div className="pt-6 border-t border-gray-200 dark:border-gray-600">
        <button
          onClick={onClose}
          className="w-full px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors min-h-[44px] font-medium"
        >
          關閉
        </button>
      </div>
    </div>
  );
}