import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, updateDoc } from 'firebase/firestore';
import { storage, db } from './firebase';

export const ALLOWED_FILE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export const validateReceiptFile = (file) => {
    if (!file) {
        return { valid: false, error: '請選擇文件 / Please select a file' };
    }

    if (file.size > MAX_FILE_SIZE) {
        return { valid: false, error: '文件大小不能超過 10MB / File size cannot exceed 10MB' };
    }

    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
        return { valid: false, error: '請上傳圖片或PDF文件 / Please upload an image or PDF file' };
    }

    return { valid: true };
};

export const uploadReceipt = async (invoiceId, file) => {
    const validation = validateReceiptFile(file);
    if (!validation.valid) {
        throw new Error(validation.error);
    }

    // Use consistent file naming
    const fileExtension = file.name.split('.').pop().toLowerCase();
    const storageRef = ref(storage, `receipts/${invoiceId}/receipt.${fileExtension}`);
    
    const uploadResult = await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(uploadResult.ref);

    // Update Firestore
    const invoiceRef = doc(db, 'invoices', invoiceId);
    await updateDoc(invoiceRef, {
        receiptUrl: downloadURL,
        receiptFileType: file.type,
        receiptUploadedAt: new Date()
    });

    return downloadURL;
};

export const getFileIcon = (fileType) => {
    if (fileType && fileType.startsWith('image/')) {
        return '🖼️';
    } else if (fileType === 'application/pdf') {
        return '📄';
    }
    return '📎';
}; 