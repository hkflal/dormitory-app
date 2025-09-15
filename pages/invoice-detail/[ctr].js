import { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, writeBatch, query, where, onSnapshot } from 'firebase/firestore';
import { db, storage } from '../../lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuth } from '../../contexts/AuthContext';
import { useRouter } from 'next/router';
import { PlusIcon, ArrowDownTrayIcon, PencilIcon, TrashIcon, ArrowPathIcon, ArrowLeftIcon, ArrowUpOnSquareIcon, LinkIcon } from '@heroicons/react/24/solid';
import { InformationCircleIcon } from '@heroicons/react/24/outline';
import AddInvoiceModal from '../../components/AddInvoiceModal';
import AccountEditModal from '../../components/AccountEditModal';
import AddManagementFeeInvoiceModal from '../../components/AddManagementFeeInvoiceModal';
import AddUtilitiesInvoiceModal from '../../components/AddUtilitiesInvoiceModal';

const InvoiceDetailPage = () => {
    const { currentUser, login } = useAuth();
    const router = useRouter();
    const { ctr } = router.query; // Get the contract number from URL
    
    const [invoices, setInvoices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showDepositModal, setShowDepositModal] = useState(false);
    const [editingInvoice, setEditingInvoice] = useState(null);
    const [showManagementFeeModal, setShowManagementFeeModal] = useState(false);
    const [showUtilitiesModal, setShowUtilitiesModal] = useState(false);
    const [updatingStatus, setUpdatingStatus] = useState({});
    const [generatingPdf, setGeneratingPdf] = useState(null);
    const [showInfoModal, setShowInfoModal] = useState(false);
    const [infoModalMessage, setInfoModalMessage] = useState('');
    const [searchTerm, setSearchTerm] = useState("");
    const [showAccountEditModal, setShowAccountEditModal] = useState(false);
    const [accountInfo, setAccountInfo] = useState({
        contract_number: '',
        employee_names: [],
        rental_amount: '',
        property_name: '',
        frequency: 1,
        notes: ''
    });
    const [generationStatus, setGenerationStatus] = useState({}); // Track generation status per invoice
    const [uploadingReceipt, setUploadingReceipt] = useState(null);
    const [contractDocuments, setContractDocuments] = useState({
        contract: null,
        deposit: null
    });
    const [uploadingDocument, setUploadingDocument] = useState(null);

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

    // Function to fetch contract documents from Firebase storage
    const fetchContractDocuments = useCallback(async () => {
        if (!ctr) return;
        
        try {
            // Try to get document URLs from a contracts collection or storage references
            // This is a placeholder - you might store document metadata in Firestore
            const contractsQuery = query(
                collection(db, 'contract_documents'),
                where('contract_number', '==', ctr)
            );
            
            const snapshot = await getDocs(contractsQuery);
            if (!snapshot.empty) {
                const docData = snapshot.docs[0].data();
                setContractDocuments({
                    contract: docData.contract_url || null,
                    deposit: docData.deposit_url || null
                });
            }
        } catch (error) {
            console.error('Error fetching contract documents:', error);
        }
    }, [ctr]);

    const fetchContractInvoices = useCallback(async () => {
        if (!currentUser || !ctr) {
            console.log('No authenticated user or contract number, skipping fetch');
            setLoading(false);
            return;
        }
        
        setLoading(true);
        try {
            // Simplified query without orderBy (to avoid index requirement)
            const invoicesQuery = query(
                collection(db, 'invoices'),
                where('contract_number', '==', ctr)
            );
            
            const invoicesSnapshot = await getDocs(invoicesQuery);
            let invoicesData = invoicesSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            
            // Sort in JavaScript instead (temporary fix)
            invoicesData.sort((a, b) => {
                const dateA = a.created_at?.toDate?.() || new Date(a.created_at || 0);
                const dateB = b.created_at?.toDate?.() || new Date(b.created_at || 0);
                return dateB - dateA; // Descending order (newest first)
            });
            
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
            await deriveAccountInfo(invoicesData);
        } catch (error) {
            console.error('Error fetching contract invoices:', error);
        } finally {
            setLoading(false);
        }
    }, [ctr, currentUser]);

    useEffect(() => {
        fetchContractInvoices();
        fetchContractDocuments();
    }, [fetchContractInvoices, fetchContractDocuments]);

    // Enhanced real-time listener with generation status tracking
    useEffect(() => {
        if (!currentUser || !ctr) return;

        const invoicesQuery = query(
            collection(db, 'invoices'),
            where('contract_number', '==', ctr)
        );

        // Set up real-time listener
        const unsubscribe = onSnapshot(invoicesQuery, (snapshot) => {
            const invoicesData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            // Sort in JavaScript
            invoicesData.sort((a, b) => {
                const dateA = a.created_at?.toDate?.() || new Date(a.created_at || 0);
                const dateB = b.created_at?.toDate?.() || new Date(b.created_at || 0);
                return dateB - dateA;
            });

            // Check for newly generated DOCX files
            invoicesData.forEach(invoice => {
                if (invoice.docx_url && generationStatus[invoice.id] === 'generating') {
                    // Show success notification
                    setInfoModalMessage(`發票 ${invoice.invoice_number} 的 DOCX 文件已生成完成！`);
                    setShowInfoModal(true);
                    
                    // Clear generation status
                    setGenerationStatus(prev => {
                        const updated = { ...prev };
                        delete updated[invoice.id];
                        return updated;
                    });
                }
            });

            setInvoices(invoicesData);
            setLoading(false);
        }, (error) => {
            console.error('Real-time listener error:', error);
            setLoading(false);
        });

        return () => unsubscribe(); // Cleanup listener
    }, [currentUser, ctr, generationStatus]);

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

    const openAddInvoiceModal = async () => {
        // Pre-populate with suggested invoice number
        const suggestedNumber = await generateNextInvoiceNumber(ctr, 'Z');
        setEditingInvoice({
            contract_number: ctr,
            invoice_number: suggestedNumber,
            status: 'pending'
        });
        setShowAddModal(true);
    };

    const openAddDepositModal = async () => {
        // Pre-populate with suggested deposit invoice number
        const suggestedNumber = await generateNextInvoiceNumber(ctr, 'A');
        setEditingInvoice({
            contract_number: ctr,
            invoice_number: suggestedNumber,
            status: 'pending',
            is_deposit: true
        });
        setShowDepositModal(true);
    };

    const handleDownloadInvoice = async (invoice) => {
        try {
            // Check both field names for backward compatibility
            const docxUrl = invoice.docx_url || invoice.docxUrl;
            
            if (!docxUrl) {
                // Trigger manual generation if no DOCX exists
                setGeneratingPdf(invoice.id);
                
                const response = await fetch('/api/generate-invoice-docx-manual', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ invoiceId: invoice.id })
                });
                
                if (response.ok) {
                    const result = await response.json();
                    if (result.docxUrl) {
                        window.open(result.docxUrl, '_blank');
                    }
                }
            } else {
                // Direct download
                window.open(docxUrl, '_blank');
            }
        } catch (error) {
            console.error('Download error:', error);
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

    const formatCurrency = (amount) => {
  if (amount == null) return 'N/A';
  const numericAmount = parseFloat(amount || 0);
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true
  }).format(numericAmount);
};
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

    const calculateTotal = (amount, nEmployees, frequency) => {
        const unitPrice = parseFloat(amount) || 0;
        const employees = parseInt(nEmployees) || 1;
        const period = parseInt(frequency) || 1;
        return unitPrice * employees * period;
    };

    // Enhanced InvoiceCard component with generation status
    const InvoiceCard = ({ invoice }) => {
        const totalPrice = calculateTotal(invoice.amount, invoice.n_employees, invoice.frequency);
        const isGenerating = generationStatus[invoice.id] === 'generating';
        
        // Check both field names for backward compatibility
        const hasDocx = (invoice.docx_url && invoice.docx_url.trim() !== '') || 
                       (invoice.docxUrl && invoice.docxUrl.trim() !== '');
        
        const generationFailed = invoice.docx_generation_status === 'failed';
        
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
                                續約 - 自動生成
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
                <div className="flex items-center justify-between mt-4">
                    <div className="flex items-center space-x-2">
                        {/* Status badge */}
                        {getStatusBadge(invoice.status)}
                        
                        {/* Generation status indicator */}
                        {isGenerating && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                                <ArrowPathIcon className="w-3 h-3 mr-1 animate-spin" />
                                生成中...
                            </span>
                        )}
                        
                        {generationFailed && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                                生成失敗
                            </span>
                        )}
                    </div>
                    
                    <div className="flex items-center space-x-2 ml-2">
                        <button 
                            onClick={() => handleDownloadInvoice(invoice)} 
                            disabled={generatingPdf === invoice.id || generationStatus[invoice.id] === 'generating'}
                            className="p-1 text-green-600 hover:text-green-900 disabled:opacity-50" 
                            title={invoice.docx_url ? '下載DOCX' : '生成並下載DOCX'}
                        >
                            {(generatingPdf === invoice.id || generationStatus[invoice.id] === 'generating') ? 
                                <ArrowPathIcon className="h-4 w-4 animate-spin" /> : 
                                <ArrowDownTrayIcon className="h-4 w-4" />
                            }
                        </button>
                        {invoice.receiptUrl ? (
                            <a href={invoice.receiptUrl} target="_blank" rel="noopener noreferrer" className="p-1 text-teal-600 hover:text-teal-900" title="查看收據">
                                <LinkIcon className="h-4 w-4"/>
                            </a>
                        ) : (
                            <>
                                <input
                                    type="file"
                                    id={`upload-${invoice.id}`}
                                    className="hidden"
                                    onChange={(e) => handleUploadReceipt(invoice.id, e.target.files[0])}
                                    accept="image/*,application/pdf"  // Added PDF support
                                />
                                <button
                                    onClick={() => document.getElementById(`upload-${invoice.id}`).click()}
                                    disabled={uploadingReceipt === invoice.id}
                                    className="p-1 text-blue-600 hover:text-blue-900 disabled:opacity-50"
                                    title="上傳收據"
                                >
                                    {uploadingReceipt === invoice.id ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <ArrowUpOnSquareIcon className="h-4 w-4" />}
                                </button>
                            </>
                        )}
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

    const deriveAccountInfo = useCallback(async (invoicesData) => {
        if (invoicesData.length === 0) return;
        
        // Get the most recent non-deposit invoice to derive account info
        const recentInvoice = invoicesData
            .filter(inv => !inv.is_deposit)
            .sort((a, b) => {
                const dateA = a.created_at?.toDate?.() || new Date(a.created_at || 0);
                const dateB = b.created_at?.toDate?.() || new Date(b.created_at || 0);
                return dateB - dateA;
            })[0];
        
        if (recentInvoice) {
            // Fetch company name from employees collection
            let companyName = recentInvoice.property_name || '';
            
            try {
                const employeesSnapshot = await getDocs(collection(db, 'employees'));
                const employeesData = employeesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                
                // Find employees with this contract number and get company name
                const contractEmployees = employeesData.filter(emp => 
                    emp.activeCtr === ctr || emp.contractNumber === ctr || emp.contract_number === ctr
                );
                
                if (contractEmployees.length > 0 && contractEmployees[0].company) {
                    companyName = contractEmployees[0].company;
                }
            } catch (error) {
                console.error('Error fetching company name:', error);
            }
            
            setAccountInfo({
                contract_number: recentInvoice.contract_number || ctr,
                employee_names: recentInvoice.employee_names || [],
                rental_amount: recentInvoice.amount || '',
                property_name: recentInvoice.property_name || '',
                company_name: companyName,
                frequency: recentInvoice.frequency || 1,
                notes: recentInvoice.notes || ''
            });
        }
    }, [ctr]);

    const handleUpdateAccountInfo = async (updatedInfo) => {
        try {
            // Update all future invoices (pending/overdue) with new account information
            const batch = writeBatch(db);
            let updateCount = 0;
            
            invoices.forEach(invoice => {
                if (['pending', 'overdue'].includes(invoice.status)) {
                    // Recalculate n_employees based on updated employee names
                    const nEmployees = updatedInfo.employee_names ? updatedInfo.employee_names.length : 0;
                    
                    const invoiceRef = doc(db, 'invoices', invoice.id);
                    batch.update(invoiceRef, {
                        employee_names: updatedInfo.employee_names,
                        amount: parseFloat(updatedInfo.rental_amount) || invoice.amount,
                        property_name: updatedInfo.property_name,
                        frequency: updatedInfo.frequency,
                        n_employees: nEmployees,
                        notes: updatedInfo.notes,
                        updated_at: new Date()
                    });
                    updateCount++;
                }
            });
            
            if (updateCount > 0) {
                await batch.commit();
                console.log(`Updated ${updateCount} invoices with new account information`);
                
                // Refresh the invoices to show updated data
                await fetchContractInvoices();
                
                setInfoModalMessage(`成功更新 ${updateCount} 張發票的帳戶資訊`);
                setShowInfoModal(true);
            } else {
                setInfoModalMessage('沒有找到可更新的發票（只更新待付款和逾期發票）');
                setShowInfoModal(true);
            }
            
            setAccountInfo(updatedInfo);
            setShowAccountEditModal(false);
            
        } catch (error) {
            console.error('Error updating account information:', error);
            setInfoModalMessage('更新帳戶資訊時發生錯誤');
            setShowInfoModal(true);
        }
    };

    // Enhanced add invoice handler
    const handleAddInvoice = async (invoiceData) => {
        try {
            // Add invoice to Firestore
            const docRef = await addDoc(collection(db, 'invoices'), {
                ...invoiceData,
                created_at: new Date(),
                updated_at: new Date(),
                docx_generation_status: 'pending' // Initial status
            });

            // Track generation status
            setGenerationStatus(prev => ({
                ...prev,
                [docRef.id]: 'generating'
            }));

            // Show immediate feedback
            setInfoModalMessage('發票已創建，正在生成 DOCX 文件...');
            setShowInfoModal(true);

            // The real-time listener will automatically update when DOCX is ready
            
        } catch (error) {
            console.error('Error adding invoice:', error);
            setInfoModalMessage(`創建發票時出錯: ${error.message}`);
            setShowInfoModal(true);
        }
    };

    const handleUploadReceipt = async (invoiceId, file) => {
        if (!currentUser) {
            alert("Please log in to upload receipts.");
            return;
        }
        if (!file) return;

        // Add file validation
        const maxSize = 10 * 1024 * 1024; // 10MB
        if (file.size > maxSize) {
            alert("文件大小不能超過 10MB / File size cannot exceed 10MB");
            return;
        }

        // Validate file type
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
        if (!allowedTypes.includes(file.type)) {
            alert("請上傳圖片或PDF文件 / Please upload an image or PDF file");
            return;
        }

        setUploadingReceipt(invoiceId);
        try {
            // Use consistent file naming like in invoices.js
            const fileExtension = file.name.split('.').pop().toLowerCase();
            const storageRef = ref(storage, `receipts/${invoiceId}/receipt.${fileExtension}`);
            const uploadResult = await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(uploadResult.ref);

            const invoiceRef = doc(db, 'invoices', invoiceId);
            await updateDoc(invoiceRef, {
                receiptUrl: downloadURL,
                receiptFileType: file.type,  // Store file type for future reference
                receiptUploadedAt: new Date()
            });
            
            // The real-time listener will handle the UI update
            setInfoModalMessage('收據上傳成功！Receipt uploaded successfully!');
            setShowInfoModal(true);

        } catch (error) {
            console.error("Error uploading receipt: ", error);
            let errorMessage = "上傳失敗，請重試 / Upload failed. Please try again.";
            if (error.code === 'storage/unauthorized') {
                errorMessage = "您沒有權限上傳文件 / You don't have permission to upload files.";
            } else if (error.code === 'storage/canceled') {
                errorMessage = "上傳已取消 / Upload was canceled.";
            }
            alert(errorMessage);
        } finally {
            setUploadingReceipt(null);
        }
    };

    // Handle contract document upload
    const handleDocumentUpload = async (docType, file) => {
        if (!currentUser || !file) return;

        // Validate file type
        const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
            alert("請上傳PDF或圖片文件 / Please upload a PDF or image file");
            return;
        }

        // Validate file size (10MB limit)
        const maxSize = 10 * 1024 * 1024;
        if (file.size > maxSize) {
            alert("文件大小不能超過 10MB / File size cannot exceed 10MB");
            return;
        }

        setUploadingDocument(docType);
        try {
            const fileExtension = file.name.split('.').pop().toLowerCase();
            const fileName = docType === 'contract' ? 'contract' : 'deposit';
            const storageRef = ref(storage, `contract_documents/${ctr}/${fileName}.${fileExtension}`);
            
            const uploadResult = await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(uploadResult.ref);

            // Store in Firestore
            const docRef = query(
                collection(db, 'contract_documents'),
                where('contract_number', '==', ctr)
            );
            
            const snapshot = await getDocs(docRef);
            
            if (snapshot.empty) {
                // Create new document
                await addDoc(collection(db, 'contract_documents'), {
                    contract_number: ctr,
                    [docType === 'contract' ? 'contract_url' : 'deposit_url']: downloadURL,
                    [`${docType}_uploaded_at`]: new Date(),
                    [`${docType}_file_name`]: file.name,
                    [`${docType}_file_type`]: file.type
                });
            } else {
                // Update existing document
                const docId = snapshot.docs[0].id;
                await updateDoc(doc(db, 'contract_documents', docId), {
                    [docType === 'contract' ? 'contract_url' : 'deposit_url']: downloadURL,
                    [`${docType}_uploaded_at`]: new Date(),
                    [`${docType}_file_name`]: file.name,
                    [`${docType}_file_type`]: file.type
                });
            }

            // Update local state
            setContractDocuments(prev => ({
                ...prev,
                [docType]: downloadURL
            }));

            setInfoModalMessage(`${docType === 'contract' ? '合約文件' : '押金發票'}上傳成功！`);
            setShowInfoModal(true);

        } catch (error) {
            console.error('Error uploading document:', error);
            let errorMessage = "上傳失敗，請重試 / Upload failed. Please try again.";
            if (error.code === 'storage/unauthorized') {
                errorMessage = "您沒有權限上傳文件 / You don't have permission to upload files.";
            }
            alert(errorMessage);
        } finally {
            setUploadingDocument(null);
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
                <div className="flex items-center space-x-4">
                    <button 
                        onClick={() => router.back()}
                        className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-white dark:border-gray-600 dark:hover:bg-gray-700">
                        <ArrowLeftIcon className="w-4 h-4 mr-2" />
                        返回
                    </button>
                    <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
                        合約 {ctr} - 發票詳情
                    </h1>
                </div>
                <div className="flex items-center space-x-2">
                    <button 
                        onClick={openAddInvoiceModal}
                        className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500">
                        <PlusIcon className="w-4 h-4 mr-2" />
                        新增發票
                    </button>
                    <button 
                        onClick={openAddDepositModal}
                        className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-orange-600 border border-transparent rounded-md shadow-sm hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500">
                        <PlusIcon className="w-4 h-4 mr-2" />
                        新增押金發票
                    </button>
                    <button 
                        onClick={() => setShowManagementFeeModal(true)}
                        className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-yellow-500 border border-transparent rounded-md shadow-sm hover:bg-yellow-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-400">
                        <PlusIcon className="w-4 h-4 mr-2" />
                        新增管理費發票
                    </button>
                    <button 
                        onClick={() => setShowUtilitiesModal(true)}
                        className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-emerald-600 border border-transparent rounded-md shadow-sm hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500">
                        <PlusIcon className="w-4 h-4 mr-2" />
                        新增水電費發票
                    </button>
                </div>
            </header>

            {/* Account Information Section */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 mb-6">
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-medium text-gray-900 dark:text-white">帳戶資訊</h2>
                        <button
                            onClick={() => setShowAccountEditModal(true)}
                            className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-primary-600 bg-primary-50 border border-primary-200 rounded-md hover:bg-primary-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 dark:bg-primary-900 dark:text-primary-300 dark:border-primary-700 dark:hover:bg-primary-800">
                            <PencilIcon className="w-4 h-4 mr-1" />
                            編輯帳戶資訊
                        </button>
                    </div>
                </div>
                <div className="px-6 py-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                合約號碼
                            </label>
                            <p className="text-sm text-gray-900 dark:text-white font-mono bg-gray-50 dark:bg-gray-700 px-2 py-1 rounded">
                                {accountInfo.contract_number || ctr}
                            </p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                租戶姓名 ({accountInfo.employee_names?.length || 0}人)
                            </label>
                            <p className="text-sm text-gray-900 dark:text-white">
                                {accountInfo.employee_names?.join(', ') || '未設定'}
                            </p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                租金總額
                            </label>
                            <div className="text-sm text-gray-900 dark:text-white">
                                <span className="font-medium">
                                    {accountInfo.rental_amount ? formatCurrency(calculateTotal(accountInfo.rental_amount, accountInfo.employee_names?.length, accountInfo.frequency)) : '未設定'}
                                </span>
                                {accountInfo.rental_amount && (
                                    <div className="text-xs text-gray-500 mt-1">
                                        {formatCurrency(accountInfo.rental_amount)} × {accountInfo.employee_names?.length || 1}人 × {accountInfo.frequency || 1}個月
                                    </div>
                                )}
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                公司名稱
                            </label>
                            <p className="text-sm text-gray-900 dark:text-white">
                                {accountInfo.company_name || accountInfo.property_name || '未設定'}
                            </p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                租期
                            </label>
                            <p className="text-sm text-gray-900 dark:text-white">
                                {accountInfo.frequency ? `${accountInfo.frequency}個月` : '未設定'}
                                {accountInfo.frequency === 1 && ' (月租)'}
                                {accountInfo.frequency === 3 && ' (季租)'}
                                {accountInfo.frequency === 6 && ' (半年租)'}
                                {accountInfo.frequency === 12 && ' (年租)'}
                            </p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                備註
                            </label>
                            <p className="text-sm text-gray-900 dark:text-white">
                                {accountInfo.notes || '無'}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Contract Documents Section */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 mb-6">
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                    <h2 className="text-lg font-medium text-gray-900 dark:text-white">合約文件管理</h2>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">上傳和管理合約相關文件</p>
                </div>
                <div className="px-6 py-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Contract Document */}
                        <div className="space-y-3">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                合約文件
                            </label>
                            <div className="flex items-center space-x-3">
                                {contractDocuments.contract ? (
                                    <div className="flex items-center space-x-2">
                                        <a
                                            href={contractDocuments.contract}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                                        >
                                            <LinkIcon className="w-4 h-4 mr-2" />
                                            查看合約
                                        </a>
                                        <input
                                            type="file"
                                            id="contract-upload"
                                            className="hidden"
                                            onChange={(e) => handleDocumentUpload('contract', e.target.files[0])}
                                            accept=".pdf,.jpg,.jpeg,.png,.gif,.webp"
                                        />
                                        <button
                                            onClick={() => document.getElementById('contract-upload').click()}
                                            disabled={uploadingDocument === 'contract'}
                                            className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
                                        >
                                            {uploadingDocument === 'contract' ? (
                                                <ArrowPathIcon className="w-4 h-4 mr-2 animate-spin" />
                                            ) : (
                                                <ArrowUpOnSquareIcon className="w-4 h-4 mr-2" />
                                            )}
                                            更換
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <input
                                            type="file"
                                            id="contract-upload"
                                            className="hidden"
                                            onChange={(e) => handleDocumentUpload('contract', e.target.files[0])}
                                            accept=".pdf,.jpg,.jpeg,.png,.gif,.webp"
                                        />
                                        <button
                                            onClick={() => document.getElementById('contract-upload').click()}
                                            disabled={uploadingDocument === 'contract'}
                                            className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
                                        >
                                            {uploadingDocument === 'contract' ? (
                                                <ArrowPathIcon className="w-4 h-4 mr-2 animate-spin" />
                                            ) : (
                                                <ArrowUpOnSquareIcon className="w-4 h-4 mr-2" />
                                            )}
                                            上傳合約
                                        </button>
                                    </>
                                )}
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                支援PDF, JPG, PNG格式，最大10MB
                            </p>
                        </div>

                        {/* Deposit Invoice Document */}
                        <div className="space-y-3">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                押金發票
                            </label>
                            <div className="flex items-center space-x-3">
                                {contractDocuments.deposit ? (
                                    <div className="flex items-center space-x-2">
                                        <a
                                            href={contractDocuments.deposit}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center px-3 py-2 text-sm font-medium text-orange-600 bg-orange-50 border border-orange-200 rounded-md hover:bg-orange-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
                                        >
                                            <LinkIcon className="w-4 h-4 mr-2" />
                                            查看押金發票
                                        </a>
                                        <input
                                            type="file"
                                            id="deposit-upload"
                                            className="hidden"
                                            onChange={(e) => handleDocumentUpload('deposit', e.target.files[0])}
                                            accept=".pdf,.jpg,.jpeg,.png,.gif,.webp"
                                        />
                                        <button
                                            onClick={() => document.getElementById('deposit-upload').click()}
                                            disabled={uploadingDocument === 'deposit'}
                                            className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
                                        >
                                            {uploadingDocument === 'deposit' ? (
                                                <ArrowPathIcon className="w-4 h-4 mr-2 animate-spin" />
                                            ) : (
                                                <ArrowUpOnSquareIcon className="w-4 h-4 mr-2" />
                                            )}
                                            更換
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <input
                                            type="file"
                                            id="deposit-upload"
                                            className="hidden"
                                            onChange={(e) => handleDocumentUpload('deposit', e.target.files[0])}
                                            accept=".pdf,.jpg,.jpeg,.png,.gif,.webp"
                                        />
                                        <button
                                            onClick={() => document.getElementById('deposit-upload').click()}
                                            disabled={uploadingDocument === 'deposit'}
                                            className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-orange-600 border border-transparent rounded-md hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:opacity-50"
                                        >
                                            {uploadingDocument === 'deposit' ? (
                                                <ArrowPathIcon className="w-4 h-4 mr-2 animate-spin" />
                                            ) : (
                                                <ArrowUpOnSquareIcon className="w-4 h-4 mr-2" />
                                            )}
                                            上傳押金發票
                                        </button>
                                    </>
                                )}
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                支援PDF, JPG, PNG格式，最大10MB
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {loading ? (<p>Loading invoices for contract {ctr}...</p>) : (
                <main>
                    <div className="py-2">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2 flex items-center">
                            所有發票 ({filteredInvoices.length})
                        </h3>
                        <div>
                            {filteredInvoices.length === 0 ? (
                                <div className="text-center py-8">
                                    <p className="text-gray-500 dark:text-gray-400">此合約暫無發票記錄</p>
                                    <button 
                                        onClick={openAddInvoiceModal}
                                        className="mt-4 inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md shadow-sm hover:bg-primary-700">
                                        <PlusIcon className="w-5 h-5 mr-2" />
                                        建立第一張發票
                                    </button>
                                </div>
                            ) : (
                                filteredInvoices.map(invoice => <InvoiceCard key={invoice.id} invoice={invoice} />)
                            )}
                        </div>
                    </div>
                </main>
            )}

            {showAddModal && (
                <AddInvoiceModal
                    isOpen={showAddModal}
                    onClose={() => {
                        setShowAddModal(false);
                        setEditingInvoice(null);
                    }}
                    onSave={handleAddInvoice} // Use enhanced handler
                    invoiceData={editingInvoice}
                    isDepositInvoice={false}
                />
            )}

            {showDepositModal && (
                <AddInvoiceModal
                    isOpen={showDepositModal}
                    onClose={() => { setShowDepositModal(false); setEditingInvoice(null); }}
                    onSave={handleAddInvoice} // Use enhanced handler
                    invoiceData={editingInvoice}
                    isDepositInvoice={true}
                />
            )}

            {showManagementFeeModal && (
                <AddManagementFeeInvoiceModal
                    isOpen={showManagementFeeModal}
                    onClose={() => setShowManagementFeeModal(false)}
                    onSave={fetchContractInvoices}
                    contractNumber={ctr}
                />
            )}
            
            {showUtilitiesModal && (
                <AddUtilitiesInvoiceModal
                    isOpen={showUtilitiesModal}
                    onClose={() => setShowUtilitiesModal(false)}
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

            {/* Account Edit Modal */}
            {showAccountEditModal && (
                <AccountEditModal
                    isOpen={showAccountEditModal}
                    onClose={() => setShowAccountEditModal(false)}
                    accountInfo={accountInfo}
                    onSave={handleUpdateAccountInfo}
                />
            )}
        </div>
    );
};

export default InvoiceDetailPage;