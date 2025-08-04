import { useState } from 'react';
import { 
  XMarkIcon,
  CalendarDaysIcon,
  CurrencyDollarIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';
import Modal from './Modal';

export default function MonthlySnapshotModal({ 
  isOpen, 
  onClose, 
  onCreateSnapshot,
  loading = false 
}) {
  const [formData, setFormData] = useState({
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
    notes: ''
  });
  const [previewData, setPreviewData] = useState(null);
  const [validationErrors, setValidationErrors] = useState([]);

  const monthNames = [
    '1月', '2月', '3月', '4月', '5月', '6月',
    '7月', '8月', '9月', '10月', '11月', '12月'
  ];

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    
    // Clear preview when form changes
    if (previewData) {
      setPreviewData(null);
    }
  };

  const handlePreview = async () => {
    try {
      setValidationErrors([]);
      
      // Basic validation
      const errors = [];
      if (!formData.year || formData.year < 2020 || formData.year > 2030) {
        errors.push('請選擇有效年份 (2020-2030)');
      }
      if (formData.month < 0 || formData.month > 11) {
        errors.push('請選擇有效月份');
      }
      
      if (errors.length > 0) {
        setValidationErrors(errors);
        return;
      }

      // Call preview function (this would calculate the snapshot data)
      const preview = await calculateSnapshotPreview(formData.year, formData.month);
      setPreviewData(preview);
      
    } catch (error) {
      console.error('Preview error:', error);
      setValidationErrors(['預覽計算失敗：' + error.message]);
    }
  };

  const handleCreate = async () => {
    if (!previewData) {
      setValidationErrors(['請先預覽快照數據']);
      return;
    }

    try {
      await onCreateSnapshot({
        year: formData.year,
        month: formData.month,
        notes: formData.notes || `手動建立 - ${formData.year}年${formData.month + 1}月快照`
      });
      
      // Reset form
      setFormData({
        year: new Date().getFullYear(),
        month: new Date().getMonth(),
        notes: ''
      });
      setPreviewData(null);
      setValidationErrors([]);
      
    } catch (error) {
      console.error('Create snapshot error:', error);
      setValidationErrors(['建立快照失敗：' + error.message]);
    }
  };

  const calculateSnapshotPreview = async (year, month) => {
    // This would normally call the actual calculation function
    // For now, return mock data to show the structure
    return {
      total_rent_cost: 150000,
      total_receivable_rent: 245000,
      actual_received_rent: 220000,
      number_of_employees: 70,
      properties_count: 12,
      collection_rate: 89.8
    };
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('zh-TW', { 
      style: 'currency', 
      currency: 'TWD',
      minimumFractionDigits: 0 
    }).format(amount || 0);
  };

  const resetForm = () => {
    setFormData({
      year: new Date().getFullYear(),
      month: new Date().getMonth(),
      notes: ''
    });
    setPreviewData(null);
    setValidationErrors([]);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="建立月度財務快照">
      <div className="space-y-6">
        {/* Form Section */}
        <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center">
            <CalendarDaysIcon className="h-5 w-5 mr-2" />
            選擇快照期間
          </h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                年份
              </label>
              <select
                value={formData.year}
                onChange={(e) => handleInputChange('year', parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                {Array.from({ length: 11 }, (_, i) => 2020 + i).map(year => (
                  <option key={year} value={year}>{year}年</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                月份
              </label>
              <select
                value={formData.month}
                onChange={(e) => handleInputChange('month', parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                {monthNames.map((month, index) => (
                  <option key={index} value={index}>{month}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              備註 (選填)
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => handleInputChange('notes', e.target.value)}
              placeholder="輸入快照備註..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </div>

          <div className="mt-4 flex justify-between">
            <button
              onClick={resetForm}
              className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
            >
              重設
            </button>
            <button
              onClick={handlePreview}
              disabled={loading}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
            >
              預覽數據
            </button>
          </div>
        </div>

        {/* Validation Errors */}
        {validationErrors.length > 0 && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <div className="flex items-center mb-2">
              <ExclamationTriangleIcon className="h-5 w-5 text-red-500 mr-2" />
              <h4 className="text-red-800 dark:text-red-200 font-medium">驗證錯誤</h4>
            </div>
            <ul className="list-disc list-inside text-red-700 dark:text-red-300 text-sm">
              {validationErrors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Preview Section */}
        {previewData && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-green-800 dark:text-green-200 mb-4 flex items-center">
              <CurrencyDollarIcon className="h-5 w-5 mr-2" />
              快照預覽 - {formData.year}年{monthNames[formData.month]}
            </h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-white dark:bg-gray-800 p-3 rounded border">
                <p className="text-sm text-gray-600 dark:text-gray-400">總租金成本</p>
                <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  {formatCurrency(previewData.total_rent_cost)}
                </p>
              </div>
              
              <div className="bg-white dark:bg-gray-800 p-3 rounded border">
                <p className="text-sm text-gray-600 dark:text-gray-400">應收租金總額</p>
                <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  {formatCurrency(previewData.total_receivable_rent)}
                </p>
              </div>
              
              <div className="bg-white dark:bg-gray-800 p-3 rounded border">
                <p className="text-sm text-gray-600 dark:text-gray-400">實際收到租金</p>
                <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  {formatCurrency(previewData.actual_received_rent)}
                </p>
              </div>
              
              <div className="bg-white dark:bg-gray-800 p-3 rounded border">
                <p className="text-sm text-gray-600 dark:text-gray-400">收款率</p>
                <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  {previewData.collection_rate.toFixed(1)}%
                </p>
              </div>
              
              <div className="bg-white dark:bg-gray-800 p-3 rounded border">
                <p className="text-sm text-gray-600 dark:text-gray-400">員工人數</p>
                <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  {previewData.number_of_employees} 人
                </p>
              </div>
              
              <div className="bg-white dark:bg-gray-800 p-3 rounded border">
                <p className="text-sm text-gray-600 dark:text-gray-400">物業數量</p>
                <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  {previewData.properties_count} 間
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={handleCreate}
            disabled={!previewData || loading}
            className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50"
          >
            {loading ? '建立中...' : '建立快照'}
          </button>
        </div>
      </div>
    </Modal>
  );
} 