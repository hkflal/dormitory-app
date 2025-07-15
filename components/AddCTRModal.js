import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, updateDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import Modal from './Modal';

const AddCTRModal = ({ isOpen, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    contract_number: '',
    selected_employees: [],
    notes: ''
  });

  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [availableEmployees, setAvailableEmployees] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [validationError, setValidationError] = useState('');

  // Fetch employees without contract numbers
  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        const employeesSnapshot = await getDocs(collection(db, 'employees'));
        const employeesData = employeesSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        setEmployees(employeesData);

        // Filter employees without contract numbers
        // Check both contractNumber and activeCtr fields
        const available = employeesData.filter(emp => 
          !emp.contractNumber && !emp.activeCtr && !emp.contract_number
        );
        
        setAvailableEmployees(available);
      } catch (error) {
        console.error('Error fetching employees:', error);
      }
    };

    if (isOpen) {
      fetchEmployees();
      // Reset form when modal opens
      setFormData({
        contract_number: '',
        selected_employees: [],
        notes: ''
      });
      setSearchTerm('');
      setValidationError('');
    }
  }, [isOpen]);

  // Filter employees based on search term
  const filteredEmployees = availableEmployees.filter(employee => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      employee.name?.toLowerCase().includes(searchLower) ||
      employee.employee_id?.toLowerCase().includes(searchLower) ||
      employee.uid?.toLowerCase().includes(searchLower) ||
      employee.company?.toLowerCase().includes(searchLower)
    );
  });

  // Validate CTR number doesn't exist
  const validateCTR = async (ctrNumber) => {
    if (!ctrNumber.trim()) {
      setValidationError('請輸入合約號碼');
      return false;
    }

    try {
      // Check in invoices collection
      const invoicesQuery = query(
        collection(db, 'invoices'), 
        where('contract_number', '==', ctrNumber)
      );
      const invoicesSnapshot = await getDocs(invoicesQuery);

      if (!invoicesSnapshot.empty) {
        setValidationError(`合約號碼 ${ctrNumber} 已存在於發票系統中`);
        return false;
      }

      // Check in employees collection for existing CTR
      const employeesWithCTR = employees.filter(emp => 
        emp.contractNumber === ctrNumber || 
        emp.activeCtr === ctrNumber ||
        emp.contract_number === ctrNumber
      );

      if (employeesWithCTR.length > 0) {
        setValidationError(`合約號碼 ${ctrNumber} 已被 ${employeesWithCTR.length} 位員工使用`);
        return false;
      }

      setValidationError('');
      return true;
    } catch (error) {
      console.error('Error validating CTR:', error);
      setValidationError('驗證合約號碼時發生錯誤');
      return false;
    }
  };

  const handleChange = async (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));

    // Validate CTR when it changes
    if (name === 'contract_number') {
      await validateCTR(value);
    }
  };

  const handleEmployeeToggle = (employeeId) => {
    setFormData(prev => ({
      ...prev,
      selected_employees: prev.selected_employees.includes(employeeId)
        ? prev.selected_employees.filter(id => id !== employeeId)
        : [...prev.selected_employees, employeeId]
    }));
  };

  const handleSelectAll = () => {
    const allFilteredIds = filteredEmployees.map(emp => emp.id);
    setFormData(prev => ({
      ...prev,
      selected_employees: allFilteredIds
    }));
  };

  const handleDeselectAll = () => {
    setFormData(prev => ({
      ...prev,
      selected_employees: []
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (formData.selected_employees.length === 0) {
      alert('請至少選擇一個員工');
      return;
    }

    // Final validation
    const isValid = await validateCTR(formData.contract_number);
    if (!isValid) {
      return;
    }

    setLoading(true);
    try {
      // Update selected employees with the CTR number
      const updatePromises = formData.selected_employees.map(employeeId => {
        const employeeRef = doc(db, 'employees', employeeId);
        return updateDoc(employeeRef, {
          activeCtr: formData.contract_number,
          contractNumber: formData.contract_number, // Update both fields for compatibility
          updatedAt: new Date()
        });
      });

      await Promise.all(updatePromises);

      // Get selected employee names for success message
      const selectedEmployeesData = employees.filter(emp => 
        formData.selected_employees.includes(emp.id)
      );
      const employeeNames = selectedEmployeesData.map(emp => emp.name).join(', ');

      alert(`成功為 ${formData.selected_employees.length} 位員工 (${employeeNames}) 分配合約號碼: ${formData.contract_number}`);
      
      if (onSave) {
        onSave();
      }
      onClose();

    } catch (error) {
      console.error('Error creating CTR:', error);
      alert('創建合約時發生錯誤: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="新增合約 (CTR)">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Contract Number */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            合約號碼 *
          </label>
          <input
            type="text"
            name="contract_number"
            value={formData.contract_number}
            onChange={handleChange}
            className={`w-full px-4 py-3 border ${validationError ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'} rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100`}
            placeholder="例如: D10199"
            required
          />
          {validationError && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">{validationError}</p>
          )}
        </div>

        {/* Employee Search */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            搜尋員工
          </label>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            placeholder="搜尋姓名、員工編號或公司..."
          />
        </div>

        {/* Employee Selection */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              選擇員工 * ({formData.selected_employees.length} / {filteredEmployees.length} 已選擇)
            </label>
            <div className="space-x-2">
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
              >
                全選
              </button>
              <button
                type="button"
                onClick={handleDeselectAll}
                className="text-xs text-gray-600 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
              >
                清除
              </button>
            </div>
          </div>
          
          <div className="max-h-64 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-lg p-3 bg-gray-50 dark:bg-gray-800">
            {availableEmployees.length === 0 ? (
              <div className="text-gray-500 dark:text-gray-400 text-center py-4">
                沒有未分配合約的員工
              </div>
            ) : filteredEmployees.length === 0 ? (
              <div className="text-gray-500 dark:text-gray-400 text-center py-4">
                沒有符合搜尋條件的員工
              </div>
            ) : (
              filteredEmployees.map(employee => (
                <label key={employee.id} className="flex items-center space-x-3 p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.selected_employees.includes(employee.id)}
                    onChange={() => handleEmployeeToggle(employee.id)}
                    className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {employee.name}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {employee.employee_id || employee.uid || 'No ID'} • {employee.company || '無公司'}
                      {employee.assignedProperty && ` • ${employee.assignedProperty}`}
                    </div>
                  </div>
                </label>
              ))
            )}
          </div>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            顯示所有尚未分配合約號碼的員工
          </p>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            備註
          </label>
          <textarea
            name="notes"
            value={formData.notes}
            onChange={handleChange}
            rows={3}
            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            placeholder="合約備註..."
          />
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200 dark:border-gray-600">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={loading || !!validationError}
            className="px-6 py-3 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? '創建中...' : '創建合約'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default AddCTRModal; 
