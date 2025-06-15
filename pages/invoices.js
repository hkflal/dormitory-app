import { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, writeBatch, query, where, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useRouter } from 'next/router';
import { PlusIcon, ArrowDownTrayIcon, PencilIcon, TrashIcon, ArrowPathIcon } from '@heroicons/react/24/solid';
import { InformationCircleIcon } from '@heroicons/react/24/outline';
import AddInvoiceModal from '../components/AddInvoiceModal';

const InvoicesPage = () => {
    const { currentUser, login } = useAuth();
    const router = useRouter();
    const [invoices, setInvoices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [groupedBy, setGroupedBy] = useState('status'); // Fixed to 'status' only
    const [openGroups, setOpenGroups] = useState({});
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingInvoice, setEditingInvoice] = useState(null);
    const [updatingStatus, setUpdatingStatus] = useState({});
    const [generatingPdf, setGeneratingPdf] = useState(null);
    const [showInfoModal, setShowInfoModal] = useState(false);
    const [infoModalMessage, setInfoModalMessage] = useState('');
    const [searchTerm, setSearchTerm] = useState("");
    const [ctrInput, setCtrInput] = useState(""); // New state for CTR input

    const fetchInvoices = useCallback(async () => {
        if (!currentUser) {
            console.log('No authenticated user, skipping fetch');
            setLoading(false);
            return;
        }
        
        setLoading(true);
        try {
            // Fetch invoices directly from Firestore
            const invoicesRef = collection(db, 'invoices');
            const invoicesSnapshot = await getDocs(invoicesRef);
            let invoicesData = invoicesSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            
            // Auto-update status for overdue invoices on load
            const today = new Date();
            today.setHours(0, 0, 0, 0); 
            const batch = writeBatch(db);
            let updatesMade = 0;
            
            invoicesData = invoicesData.map(invoice => {
                // Convert Firestore timestamp to Date if needed
                let endDate = invoice.end_date;
                if (endDate && endDate.toDate) {
                    endDate = endDate.toDate();
                } else if (endDate) {
                    endDate = new Date(endDate);
                }

                if (endDate && invoice.status === 'pending' && endDate < today) {
                    const invoiceRef = doc(db, 'invoices', invoice.id);
                    batch.update(invoiceRef, { status: 'overdue' });
                    updatesMade++;
                    return { ...invoice, status: 'overdue' };
                }
                return invoice;
            });

            if (updatesMade > 0) {
                await batch.commit();
                console.log(`Updated ${updatesMade} overdue invoices`);
            }
            
            setInvoices(invoicesData);
        } catch (error) {
            console.error('Error fetching invoices:', error);
        } finally {
            setLoading(false);
        }
    }, [groupedBy, currentUser]);

    useEffect(() => {
        fetchInvoices();
    }, [fetchInvoices]);

    const groupInvoices = (invoices) => {
        return invoices.reduce((acc, invoice) => {
            const key = getStatusLabel(invoice.status);
            if (!acc[key]) {
                acc[key] = [];
            }
            acc[key].push(invoice);
            return acc;
        }, {});
    };
    
    const getStatusLabel = (status) => {
        switch (status) {
            case 'paid': return '已付款';
            case 'pending': return '待付款';
            case 'overdue': return '逾期';
            case 'newly_signed': return '新簽約';
            default: return '未知';
        }
    };
    
    const openEditModal = (invoice) => {
        setEditingInvoice(invoice);
        setShowAddModal(true);
    };

    const handleNavigateToDetail = () => {
        if (ctrInput.trim()) {
            router.push(`/invoice-detail/${ctrInput.trim()}`);
        } else {
            alert('請輸入合約號碼');
        }
    };

    const handleGenerateNewInvoice = async (contractPlaceholder) => {
        // TODO: Implement invoice generation logic directly with Firestore
        // This function needs to be implemented based on business requirements
        alert('Invoice generation feature needs to be implemented. Please create invoices manually for now.');
        
        /* 
        Original API-based implementation (commented out):
        if (loading) return;
        setLoading(true);
        try {
            const response = await fetch('/api/invoices/generate-next', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contractNumber: contractPlaceholder.contract_number }),
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to generate new invoice');
            }
            await fetchInvoices(); // Refresh the list
        } catch (error) {
            console.error('Error generating new invoice:', error);
            alert(`生成新發票時出錯: ${error.message}`);
        } finally {
            setLoading(false);
        }
        */
    };

    const handleDownloadInvoice = async (invoice) => {
        if (!invoice || generatingPdf === invoice.id) return;
        
        if (invoice.status === 'newly_signed') {
            setInfoModalMessage('This is a newly signed contract. Please generate the first invoice using the "Generate First Invoice" button before downloading.');
            setShowInfoModal(true);
            return;
        }
        
        setGeneratingPdf(invoice.id);
        
        try {
            // If DOCX URL exists, download directly
            if (invoice.docx_url) {
                const a = document.createElement('a');
                a.href = invoice.docx_url;
                a.download = `${invoice.invoice_number}.docx`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                setGeneratingPdf(null);
                return;
            }
            
            // Otherwise, generate DOCX manually
            const response = await fetch(`/api/generateInvoiceDocxManual?invoiceId=${invoice.id}`);
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to generate DOCX: ${errorText}`);
            }
            
            // Create blob and download
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${invoice.invoice_number}${invoice.is_deposit ? '_deposit' : ''}.docx`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            
            // Refresh the invoice data to get the updated docx_url
            await fetchInvoices();
            
        } catch (error) {
            console.error('Error downloading invoice:', error);
            setInfoModalMessage(`下載發票時發生錯誤: ${error.message}`);
            setShowInfoModal(true);
        } finally {
            setGeneratingPdf(null);
        }
    };

    const handleStatusChange = async (invoiceId, newStatus) => {
        setUpdatingStatus(prev => ({ ...prev, [invoiceId]: true }));
        try {
            // Update invoice status in Firestore
            const invoiceRef = doc(db, 'invoices', invoiceId);
            await updateDoc(invoiceRef, { 
                status: newStatus,
                updated_at: new Date()
            });
            
            setInvoices(prevInvoices =>
                prevInvoices.map(inv =>
                    inv.id === invoiceId ? { ...inv, status: newStatus } : inv
                )
            );
        } catch (error) {
            console.error('Failed to update status', error);
        } finally {
            setUpdatingStatus(prev => ({ ...prev, [invoiceId]: false }));
        }
    };
    
    const handleDeleteInvoice = async (invoiceId) => {
        if (window.confirm('Are you sure you want to delete this invoice?')) {
            try {
                // Delete invoice from Firestore
                const invoiceRef = doc(db, 'invoices', invoiceId);
                await deleteDoc(invoiceRef);
                
                setInvoices(invoices.filter(i => i.id !== invoiceId));
            } catch (error) {
                console.error('Failed to delete invoice', error);
            }
        }
    };

    const formatCurrency = (amount) => amount != null ? `HK$${Number(amount).toFixed(2)}` : 'N/A';
    const formatDate = (date) => {
        if (!date) return 'N/A';
        // Handle Firestore timestamp
        if (date.toDate) {
            return date.toDate().toLocaleDateString('en-CA');
        }
        // Handle regular date string/object
        return new Date(date).toLocaleDateString('en-CA');
    };
    const getStatusBadge = (status) => {
        const badgeStyles = {
            paid: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
            pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
            overdue: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
            newly_signed: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
        };
        return (
            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${badgeStyles[status] || 'bg-gray-100 text-gray-800'}`}>
                {getStatusLabel(status)}
            </span>
        );
    };

    // Filter invoices by search term
    const filteredInvoices = searchTerm.trim()
        ? invoices.filter(inv =>
            (inv.invoice_number || "").toLowerCase().includes(searchTerm.trim().toLowerCase())
        )
        : invoices;

    const groupedInvoices = groupInvoices(filteredInvoices);

    // Custom sort order for status groups
    const statusOrder = {
        '待付款': 1,     // pending - highest priority
        '逾期': 2,       // overdue - second priority  
        '已付款': 3,     // paid - third priority
        '新簽約': 4      // newly_signed - lowest priority
    };

    const sortedGroupKeys = Object.keys(groupedInvoices).sort((a, b) => {
        // If we have status order defined, use it
        if (statusOrder[a] && statusOrder[b]) {
            return statusOrder[a] - statusOrder[b];
        }
        // Otherwise, alphabetical sort
        return a.localeCompare(b);
    });
    
    const calculateTotal = (amount, nEmployees, frequency) => {
        const unitPrice = parseFloat(amount) || 0;
        const employees = parseInt(nEmployees) || 1;
        const period = parseInt(frequency) || 1;
        return unitPrice * employees * period;
    };

    const InvoiceCard = ({ invoice }) => {
        // Calculate total price for display
        const totalPrice = calculateTotal(invoice.amount, invoice.n_employees, invoice.frequency);
        
        // Special card for newly signed contracts
        if (invoice.status === 'newly_signed') {
            return (
                <div className="px-3 py-2 my-1 bg-white rounded shadow-sm dark:bg-gray-800 border-l-4 border-primary-500 flex items-center min-h-[56px]">
                    <div className="flex-1 min-w-0 pr-2">
                        <span className="text-xs font-medium text-primary-600 truncate dark:text-primary-400 block">合約號碼: {invoice.contract_number}</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400 block">{(invoice.employee_names || []).join(', ')}</span>
                        <span className="mt-1 block">{getStatusBadge(invoice.status)}</span>
                    </div>
                    <button
                        onClick={() => handleGenerateNewInvoice(invoice)}
                        className="inline-flex items-center px-2 py-1 text-xs font-medium text-white bg-primary-600 border border-transparent rounded shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500">
                        <PlusIcon className="w-4 h-4 mr-1 -ml-1" />生成首張發票
                    </button>
                </div>
            );
        }

        // Compact horizontal card for all other invoices
        return (
            <div className="px-3 py-2 my-1 bg-white rounded shadow-sm dark:bg-gray-800 flex items-center min-h-[56px]">
                <div className="flex-1 grid grid-cols-6 gap-2 items-center">
                    <div className="flex flex-col">
                        <span className="text-xs font-medium text-primary-600 truncate dark:text-primary-400">
                            {invoice.invoice_number}
                            {invoice.is_deposit && <span className="ml-1 text-orange-500">(押金)</span>}
                        </span>
                        {invoice.auto_generated && (
                            <span className="text-xs bg-blue-100 text-blue-800 px-1 rounded mt-1 inline-block w-fit dark:bg-blue-900 dark:text-blue-300">
                                自動生成
                            </span>
                        )}
                    </div>
                    <span className="text-xs text-gray-900 dark:text-white">{invoice.contract_number}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {(invoice.employee_names || []).join(', ')}
                        {invoice.n_employees && <span className="ml-1 text-gray-400">({invoice.n_employees}人)</span>}
                    </span>
                    <div className="flex flex-col">
                        <span className="text-xs font-medium text-gray-900 dark:text-white">
                            {formatCurrency(totalPrice)}
                        </span>
                        <span className="text-xs text-gray-400">
                            {formatCurrency(invoice.amount)} × {invoice.n_employees || 1} × {invoice.frequency || 1}
                        </span>
                    </div>
                    <span className="text-xs text-gray-500 dark:text-gray-400">{formatDate(invoice.start_date)} ~ {formatDate(invoice.end_date)}</span>
                    <span>{getStatusBadge(invoice.status)}</span>
                </div>
                <div className="flex items-center space-x-1 ml-2">
                    <button onClick={() => handleDownloadInvoice(invoice)} disabled={generatingPdf === invoice.id} className="p-1 text-green-600 hover:text-green-900 disabled:opacity-50" title={invoice.docx_url ? '下載DOCX' : '下載PDF'}>
                        {generatingPdf === invoice.id ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <ArrowDownTrayIcon className="h-4 w-4" />}
                    </button>
                    <select value={invoice.status} onChange={(e) => handleStatusChange(invoice.id, e.target.value)} disabled={updatingStatus[invoice.id]}
                        className="text-xs border-gray-300 dark:border-gray-600 rounded focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white">
                        <option value="pending">待付款</option>
                        <option value="paid">已付款</option>
                        <option value="overdue">逾期</option>
                    </select>
                    <button onClick={() => openEditModal(invoice)} className="p-1 text-primary-600 hover:text-primary-900" title="編輯">
                        <PencilIcon className="h-4 w-4" />
                    </button>
                    <button onClick={() => handleDeleteInvoice(invoice.id)} className="p-1 text-red-600 hover:text-red-900" title="刪除">
                        <TrashIcon className="h-4 w-4" />
                    </button>
                </div>
            </div>
        );
    };

    const [loginForm, setLoginForm] = useState({ email: 'kazaffong@hkflal.com', password: '' });
    const [loginError, setLoginError] = useState('');
    const [isLoggingIn, setIsLoggingIn] = useState(false);

    const handleLogin = async (e) => {
        e.preventDefault();
        setIsLoggingIn(true);
        setLoginError('');
        try {
            await login(loginForm.email, loginForm.password);
        } catch (error) {
            setLoginError('Invalid email or password. Please try again.');
            console.error('Login error:', error);
        } finally {
            setIsLoggingIn(false);
        }
    };

    if (!currentUser) {
        return (
            <div className="p-4 md:p-6 lg:p-8">
                <div className="max-w-md mx-auto">
                    <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">Sign In Required</h1>
                    <form onSubmit={handleLogin} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Email
                            </label>
                            <input
                                type="email"
                                value={loginForm.email}
                                onChange={(e) => setLoginForm(prev => ({ ...prev, email: e.target.value }))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white dark:border-gray-600"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Password
                            </label>
                            <input
                                type="password"
                                value={loginForm.password}
                                onChange={(e) => setLoginForm(prev => ({ ...prev, password: e.target.value }))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white dark:border-gray-600"
                                required
                            />
                        </div>
                        {loginError && (
                            <div className="text-red-600 text-sm">{loginError}</div>
                        )}
                        <button
                            type="submit"
                            disabled={isLoggingIn}
                            className="w-full py-2 px-4 bg-primary-600 text-white rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
                        >
                            {isLoggingIn ? 'Signing In...' : 'Sign In'}
                        </button>
                    </form>
                    <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
                        Use your admin credentials to access the invoice management system.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="p-4 md:p-6 lg:p-8">
            <header className="flex flex-wrap items-center justify-between gap-4 mb-6">
                <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">發票管理總覽</h1>
                <div className="flex items-center space-x-4">
                    <input
                        type="text"
                        value={ctrInput}
                        onChange={e => setCtrInput(e.target.value)}
                        placeholder="輸入合約號碼 (如: D10103)"
                        className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white"
                        style={{ minWidth: 200 }}
                    />
                    <button 
                        onClick={handleNavigateToDetail}
                        className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500">
                        按合約查看
                    </button>
                </div>
            </header>

            {loading ? (<p>Loading invoices...</p>) : (
                <main>
                    {sortedGroupKeys.map(groupKey => (
                        <div key={groupKey} className="py-2">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2 flex items-center">
                                {groupKey} ({groupedInvoices[groupKey].length})
                            </h3>
                            <div>
                                {groupedInvoices[groupKey].map(invoice => <InvoiceCard key={invoice.id} invoice={invoice} />)}
                            </div>
                        </div>
                    ))}
                </main>
            )}

            {showAddModal && (
                <AddInvoiceModal
                    isOpen={showAddModal}
                    onClose={() => setShowAddModal(false)}
                    onSave={fetchInvoices}
                    invoiceData={editingInvoice}
                />
            )}

            {showInfoModal && (
                <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
                    <div className="flex items-end justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
                        <div className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" aria-hidden="true"></div>
                        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
                        <div className="inline-block px-4 pt-5 pb-4 overflow-hidden text-left align-bottom transition-all transform bg-white rounded-lg shadow-xl dark:bg-gray-800 sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
                            <div>
                                <div className="flex items-center justify-center w-12 h-12 mx-auto bg-blue-100 rounded-full">
                                    <InformationCircleIcon className="w-6 h-6 text-blue-600" aria-hidden="true" />
                                </div>
                                <div className="mt-3 text-center sm:mt-5">
                                    <h3 className="text-lg font-medium leading-6 text-gray-900 dark:text-white" id="modal-title">Action Required</h3>
                                    <div className="mt-2"><p className="text-sm text-gray-500 dark:text-gray-400">{infoModalMessage}</p></div>
                                </div>
                            </div>
                            <div className="mt-5 sm:mt-6">
                                <button type="button" onClick={() => setShowInfoModal(false)} className="inline-flex justify-center w-full px-4 py-2 text-base font-medium text-white border border-transparent rounded-md shadow-sm bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 sm:text-sm">
                                    OK
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default InvoicesPage; 