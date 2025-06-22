import { useState, useEffect, useRef } from 'react';
import { db } from '../lib/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, getDoc } from 'firebase/firestore';
import { ChevronDownIcon } from '@heroicons/react/24/outline';

// Add this comprehensive CSS fix at the very top of the component, before the return statement

const customStyles = `
  .scrollbar-hide {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
  .scrollbar-hide::-webkit-scrollbar {
    display: none;
  }
  
  /* 🎯 FINAL Z-INDEX HIERARCHY FIX - CONSIDERS DESKTOP SIDEBAR */
  /* 
   * Desktop Sidebar: lg:fixed (implicit very high z-index, ~1000+)
   * Mobile sidebar overlay: z-40
   * Mobile bottom nav: z-30
   * Top navigation: z-10
   * 
   * Our table elements must be BELOW the desktop sidebar!
   */
  
  /* Column dropdown menus - High but below desktop sidebar */
  .column-dropdown {
    z-index: 35 !important;
    position: absolute !important;
  }
  
  /* ID Header - Below desktop sidebar, above everything else */
  .data-table-id-header {
    z-index: 30 !important;
    position: sticky !important;
    top: 0 !important;
    left: 0 !important;
    background-color: rgb(249 250 251) !important;
    box-shadow: 2px 0 4px rgba(0, 0, 0, 0.1) !important;
  }
  
  /* ID Cells - Below header, above content */
  .data-table-id-cell {
    z-index: 25 !important;
    position: sticky !important;
    left: 0 !important;
    background-color: white !important;
    box-shadow: 2px 0 4px rgba(0, 0, 0, 0.05) !important;
  }
  
  /* ID Cell hover state */
  .data-table-id-cell-hover {
    background-color: rgb(239 246 255) !important;
  }
  
  /* Table header - Above content */
  .data-table-header {
    z-index: 20 !important;
    position: sticky !important;
    top: 0 !important;
    background-color: rgb(249 250 251) !important;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1) !important;
  }
  
  /* Regular table cells - Lowest priority */
  .data-table-cell {
    z-index: 5 !important;
    position: relative !important;
    background-color: white !important;
  }
  
  /* Table container - Base level */
  .data-table-container {
    position: relative !important;
    z-index: 1 !important;
  }
  
  /* DESKTOP RESPONSIVE: Ensure table respects sidebar space */
  @media (min-width: 1024px) {
    .data-table-container {
      /* Account for sidebar width (w-64 = 16rem = 256px) */
      margin-left: 0 !important;
      /* Ensure table doesn't overflow into sidebar space */
      max-width: calc(100vw - 16rem - 2rem) !important;
    }
    
    /* ID column positioning - stay within content area */
    .data-table-id-header,
    .data-table-id-cell {
      /* Don't stick to viewport left, stick to content area left */
      left: 0 !important;
    }
  }
  
  /* New row styles */
  .data-table-new-row .data-table-id-cell {
    background-color: rgb(240 253 244) !important;
  }
  
  /* Hover effects that maintain proper layering */
  .data-table-row:hover .data-table-cell {
    background-color: rgb(239 246 255) !important;
  }
  
  .data-table-row:hover .data-table-id-cell {
    background-color: rgb(219 234 254) !important;
  }
  
  /* Ensure scrollable area respects sidebar */
  .data-table-scroll-container {
    position: relative !important;
    z-index: 1 !important;
  }
  
  /* Additional safeguard: Ensure no table element goes above 35 */
  table, thead, tbody, tr, th, td {
    z-index: auto !important;
  }
  
  /* Only our specific classes get higher z-index */
  .data-table-id-header,
  .data-table-id-cell,
  .data-table-header,
  .column-dropdown {
    /* z-index values already set above */
  }
`;

// Inject styles (update the existing style injection)
if (typeof document !== 'undefined') {
  // Remove existing style if it exists
  const existingStyle = document.getElementById('data-management-styles');
  if (existingStyle) {
    existingStyle.remove();
  }
  
  const styleSheet = document.createElement('style');
  styleSheet.id = 'data-management-styles';
  styleSheet.textContent = customStyles;
  document.head.appendChild(styleSheet);
}

// Airtable-like Column Header Component
function ColumnHeader({ columnName, onHide, showDropdown, onToggleDropdown }) {
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        onToggleDropdown(columnName, false);
      }
    };

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showDropdown, columnName, onToggleDropdown]);

  return (
    <div className="relative">
      <div className="flex items-center justify-between">
        <span className="truncate">{columnName}</span>
        <button
          onClick={() => onToggleDropdown(columnName, !showDropdown)}
          className="ml-1 p-1 hover:bg-gray-200 rounded transition-colors"
        >
          <ChevronDownIcon className="h-3 w-3" />
        </button>
      </div>
      
      {showDropdown && (
        <div className="column-dropdown absolute right-0 mt-1 w-32 bg-white border border-gray-200 rounded-md shadow-lg">
          <button
            onClick={() => {
              onHide(columnName);
              onToggleDropdown(columnName, false);
            }}
            className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 transition-colors"
          >
            Hide Column
          </button>
        </div>
      )}
    </div>
  );
}

// Mobile Card Component for Better UX
function MobileCard({ item, visibleColumns, onEdit, onDelete }) {
  const [editingField, setEditingField] = useState(null);
  const [editValue, setEditValue] = useState('');

  const handleStartEdit = (column, currentValue) => {
    setEditingField(column);
    setEditValue(currentValue || '');
  };

  const handleSave = () => {
    if (editingField) {
      onEdit(item.id, editingField, editValue, item[editingField]);
      setEditingField(null);
      setEditValue('');
    }
  };

  const handleCancel = () => {
    setEditingField(null);
    setEditValue('');
  };

  const formatDisplayValue = (val) => {
    if (val === null || val === undefined) return '';
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 mb-3 shadow-sm">
      {/* Card Header with ID and Actions */}
      <div className="flex justify-between items-start mb-3 pb-2 border-b border-gray-100">
        <div className="flex-1">
          <div className="text-xs text-gray-500 font-medium">ID</div>
          <div className="text-sm font-mono text-gray-700 truncate" title={item.id}>
            {item.id.substring(0, 12)}...
          </div>
        </div>
        <button
          onClick={() => onDelete(item.id)}
          className="text-red-400 hover:text-red-600 p-1 rounded-full hover:bg-red-50 transition-colors"
          title="Delete record"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>

      {/* Card Fields */}
      <div className="space-y-3">
        {visibleColumns.slice(0, 6).map(column => (
          <div key={column} className="flex flex-col">
            <div className="text-xs text-gray-500 font-medium mb-1">{column}</div>
            {editingField === column ? (
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={handleSave}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSave();
                    if (e.key === 'Escape') handleCancel();
                  }}
                  className="flex-1 p-2 border border-blue-300 rounded text-sm focus:ring-1 focus:ring-blue-500"
                  autoFocus
                />
              </div>
            ) : (
              <div
                onClick={() => handleStartEdit(column, item[column])}
                className="p-2 bg-gray-50 rounded text-sm cursor-text hover:bg-blue-50 transition-colors min-h-[2.5rem] flex items-center"
              >
                {formatDisplayValue(item[column]) || (
                  <span className="text-gray-400 italic">Tap to edit {column}</span>
                )}
              </div>
            )}
          </div>
        ))}
        
        {/* Show more fields if there are many */}
        {visibleColumns.length > 6 && (
          <div className="pt-2 border-t border-gray-100">
            <div className="text-xs text-gray-500 text-center">
              + {visibleColumns.length - 6} more fields (use desktop view for all fields)
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Airtable-like Editable Cell Component
function EditableCell({ value, onSave, placeholder = '' }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleStartEdit = () => {
    setIsEditing(true);
    setEditValue(value || '');
  };

  const handleSave = () => {
    setIsEditing(false);
    if (editValue !== (value || '')) {
      onSave(editValue);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditValue('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  const formatDisplayValue = (val) => {
    if (val === null || val === undefined) return '';
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  };

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className="w-full p-1 border border-blue-300 rounded text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
        placeholder={placeholder}
      />
    );
  }

  return (
    <div
      onClick={handleStartEdit}
      className="w-full p-1 min-h-[1.5rem] cursor-text hover:bg-gray-50 rounded text-sm truncate group-hover/cell:bg-blue-50"
      title={formatDisplayValue(value)}
    >
      {formatDisplayValue(value) || (
        <span className="text-gray-400 italic">{placeholder}</span>
      )}
    </div>
  );
}

export default function DataManagement() {
  const [activeCollection, setActiveCollection] = useState('employees');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [hiddenColumns, setHiddenColumns] = useState(new Set());
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState('success');
  const [showPasteHelp, setShowPasteHelp] = useState(false);
  const fileInputRef = useRef(null);
  const [newRow, setNewRow] = useState({});
  const [showNewRow, setShowNewRow] = useState(false);
  const [columnDropdowns, setColumnDropdowns] = useState(new Set());

  const collections = [
    { id: 'employees', name: 'Employees 👥', icon: '👥' },
    { id: 'properties', name: 'Properties 🏢', icon: '🏢' },
    { id: 'invoices', name: 'Invoices 📄', icon: '📄' },
    { id: 'contracts', name: 'Contracts 📋', icon: '📋' },
    { id: 'financials', name: 'Financials 💰', icon: '💰' },
    { id: 'maintenance', name: 'Maintenance 🔧', icon: '🔧' },
    { id: 'history_logs', name: 'History 📝', icon: '📝' }
  ];

  // Load column preferences from localStorage
  useEffect(() => {
    const savedPreferences = localStorage.getItem(`columnPrefs_${activeCollection}`);
    if (savedPreferences) {
      setHiddenColumns(new Set(JSON.parse(savedPreferences)));
    } else {
      setHiddenColumns(new Set());
    }
  }, [activeCollection]);

  // Save column preferences to localStorage
  const saveColumnPreferences = (newHiddenColumns) => {
    setHiddenColumns(newHiddenColumns);
    localStorage.setItem(`columnPrefs_${activeCollection}`, JSON.stringify([...newHiddenColumns]));
  };

  // Toggle column dropdown
  const toggleColumnDropdown = (columnName) => {
    const newDropdowns = new Set(columnDropdowns);
    if (newDropdowns.has(columnName)) {
      newDropdowns.delete(columnName);
    } else {
      newDropdowns.clear(); // Close other dropdowns
      newDropdowns.add(columnName);
    }
    setColumnDropdowns(newDropdowns);
  };

  // Hide column (Airtable-like)
  const hideColumn = (columnName) => {
    const newHiddenColumns = new Set(hiddenColumns);
    newHiddenColumns.add(columnName);
    saveColumnPreferences(newHiddenColumns);
    setColumnDropdowns(new Set()); // Close dropdown
  };

  // Show column
  const showColumn = (columnName) => {
    const newHiddenColumns = new Set(hiddenColumns);
    newHiddenColumns.delete(columnName);
    saveColumnPreferences(newHiddenColumns);
  };

  // Show toast notification
  const showToastNotification = (message, type = 'success') => {
    setToastMessage(message);
    setToastType(type);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  // Show confirmation modal
  const showConfirmation = (message, onConfirm) => {
    setConfirmAction({ message, onConfirm });
    setShowConfirmModal(true);
  };

  // Fetch data from Firebase
  const fetchData = async (collectionName) => {
    setLoading(true);
    setError(null);
    try {
      const snapshot = await getDocs(collection(db, collectionName));
      const fetchedData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setData(fetchedData);
      console.log(`Loaded ${fetchedData.length} records from ${collectionName}`);
    } catch (error) {
      console.error('Error fetching data:', error);
      setError(`Failed to load ${collectionName} data: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Get all possible columns
  const getColumns = () => {
    if (data.length === 0) return [];
    const allKeys = new Set();
    data.forEach(item => {
      Object.keys(item).forEach(key => {
        if (key !== 'id') allKeys.add(key);
      });
    });
    return Array.from(allKeys).sort();
  };

  // Get visible columns (filtered by user preferences)
  const getVisibleColumns = () => {
    return getColumns().filter(col => !hiddenColumns.has(col));
  };

  // Filter data
  const filteredData = data.filter(item => {
    if (!searchTerm) return true;
    return Object.values(item).some(value => 
      String(value).toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  // Handle collection change
  const handleCollectionChange = (collectionName) => {
    setActiveCollection(collectionName);
    setSearchTerm('');
    setShowNewRow(false);
    setNewRow({});
    setColumnDropdowns(new Set()); // Close any open dropdowns
    fetchData(collectionName);
  };

  // Handle direct cell edit and auto-save
  const handleCellEdit = async (rowId, column, value, originalValue) => {
    // Prevent saving if the value hasn't changed
    if (String(value) === String(originalValue)) {
      showToastNotification('No changes detected, save skipped.', 'info');
      return;
    }

    try {
      const docRef = doc(db, activeCollection, rowId);
      
      // --- CORE FIX: Fetch the latest document data before updating ---
      const docSnap = await getDoc(docRef);
      let fullDocData = {};
      if (docSnap.exists()) {
        fullDocData = docSnap.data();
      } else {
        // Fallback for new rows that might not be in DB yet but exist in state
        const stateItem = data.find(item => item.id === rowId);
        if (stateItem) {
          fullDocData = { ...stateItem };
        }
      }
      
      // Merge the specific field update into the full document data
      const updatePayload = {
        ...fullDocData,
        [column]: value,
        updatedAt: new Date()
      };
      
      await updateDoc(docRef, updatePayload);
      // --- END CORE FIX ---

      // Update local state
      setData(currentData =>
        currentData.map(row =>
          row.id === rowId ? { ...row, [column]: value } : row
        )
      );

      showToastNotification(`Successfully updated ${column} for record ${rowId.substring(0, 6)}...`);
    } catch (error) {
      console.error('Error updating document:', error);
      showToastNotification(`Error updating record: ${error.message}`, 'error');
    }
  };

  // Handle new row creation
  const handleAddNewRow = async () => {
    if (Object.keys(newRow).length === 0) {
      showToastNotification('Please fill in at least one field', 'warning');
      return;
    }

    try {
      const docRef = await addDoc(collection(db, activeCollection), newRow);
      console.log('Added document with ID: ', docRef.id);
      setNewRow({});
      setShowNewRow(false);
      await fetchData(activeCollection);
      showToastNotification('Record added successfully! 🎉');
    } catch (error) {
      console.error('Error adding document: ', error);
      showToastNotification('Error adding record: ' + error.message, 'error');
    }
  };

  // Handle delete record
  const handleDeleteRecord = (id) => {
    showConfirmation(
      'Are you sure you want to delete this record? This action cannot be undone.',
      async () => {
        try {
          setLoading(true);
          await deleteDoc(doc(db, activeCollection, id));
          console.log('Deleted document with ID: ', id);
          await fetchData(activeCollection);
          showToastNotification('Record deleted successfully! 🗑️');
        } catch (error) {
          console.error('Error deleting document: ', error);
          showToastNotification('Error deleting record: ' + error.message, 'error');
        } finally {
          setLoading(false);
        }
      }
    );
  };

  // Parse CSV data - enhanced to handle tabs and commas
  const parseCSV = (csvText) => {
    const lines = csvText.split('\n').filter(line => line.trim());
    if (lines.length < 2) throw new Error('CSV must have at least header and one data row');
    
    // Auto-detect separator (tab or comma)
    const firstLine = lines[0];
    const separator = firstLine.includes('\t') ? '\t' : ',';
    
    const headers = firstLine.split(separator).map(h => h.trim().replace(/"/g, ''));
    const data = [];
    
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(separator).map(cell => cell.trim().replace(/"/g, ''));
      if (row.length === headers.length) {
        const rowData = {};
        headers.forEach((header, index) => {
          if (row[index] && row[index] !== '') {
            // Try to parse numbers
            const value = isNaN(row[index]) ? row[index] : Number(row[index]);
            rowData[header] = value;
          }
        });
        if (Object.keys(rowData).length > 0) {
          data.push(rowData);
        }
      }
    }
    
    return data;
  };

  // Handle CSV file upload
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const csvData = e.target.result;
        const parsedData = parseCSV(csvData);
        handleBulkImport(parsedData);
      } catch (error) {
        showToastNotification('Error parsing CSV file: ' + error.message, 'error');
      }
    };
    reader.readAsText(file);
  };

  // Handle clipboard paste
  const handleClipboardPaste = async () => {
    try {
      const clipboardText = await navigator.clipboard.readText();
      const parsedData = parseCSV(clipboardText);
      handleBulkImport(parsedData);
    } catch (error) {
      showToastNotification('Error reading clipboard. Please try the Help button for instructions.', 'error');
    }
  };

  // Handle bulk import
  const handleBulkImport = async (importData) => {
    if (importData.length === 0) {
      showToastNotification('No valid data found to import', 'warning');
      return;
    }

    showConfirmation(
      `Import ${importData.length} records to ${activeCollection}?`,
      async () => {
        try {
          setLoading(true);
          const promises = importData.map(record => 
            addDoc(collection(db, activeCollection), record)
          );
          await Promise.all(promises);
          console.log(`Imported ${importData.length} records`);
          await fetchData(activeCollection);
          showToastNotification(`Successfully imported ${importData.length} records! 🎉`);
        } catch (error) {
          console.error('Error importing data:', error);
          showToastNotification('Error importing data: ' + error.message, 'error');
        } finally {
          setLoading(false);
        }
      }
    );
  };

  // Export to CSV
  const exportToCSV = () => {
    if (data.length === 0) {
      showToastNotification('No data to export', 'warning');
      return;
    }
    
    const columns = getColumns();
    const headers = ['id', ...columns];
    const csvContent = [
      headers.join(','),
      ...data.map(row => 
        headers.map(header => {
          const value = row[header];
          if (value === null || value === undefined) return '';
          if (typeof value === 'object') return JSON.stringify(value);
          return `"${value}"`;
        }).join(',')
      )
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeCollection}_export_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    showToastNotification('Data exported successfully! 💾');
  };

  // Format cell value for display
  const formatCellValue = (value) => {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'object' && value.toDate) {
      return new Date(value.toDate()).toLocaleDateString();
    }
    if (typeof value === 'boolean') return value ? '✓' : '✗';
    if (typeof value === 'number') return value.toLocaleString();
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  // Toggle column visibility
  const toggleColumn = (column) => {
    const newHiddenColumns = new Set(hiddenColumns);
    if (newHiddenColumns.has(column)) {
      newHiddenColumns.delete(column);
    } else {
      newHiddenColumns.add(column);
    }
    saveColumnPreferences(newHiddenColumns);
  };

  // Show all columns
  const showAllColumns = () => {
    saveColumnPreferences(new Set());
  };

  useEffect(() => {
    fetchData(activeCollection);
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = () => {
      setColumnDropdowns(new Set());
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Add style injection on component mount
  useEffect(() => {
    const styleElement = document.createElement('style');
    styleElement.textContent = customStyles;
    document.head.appendChild(styleElement);
    
    return () => {
      // Cleanup on unmount
      if (document.head.contains(styleElement)) {
        document.head.removeChild(styleElement);
      }
    };
  }, []);

  return (
    <div className="data-table-container min-h-screen bg-gray-50 py-4 px-2 sm:px-4 lg:px-8">
      {/* Toast Notification - Mobile Responsive */}
      {showToast && (
        <div className={`fixed top-4 right-2 left-2 sm:left-auto sm:right-4 z-50 p-3 sm:p-4 rounded-lg shadow-lg transition-all duration-300 ${
          toastType === 'success' ? 'bg-green-500 text-white' :
          toastType === 'error' ? 'bg-red-500 text-white' :
          'bg-yellow-500 text-black'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-sm sm:text-base">{toastMessage}</span>
            <button onClick={() => setShowToast(false)} className="ml-2 text-xl">×</button>
          </div>
        </div>
      )}

      {/* Confirmation Modal - Mobile Responsive */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-4 sm:p-6 w-full max-w-sm sm:max-w-md">
            <h3 className="text-lg font-medium mb-4">Confirm Action</h3>
            <p className="text-gray-600 text-sm sm:text-base mb-6">{confirmAction?.message}</p>
            <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-3 sm:justify-end">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 text-sm sm:text-base"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  confirmAction?.onConfirm();
                  setShowConfirmModal(false);
                }}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm sm:text-base"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Paste Help Modal - Mobile Responsive */}
      {showPasteHelp && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-4 sm:p-6 w-full max-w-sm sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-medium mb-4">📋 How to Paste CSV Data</h3>
            <div className="space-y-4 text-sm">
              <div>
                <h4 className="font-medium text-blue-600">From Excel/Google Sheets:</h4>
                <ol className="list-decimal list-inside mt-2 space-y-1">
                  <li>Select your data including headers (first row)</li>
                  <li>Copy the selection (Ctrl+C or Cmd+C)</li>
                  <li>Click "Paste CSV" button below</li>
                  <li>Review and confirm the import</li>
                </ol>
              </div>
              <div className="hidden sm:block">
                <h4 className="font-medium text-green-600">CSV Format Example:</h4>
                <pre className="bg-gray-100 p-2 rounded text-xs mt-2">
name,email,company,salary
John Doe,john@example.com,ABC Corp,50000
Jane Smith,jane@example.com,XYZ Inc,60000
                </pre>
              </div>
              <div>
                <h4 className="font-medium text-purple-600">Supported Formats:</h4>
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li>Comma-separated values (CSV)</li>
                  <li>Tab-separated values (TSV)</li>
                  <li>Data copied from Excel/Google Sheets</li>
                  <li>Numbers are automatically detected</li>
                </ul>
              </div>
            </div>
            <button
              onClick={() => setShowPasteHelp(false)}
              className="mt-4 w-full sm:w-auto px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Got it!
            </button>
          </div>
        </div>
      )}

      <div className="mb-4 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">🗃️ Database Management</h1>
        <p className="text-sm sm:text-base text-gray-600 hidden sm:block">View, edit, add, delete and import/export data from all Firebase collections</p>
        <p className="text-sm text-gray-600 sm:hidden">Manage your database records</p>
      </div>
      
      {/* Collection Tabs - Mobile Responsive */}
      <div className="border-b mb-4 sm:mb-6">
        <nav className="flex space-x-1 overflow-x-auto pb-2 scrollbar-hide">
          {collections.map((coll) => (
            <button
              key={coll.id}
              onClick={() => handleCollectionChange(coll.id)}
              className={`whitespace-nowrap py-2 px-3 sm:px-4 text-xs sm:text-sm font-medium rounded-t-lg transition-colors ${
                activeCollection === coll.id
                  ? 'bg-blue-500 text-white border-b-2 border-blue-500'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}
            >
              <span className="sm:hidden">{coll.icon}</span>
              <span className="hidden sm:inline">{coll.name}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Controls - Mobile First Design */}
      <div className="mb-4 sm:mb-6 space-y-3 sm:space-y-0">
        {/* Mobile: Search Full Width */}
        <div className="sm:hidden">
          <input
            type="text"
            placeholder="🔍 Search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <div className="mt-2 text-xs text-gray-500 text-center">
            {filteredData.length} / {data.length} records
          </div>
        </div>

        {/* Desktop: Search + Controls in Row */}
        <div className="hidden sm:flex sm:flex-wrap sm:gap-4 sm:items-center sm:justify-between">
          <div className="flex items-center space-x-4">
            <input
              type="text"
              placeholder="🔍 Search data..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="px-4 py-2 border rounded-md w-64 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <span className="text-sm text-gray-500 whitespace-nowrap">
              {filteredData.length} / {data.length} records
            </span>
          </div>
        </div>

        {/* Mobile: Priority Actions */}
        <div className="flex flex-wrap gap-2 sm:hidden">
          <button
            onClick={() => setShowNewRow(!showNewRow)}
            className="flex-1 inline-flex items-center justify-center px-3 py-2 bg-green-600 text-white text-sm rounded-md hover:bg-green-700"
          >
            ➕ Add
          </button>
          
          {hiddenColumns.size > 0 && (
            <button
              onClick={showAllColumns}
              className="flex-1 inline-flex items-center justify-center px-3 py-2 bg-orange-500 text-white text-sm rounded-md hover:bg-orange-600"
            >
              👁️ Show ({hiddenColumns.size})
            </button>
          )}
          
          <button
            onClick={() => setShowColumnSettings(!showColumnSettings)}
            className="inline-flex items-center justify-center px-3 py-2 bg-gray-600 text-white text-sm rounded-md hover:bg-gray-700"
          >
            ⚙️
          </button>
        </div>

        {/* Desktop: Full Controls */}
        <div className="hidden sm:flex sm:items-center sm:space-x-2 sm:flex-wrap sm:gap-2">
          {hiddenColumns.size > 0 && (
            <button
              onClick={showAllColumns}
              className="inline-flex items-center px-3 py-2 bg-orange-500 text-white text-sm rounded-md hover:bg-orange-600 animate-pulse"
            >
              👁️ Show {hiddenColumns.size} Hidden Column{hiddenColumns.size !== 1 ? 's' : ''}
            </button>
          )}

          <button
            onClick={() => setShowColumnSettings(!showColumnSettings)}
            className="inline-flex items-center px-3 py-2 bg-gray-600 text-white text-sm rounded-md hover:bg-gray-700"
          >
            ⚙️ Columns ({getVisibleColumns().length}/{getColumns().length})
          </button>

          <button
            onClick={() => setShowNewRow(!showNewRow)}
            className="inline-flex items-center px-3 py-2 bg-green-600 text-white text-sm rounded-md hover:bg-green-700"
          >
            ➕ Add New
          </button>

          <button
            onClick={() => setShowPasteHelp(true)}
            className="hidden lg:inline-flex items-center px-3 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
          >
            ❓ Help
          </button>

          <button
            onClick={handleClipboardPaste}
            className="hidden md:inline-flex items-center px-3 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
          >
            📋 Paste CSV
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="hidden md:inline-flex items-center px-3 py-2 bg-purple-600 text-white text-sm rounded-md hover:bg-purple-700"
          >
            📁 Import CSV
          </button>

          <button
            onClick={exportToCSV}
            className="hidden md:inline-flex items-center px-3 py-2 bg-gray-600 text-white text-sm rounded-md hover:bg-gray-700"
          >
            💾 Export CSV
          </button>
        </div>

        {/* Mobile: Secondary Actions (Expandable) */}
        <div className="sm:hidden">
          <details className="group">
            <summary className="cursor-pointer text-sm text-gray-600 hover:text-gray-800 py-1">
              <span className="inline-flex items-center">
                ⚙️ More actions 
                <svg className="w-4 h-4 ml-1 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </span>
            </summary>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                onClick={() => setShowPasteHelp(true)}
                className="inline-flex items-center px-3 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
              >
                ❓ Help
              </button>
              <button
                onClick={handleClipboardPaste}
                className="inline-flex items-center px-3 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
              >
                📋 Paste
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center px-3 py-2 bg-purple-600 text-white text-sm rounded-md hover:bg-purple-700"
              >
                📁 Import
              </button>
              <button
                onClick={exportToCSV}
                className="inline-flex items-center px-3 py-2 bg-gray-600 text-white text-sm rounded-md hover:bg-gray-700"
              >
                💾 Export
              </button>
            </div>
          </details>
        </div>
      </div>

      {/* Column Settings Panel */}
      {showColumnSettings && (
        <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium">Column Visibility</h3>
            <button
              onClick={showAllColumns}
              className="px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600"
            >
              Show All Columns
            </button>
          </div>
          
          {/* Hidden Columns - Show prominently if any are hidden */}
          {hiddenColumns.size > 0 && (
            <div className="mb-4 p-4 bg-orange-50 border-2 border-orange-300 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-base font-semibold text-orange-800 flex items-center">
                  <svg className="w-5 h-5 mr-2 text-orange-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
                  </svg>
                  {hiddenColumns.size} Hidden Column{hiddenColumns.size !== 1 ? 's' : ''}
                </h4>
                <button
                  onClick={showAllColumns}
                  className="px-3 py-1 bg-orange-500 text-white text-sm rounded-md hover:bg-orange-600 font-medium"
                >
                  👁️ Show All
                </button>
              </div>
              <p className="text-sm text-orange-700 mb-3">
                Click any hidden column below to restore it to the table:
              </p>
              <div className="flex flex-wrap gap-2">
                {[...hiddenColumns].map(column => (
                  <button
                    key={column}
                    onClick={() => showColumn(column)}
                    className="inline-flex items-center px-3 py-2 bg-orange-100 text-orange-800 text-sm rounded-md hover:bg-orange-200 transition-colors border border-orange-300 hover:border-orange-400"
                    title={`Click to show ${column}`}
                  >
                    <span className="truncate max-w-[120px] font-medium">{column}</span>
                    <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  </button>
                ))}
              </div>
            </div>
          )}
          
          {/* Visible Columns */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">
              👁️ Visible Columns ({getVisibleColumns().length})
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {getVisibleColumns().map(column => (
                <div key={column} className="flex items-center justify-between p-2 bg-white border border-gray-200 rounded">
                  <span className="text-sm text-gray-700 truncate flex-1" title={column}>
                    {column}
                  </span>
                  <button
                    onClick={() => hideColumn(column)}
                    className="ml-2 text-gray-400 hover:text-red-500 transition-colors"
                    title={`Hide ${column}`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L12 12m-2.122-2.122L7.758 7.758M12 12l2.122-2.122m0 0L16.242 7.758M12 12l-2.122 2.122" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
          
          <p className="text-xs text-gray-500 mt-3">
            💡 <strong>Pro tip:</strong> Hover over column headers and use the dropdown to hide columns quickly!
          </p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          <p className="mt-2 text-gray-500">Loading...</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
          <p className="text-red-800">❌ {error}</p>
        </div>
      )}

      {/* Hidden Columns Indicator - Desktop Only */}
      {!loading && !error && hiddenColumns.size > 0 && (
        <div className="mb-3 relative hidden sm:block">
          <div className="bg-orange-100 border-l-4 border-orange-500 p-3 rounded">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-orange-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-orange-700">
                    <strong>{hiddenColumns.size} column{hiddenColumns.size !== 1 ? 's' : ''} hidden:</strong> {[...hiddenColumns].join(', ')}
                  </p>
                </div>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={showAllColumns}
                  className="px-3 py-1 bg-orange-500 text-white text-xs rounded hover:bg-orange-600 transition-colors"
                >
                  👁️ Show All
                </button>
                <button
                  onClick={() => setShowColumnSettings(true)}
                  className="px-3 py-1 bg-gray-500 text-white text-xs rounded hover:bg-gray-600 transition-colors"
                >
                  ⚙️ Manage
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mobile: Card View */}
      <div className="sm:hidden">
        {!loading && !error && (
          <>
            {/* Mobile Add New Form */}
            {showNewRow && (
              <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4 mb-4">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-medium text-green-800">➕ Add New Record</h3>
                  <button
                    onClick={() => {
                      setShowNewRow(false);
                      setNewRow({});
                    }}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    ✖️
                  </button>
                </div>
                <div className="space-y-3">
                  {getVisibleColumns().slice(0, 4).map(column => (
                    <div key={column}>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{column}</label>
                      <input
                        type="text"
                        value={newRow[column] || ''}
                        onChange={(e) => setNewRow({
                          ...newRow,
                          [column]: e.target.value
                        })}
                        placeholder={`Enter ${column}`}
                        className="w-full p-2 border border-green-300 rounded text-sm focus:ring-1 focus:ring-green-500"
                      />
                    </div>
                  ))}
                  <button
                    onClick={handleAddNewRow}
                    className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                  >
                    ✅ Save Record
                  </button>
                </div>
              </div>
            )}

            {/* Mobile Cards */}
            <div className="space-y-3">
              {filteredData.map((item) => (
                <MobileCard
                  key={item.id}
                  item={item}
                  visibleColumns={getVisibleColumns()}
                  onEdit={handleCellEdit}
                  onDelete={handleDeleteRecord}
                />
              ))}
            </div>

            {/* Mobile Empty State */}
            {filteredData.length === 0 && !loading && (
              <div className="text-center py-12 bg-white rounded-lg border">
                <p className="text-gray-500 text-lg">📭 No data found</p>
                <p className="text-gray-400 text-sm mt-2 mb-4">
                  {searchTerm ? 'Try adjusting your search term' : 'This collection is empty'}
                </p>
                {!showNewRow && (
                  <button
                    onClick={() => setShowNewRow(true)}
                    className="px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700"
                  >
                    ➕ Add First Record
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Desktop: Table View - FINAL VERSION */}
      <div className="hidden sm:block">
        {!loading && !error && (
          <div className="bg-white shadow-lg overflow-hidden rounded-lg border relative">
            <div className="data-table-scroll-container overflow-x-auto max-h-[70vh] scrollbar-hide">
              <table className="w-full divide-y divide-gray-200">
                {/* Table structure remains the same with proper CSS classes */}
                <thead className="bg-gray-50 data-table-header">
                  <tr>
                    <th className="data-table-id-header px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24 min-w-[6rem] border-r-2 border-blue-200">
                      📌 ID
                    </th>
                    {getVisibleColumns().map(column => (
                      <th key={column} className="data-table-header px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[8rem] max-w-[12rem] relative">
                        <ColumnHeader 
                          columnName={column}
                          onHide={hideColumn}
                          showDropdown={columnDropdowns.has(column)}
                          onToggleDropdown={(name, show) => {
                            if (show) {
                              toggleColumnDropdown(name);
                            } else {
                              setColumnDropdowns(new Set());
                            }
                          }}
                        />
                      </th>
                    ))}
                    <th className="data-table-header px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-16 min-w-[4rem]">
                      Del
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredData.map((item) => (
                    <tr key={item.id} className="data-table-row hover:bg-blue-50 group">
                      <td className="data-table-id-cell group-hover:data-table-id-cell-hover px-2 py-1 text-xs text-gray-600 font-mono w-24 min-w-[6rem] border-r-2 border-blue-200">
                        <div className="truncate" title={item.id}>
                          {item.id.substring(0, 8)}...
                        </div>
                      </td>
                      {getVisibleColumns().map(column => (
                        <td key={column} className="data-table-cell px-2 py-1 text-sm relative group/cell max-w-[12rem]">
                          <EditableCell
                            value={item[column]}
                            onSave={(newValue) => handleCellEdit(item.id, column, newValue, item[column])}
                            placeholder={`Enter ${column}`}
                          />
                        </td>
                      ))}
                      <td className="data-table-cell px-2 py-1 text-center">
                        <button
                          onClick={() => handleDeleteRecord(item.id)}
                          className="text-red-400 hover:text-red-600 p-1 rounded-full hover:bg-red-50 transition-colors"
                          title="Delete record"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                  
                  {/* FIXED: Add new row */}
                  {showNewRow && (
                    <tr className="data-table-row data-table-new-row bg-green-50 border-2 border-green-200">
                      <td className="data-table-id-cell px-2 py-1 text-xs text-green-600 font-mono border-r-2 border-green-200">
                        <div className="text-center">NEW</div>
                      </td>
                      {getVisibleColumns().map(column => (
                        <td key={column} className="data-table-cell px-2 py-1">
                          <input
                            type="text"
                            value={newRow[column] || ''}
                            onChange={(e) => setNewRow({
                              ...newRow,
                              [column]: e.target.value
                            })}
                            placeholder={`Enter ${column}`}
                            className="w-full p-1 border border-green-300 rounded text-sm focus:ring-1 focus:ring-green-500 bg-white"
                          />
                        </td>
                      ))}
                      <td className="data-table-cell px-2 py-1 text-center">
                        <div className="flex space-x-1">
                          <button
                            onClick={handleAddNewRow}
                            className="text-green-600 hover:text-green-800 text-xs bg-green-100 px-2 py-1 rounded transition-colors"
                            title="Save new record"
                          >
                            ✅
                          </button>
                          <button
                            onClick={() => {
                              setShowNewRow(false);
                              setNewRow({});
                            }}
                            className="text-gray-400 hover:text-gray-600 text-xs bg-gray-100 px-2 py-1 rounded transition-colors"
                            title="Cancel"
                          >
                            ❌
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            
            {/* Desktop Empty State */}
            {filteredData.length === 0 && !loading && (
              <div className="text-center py-12">
                <p className="text-gray-500 text-lg">📭 No data found</p>
                <p className="text-gray-400 text-sm mt-2">
                  {searchTerm ? 'Try adjusting your search term' : 'This collection is empty'}
                </p>
                {!showNewRow && (
                  <button
                    onClick={() => setShowNewRow(true)}
                    className="mt-4 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                  >
                    ➕ Add First Record
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Instructions - Responsive */}
      <div className="mt-6 sm:mt-8 bg-blue-50 border border-blue-200 rounded-lg p-3 sm:p-4">
        <h3 className="font-medium text-blue-800 mb-2 text-sm sm:text-base">💡 Interface Tips:</h3>
        
        {/* Mobile Tips */}
        <div className="sm:hidden">
          <ul className="text-xs text-blue-700 space-y-1">
            <li>• <strong>Edit:</strong> Tap any field in the cards to edit</li>
            <li>• <strong>Add:</strong> Use "➕ Add" button for new records</li>
            <li>• <strong>More actions:</strong> Expand "⚙️ More actions" for import/export</li>
            <li>• <strong>Desktop view:</strong> Use wider screen for full table features</li>
          </ul>
        </div>

        {/* Desktop Tips */}
        <div className="hidden sm:block">
          <ul className="text-sm text-blue-700 space-y-1">
            <li>• <strong>Edit:</strong> Click any cell to edit directly. Press Enter to save, Escape to cancel</li>
            <li>• <strong>Add:</strong> Click "➕ Add New" to create a new row inline. Enter to save, Escape to cancel</li>
            <li>• <strong>Delete:</strong> Hover over rows to see the delete button (🗑️)</li>
            <li>• <strong>Hide Columns:</strong> Hover over column headers and click the dropdown arrow, or use "⚙️ Columns" panel</li>
            <li>• <strong>Show Columns:</strong> Click on hidden column tags in the "⚙️ Columns" panel to restore them</li>
            <li>• <strong>Sticky ID:</strong> The 📌 ID column stays visible when scrolling horizontally</li>
            <li>• <strong>CSV Import:</strong> Click "❓ Help" for step-by-step paste instructions</li>
            <li>• <strong>Search:</strong> Filter across all visible fields in real-time</li>
          </ul>
        </div>
      </div>
    </div>
  );
}