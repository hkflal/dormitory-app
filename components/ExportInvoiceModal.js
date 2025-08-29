import { useState } from 'react';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { XMarkIcon, DocumentArrowDownIcon } from '@heroicons/react/24/solid';

const ExportInvoiceModal = ({ isOpen, onClose }) => {
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [isExporting, setIsExporting] = useState(false);

    const handleExport = async () => {
        if (!startDate || !endDate) {
            alert('請選擇開始和結束日期');
            return;
        }

        if (new Date(startDate) > new Date(endDate)) {
            alert('開始日期不能晚於結束日期');
            return;
        }

        setIsExporting(true);
        try {
            // Query invoices from Firestore
            const invoicesRef = collection(db, 'invoices');
            let invoicesQuery = invoicesRef;

            // Add status filter if not 'all'
            if (statusFilter !== 'all') {
                invoicesQuery = query(invoicesRef, where('status', '==', statusFilter));
            }

            const querySnapshot = await getDocs(invoicesQuery);
            const invoices = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            // ALSO fetch employees to get company information
            const employeesRef = collection(db, 'employees');
            const employeesSnapshot = await getDocs(employeesRef);
            const employees = employeesSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            // Enrich invoices with company data from employees
            const enrichedInvoices = invoices.map(invoice => {
                // Find company name from employees
                let company = '';
                
                // Strategy 1: Find by contract number
                const employeesByContract = employees.filter(emp => {
                    const contractId = emp.financials?.contractId || emp.contractNumber || emp.contract_number;
                    return contractId === invoice.contract_number;
                });
                
                if (employeesByContract.length > 0) {
                    const companies = employeesByContract
                        .map(emp => emp.company)
                        .filter(comp => comp && comp.trim() !== '');
                    if (companies.length > 0) {
                        company = companies[0];
                    }
                }
                
                // Strategy 2: Find by employee names if no company found
                if (!company && invoice.employee_names && invoice.employee_names.length > 0) {
                    for (const empName of invoice.employee_names) {
                        const employee = employees.find(emp => emp.name === empName);
                        if (employee && employee.company && employee.company.trim() !== '') {
                            company = employee.company;
                            break;
                        }
                    }
                }
                
                return {
                    ...invoice,
                    company: company
                };
            });

            // Filter by date range - check if invoice period overlaps with selected range
            const filterStartDate = new Date(startDate);
            const filterEndDate = new Date(endDate);
            
            const filteredInvoices = enrichedInvoices.filter(invoice => {
                const invoiceStartDate = invoice.start_date?.toDate ? invoice.start_date.toDate() : new Date(invoice.start_date);
                const invoiceEndDate = invoice.end_date?.toDate ? invoice.end_date.toDate() : new Date(invoice.end_date);
                
                // Check if invoice period overlaps with filter period
                return invoiceStartDate <= filterEndDate && invoiceEndDate >= filterStartDate;
            });

            if (filteredInvoices.length === 0) {
                alert('沒有找到符合條件的發票記錄');
                return;
            }

            // Generate CSV content
            const csvContent = generateCSV(filteredInvoices);
            
            // Download CSV
            downloadCSV(csvContent, `invoices_${startDate}_to_${endDate}.csv`);
            
            alert(`成功導出 ${filteredInvoices.length} 條記錄`);
            onClose();
        } catch (error) {
            console.error('Export error:', error);
            alert('導出失敗，請重試');
        } finally {
            setIsExporting(false);
        }
    };

    const generateCSV = (invoices) => {
        const headers = [
            '發票號碼',
            '合約號碼', 
            '員工姓名',
            '公司',
            '金額',
            '人數',
            '頻率',
            '總金額',
            '開始日期',
            '結束日期',
            '狀態',
            '已開出',
            '創建日期',
            '收據URL',
            'DOCX URL'
        ];

        const rows = invoices.map(invoice => {
            const totalAmount = (invoice.amount || 0) * (invoice.n_employees || 1) * (invoice.frequency || 1);
            const startDate = invoice.start_date?.toDate ? invoice.start_date.toDate().toLocaleDateString('zh-HK') : (invoice.start_date ? new Date(invoice.start_date).toLocaleDateString('zh-HK') : 'N/A');
            const endDate = invoice.end_date?.toDate ? invoice.end_date.toDate().toLocaleDateString('zh-HK') : (invoice.end_date ? new Date(invoice.end_date).toLocaleDateString('zh-HK') : 'N/A');
            const createdDate = invoice.created_at?.toDate ? invoice.created_at.toDate().toLocaleDateString('zh-HK') : (invoice.createdAt?.toDate ? invoice.createdAt.toDate().toLocaleDateString('zh-HK') : 'N/A');
            
            const statusMap = {
                'paid': '已付款',
                'pending': '待付款', 
                'overdue': '逾期',
                'deposit': '按金/押金',
                'newly_signed': '新簽約'
            };

            return [
                invoice.invoice_number || '',
                invoice.contract_number || '',
                (invoice.employee_names || []).join('; '),
                invoice.company || '',
                invoice.amount || 0,
                invoice.n_employees || 1,
                invoice.frequency || 1,
                totalAmount,
                startDate,
                endDate,
                statusMap[invoice.status] || invoice.status || '',
                invoice.is_issued ? '是' : '否',
                createdDate,
                invoice.receiptUrl || '',
                invoice.docx_url || invoice.docxUrl || ''
            ];
        });

        // Convert to CSV format
        const csvRows = [headers, ...rows];
        return csvRows.map(row => 
            row.map(field => {
                // Handle fields that might contain commas or quotes
                const stringField = String(field);
                if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) {
                    return `"${stringField.replace(/"/g, '""')}"`;
                }
                return stringField;
            }).join(',')
        ).join('\n');
    };

    const downloadCSV = (content, filename) => {
        const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                            導出發票記錄
                        </h3>
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        >
                            <XMarkIcon className="h-6 w-6" />
                        </button>
                    </div>
                </div>

                <div className="px-6 py-4 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            開始日期
                        </label>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            結束日期
                        </label>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            狀態篩選
                        </label>
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                        >
                            <option value="all">全部狀態</option>
                            <option value="paid">已付款</option>
                            <option value="pending">待付款</option>
                            <option value="overdue">逾期</option>
                            <option value="deposit">按金/押金</option>
                            <option value="newly_signed">新簽約</option>
                        </select>
                    </div>

                    <div className="text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 p-3 rounded-md">
                        <p className="mb-1">篩選說明：</p>
                        <p>• 將導出發票期間與所選日期範圍有重疊的所有記錄</p>
                        <p>• CSV文件將包含收據和文檔的下載連結</p>
                    </div>
                </div>

                <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700 rounded-b-lg flex justify-end space-x-3">
                    <button
                        onClick={onClose}
                        disabled={isExporting}
                        className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md shadow-sm hover:bg-gray-50 dark:hover:bg-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
                    >
                        取消
                    </button>
                    <button
                        onClick={handleExport}
                        disabled={isExporting}
                        className="px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 flex items-center"
                    >
                        {isExporting ? (
                            <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                導出中...
                            </>
                        ) : (
                            <>
                                <DocumentArrowDownIcon className="h-4 w-4 mr-2" />
                                導出CSV
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ExportInvoiceModal;