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

// Update the handleSubmit function to include computed fields
const handleSubmit = async (e) => {
  e.preventDefault();
  
  try {
    // Parse employee names
    const employeeNamesArray = formData.employee_names
      .split(',')
      .map(name => name.trim())
      .filter(name => name.length > 0);
    
    // Calculate computed fields
    const frequency = calculateFrequency(formData.start_date, formData.end_date);
    const nEmployees = calculateNEmployees(employeeNamesArray);
    
    const invoiceData = {
      ...formData,
      employee_names: employeeNamesArray,
      amount: parseFloat(formData.amount) || 0,
      is_deposit: isDepositInvoice,
      frequency: frequency, // Add computed field
      n_employees: nEmployees, // Add computed field
      created_at: new Date(),
      updated_at: new Date()
    };
    
    if (isEditing) {
      const invoiceRef = doc(db, 'invoices', invoiceData.id);
      await updateDoc(invoiceRef, {
        ...invoiceData,
        updated_at: new Date()
      });
    } else {
      await addDoc(collection(db, 'invoices'), invoiceData);
    }
    
    onSave();
    onClose();
  } catch (error) {
    console.error('Error saving invoice:', error);
    alert('保存發票時發生錯誤');
  }
};

const AddInvoiceModal = ({ isOpen, onClose, onSave, invoiceData, isDepositInvoice = false }) => {
  const [formData, setFormData] = useState({
    invoice_number: '',
    contract_number: '',
    employee_names: '', // Storing as a comma-separated string in the form
    amount: '',
    start_date: '',
    end_date: '',
    status: 'pending',
    notes: '',
    total: '', // Add total field
    is_deposit: false
  });

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
          amount: invoiceData.amount || '',
          start_date: formatDateForInput(invoiceData.start_date),
          end_date: formatDateForInput(invoiceData.end_date),
          status: invoiceData.status || 'pending',
          notes: invoiceData.notes || '',
          total: invoiceData.total || invoiceData.amount || '',
          is_deposit: invoiceData.is_deposit || false
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
          is_deposit: isDepositInvoice
        });
      }
    };

    if (isOpen) {
      initializeForm();
    }
  }, [invoiceData, isEditing, isOpen, isDepositInvoice]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Convert employee_names string back to an array
    const submissionData = {
        ...formData,
        employee_names: formData.employee_names.split(',').map(name => name.trim()).filter(Boolean),
        amount: parseFloat(formData.amount),
        total: parseFloat(formData.total) || parseFloat(formData.amount),
        start_date: new Date(formData.start_date),
        end_date: new Date(formData.end_date),
        created_at: isEditing ? invoiceData.created_at : new Date(),
        updated_at: new Date(),
        is_deposit: isDepositInvoice || formData.is_deposit,
        template_type: isDepositInvoice ? 'deposit' : 'invoice' // Track which template to use
    };

    try {
      if (isEditing) {
        // Update existing invoice in Firestore
        const invoiceRef = doc(db, 'invoices', invoiceData.id);
        await updateDoc(invoiceRef, submissionData);
      } else {
        // Add new invoice to Firestore
        await addDoc(collection(db, 'invoices'), submissionData);
      }

      onSave(); // This will refetch the invoices list
      onClose();
    } catch (error) {
      console.error(error);
      alert(`錯誤: ${error.message}`);
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
          <label htmlFor="employee_names" className="block text-sm font-medium text-gray-700 dark:text-gray-300">員工姓名 (用逗號分隔)</label>
          <input 
            type="text" 
            name="employee_names" 
            id="employee_names" 
            value={formData.employee_names} 
            onChange={handleChange} 
            required 
            placeholder="例如: 陈裕维, 黄锡球"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" 
          />
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="amount" className="block text-sm font-medium text-gray-700 dark:text-gray-300">金額 (HK$)</label>
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
          <div>
            <label htmlFor="total" className="block text-sm font-medium text-gray-700 dark:text-gray-300">總計 (HK$)</label>
            <input 
              type="number" 
              name="total" 
              id="total" 
              value={formData.total} 
              onChange={handleChange} 
              step="0.01"
              placeholder="如未指定則與金額相同"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" 
            />
          </div>
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
            className={`px-4 py-2 text-sm font-medium text-white border border-transparent rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 ${
              isDepositInvoice 
                ? 'bg-orange-600 hover:bg-orange-700 focus:ring-orange-500' 
                : 'bg-primary-600 hover:bg-primary-700 focus:ring-primary-500'
            }`}
          >
            {isEditing ? '保存更改' : isDepositInvoice ? '新增押金發票' : '新增發票'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default AddInvoiceModal;