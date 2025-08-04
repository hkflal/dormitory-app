import { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import Modal from './Modal';

const MANAGEMENT_FEE_AMOUNT = 350; // Fixed monthly amount

const formatCurrency = (amount) => {
  const numericAmount = parseFloat(amount || 0);
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true
  }).format(numericAmount);
};

const calculateProportionalAmount = (startDate) => {
  if (!startDate) return MANAGEMENT_FEE_AMOUNT;
  
  const start = new Date(startDate);
  const year = start.getFullYear();
  const month = start.getMonth();
  
  // Get the last day of the month
  const lastDay = new Date(year, month + 1, 0).getDate();
  const startDay = start.getDate();
  
  // Calculate remaining days in the month (inclusive of start date)
  const remainingDays = lastDay - startDay + 1;
  
  // Calculate proportional amount
  const proportionalAmount = (remainingDays / lastDay) * MANAGEMENT_FEE_AMOUNT;
  
  return Math.round(proportionalAmount * 100) / 100; // Round to 2 decimal places
};

const AddManagementFeeInvoiceModal = ({ isOpen, onClose, onSave, contractNumber }) => {
  const [formData, setFormData] = useState({
    invoice_number: '',
    contract_number: '',
    employee_names: '',
    company: '',
    amount: MANAGEMENT_FEE_AMOUNT,
    start_date: '',
    end_date: '',
    status: 'pending',
    notes: '管理費',
    invoice_type: 'management_fee',
    is_first_month: false
  });

  const [availableEmployees, setAvailableEmployees] = useState([]);
  const [selectedEmployees, setSelectedEmployees] = useState([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [showEmployeeDropdown, setShowEmployeeDropdown] = useState(false);
  const [isFirstInvoice, setIsFirstInvoice] = useState(false);

  // Generate next invoice number for management fee
  const generateNextInvoiceNumber = async (contractNumber) => {
    try {
      const invoicesQuery = query(
        collection(db, 'invoices'),
        where('contract_number', '==', contractNumber)
      );
      
      const snapshot = await getDocs(invoicesQuery);
      const existingInvoices = snapshot.docs.map(doc => doc.data());
      
      // Filter for management fee invoices (M prefix)
      const managementInvoices = existingInvoices.filter(inv => 
        inv.invoice_number && inv.invoice_number.includes('-M')
      );
      
      if (managementInvoices.length === 0) {
        setIsFirstInvoice(true);
        return `${contractNumber}-M0001`;
      }
      
      setIsFirstInvoice(false);
      const numbers = managementInvoices.map(inv => {
        const parts = inv.invoice_number.split('-');
        const mPart = parts.find(p => p.startsWith('M'));
        if (mPart) {
          return parseInt(mPart.substring(1));
        }
        return 0;
      }).filter(num => !isNaN(num));
      
      const maxNumber = Math.max(...numbers, 0);
      return `${contractNumber}-M${String(maxNumber + 1).padStart(4, '0')}`;
    } catch (error) {
      console.error('Error generating invoice number:', error);
      return `${contractNumber}-M0001`;
    }
  };

  // Initialize contract number when modal opens
  useEffect(() => {
    if (isOpen && contractNumber && contractNumber !== formData.contract_number) {
      setFormData(prev => ({ ...prev, contract_number: contractNumber }));
    }
  }, [isOpen, contractNumber]);

  // Fetch employees when contract number changes
  useEffect(() => {
    const fetchEmployees = async () => {
      if (!formData.contract_number) {
        setAvailableEmployees([]);
        setSelectedEmployees([]);
        return;
      }

      setLoadingEmployees(true);
      try {
        // Try multiple possible field names for contract number
        const queries = [
          query(collection(db, 'employees'), where('contract_number', '==', formData.contract_number)),
          query(collection(db, 'employees'), where('activeCtr', '==', formData.contract_number)),
          query(collection(db, 'employees'), where('contractNumber', '==', formData.contract_number))
        ];

        const results = await Promise.all(queries.map(q => getDocs(q)));
        const employeesSet = new Set();
        
        results.forEach(snapshot => {
          snapshot.docs.forEach(doc => {
            const employee = { id: doc.id, ...doc.data() };
            employeesSet.add(JSON.stringify(employee));
          });
        });

        const employees = Array.from(employeesSet).map(emp => JSON.parse(emp));
        console.log(`Found ${employees.length} employees for contract ${formData.contract_number}:`, employees);
        
        setAvailableEmployees(employees);
        
        // Auto-select all employees initially
        setSelectedEmployees(employees);
        
        // Set company from first employee
        if (employees.length > 0 && employees[0].company) {
          setFormData(prev => ({ ...prev, company: employees[0].company }));
        }
        
        // Generate invoice number
        const nextNumber = await generateNextInvoiceNumber(formData.contract_number);
        setFormData(prev => ({ ...prev, invoice_number: nextNumber }));
        
      } catch (error) {
        console.error('Error fetching employees:', error);
      } finally {
        setLoadingEmployees(false);
      }
    };

    fetchEmployees();
  }, [formData.contract_number]);

  // Update dates and calculate amount
  useEffect(() => {
    if (formData.start_date) {
      const start = new Date(formData.start_date);
      
      // Set end date to last day of the same month
      const endDate = new Date(start.getFullYear(), start.getMonth() + 1, 0);
      setFormData(prev => ({
        ...prev,
        end_date: endDate.toISOString().split('T')[0]
      }));
      
      // Calculate amount based on whether it's the first invoice
      if (isFirstInvoice) {
        const proportionalAmount = calculateProportionalAmount(formData.start_date);
        setFormData(prev => ({
          ...prev,
          amount: proportionalAmount,
          is_first_month: true
        }));
      } else {
        setFormData(prev => ({
          ...prev,
          amount: MANAGEMENT_FEE_AMOUNT,
          is_first_month: false
        }));
      }
    }
  }, [formData.start_date, isFirstInvoice]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showEmployeeDropdown && !event.target.closest('.employee-dropdown-container')) {
        setShowEmployeeDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showEmployeeDropdown]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      const employeeNames = selectedEmployees.map(emp => emp.name);
      const invoiceData = {
        ...formData,
        employee_names: employeeNames,
        n_employees: selectedEmployees.length,
        frequency: 1, // Monthly
        total: formData.amount * selectedEmployees.length,
        created_at: new Date(),
        updated_at: new Date()
      };

      await addDoc(collection(db, 'invoices'), invoiceData);
      
      onSave();
      onClose();
      
      // Reset form
      setFormData({
        invoice_number: '',
        contract_number: '',
        employee_names: '',
        company: '',
        amount: MANAGEMENT_FEE_AMOUNT,
        start_date: '',
        end_date: '',
        status: 'pending',
        notes: '管理費',
        invoice_type: 'management_fee',
        is_first_month: false
      });
      setSelectedEmployees([]);
      
    } catch (error) {
      console.error('Error creating management fee invoice:', error);
      alert('創建管理費發票時出錯: ' + error.message);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleEmployeeToggle = (employee) => {
    const isSelected = selectedEmployees.some(emp => emp.id === employee.id);
    let newSelectedEmployees;
    
    if (isSelected) {
      newSelectedEmployees = selectedEmployees.filter(emp => emp.id !== employee.id);
    } else {
      newSelectedEmployees = [...selectedEmployees, employee];
    }
    
    setSelectedEmployees(newSelectedEmployees);
    
    // Update company field based on selected employees
    if (newSelectedEmployees.length > 0) {
      const firstEmployeeWithCompany = newSelectedEmployees.find(e => e.company);
      setFormData(prev => ({
        ...prev,
        company: firstEmployeeWithCompany ? firstEmployeeWithCompany.company : ''
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        company: ''
      }));
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="新增管理費發票">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              合約號碼
            </label>
            <input
              type="text"
              name="contract_number"
              value={formData.contract_number}
              onChange={handleInputChange}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              發票編號
            </label>
            <input
              type="text"
              name="invoice_number"
              value={formData.invoice_number}
              readOnly
              className="mt-1 block w-full rounded-md border-gray-300 bg-gray-100 shadow-sm dark:bg-gray-600 dark:border-gray-600 dark:text-gray-300"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            公司
          </label>
          <input
            type="text"
            name="company"
            value={formData.company}
            onChange={handleInputChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            員工
          </label>
          
          {/* Selected employees display */}
          {selectedEmployees.length > 0 && (
            <div className="mt-1 mb-2 flex flex-wrap gap-1">
              {selectedEmployees.map((emp) => (
                <span
                  key={emp.id}
                  className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                >
                  {emp.name}
                  <button
                    type="button"
                    onClick={() => handleEmployeeToggle(emp)}
                    className="ml-1 text-blue-600 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-100"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Contract number required message */}
          {!formData.contract_number && (
            <p className="mt-1 text-sm text-amber-600 dark:text-amber-400">
              請先輸入合約號碼以載入該合約的員工列表
            </p>
          )}

          {/* Employee selection dropdown */}
          {formData.contract_number && (
            <div className="relative employee-dropdown-container">
              <button
                type="button"
                onClick={() => setShowEmployeeDropdown(!showEmployeeDropdown)}
                disabled={loadingEmployees}
                className="mt-1 w-full flex justify-between items-center px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-left focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              >
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {loadingEmployees ? '載入中...' : 
                   availableEmployees.length > 0 ? `點擊選擇員工 (${availableEmployees.length}人可選, ${selectedEmployees.length}人已選)` : 
                   '此合約沒有找到員工'}
                </span>
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Dropdown menu */}
              {showEmployeeDropdown && availableEmployees.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto dark:bg-gray-700 dark:border-gray-600">
                  {availableEmployees.map(employee => {
                    const isSelected = selectedEmployees.some(emp => emp.id === employee.id);
                    return (
                      <div
                        key={employee.id}
                        className={`px-3 py-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 ${
                          isSelected ? 'bg-blue-50 dark:bg-blue-900' : ''
                        }`}
                        onClick={() => handleEmployeeToggle(employee)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}} // Handled by parent click
                              className="mr-2 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                            />
                            <div>
                              <p className="text-sm font-medium text-gray-900 dark:text-white">
                                {employee.name}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {employee.company} • {employee.gender === 'female' ? '女' : '男'}
                              </p>
                            </div>
                          </div>
                          {employee.assigned_property_id && (
                            <span className="text-xs text-green-600 dark:text-green-400">
                              已分配住宿
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              開始日期
            </label>
            <input
              type="date"
              name="start_date"
              value={formData.start_date}
              onChange={handleInputChange}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              結束日期
            </label>
            <input
              type="date"
              name="end_date"
              value={formData.end_date}
              readOnly
              className="mt-1 block w-full rounded-md border-gray-300 bg-gray-100 shadow-sm dark:bg-gray-600 dark:border-gray-600 dark:text-gray-300"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              金額 (每人)
            </label>
            <input
              type="number"
              name="amount"
              value={formData.amount}
              readOnly
              className="mt-1 block w-full rounded-md border-gray-300 bg-gray-100 shadow-sm dark:bg-gray-600 dark:border-gray-600 dark:text-gray-300"
            />
            {isFirstInvoice && formData.start_date && (
              <p className="text-xs text-gray-500 mt-1">
                首月按比例計算
              </p>
            )}
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              總金額
            </label>
            <input
              type="text"
              value={formatCurrency(formData.amount * selectedEmployees.length)}
              readOnly
              className="mt-1 block w-full rounded-md border-gray-300 bg-gray-100 shadow-sm dark:bg-gray-600 dark:border-gray-600 dark:text-gray-300"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            狀態
          </label>
          <select
            name="status"
            value={formData.status}
            onChange={handleInputChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          >
            <option value="pending">待付款</option>
            <option value="paid">已付款</option>
            <option value="overdue">逾期</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            備註
          </label>
          <textarea
            name="notes"
            value={formData.notes}
            onChange={handleInputChange}
            rows={2}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
        </div>

        <div className="flex justify-end space-x-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-600"
          >
            取消
          </button>
          <button
            type="submit"
            className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-yellow-500 hover:bg-yellow-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-400"
          >
            創建管理費發票
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default AddManagementFeeInvoiceModal; 