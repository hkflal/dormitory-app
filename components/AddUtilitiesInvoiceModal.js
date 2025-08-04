import { useState } from 'react';
import Modal from './Modal';

const AddUtilitiesInvoiceModal = ({ isOpen, onClose }) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="新增水電費發票">
      <div className="p-6 text-center">
        <div className="mb-4">
          <svg 
            className="mx-auto h-16 w-16 text-gray-400" 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M19 14l-7 7m0 0l-7-7m7 7V3" 
            />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
          功能開發中
        </h3>
        <p className="text-gray-500 dark:text-gray-400 mb-6">
          水電費發票功能正在開發中，請稍後再試。
        </p>
        <button
          onClick={onClose}
          className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500"
        >
          關閉
        </button>
      </div>
    </Modal>
  );
};

export default AddUtilitiesInvoiceModal; 