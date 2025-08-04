import { useState, useEffect } from 'react';
import { collection, addDoc, updateDoc, doc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import Modal from './Modal'; // Re-using the generic Modal component

const calculateFrequency = (startDate, endDate) => {
  if (!startDate || !endDate) return 1;
  
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = Math.abs(end - start);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  // Round to nearest common frequency
  if (diffDays <= 45) {
    return 1; // Monthly
  } else if (diffDays <= 135) {
    return 3; // Quarterly
  } else {
    return Math.round(diffDays / 30); // Custom frequency in months
  }
};

const calculateNEmployees = (employeeNames) => {
  if (!employeeNames || !Array.isArray(employeeNames)) {
    return 0;
  }
  return employeeNames.filter(name => name && name.trim().length > 0).length;
};

const AddInvoiceModal = ({ isOpen, onClose, onSave, invoiceData, isDepositInvoice = false }) => {
  const [formData, setFormData] = useState({
    invoice_number: '',
    contract_number: '',
    employee_names: '', // Storing as a comma-separated string in the form
    company: '', // Add company field
    amount: '',
    start_date: '',
    end_date: '',
    status: 'pending',
    notes: '',
    total: '', // Add total field
    is_deposit: false,
    n: 2 // Default deposit months for deposit invoices
  });

  const [availableEmployees, setAvailableEmployees] = useState([]);
  const [selectedEmployees, setSelectedEmployees] = useState([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [showEmployeeDropdown, setShowEmployeeDropdown] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isEditing = Boolean(invoiceData && invoiceData.id);

  // Function to generate next invoice number
  const generateNextInvoiceNumber = async (contractNumber, type = 'Z') => {
    try {
      const invoicesQuery = query(
        collection(db, 'invoices'),
        where('contract_number', '==', contractNumber)
      );
      
      const snapshot = await getDocs(invoicesQuery);
      const existingInvoices = snapshot.docs.map(doc => doc.data());
      
      // Filter by type and find the highest number
      const typeInvoices = existingInvoices.filter(inv => 
        inv.invoice_number && inv.invoice_number.includes(`-${type}`)
      );
      
      if (typeInvoices.length === 0) {
        return `${contractNumber}-${type}001`;
      }
      
      const numbers = typeInvoices.map(inv => {
        const parts = inv.invoice_number.split('-')[1];
        if (parts && parts.startsWith(type)) {
          return parseInt(parts.substring(1));
        }
        return 0;
      }).filter(num => !isNaN(num));
      
      const maxNumber = Math.max(...numbers);
      const nextNumber = maxNumber + 1;
      
      return `${contractNumber}-${type}${String(nextNumber).padStart(3, '0')}`;
    } catch (error) {
      console.error('Error generating invoice number:', error);
      return `${contractNumber}-${type}001`;
    }
  };

  // Function to get latest invoice data for auto-fill
  const getLatestInvoiceData = async (contractNumber) => {
    try {
      const invoicesQuery = query(
        collection(db, 'invoices'),
        where('contract_number', '==', contractNumber)
      );
      
      const snapshot = await getDocs(invoicesQuery);
      const existingInvoices = snapshot.docs.map(doc => doc.data());
      
      if (existingInvoices.length === 0) {
        return null;
      }

      // Sort by creation date to get the latest
      const latestInvoice = existingInvoices.sort((a, b) => {
        const dateA = a.created_at?.toDate?.() || new Date(a.created_at || 0);
        const dateB = b.created_at?.toDate?.() || new Date(b.created_at || 0);
        return dateB - dateA;
      })[0];

      return latestInvoice;
    } catch (error) {
      console.error('Error fetching latest invoice data:', error);
      return null;
    }
  };

  // Function to fetch employees based on contract number
  const fetchEmployeesForContract = async (contractNumber) => {
    if (!contractNumber.trim()) {
      setAvailableEmployees([]);
      return;
    }

    setLoadingEmployees(true);
    try {
      // Try multiple possible field names for contract number
      const queries = [
        query(collection(db, 'employees'), where('contract_number', '==', contractNumber)),
        query(collection(db, 'employees'), where('activeCtr', '==', contractNumber)),
        query(collection(db, 'employees'), where('contractNumber', '==', contractNumber))
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
      console.log(`Found ${employees.length} employees for contract ${contractNumber}:`, employees);
      
      setAvailableEmployees(employees);
    } catch (error) {
      console.error('Error fetching employees:', error);
      setAvailableEmployees([]);
    } finally {
      setLoadingEmployees(false);
    }
  };

  useEffect(() => {
    const initializeForm = async () => {
      if (isEditing && invoiceData) {
        // Handle Firestore timestamp conversion for dates
        const formatDateForInput = (date) => {
          if (!date) return '';
          if (date.toDate) {
            return date.toDate().toISOString().split('T')[0];
          }
          return new Date(date).toISOString().split('T')[0];
        };

        setFormData({
          invoice_number: invoiceData.invoice_number || '',
          contract_number: invoiceData.contract_number || '',
          employee_names: (invoiceData.employee_names || []).join(', '),
          company: invoiceData.company || '', // Add company field
          amount: invoiceData.amount || '',
          start_date: formatDateForInput(invoiceData.start_date),
          end_date: formatDateForInput(invoiceData.end_date),
          status: invoiceData.status || 'pending',
          notes: invoiceData.notes || '',
          total: invoiceData.total || invoiceData.amount || '',
          is_deposit: invoiceData.is_deposit || false,
          n: invoiceData.n || (isDepositInvoice ? 2 : 1) // Default n=2 for deposits
        });
      } else {
        // Reset for new invoice with auto-generated invoice number and auto-filled data
        const invoiceType = isDepositInvoice ? 'A' : 'Z';
        let suggestedNumber = '';
        let latestData = null;
        
        if (invoiceData && invoiceData.contract_number) {
          suggestedNumber = await generateNextInvoiceNumber(invoiceData.contract_number, invoiceType);
          latestData = await getLatestInvoiceData(invoiceData.contract_number);
        }

        setFormData({
          invoice_number: invoiceData?.invoice_number || suggestedNumber,
          contract_number: invoiceData?.contract_number || '',
          employee_names: invoiceData?.employee_names ? 
            (Array.isArray(invoiceData.employee_names) ? invoiceData.employee_names.join(', ') : invoiceData.employee_names) :
            latestData?.employee_names ? 
              (Array.isArray(latestData.employee_names) ? latestData.employee_names.join(', ') : latestData.employee_names) : '',
          amount: invoiceData?.amount || latestData?.amount || '',
          start_date: '',
          end_date: '',
          status: invoiceData?.status || 'pending',
          notes: '',
          total: invoiceData?.total || invoiceData?.amount || latestData?.total || latestData?.amount || '',
          is_deposit: isDepositInvoice,
          n: isDepositInvoice ? 2 : 1 // Default n=2 for deposit invoices, n=1 for regular
        });
      }
    };

    if (isOpen) {
      initializeForm();
      setSubmitting(false); // Reset submitting state when modal opens
    }
  }, [invoiceData, isEditing, isOpen, isDepositInvoice]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    
    // Fetch employees when contract number changes
    if (name === 'contract_number') {
      fetchEmployeesForContract(value);
    }
  };

  // Fetch employees when contract number changes from external source
  useEffect(() => {
    if (formData.contract_number) {
      fetchEmployeesForContract(formData.contract_number);
    }
  }, [formData.contract_number]);

  // Auto-calculate total when amount, start_date, or end_date changes
  useEffect(() => {
    if (!isDepositInvoice && formData.amount && formData.start_date && formData.end_date) {
      const frequency = calculateFrequency(formData.start_date, formData.end_date);
      const calculatedTotal = parseFloat(formData.amount) * frequency;
      setFormData(prev => ({ ...prev, total: calculatedTotal.toFixed(2) }));
    }
  }, [formData.amount, formData.start_date, formData.end_date, isDepositInvoice]);

  // Handle employee selection
  const handleEmployeeToggle = (employee) => {
    const isSelected = selectedEmployees.some(emp => emp.id === employee.id);
    let newSelectedEmployees;
    
    if (isSelected) {
      newSelectedEmployees = selectedEmployees.filter(emp => emp.id !== employee.id);
    } else {
      newSelectedEmployees = [...selectedEmployees, employee];
    }
    
    setSelectedEmployees(newSelectedEmployees);
    
    // Update the employee_names field
    const employeeNames = newSelectedEmployees.map(emp => emp.name).join(', ');
    setFormData(prev => ({ ...prev, employee_names: employeeNames }));
  };

  // Initialize selected employees when form data changes
  useEffect(() => {
    if (formData.employee_names && availableEmployees.length > 0) {
      const namesList = formData.employee_names.split(',').map(name => name.trim());
      const selected = availableEmployees.filter(emp => namesList.includes(emp.name));
      setSelectedEmployees(selected);
    }
  }, [formData.employee_names, availableEmployees]);

  // Update company field when selected employees change
  useEffect(() => {
    if (selectedEmployees.length > 0) {
      const firstEmployeeWithCompany = selectedEmployees.find(e => e.company);
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
  }, [selectedEmployees]);

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
    
    // Prevent duplicate submissions
    if (submitting) {
      return;
    }
    
    setSubmitting(true);
    console.log('📊 Invoice submission started:', { isEditing, formData: formData.invoice_number });
    
    // Parse employee names and calculate computed fields
    const employeeNamesArray = formData.employee_names
      .split(',')
      .map(name => name.trim())
      .filter(name => name.length > 0);
    
    const frequency = calculateFrequency(formData.start_date, formData.end_date);
    const nEmployees = calculateNEmployees(employeeNamesArray);
    
    // Get company from selected employees (use first employee's company)
    const employeeCompany = selectedEmployees.length > 0 ? 
      (selectedEmployees.find(e => e.company) || {}).company || '' : 
      '';
    
    // Convert employee_names string back to an array
    const submissionData = {
        ...formData,
        employee_names: employeeNamesArray,
        company: employeeCompany, // Add company field
        amount: parseFloat(formData.amount),
        total: parseFloat(formData.total) || parseFloat(formData.amount),
        start_date: new Date(formData.start_date),
        end_date: new Date(formData.end_date),
        created_at: isEditing ? invoiceData.created_at : new Date(),
        updated_at: new Date(),
        is_deposit: isDepositInvoice || formData.is_deposit,
        template_type: isDepositInvoice ? 'deposit' : 'invoice', // Track which template to use
        frequency: frequency, // Add computed field
        n_employees: nEmployees, // Add computed field
        n: parseInt(formData.n) || (isDepositInvoice ? 2 : 1) // Include n field for deposit invoices
    };

    try {
      if (isEditing) {
        // Update existing invoice in Firestore
        console.log('📊 Updating invoice:', invoiceData.id);
        const invoiceRef = doc(db, 'invoices', invoiceData.id);
        await updateDoc(invoiceRef, submissionData);
      } else {
        // Add new invoice to Firestore
        console.log('📊 Creating new invoice:', submissionData.invoice_number);
        await addDoc(collection(db, 'invoices'), submissionData);
      }

      console.log('📊 Invoice submission completed successfully');
      onSave(); // This will refetch the invoices list
      onClose();
    } catch (error) {
      console.error('📊 Invoice submission failed:', error);
      alert(`錯誤: ${error.message}`);
    } finally {
      setSubmitting(false);
      console.log('📊 Invoice submission state reset');
    }
  };

  const modalTitle = isEditing 
    ? '編輯發票' 
    : isDepositInvoice 
      ? '新增押金發票' 
      : '新增發票';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={modalTitle}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="invoice_number" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            發票號碼
            {isDepositInvoice && <span className="text-orange-600 ml-1">(押金)</span>}
          </label>
          <input 
            type="text" 
            name="invoice_number" 
            id="invoice_number" 
            value={formData.invoice_number} 
            onChange={handleChange} 
            required 
            placeholder={isDepositInvoice ? "例如: D10103-A001" : "例如: D10103-Z001"}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" 
          />
        </div>
        
        <div>
          <label htmlFor="contract_number" className="block text-sm font-medium text-gray-700 dark:text-gray-300">合約號碼</label>
          <input 
            type="text" 
            name="contract_number" 
            id="contract_number" 
            value={formData.contract_number} 
            onChange={handleChange} 
            required 
            placeholder="例如: D10103"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" 
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            員工姓名 {selectedEmployees.length > 0 && <span className="text-green-600">({selectedEmployees.length}人已選擇)</span>}
          </label>
          
          {/* Display selected employees */}
          {selectedEmployees.length > 0 && (
            <div className="mt-2 mb-2 flex flex-wrap gap-2">
              {selectedEmployees.map(employee => (
                <span 
                  key={employee.id}
                  className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                >
                  {employee.name}
                  <button
                    type="button"
                    onClick={() => handleEmployeeToggle(employee)}
                    className="ml-1 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200"
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
                   availableEmployees.length > 0 ? `點擊選擇員工 (${availableEmployees.length}人可選)` : 
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

          {/* Hidden input to maintain form validation */}
          <input 
            type="hidden" 
            name="employee_names" 
            value={formData.employee_names} 
            required 
          />
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="amount" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              {isDepositInvoice ? '單月押金金額' : '金額'}
            </label>
            <input 
              type="number" 
              name="amount" 
              id="amount" 
              value={formData.amount} 
              onChange={handleChange} 
              required 
              step="0.01"
              placeholder="3500.00"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" 
            />
          </div>
          
          {/* Add n field for deposit invoices */}
          {isDepositInvoice && (
            <div>
              <label htmlFor="n" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                按金月數 (n)
              </label>
              <input 
                type="number" 
                name="n" 
                id="n" 
                value={formData.n} 
                onChange={handleChange} 
                required 
                min="1"
                max="12"
                placeholder="2"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" 
              />
              <p className="mt-1 text-xs text-gray-500">
                總押金 = 單月押金 × 人數 × 按金月數
              </p>
            </div>
          )}
          
          {!isDepositInvoice && (
            <div>
              <label htmlFor="total" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                總計
                <span className="text-xs text-gray-500 ml-1">(自動計算: 金額 × 租期)</span>
              </label>
              <input 
                type="number" 
                name="total" 
                id="total" 
                value={formData.total} 
                readOnly
                step="0.01"
                placeholder="將根據金額和租期自動計算"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm bg-gray-50 dark:bg-gray-600 text-gray-700 dark:text-gray-300 sm:text-sm cursor-not-allowed" 
              />
              {formData.amount && formData.start_date && formData.end_date && (
                <p className="mt-1 text-xs text-gray-500">
                  計算: {formData.amount} × {calculateFrequency(formData.start_date, formData.end_date)} = {formData.total}
                </p>
              )}
            </div>
          )}
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="start_date" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                {isDepositInvoice ? '押金開始日期' : '租賃開始日期'}
              </label>
              <input 
                type="date" 
                name="start_date" 
                id="start_date" 
                value={formData.start_date} 
                onChange={handleChange} 
                required 
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" 
              />
            </div>
            <div>
              <label htmlFor="end_date" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                {isDepositInvoice ? '押金結束日期' : '租賃結束日期'}
              </label>
              <input 
                type="date" 
                name="end_date" 
                id="end_date" 
                value={formData.end_date} 
                onChange={handleChange} 
                required 
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" 
              />
            </div>
        </div>
        
        <div>
          <label htmlFor="status" className="block text-sm font-medium text-gray-700 dark:text-gray-300">狀態</label>
          <select 
            name="status" 
            id="status" 
            value={formData.status} 
            onChange={handleChange} 
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          >
            <option value="pending">待付款</option>
            <option value="paid">已付款</option>
            <option value="overdue">逾期</option>
          </select>
        </div>
        
        <div>
          <label htmlFor="notes" className="block text-sm font-medium text-gray-700 dark:text-gray-300">備註</label>
          <textarea 
            name="notes" 
            id="notes" 
            rows="3" 
            value={formData.notes} 
            onChange={handleChange} 
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
        </div>
        
        <div className="pt-4 flex justify-end space-x-2">
          <button 
            type="button" 
            onClick={onClose} 
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-500 dark:hover:bg-gray-600"
          >
            取消
          </button>
          <button 
            type="submit" 
            disabled={submitting}
            className={`px-4 py-2 text-sm font-medium text-white border border-transparent rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 ${
              submitting 
                ? 'bg-gray-400 cursor-not-allowed' 
                : isDepositInvoice 
                  ? 'bg-orange-600 hover:bg-orange-700 focus:ring-orange-500' 
                  : 'bg-primary-600 hover:bg-primary-700 focus:ring-primary-500'
            }`}
          >
            {submitting ? '處理中...' : isEditing ? '保存更改' : isDepositInvoice ? '新增押金發票' : '新增發票'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default AddInvoiceModal;