import { useState, useEffect } from 'react';
import Modal from './Modal';

const AccountEditModal = ({ isOpen, onClose, accountInfo, onSave }) => {
    const [formData, setFormData] = useState({
        contract_number: '',
        employee_names: [],
        rental_amount: '',
        property_name: '',
        frequency: 1,
        notes: ''
    });
    const [employeeNamesText, setEmployeeNamesText] = useState('');

    useEffect(() => {
        if (accountInfo) {
            setFormData({
                contract_number: accountInfo.contract_number || '',
                employee_names: accountInfo.employee_names || [],
                rental_amount: accountInfo.rental_amount || '',
                property_name: accountInfo.property_name || '',
                frequency: accountInfo.frequency || 1,
                notes: accountInfo.notes || ''
            });
            setEmployeeNamesText((accountInfo.employee_names || []).join(', '));
        }
    }, [accountInfo]);

    const handleSubmit = (e) => {
        e.preventDefault();

        // Parse employee names from text
        const employeeNames = employeeNamesText
            .split(',')
            .map(name => name.trim())
            .filter(name => name.length > 0);

        const updatedInfo = {
            ...formData,
            employee_names: employeeNames,
            rental_amount: parseFloat(formData.rental_amount) || 0
        };

        onSave(updatedInfo);
    };

    const handleInputChange = (field, value) => {
        setFormData(prev => ({
            ...prev,
            [field]: value
        }));
    };

    const calculateTotal = (amount, nEmployees, frequency) => {
        const unitPrice = parseFloat(amount) || 0;
        const employees = parseInt(nEmployees) || 1;
        const period = parseInt(frequency) || 1;
        return unitPrice * employees * period;
    };

    const formatCurrency = (amount) => {
        const numericAmount = parseFloat(amount || 0);
        return new Intl.NumberFormat('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
            useGrouping: true
        }).format(numericAmount);
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="編輯帳戶資訊">
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        合約號碼 <span className="text-red-500">*</span>
                    </label>
                    <input
                        type="text"
                        value={formData.contract_number}
                        disabled
                        className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 text-gray-500 cursor-not-allowed focus:outline-none dark:bg-gray-700 dark:border-gray-600 dark:text-gray-400"
                        placeholder="合約號碼不可編輯"
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        合約號碼不可修改
                    </p>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        租戶姓名 <span className="text-red-500">*</span>
                    </label>
                    <input
                        type="text"
                        value={employeeNamesText}
                        onChange={(e) => setEmployeeNamesText(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white dark:border-gray-600"
                        placeholder="輸入租戶姓名，多個姓名用逗號分隔"
                        required
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        多個租戶請用逗號分隔，例如：張三, 李四
                    </p>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        租金單價 <span className="text-red-500">*</span>
                    </label>
                    <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.rental_amount}
                        onChange={(e) => handleInputChange('rental_amount', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white dark:border-gray-600"
                        placeholder="輸入每人每月租金單價"
                        required
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        每人每月的租金單價
                    </p>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        物業名稱
                    </label>
                    <input
                        type="text"
                        value={formData.property_name}
                        onChange={(e) => handleInputChange('property_name', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white dark:border-gray-600"
                        placeholder="輸入物業名稱"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        租期 (月) <span className="text-red-500">*</span>
                    </label>
                    <select
                        value={formData.frequency}
                        onChange={(e) => handleInputChange('frequency', parseInt(e.target.value))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white dark:border-gray-600"
                        required
                    >
                        <option value={1}>1個月 (月租)</option>
                        <option value={2}>2個月</option>
                        <option value={3}>3個月 (季租)</option>
                        <option value={6}>6個月 (半年租)</option>
                        <option value={12}>12個月 (年租)</option>
                    </select>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        選擇租期長度，影響發票的開始和結束日期
                    </p>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        備註
                    </label>
                    <textarea
                        value={formData.notes}
                        onChange={(e) => handleInputChange('notes', e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white dark:border-gray-600"
                        placeholder="輸入備註資訊"
                    />
                </div>

                {/* Total Calculation Preview */}
                {formData.rental_amount && employeeNamesText && formData.frequency && (
                    <div className="bg-green-50 dark:bg-green-900 p-3 rounded-md">
                        <h4 className="text-sm font-medium text-green-900 dark:text-green-100 mb-2">
                            租金總額預覽
                        </h4>
                        <div className="text-sm text-green-800 dark:text-green-200">
                            <div className="flex justify-between">
                                <span>單價:</span>
                                <span>{formatCurrency(formData.rental_amount)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>人數:</span>
                                <span>{employeeNamesText.split(',').filter(name => name.trim()).length}人</span>
                            </div>
                            <div className="flex justify-between">
                                <span>租期:</span>
                                <span>{formData.frequency}個月</span>
                            </div>
                            <hr className="my-2 border-green-200 dark:border-green-700" />
                            <div className="flex justify-between font-medium">
                                <span>總金額:</span>
                                <span className="text-lg">
                                    {formatCurrency(calculateTotal(
                                        formData.rental_amount,
                                        employeeNamesText.split(',').filter(name => name.trim()).length,
                                        formData.frequency
                                    ))}
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                <div className="flex justify-end space-x-3 pt-4">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-white dark:border-gray-600 dark:hover:bg-gray-700"
                    >
                        取消
                    </button>
                    <button
                        type="submit"
                        className="px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
                    >
                        保存更改
                    </button>
                </div>
            </form>
        </Modal>
    );
};

export default AccountEditModal; 