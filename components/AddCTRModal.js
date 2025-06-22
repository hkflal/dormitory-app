import { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, query, where, updateDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import Modal from './Modal';

const AddCTRModal = ({ isOpen, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    contract_number: '',
    selected_employees: [],
    property_name: '',
    monthly_rent: '',
    start_date: '',
    end_date: '',
    notes: ''
  });

  const [employees, setEmployees] = useState([]);
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(false);
  const [availableEmployees, setAvailableEmployees] = useState([]);

  // Fetch initial data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [employeesSnapshot, propertiesSnapshot] = await Promise.all([
          getDocs(collection(db, 'employees')),
          getDocs(collection(db, 'properties'))
        ]);

        const employeesData = employeesSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        const propertiesData = propertiesSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        setEmployees(employeesData);
        setProperties(propertiesData);

        // Filter available employees (those without assigned properties)
        const available = employeesData.filter(emp => !emp.assigned_property_id && !emp.assignedProperty);
        setAvailableEmployees(available);

      } catch (error) {
        console.error('Error fetching data:', error);
      }
    };

    if (isOpen) {
      fetchData();
    }
  }, [isOpen]);

  // Generate contract number based on property and date
  const generateContractNumber = () => {
    if (!formData.property_name || !formData.start_date) return '';
    
    const property = properties.find(p => p.name === formData.property_name);
    if (!property) return '';

    const startDate = new Date(formData.start_date);
    const year = startDate.getFullYear().toString().slice(-2);
    const month = String(startDate.getMonth() + 1).padStart(2, '0');
    
    // Use property code or first letter of property name
    const propertyCode = property.code || property.name.charAt(0).toUpperCase();
    
    return `${propertyCode}${year}${month}`;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const updated = { ...prev, [name]: value };
      
      // Auto-generate contract number when property or date changes
      if (name === 'property_name' || name === 'start_date') {
        updated.contract_number = generateContractNumber();
      }
      
      return updated;
    });
  };

  const handleEmployeeToggle = (employeeId) => {
    setFormData(prev => ({
      ...prev,
      selected_employees: prev.selected_employees.includes(employeeId)
        ? prev.selected_employees.filter(id => id !== employeeId)
        : [...prev.selected_employees, employeeId]
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (formData.selected_employees.length === 0) {
      alert('請至少選擇一個員工');
      return;
    }

    setLoading(true);
    try {
      // Get selected employee names and company
      const selectedEmployeesData = employees.filter(emp => 
        formData.selected_employees.includes(emp.id)
      );
      
      const employeeNames = selectedEmployeesData.map(emp => emp.name);
      // Get company from first selected employee
      const company = selectedEmployeesData[0]?.company || 'Unknown Company';

      // Create contract record
      const contractData = {
        contract_number: formData.contract_number,
        company: company, // Auto-detected from selected employees
        employee_names: employeeNames,
        employee_ids: formData.selected_employees,
        property_name: formData.property_name,
        monthly_rent: parseFloat(formData.monthly_rent),
        start_date: new Date(formData.start_date),
        end_date: new Date(formData.end_date),
        notes: formData.notes,
        status: 'active',
        created_at: new Date()
      };

      // Add to contracts collection
      await addDoc(collection(db, 'contracts'), contractData);

      // Update selected employees with property assignment
      const property = properties.find(p => p.name === formData.property_name);
      if (property) {
        const batch = [];
        for (const employeeId of formData.selected_employees) {
          const employeeRef = doc(db, 'employees', employeeId);
          batch.push(updateDoc(employeeRef, {
            assigned_property_id: property.id,
            assignedProperty: property.name,
            status: 'housed'
          }));
        }
        await Promise.all(batch);
      }

      alert('合約創建成功！');
      onSave();
      onClose();
      
      // Reset form
      setFormData({
        contract_number: '',
        selected_employees: [],
        property_name: '',
        monthly_rent: '',
        start_date: '',
        end_date: '',
        notes: ''
      });

    } catch (error) {
      console.error('Error creating contract:', error);
      alert('創建合約時發生錯誤');
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
            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            placeholder="自動生成或手動輸入"
            required
          />
        </div>

        {/* Property Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            物業 *
          </label>
          <select
            name="property_name"
            value={formData.property_name}
            onChange={handleChange}
            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            required
          >
            <option value="">選擇物業</option>
            {properties.map(property => (
              <option key={property.id} value={property.name}>{property.name}</option>
            ))}
          </select>
        </div>

        {/* Employee Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            選擇員工 * ({formData.selected_employees.length} 已選擇)
          </label>
          <div className="max-h-48 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-lg p-3 bg-gray-50 dark:bg-gray-800">
            {availableEmployees.length === 0 ? (
              <div className="text-gray-500 dark:text-gray-400 text-center py-4">
                沒有可用員工
              </div>
            ) : (
              availableEmployees.map(employee => (
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
                      {employee.employee_id} • {employee.company}
                    </div>
                  </div>
                </label>
              ))
            )}
          </div>
        </div>

        {/* Monthly Rent */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            月租金 (HK$) *
          </label>
          <input
            type="number"
            name="monthly_rent"
            value={formData.monthly_rent}
            onChange={handleChange}
            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            placeholder="20000"
            required
          />
        </div>

        {/* Date Range */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              開始日期 *
            </label>
            <input
              type="date"
              name="start_date"
              value={formData.start_date}
              onChange={handleChange}
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              結束日期 *
            </label>
            <input
              type="date"
              name="end_date"
              value={formData.end_date}
              onChange={handleChange}
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              required
            />
          </div>
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
            disabled={loading}
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
