import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { collection, getDocs, doc, updateDoc, addDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { 
  PlusIcon, 
  PencilIcon,
  TrashIcon,
  ArrowLeftIcon,
  BuildingOfficeIcon,
  UserGroupIcon,
  CurrencyDollarIcon,
  WrenchScrewdriverIcon,
  DocumentTextIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  UserIcon,
  HomeIcon
} from '@heroicons/react/24/outline';
import Modal from '../components/Modal';
import { 
  logRoomCreate, 
  logRoomUpdate, 
  logRoomDelete,
  logMaintenanceCreate,
  logRoomReassignment
} from '../lib/historyLogger';
import { Timestamp } from 'firebase/firestore';

export default function PropertyDetail() {
  const router = useRouter();
  const { id } = router.query;
  
  const [property, setProperty] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [maintenance, setMaintenance] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Modal states
  const [showAddRoomModal, setShowAddRoomModal] = useState(false);
  const [showEditRoomModal, setShowEditRoomModal] = useState(false);
  const [showMaintenanceModal, setShowMaintenanceModal] = useState(false);
  const [editingRoom, setEditingRoom] = useState(null);
  
  // Form states
  const [roomForm, setRoomForm] = useState({
    room_name: '',
    capacity: 2,
    amenities: []
  });
  
  const [maintenanceForm, setMaintenanceForm] = useState({
    item: '',
    cost: '',
    date: new Date().toISOString().slice(0, 10),
    description: '',
    status: 'pending'
  });

  const [todos, setTodos] = useState([]);
  const [newTodoText, setNewTodoText] = useState("");
  const [newTodoDate, setNewTodoDate] = useState("");

  // Editing states for inline room assignment
  const [editingEmployeeId, setEditingEmployeeId] = useState(null);
  const [editingRoomAssignment, setEditingRoomAssignment] = useState('');

  useEffect(() => {
    if (id) {
      fetchPropertyData();
    }
  }, [id]);

  useEffect(() => {
    if (property && property.todos) {
      setTodos(property.todos);
    }
  }, [property]);

  const fetchPropertyData = async () => {
    try {
      // Fetch property details
      const propertiesRef = collection(db, 'properties');
      const propertiesSnapshot = await getDocs(propertiesRef);
      let propertyData = propertiesSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .find(prop => prop.id === id);

      if (!propertyData) {
        console.error('Property not found:', id);
        router.push('/properties');
        return;
      }

      // Ensure genderTypes is an array to handle data inconsistencies
      if (typeof propertyData.genderTypes === 'string') {
        propertyData.genderTypes = [propertyData.genderTypes];
      } else if (!propertyData.genderTypes && propertyData.target_gender_type) {
        propertyData.genderTypes = [propertyData.target_gender_type];
      } else if (!Array.isArray(propertyData.genderTypes)) {
        propertyData.genderTypes = [];
      }

      // Fetch ALL employees
      const employeesRef = collection(db, 'employees');
      const employeesSnapshot = await getDocs(employeesRef);
      const allEmployees = employeesSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }));

      /**
       * CORRECTED LOGIC - EXACTLY MATCHING PROPERTIES PAGE
       * 
       * Show employees who are assigned to THIS property, regardless of status!
       * Status only indicates if they've arrived physically, not housing assignment.
       */
      const employeesData = allEmployees.filter(emp => {
        // Check if employee is assigned to THIS property (same logic as getPropertyEmployees)
        const isAssignedById = emp.assigned_property_id === id;
        const isAssignedByName = emp.assignedProperty === propertyData.name;
        
        const isAssignedToProperty = isAssignedById || isAssignedByName;
        
        // Return true if assigned to this property, regardless of status
        return isAssignedToProperty;
      });

      // Enhanced debug logging to match properties page
      console.log(`\n=== PROPERTY DETAIL DEBUG (MATCHING PROPERTIES PAGE) ===`);
      console.log(`Property ID: ${id}, Property Name: ${propertyData.name}`);
      console.log(`Total employees in database: ${allEmployees.length}`);
      
      // Count all employees assigned to this property by status
      const statusBreakdown = {
        housed: 0,
        pending: 0,
        pending_assignment: 0,
        departed: 0,
        other: 0
      };
      
      employeesData.forEach(emp => {
        if (statusBreakdown[emp.status] !== undefined) {
          statusBreakdown[emp.status]++;
        } else {
          statusBreakdown.other++;
        }
      });
      
      console.log(`Employees assigned to this property (ALL statuses): ${employeesData.length}`);
      console.log(`Status breakdown:`);
      console.log(`  - housed (已入住): ${statusBreakdown.housed}`);
      console.log(`  - pending (未入住): ${statusBreakdown.pending}`);
      console.log(`  - pending_assignment (待分配): ${statusBreakdown.pending_assignment}`);
      console.log(`  - departed (已離開): ${statusBreakdown.departed}`);
      console.log(`  - other: ${statusBreakdown.other}`);
      
      employeesData.forEach(emp => {
        console.log(`  - ${emp.name || emp.firstName || 'Unknown'} (Status: ${emp.status}, Room: ${emp.assigned_room_name || emp.roomNumber || 'Unassigned'})`);
      });
      console.log(`=== END PROPERTY DETAIL DEBUG ===\n`);

      // Fetch invoices related to this property
      const invoicesRef = collection(db, 'invoices');
      const invoicesSnapshot = await getDocs(invoicesRef);
      const allInvoicesData = invoicesSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Filter invoices by property (using assigned_property_id logic)
      const invoicesData = allInvoicesData.filter(invoice => {
        // Method 1: Direct property_id match
        if (invoice.property_id === id) return true;
        
        // Method 2: Check if invoice belongs to employees assigned to this property
        const employeeInThisProperty = employeesData.some(emp => 
          emp.id === invoice.employee_id || emp.employeeId === invoice.employee_id
        );
        
        return employeeInThisProperty;
      });
      
      console.log(`\n=== INVOICE DEBUG ===`);
      console.log(`Property ID: ${id}, Property Name: ${propertyData.name}`);
      console.log(`Total invoices in database: ${allInvoicesData.length}`);
      console.log(`Invoices for this property: ${invoicesData.length}`);
      console.log(`=== END INVOICE DEBUG ===\n`);

      // Fetch maintenance records for this property
      const maintenanceRef = collection(db, 'maintenance');
      const maintenanceSnapshot = await getDocs(maintenanceRef);
      const maintenanceData = maintenanceSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(item => item.property_id === propertyData.name || item.property_id === id);

      // Set up rooms (use existing or create default)
      const propertyRooms = propertyData.rooms || [
        { room_name: 'Room-101', capacity: 2, amenities: ['WiFi', 'Air Conditioning'] },
        { room_name: 'Room-102', capacity: 2, amenities: ['WiFi', 'Air Conditioning'] },
        { room_name: 'Room-103', capacity: 1, amenities: ['WiFi', 'Air Conditioning', 'Private Bathroom'] },
        { room_name: 'Room-201', capacity: 2, amenities: ['WiFi', 'Air Conditioning'] },
        { room_name: 'Room-202', capacity: 2, amenities: ['WiFi', 'Air Conditioning'] }
      ];

      setProperty(propertyData);
      setEmployees(employeesData);
      setInvoices(invoicesData);
      setMaintenance(maintenanceData);
      setRooms(propertyRooms);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching property data:', error);
      setLoading(false);
      alert('載入物業資料時發生錯誤，請重新整理頁面。');
    }
  };

  // FIXED: Helper functions for capacity calculations
  const getTotalPropertyCapacity = () => {
    // Return static bed capacity (total bed spaces available)
    return property?.capacity || 
           (property?.rooms ? property.rooms.reduce((sum, room) => sum + (room.capacity || 0), 0) : 0);
  };

  const getCurrentOccupancy = () => {
    // Return count of housed employees only (actual occupancy)
    return employees.filter(emp => emp.status === 'housed').length;
  };

  const getOccupancyPercentage = () => {
    const capacity = getTotalPropertyCapacity();
    const occupancy = getCurrentOccupancy();
    return capacity > 0 ? Math.round((occupancy / capacity) * 100) : 0;
  };

  // Optional: Helper function to get room capacity sum for reference
  const getRoomCapacitySum = () => {
    return rooms.reduce((total, room) => total + (room.capacity || 0), 0);
  };

  const getRoomEmployees = (roomName) => {
    return employees.filter(emp => 
      emp.assigned_room_name === roomName || 
      emp.roomNumber === roomName
    );
  };

  const getUnassignedEmployees = () => {
    return employees.filter(emp => 
      !emp.assigned_room_name && !emp.roomNumber
    );
  };

  // Handle inline room assignment editing
  const handleStartEditRoomAssignment = (employee) => {
    setEditingEmployeeId(employee.id);
    setEditingRoomAssignment(employee.assigned_room_name || employee.roomNumber || '');
  };

  const handleSaveRoomAssignment = async (employeeId) => {
    try {
      const employee = employees.find(emp => emp.id === employeeId);
      if (!employee) return;

      const oldRoomName = employee.assigned_room_name || employee.roomNumber || 'Unassigned';
      const newRoomName = editingRoomAssignment || null;

      // Validate room capacity if assigning to a room
      if (newRoomName && newRoomName !== 'Unassigned') {
        const targetRoom = rooms.find(room => room.room_name === newRoomName);
        if (!targetRoom) {
          alert('房間不存在');
          return;
        }

        const currentRoomEmployees = getRoomEmployees(newRoomName);
        // Don't count the current employee if they're already in this room
        const availableCapacity = targetRoom.capacity - (oldRoomName === newRoomName ? currentRoomEmployees.length - 1 : currentRoomEmployees.length);
        
        if (availableCapacity <= 0) {
          alert(`房間 ${newRoomName} 已滿 (${currentRoomEmployees.length}/${targetRoom.capacity})`);
          return;
        }
      }

      // Update employee room assignment
      const employeeRef = doc(db, 'employees', employeeId);
      await updateDoc(employeeRef, {
        assigned_room_name: newRoomName === 'Unassigned' ? null : newRoomName,
        roomNumber: newRoomName === 'Unassigned' ? null : newRoomName, // Legacy field
        updatedAt: new Date()
      });

      // Log the room reassignment
      await logRoomReassignment(
        employee.name || employee.firstName || 'Unknown',
        oldRoomName,
        newRoomName || 'Unassigned',
        property?.name || 'Unknown Property',
        employeeId
      );

      setEditingEmployeeId(null);
      setEditingRoomAssignment('');
      
      // Refresh data
      await fetchPropertyData();
    } catch (error) {
      console.error('Error updating room assignment:', error);
      alert('更新房間分配失敗，請重試。');
    }
  };

  const handleCancelEditRoomAssignment = () => {
    setEditingEmployeeId(null);
    setEditingRoomAssignment('');
  };

  const handleAddRoom = async (e) => {
    e.preventDefault();
    try {
      const updatedRooms = [...rooms, roomForm];
      
      // Update property with new rooms
      const propertyRef = doc(db, 'properties', id);
      await updateDoc(propertyRef, {
        rooms: updatedRooms,
        totalRooms: updatedRooms.length,
        updatedAt: new Date()
      });

      // Log the room creation
      await logRoomCreate(
        { ...roomForm, id: Date.now() },
        property?.name || 'Unknown Property',
        id
      );

      setShowAddRoomModal(false);
      setRoomForm({ room_name: '', capacity: 2, amenities: [] });
      fetchPropertyData();
    } catch (error) {
      console.error('Error adding room:', error);
    }
  };

  const handleEditRoom = async (e) => {
    e.preventDefault();
    try {
      const updatedRooms = rooms.map(room => 
        room.room_name === editingRoom.room_name ? roomForm : room
      );
      
      // Update property with modified rooms
      const propertyRef = doc(db, 'properties', id);
      await updateDoc(propertyRef, {
        rooms: updatedRooms,
        updatedAt: new Date()
      });

      // Log the room update
      await logRoomUpdate(
        editingRoom.room_name,
        editingRoom.room_name,
        property?.name || 'Unknown Property',
        editingRoom,
        roomForm
      );

      setShowEditRoomModal(false);
      setEditingRoom(null);
      setRoomForm({ room_name: '', capacity: 2, amenities: [] });
      fetchPropertyData();
    } catch (error) {
      console.error('Error editing room:', error);
    }
  };

  const handleDeleteRoom = async (roomName) => {
    // Check if room has employees
    const roomEmployees = getRoomEmployees(roomName);
    if (roomEmployees.length > 0) {
      alert(`無法刪除房間 ${roomName}，房間內還有 ${roomEmployees.length} 位員工。請先將員工遷出。`);
      return;
    }

    if (window.confirm(`確定要刪除房間 ${roomName} 嗎？`)) {
      try {
        const roomToDelete = rooms.find(room => room.room_name === roomName);
        const updatedRooms = rooms.filter(room => room.room_name !== roomName);
        
        // Update property with remaining rooms
        const propertyRef = doc(db, 'properties', id);
        await updateDoc(propertyRef, {
          rooms: updatedRooms,
          totalRooms: updatedRooms.length,
          updatedAt: new Date()
        });

        // Log the room deletion
        await logRoomDelete(
          roomToDelete || { room_name: roomName },
          property?.name || 'Unknown Property',
          id
        );

        fetchPropertyData();
      } catch (error) {
        console.error('Error deleting room:', error);
      }
    }
  };

  const handleAddMaintenance = async (e) => {
    e.preventDefault();
    try {
      const maintenanceData = {
        ...maintenanceForm,
        cost: parseFloat(maintenanceForm.cost) || 0,
        date: new Date(maintenanceForm.date),
        property_id: id,
        property_name: property?.name,
        created_at: new Date()
      };

      const docRef = await addDoc(collection(db, 'maintenance'), maintenanceData);

      // Log the maintenance creation
      await logMaintenanceCreate(
        { ...maintenanceData, id: docRef.id },
        property?.name || 'Unknown Property',
        id
      );

      setShowMaintenanceModal(false);
      setMaintenanceForm({
        item: '',
        cost: '',
        date: new Date().toISOString().slice(0, 10),
        description: '',
        status: 'pending'
      });
      fetchPropertyData();
    } catch (error) {
      console.error('Error adding maintenance:', error);
    }
  };

  const openEditRoomModal = (room) => {
    setEditingRoom(room);
    setRoomForm({ ...room });
    setShowEditRoomModal(true);
  };

  const getRentStats = () => {
    // Calculate total rent from individual employee rent amounts
    const totalRent = employees.reduce((sum, emp) => {
      const rent = parseFloat(emp.rent) || parseFloat(emp.monthlyRent) || parseFloat(property?.monthlyRent) || 0;
      return sum + rent;
    }, 0);
    
    // For simulation, assume 70% have paid
    const paidCount = Math.floor(employees.length * 0.7);
    const dueCount = employees.length - paidCount;
    
    // Calculate paid and due amounts based on individual rents
    let paidAmount = 0;
    let dueAmount = 0;
    
    employees.forEach((emp, index) => {
      const empRent = parseFloat(emp.rent) || parseFloat(emp.monthlyRent) || parseFloat(property?.monthlyRent) || 0;
      if (index < paidCount) {
        paidAmount += empRent;
      } else {
        dueAmount += empRent;
      }
    });
    
    return { totalRent, paidCount, dueCount, paidAmount, dueAmount };
  };

  const formatCurrency = (amount) => {
    const numericAmount = parseFloat(amount || 0);
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      useGrouping: true
    }).format(numericAmount);
  };

  // Helper function to get current month invoices
  const getCurrentMonthInvoices = () => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    
    return invoices.filter(invoice => {
      if (!invoice.created_at) return false;
      
      // Handle Firestore Timestamp
      let invoiceDate;
      if (invoice.created_at.seconds) {
        invoiceDate = new Date(invoice.created_at.seconds * 1000);
      } else {
        invoiceDate = new Date(invoice.created_at);
      }
      
      return invoiceDate.getFullYear() === currentYear && 
             invoiceDate.getMonth() === currentMonth;
    }).sort((a, b) => {
      // Sort by creation date, newest first
      const dateA = a.created_at.seconds ? new Date(a.created_at.seconds * 1000) : new Date(a.created_at);
      const dateB = b.created_at.seconds ? new Date(b.created_at.seconds * 1000) : new Date(b.created_at);
      return dateB - dateA;
    });
  };

  const handleAddTodo = async () => {
    if (!newTodoText.trim()) return;
    const todo = {
      text: newTodoText.trim(),
      completed: false,
      expectedDate: newTodoDate ? newTodoDate : null,
      createdAt: new Date(),
    };
    const updatedTodos = [...(todos || []), todo];
    setTodos(updatedTodos);
    setNewTodoText("");
    setNewTodoDate("");
    // Save to Firestore
    const propertyRef = doc(db, 'properties', id);
    await updateDoc(propertyRef, { todos: updatedTodos });
  };

  const handleToggleTodo = async (idx) => {
    const updatedTodos = todos.map((todo, i) => i === idx ? { ...todo, completed: !todo.completed } : todo);
    setTodos(updatedTodos);
    const propertyRef = doc(db, 'properties', id);
    await updateDoc(propertyRef, { todos: updatedTodos });
  };

  const handleDeleteTodo = async (idx) => {
    const updatedTodos = todos.filter((_, i) => i !== idx);
    setTodos(updatedTodos);
    const propertyRef = doc(db, 'properties', id);
    await updateDoc(propertyRef, { todos: updatedTodos });
  };

  // Update the status display to show correct Chinese labels
  const getStatusDisplay = (status) => {
    const statusMap = {
      'housed': '已入住', // Has arrived and is physically present
      'pending': '未入住', // Assigned but hasn't arrived yet
      'pending_assignment': '待分配', // Not assigned to any property
      'departed': '已離開' // Has left the property
    };
    return statusMap[status] || status || '未知';
  };

  const getStatusBadgeClass = (status) => {
    const statusClasses = {
      'housed': 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
      'pending': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400',
      'pending_assignment': 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400',
      'departed': 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
    };
    return statusClasses[status] || 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (!property) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h3 className="text-lg font-medium text-gray-900">找不到物業</h3>
          <button
            onClick={() => router.push('/properties')}
            className="mt-4 bg-primary-600 text-white px-4 py-2 rounded-md"
          >
            返回物業列表
          </button>
        </div>
      </div>
    );
  }

  const rentStats = getRentStats();
  const occupancyPercentage = getOccupancyPercentage();
  const totalCapacity = getTotalPropertyCapacity();
  const currentOccupancy = getCurrentOccupancy();
  const unassignedEmployees = getUnassignedEmployees();
  const currentMonthInvoices = getCurrentMonthInvoices();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => router.back()}
            className="p-2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
          >
            <ArrowLeftIcon className="h-6 w-6" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {property.name}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {property.address} • {property.location}
            </p>
            {/* Capacity status indicator */}
            {occupancyPercentage >= 100 && (
              <p className="text-sm text-red-600 dark:text-red-400 font-medium">
                ⚠️ 物業已滿 ({currentOccupancy}/{totalCapacity})
              </p>
            )}
            {occupancyPercentage >= 90 && occupancyPercentage < 100 && (
              <p className="text-sm text-orange-600 dark:text-orange-400 font-medium">
                ⚠️ 物業接近滿載 ({occupancyPercentage}% - {currentOccupancy}/{totalCapacity})
              </p>
            )}
          </div>
        </div>
        
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowMaintenanceModal(true)}
            className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-md flex items-center space-x-2"
          >
            <WrenchScrewdriverIcon className="h-5 w-5" />
            <span>報告維修</span>
          </button>
          <button
            onClick={() => setShowAddRoomModal(true)}
            className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-md flex items-center space-x-2"
          >
            <PlusIcon className="h-5 w-5" />
            <span>新增房間</span>
          </button>
        </div>
      </div>

      {/* Property Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-md bg-blue-50 dark:bg-blue-900/20">
              <BuildingOfficeIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">總容量</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {totalCapacity}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-md bg-green-50 dark:bg-green-900/20">
              <UserGroupIcon className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">入住人數</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {currentOccupancy}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-md bg-purple-50 dark:bg-purple-900/20">
              <CurrencyDollarIcon className="h-6 w-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">月租收入</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {formatCurrency(rentStats.totalRent)}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-md bg-red-50 dark:bg-red-900/20">
              <WrenchScrewdriverIcon className="h-6 w-6 text-red-600 dark:text-red-400" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">維修費用</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {formatCurrency(maintenance.reduce((sum, item) => sum + (item.cost || 0), 0))}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Todo List for non-active properties */}
      {property.status !== 'active' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">待辦事項 (Todo List)</h2>
          <div className="space-y-2">
            {todos && todos.length > 0 ? todos.map((todo, idx) => (
              <div key={idx} className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 py-2">
                <div className="flex items-center space-x-2">
                  <button onClick={() => handleToggleTodo(idx)} className="text-green-600 hover:text-green-800">
                    {todo.completed ? <CheckCircleIcon className="h-5 w-5" /> : <ClockIcon className="h-5 w-5" />}
                  </button>
                  <span className={todo.completed ? 'line-through text-gray-400' : ''}>{todo.text}</span>
                  {todo.expectedDate && (
                    <span className="ml-2 text-xs text-gray-500">預計完成: {new Date(todo.expectedDate).toLocaleDateString()}</span>
                  )}
                </div>
                <button onClick={() => handleDeleteTodo(idx)} className="text-red-500 hover:text-red-700">
                  <XCircleIcon className="h-5 w-5" />
                </button>
              </div>
            )) : <div className="text-gray-400">暫無待辦事項</div>}
          </div>
          <div className="flex items-center space-x-2 mt-4">
            <input
              type="text"
              value={newTodoText}
              onChange={e => setNewTodoText(e.target.value)}
              placeholder="新增待辦事項..."
              className="flex-1 px-3 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white"
            />
            <input
              type="date"
              value={newTodoDate}
              onChange={e => setNewTodoDate(e.target.value)}
              className="px-2 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white"
            />
            <button onClick={handleAddTodo} className="px-3 py-1 bg-primary-600 text-white rounded hover:bg-primary-700">新增</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content - Employee List and Room Overview */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* In-House Employees List */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                  入住員工列表 ({employees.length})
                </h2>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  點擊房間欄位可編輯分配
                </div>
              </div>
            </div>
            
            <div className="p-6">
              {employees.length === 0 ? (
                <div className="text-center py-8">
                  <UserGroupIcon className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
                  <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">暫無入住員工</h3>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    此物業目前沒有入住員工。
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                          員工姓名
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                          公司
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                          性別
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                          房間分配
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                          狀態
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                          到達狀態
                          <div className="text-xs font-normal text-gray-400 normal-case">
                            (是否已到達物業)
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                      {employees.map((employee) => (
                        <tr key={employee.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div className="flex-shrink-0 h-10 w-10">
                                <div className="h-10 w-10 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center">
                                  <UserIcon className="h-6 w-6 text-primary-600 dark:text-primary-400" />
                                </div>
                              </div>
                              <div className="ml-4">
                                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                  {employee.name || employee.firstName || 'Unknown'}
                                </div>
                                <div className="text-sm text-gray-500 dark:text-gray-400">
                                  ID: {employee.id.slice(-6)}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                            {employee.company || '無公司'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              employee.gender === 'male' ? 'bg-blue-100 text-blue-800' :
                              employee.gender === 'female' ? 'bg-pink-100 text-pink-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {employee.gender === 'male' ? '男' : employee.gender === 'female' ? '女' : '其他'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {editingEmployeeId === employee.id ? (
                              <div className="flex items-center space-x-2">
                                <select
                                  value={editingRoomAssignment}
                                  onChange={(e) => setEditingRoomAssignment(e.target.value)}
                                  className="text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white dark:border-gray-600"
                                >
                                  <option value="">未分配</option>
                                  {rooms.map((room) => {
                                    const roomEmployees = getRoomEmployees(room.room_name);
                                    const isCurrentRoom = (employee.assigned_room_name || employee.roomNumber) === room.room_name;
                                    const availableCapacity = room.capacity - (isCurrentRoom ? roomEmployees.length - 1 : roomEmployees.length);
                                    
                                    return (
                                      <option 
                                        key={room.room_name} 
                                        value={room.room_name}
                                        disabled={availableCapacity <= 0 && !isCurrentRoom}
                                      >
                                        {room.room_name} ({roomEmployees.length}/{room.capacity})
                                        {availableCapacity <= 0 && !isCurrentRoom ? ' - 已滿' : ''}
                                      </option>
                                    );
                                  })}
                                </select>
                                <button
                                  onClick={() => handleSaveRoomAssignment(employee.id)}
                                  className="text-green-600 hover:text-green-800 text-sm"
                                >
                                  保存
                                </button>
                                <button
                                  onClick={handleCancelEditRoomAssignment}
                                  className="text-gray-600 hover:text-gray-800 text-sm"
                                >
                                  取消
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleStartEditRoomAssignment(employee)}
                                className="text-sm text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300 flex items-center space-x-1"
                              >
                                <HomeIcon className="h-4 w-4" />
                                <span>
                                  {employee.assigned_room_name || employee.roomNumber || '未分配'}
                                </span>
                                <PencilIcon className="h-3 w-3" />
                              </button>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeClass(employee.status)}`}>
                              {getStatusDisplay(employee.status)}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                            {employee.arrival_time ? (
                              employee.arrival_time.seconds ? 
                                new Date(employee.arrival_time.seconds * 1000).toLocaleDateString('zh-HK') :
                                new Date(employee.arrival_time).toLocaleDateString('zh-HK')
                            ) : '未記錄'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Room Overview */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                  房間概覽 ({rooms.length} 個房間)
                </h2>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  總容量: {totalCapacity} | 已入住: {currentOccupancy} | 空置: {totalCapacity - currentOccupancy}
                </div>
              </div>
            </div>
            
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {rooms.map((room) => {
                  const roomEmployees = getRoomEmployees(room.room_name);
                  const occupancyRate = Math.round((roomEmployees.length / room.capacity) * 100);
                  
                  return (
                    <div key={room.room_name} className={`border-2 rounded-lg p-4 ${
                      roomEmployees.length >= room.capacity 
                        ? 'border-red-200 bg-red-50 dark:border-red-600 dark:bg-red-900/10' 
                        : roomEmployees.length > 0
                          ? 'border-green-200 bg-green-50 dark:border-green-600 dark:bg-green-900/10'
                          : 'border-gray-200 bg-gray-50 dark:border-gray-600 dark:bg-gray-700'
                    }`}>
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h3 className="font-medium text-gray-900 dark:text-gray-100">{room.room_name}</h3>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {roomEmployees.length}/{room.capacity} ({occupancyRate}%)
                          </p>
                        </div>
                        <div className="flex space-x-1">
                          <button
                            onClick={() => openEditRoomModal(room)}
                            className="p-1 text-gray-400 hover:text-blue-600 dark:text-gray-500 dark:hover:text-blue-400"
                            title="編輯房間"
                          >
                            <PencilIcon className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteRoom(room.room_name)}
                            className="p-1 text-gray-400 hover:text-red-600 dark:text-gray-500 dark:hover:text-red-400"
                            title="刪除房間"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {/* Room amenities */}
                      {room.amenities && room.amenities.length > 0 && (
                        <div className="mb-3">
                          <div className="flex flex-wrap gap-1">
                            {room.amenities.slice(0, 3).map((amenity, index) => (
                              <span key={index} className="px-2 py-1 bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-300 text-xs rounded">
                                {amenity}
                              </span>
                            ))}
                            {room.amenities.length > 3 && (
                              <span className="px-2 py-1 bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-300 text-xs rounded">
                                +{room.amenities.length - 3}
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Room occupants */}
                      <div className="space-y-1">
                        {roomEmployees.length === 0 ? (
                          <p className="text-sm text-gray-400 dark:text-gray-500 italic">空房間</p>
                        ) : (
                          roomEmployees.map((employee) => (
                            <div key={employee.id} className="text-sm text-gray-700 dark:text-gray-300 flex items-center space-x-2">
                              <UserIcon className="h-3 w-3" />
                              <span>{employee.name || employee.firstName || 'Unknown'}</span>
                              <span className={`px-1 py-0.5 text-xs rounded ${
                                employee.gender === 'male' ? 'bg-blue-100 text-blue-700' :
                                employee.gender === 'female' ? 'bg-pink-100 text-pink-700' :
                                'bg-gray-100 text-gray-700'
                              }`}>
                                {employee.gender === 'male' ? '男' : employee.gender === 'female' ? '女' : '其他'}
                              </span>
                            </div>
                          ))
                        )}
                      </div>

                      {/* Capacity indicator */}
                      <div className="mt-3 w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full transition-all duration-300 ${
                            occupancyRate >= 100 ? 'bg-red-500' :
                            occupancyRate >= 80 ? 'bg-yellow-500' :
                            'bg-green-500'
                          }`}
                          style={{ width: `${Math.min(occupancyRate, 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Unassigned Employees (if any) */}
          {unassignedEmployees.length > 0 && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-6">
              <div className="flex items-center mb-4">
                <div className="p-2 rounded-md bg-yellow-100 dark:bg-yellow-900/40">
                  <UserGroupIcon className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                </div>
                <h3 className="ml-3 text-lg font-medium text-yellow-800 dark:text-yellow-200">
                  未分配房間的員工 ({unassignedEmployees.length})
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {unassignedEmployees.map((employee) => (
                  <div key={employee.id} className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-yellow-200 dark:border-yellow-700">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-gray-100">
                          {employee.name || employee.firstName || 'Unknown'}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {employee.company || '無公司'}
                        </p>
                      </div>
                      <button
                        onClick={() => handleStartEditRoomAssignment(employee)}
                        className="text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300"
                      >
                        <PencilIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar - Financial & Maintenance */}
        <div className="space-y-6">
          {/* Rent Status */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">租金狀況</h2>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400">每月租金</span>
                <span className="font-medium">{formatCurrency(property.monthlyRent || 20000)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400">已收租金</span>
                <span className="font-medium text-green-600">{formatCurrency(rentStats.paidAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400">待收租金</span>
                <span className="font-medium text-red-600">{formatCurrency(rentStats.dueAmount)}</span>
              </div>
              <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                <div className="flex justify-between">
                  <span className="text-sm font-medium">入住率</span>
                  <span className={`font-medium ${
                    occupancyPercentage > 100 ? 'text-red-600' : 
                    occupancyPercentage === 100 ? 'text-orange-600' : 
                    'text-gray-900 dark:text-gray-100'
                  }`}>
                    {occupancyPercentage}% ({currentOccupancy}/{totalCapacity})
                  </span>
                </div>
                {/* Visual progress bar */}
                <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full transition-all duration-300 ${
                      occupancyPercentage > 100 ? 'bg-red-500' :
                      occupancyPercentage === 100 ? 'bg-orange-500' :
                      occupancyPercentage >= 90 ? 'bg-yellow-500' :
                      'bg-green-500'
                    }`}
                    style={{ width: `${Math.min(occupancyPercentage, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Maintenance Issues */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">維修記錄</h2>
                <span className="bg-orange-100 text-orange-800 text-xs px-2 py-1 rounded-full">
                  {maintenance.length}
                </span>
              </div>
            </div>
            <div className="p-6">
              {maintenance.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                  暫無維修記錄
                </p>
              ) : (
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {maintenance.map((item, index) => (
                    <div key={index} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <p className="font-medium text-sm">{item.item}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{item.description}</p>
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                            {item.date ? new Date(item.date.seconds * 1000).toLocaleDateString('zh-HK') : ''}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-medium text-sm">{formatCurrency(item.cost || 0)}</p>
                          <span className={`text-xs px-2 py-1 rounded-full ${
                            item.status === 'completed' ? 'bg-green-100 text-green-800' : 
                            'bg-yellow-100 text-yellow-800'
                          }`}>
                            {item.status === 'completed' ? '已完成' : '進行中'}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Recent Invoices */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                  本月發票 ({new Date().getFullYear()}年{new Date().getMonth() + 1}月)
                </h2>
                <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
                  {currentMonthInvoices.length}
                </span>
              </div>
            </div>
            <div className="p-6">
              {currentMonthInvoices.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                  本月暫無發票記錄
                </p>
              ) : (
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {currentMonthInvoices.slice(0, 5).map((invoice, index) => (
                    <div key={index} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <p className="font-medium text-sm">發票 #{invoice.invoice_number}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {invoice.employee_names ? invoice.employee_names.join(', ') : '未知員工'}
                          </p>
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                            {invoice.created_at ? new Date(invoice.created_at.seconds * 1000).toLocaleDateString('zh-HK') : ''}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-medium text-sm">{formatCurrency(invoice.amount || 0)}</p>
                          <span className={`text-xs px-2 py-1 rounded-full ${
                            invoice.type === 'deposit' ? 'bg-purple-100 text-purple-800' : 
                            'bg-blue-100 text-blue-800'
                          }`}>
                            {invoice.type === 'deposit' ? '押金' : '租金'}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Add Room Modal */}
      <Modal
        isOpen={showAddRoomModal}
        onClose={() => setShowAddRoomModal(false)}
        title="新增房間"
      >
        <form onSubmit={handleAddRoom} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              房間名稱
            </label>
            <input
              type="text"
              required
              value={roomForm.room_name}
              onChange={(e) => setRoomForm({ ...roomForm, room_name: e.target.value })}
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white dark:border-gray-600"
              placeholder="例如: Room-301"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              容量
            </label>
            <input
              type="number"
              min="1"
              max="10"
              required
              value={roomForm.capacity}
              onChange={(e) => setRoomForm({ ...roomForm, capacity: parseInt(e.target.value) })}
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white dark:border-gray-600"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              設施 (用逗號分隔)
            </label>
            <input
              type="text"
              value={roomForm.amenities.join(', ')}
              onChange={(e) => setRoomForm({ 
                ...roomForm, 
                amenities: e.target.value.split(',').map(item => item.trim()).filter(item => item) 
              })}
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white dark:border-gray-600"
              placeholder="例如: WiFi, 空調, 私人浴室"
            />
          </div>
          
          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={() => setShowAddRoomModal(false)}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md dark:bg-gray-600 dark:text-gray-300 dark:hover:bg-gray-500"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md"
            >
              新增房間
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Room Modal */}
      <Modal
        isOpen={showEditRoomModal}
        onClose={() => setShowEditRoomModal(false)}
        title="編輯房間"
      >
        <form onSubmit={handleEditRoom} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              房間名稱
            </label>
            <input
              type="text"
              required
              value={roomForm.room_name}
              onChange={(e) => setRoomForm({ ...roomForm, room_name: e.target.value })}
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white dark:border-gray-600"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              容量
            </label>
            <input
              type="number"
              min="1"
              max="10"
              required
              value={roomForm.capacity}
              onChange={(e) => setRoomForm({ ...roomForm, capacity: parseInt(e.target.value) })}
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white dark:border-gray-600"
            />
            {editingRoom && getRoomEmployees(editingRoom.room_name).length > parseInt(roomForm.capacity) && (
              <p className="mt-1 text-sm text-red-600">
                ⚠️ 警告: 新容量小於目前入住人數 ({getRoomEmployees(editingRoom.room_name).length})
              </p>
            )}
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              設施 (用逗號分隔)
            </label>
            <input
              type="text"
              value={roomForm.amenities.join(', ')}
              onChange={(e) => setRoomForm({ 
                ...roomForm, 
                amenities: e.target.value.split(',').map(item => item.trim()).filter(item => item) 
              })}
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white dark:border-gray-600"
            />
          </div>
          
          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={() => setShowEditRoomModal(false)}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md dark:bg-gray-600 dark:text-gray-300 dark:hover:bg-gray-500"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md"
            >
              保存更改
            </button>
          </div>
        </form>
      </Modal>

      {/* Add Maintenance Modal */}
      <Modal
        isOpen={showMaintenanceModal}
        onClose={() => setShowMaintenanceModal(false)}
        title="報告維修"
      >
        <form onSubmit={handleAddMaintenance} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              維修項目
            </label>
            <input
              type="text"
              required
              value={maintenanceForm.item}
              onChange={(e) => setMaintenanceForm({ ...maintenanceForm, item: e.target.value })}
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white dark:border-gray-600"
              placeholder="例如: 空調維修"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              費用 (HKD)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              required
              value={maintenanceForm.cost}
              onChange={(e) => setMaintenanceForm({ ...maintenanceForm, cost: e.target.value })}
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white dark:border-gray-600"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              日期
            </label>
            <input
              type="date"
              required
              value={maintenanceForm.date}
              onChange={(e) => setMaintenanceForm({ ...maintenanceForm, date: e.target.value })}
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white dark:border-gray-600"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              描述
            </label>
            <textarea
              rows="3"
              value={maintenanceForm.description}
              onChange={(e) => setMaintenanceForm({ ...maintenanceForm, description: e.target.value })}
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white dark:border-gray-600"
              placeholder="詳細描述維修內容..."
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              狀態
            </label>
            <select
              value={maintenanceForm.status}
              onChange={(e) => setMaintenanceForm({ ...maintenanceForm, status: e.target.value })}
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white dark:border-gray-600"
            >
              <option value="pending">進行中</option>
              <option value="completed">已完成</option>
            </select>
          </div>
          
          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={() => setShowMaintenanceModal(false)}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md dark:bg-gray-600 dark:text-gray-300 dark:hover:bg-gray-500"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md"
            >
              提交維修報告
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}