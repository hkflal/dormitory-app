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
  ClockIcon
} from '@heroicons/react/24/outline';
import Modal from '../components/Modal';
import { 
  DndContext, 
  DragOverlay, 
  useSensor, 
  useSensors, 
  PointerSensor,
  closestCorners
} from '@dnd-kit/core';
import { 
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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
  const [activeId, setActiveId] = useState(null);
  
  // Modal states
  const [showAddRoomModal, setShowAddRoomModal] = useState(false);
  const [showEditRoomModal, setShowEditRoomModal] = useState(false);
  const [showMaintenanceModal, setShowMaintenanceModal] = useState(false);
  const [editingRoom, setEditingRoom] = useState(null);
  
  // Form states
  const [roomForm, setRoomForm] = useState({
    room_name: '',
    capacity: 2,
    amenities: [],
    selectedEmployees: [] // Track employees to assign to new room
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

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

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
      const propertyData = propertiesSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .find(prop => prop.id === id);

      if (!propertyData) {
        router.push('/properties');
        return;
      }

      // Fetch ALL employees to include unassigned ones
      const employeesRef = collection(db, 'employees');
      const employeesSnapshot = await getDocs(employeesRef);
      const allEmployees = employeesSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }));

      // For property detail page, we need ONLY employees assigned to THIS property
      // Filter employees who are assigned to this property AND have in-house status
      const employeesData = allEmployees.filter(emp => {
        // Check if employee is assigned to THIS property
        const isAssignedToProperty = emp.assigned_property_id === id || 
                                   emp.assigned_property_id === propertyData.name ||
                                   emp.assignedProperty === propertyData.name;
        
        // Check if employee has in-house status
        const status = emp.status?.toLowerCase();
        const isInHouse = status === 'housed' || status === 'active';
        
        // Only include employees assigned to THIS property AND in-house
        return isAssignedToProperty && isInHouse;
      });

      // Debug logging for property detail page
      console.log(`\n=== PROPERTY DETAIL DEBUG ===`);
      console.log(`Property ID: ${id}, Property Name: ${propertyData.name}`);
      console.log(`Total employees in database: ${allEmployees.length}`);
      console.log(`Employees assigned to this property with in-house status: ${employeesData.length}`);
      employeesData.forEach(emp => {
        console.log(`  - ${emp.name || 'Unknown'} (Status: ${emp.status}, Property: ${emp.assigned_property_id || emp.assignedProperty}, Room: ${emp.assigned_room_name || emp.roomNumber || 'None'})`);
      });
      console.log(`=== END PROPERTY DETAIL DEBUG ===\n`);

      // Fetch invoices related to this property
      const invoicesRef = collection(db, 'invoices');
      const invoicesSnapshot = await getDocs(invoicesRef);
      const invoicesData = invoicesSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(invoice => 
          invoice.property_id === id ||
          employeesData.some(emp => emp.id === invoice.employee_id)
        );

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
    }
  };

  const handleDragStart = (event) => {
    setActiveId(event.active.id);
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const employeeId = active.id;
    const targetId = over.id;

    // Find the employee
    const employee = employees.find(emp => emp.id === employeeId);
    if (!employee) return;

    const oldRoomName = employee.assigned_room_name || employee.roomNumber || 'Unassigned';

    try {
      // If dropping to unassigned zone
      if (targetId === 'unassigned-employees') {
        const employeeRef = doc(db, 'employees', employeeId);
        await updateDoc(employeeRef, {
          assigned_room_name: null,
          roomNumber: null, // Legacy field
          updatedAt: new Date()
        });

        // Log the unassignment
        await logRoomReassignment(
          employee.name || 'Unknown',
          oldRoomName,
          'Unassigned',
          property?.name || 'Unknown Property',
          employeeId
        );

        // Refresh data
        fetchPropertyData();
        return;
      }

      // If dropping to a room
      const targetRoom = rooms.find(room => room.room_name === targetId);
      if (!targetRoom) return;

      // Check room capacity
      const currentRoomEmployees = getRoomEmployees(targetId);
      if (currentRoomEmployees.length >= targetRoom.capacity) {
        alert(`房間 ${targetId} 已滿 (${targetRoom.capacity}/${targetRoom.capacity})`);
        return;
      }

      // If employee is already in this room, do nothing
      if (oldRoomName === targetId) return;

      // Update employee room assignment
      const employeeRef = doc(db, 'employees', employeeId);
      await updateDoc(employeeRef, {
        assigned_room_name: targetId,
        roomNumber: targetId, // Legacy field
        updatedAt: new Date()
      });

      // Log the room reassignment
      await logRoomReassignment(
        employee.name || 'Unknown',
        oldRoomName,
        targetId,
        property?.name || 'Unknown Property',
        employeeId
      );

      // Refresh data
      fetchPropertyData();
    } catch (error) {
      console.error('Error reassigning room:', error);
    }
  };

  const handleAddRoom = async (e) => {
    e.preventDefault();
    try {
      // Validate that we don't exceed room capacity
      const selectedEmployees = roomForm.selectedEmployees || [];
      if (selectedEmployees.length > roomForm.capacity) {
        alert(`選擇的員工數量 (${selectedEmployees.length}) 超過房間容量 (${roomForm.capacity})`);
        return;
      }

      const updatedRooms = [...rooms, roomForm];
      
      // Update property with new rooms
      const propertyRef = doc(db, 'properties', id);
      await updateDoc(propertyRef, {
        rooms: updatedRooms,
        totalRooms: updatedRooms.length,
        updatedAt: new Date()
      });

      // Assign selected employees to the new room
      if (selectedEmployees.length > 0) {
        const updatePromises = selectedEmployees.map(async (employeeId) => {
          const employeeRef = doc(db, 'employees', employeeId);
          await updateDoc(employeeRef, {
            assigned_room_name: roomForm.room_name,
            roomNumber: roomForm.room_name, // Legacy field
            updatedAt: new Date()
          });

          // Log the room assignment
          const employee = employees.find(emp => emp.id === employeeId);
          await logRoomReassignment(
            employee?.name || 'Unknown',
            'Unassigned',
            roomForm.room_name,
            property?.name || 'Unknown Property',
            employeeId
          );
        });

        await Promise.all(updatePromises);
      }

      // Log the room creation
      await logRoomCreate(
        { ...roomForm, id: Date.now() },
        property?.name || 'Unknown Property',
        id
      );

      setShowAddRoomModal(false);
      setRoomForm({ room_name: '', capacity: 2, amenities: [], selectedEmployees: [] });
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
        property?.name || 'Unknown Property'
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
    setRoomForm({
      room_name: room.room_name,
      capacity: room.capacity,
      amenities: room.amenities || [],
      selectedEmployees: [] // Not used in edit mode
    });
    setShowEditRoomModal(true);
  };

  const getUnassignedEmployees = () => {
    // Filter employees who are:
    // 1. Assigned to THIS property (already filtered in fetchPropertyData)
    // 2. Have in-house status (already filtered in fetchPropertyData)
    // 3. Do NOT have a room assignment (filtered here)
    const unassigned = employees.filter(emp => {
      // Check if employee is assigned to any room
      const hasRoomAssignment = emp.assigned_room_name || emp.roomNumber;
      
      // Employee should be in waitlist ONLY if:
      // - They are assigned to this property (already guaranteed by fetchPropertyData)
      // - They have in-house status (already guaranteed by fetchPropertyData)
      // - They do NOT have a room assignment
      return !hasRoomAssignment;
    });
    
    // Debug logging
    console.log('Property ID:', id, 'Property Name:', property?.name);
    console.log('Total in-house employees for this property:', employees.length);
    console.log('Employees in waiting list (in-house but no room assignment):', unassigned.length);
    if (employees.length > 0) {
      console.log('Sample employee data:', employees[0]);
      console.log('Waiting list employees:', unassigned.map(emp => ({ 
        id: emp.id, 
        name: emp.name, 
        status: emp.status,
        assigned_property_id: emp.assigned_property_id,
        assignedProperty: emp.assignedProperty,
        assigned_room_name: emp.assigned_room_name, 
        roomNumber: emp.roomNumber
      })));
    }
    
    return unassigned;
  };

  const getRoomEmployees = (roomName) => {
    return employees.filter(emp => 
      emp.assigned_room_name === roomName || 
      emp.roomNumber === roomName
    );
  };

  const getRentStats = () => {
    const totalRent = employees.length * (property?.monthlyRent || 20000);
    const paidCount = Math.floor(employees.length * 0.7); // 70% paid simulation
    const dueCount = employees.length - paidCount;
    const paidAmount = paidCount * (property?.monthlyRent || 20000);
    const dueAmount = dueCount * (property?.monthlyRent || 20000);
    
    return { totalRent, paidCount, dueCount, paidAmount, dueAmount };
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('zh-HK', {
      style: 'currency',
      currency: 'HKD',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const handleMoveOutRoom = async (roomName) => {
    const roomEmployees = getRoomEmployees(roomName);
    
    if (roomEmployees.length === 0) {
      alert(`房間 ${roomName} 沒有住客`);
      return;
    }

    if (window.confirm(`確認將房間 ${roomName} 的所有 ${roomEmployees.length} 位住客遷出？`)) {
      try {
        // Update all employees in this room
        const updatePromises = roomEmployees.map(async (employee) => {
          const employeeRef = doc(db, 'employees', employee.id);
          await updateDoc(employeeRef, {
            assigned_room_name: null,
            roomNumber: null,
            updatedAt: new Date()
          });

          // Log the move out
          await logRoomReassignment(
            employee.name || 'Unknown',
            roomName,
            'Unassigned',
            property?.name || 'Unknown Property',
            employee.id
          );
        });

        await Promise.all(updatePromises);
        
        // Refresh data
        fetchPropertyData();
      } catch (error) {
        console.error('Error moving out employees:', error);
        alert('遷出過程中發生錯誤，請重試。');
      }
    }
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

  return (
    <DndContext 
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
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
                  {property.capacity || 0}
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
                  {employees.length}
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
          {/* Room Layout */}
          <div className="lg:col-span-2">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                    房間配置 ({rooms.length} 個房間)
                  </h2>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    拖拽員工來重新分配房間
                  </div>
                </div>
              </div>
              
              <div className="p-6">
                <div className={`grid gap-3 items-start ${ 
                  rooms.length === 1 ? 'grid-cols-1 max-w-md mx-auto' :
                  rooms.length === 2 ? 'grid-cols-1 sm:grid-cols-2' :
                  rooms.length === 3 ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' :
                  rooms.length === 4 ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4' :
                  rooms.length === 5 ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5' :
                  'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6'
                }`}>
                  {rooms.map((room, index) => (
                    <RoomCard 
                      key={room.room_name} 
                      room={room} 
                      employees={getRoomEmployees(room.room_name)}
                      onEdit={() => openEditRoomModal(room)}
                      onDelete={() => handleDeleteRoom(room.room_name)}
                      onMoveOut={() => handleMoveOutRoom(room.room_name)}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Housed Employees Section */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow mt-6">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                    未分配員工 ({getUnassignedEmployees().length})
                  </h2>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    拖拽到房間分配
                  </div>
                </div>
              </div>
              
              <UnassignedEmployeesDropZone employees={getUnassignedEmployees()} />
            </div>
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
                    <span className="font-medium">
                      {Math.round((employees.length / (property.capacity || 1)) * 100)}%
                    </span>
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
                <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">相關發票</h2>
              </div>
              <div className="p-6">
                {invoices.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                    暫無相關發票
                  </p>
                ) : (
                  <div className="space-y-3 max-h-64 overflow-y-auto">
                    {invoices.slice(0, 5).map((invoice) => (
                      <div key={invoice.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <p className="font-medium text-sm">{invoice.invoice_number}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{invoice.employee_name}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-medium text-sm">{formatCurrency(invoice.amount || 0)}</p>
                            <span className={`text-xs px-2 py-1 rounded-full ${
                              invoice.status === 'paid' ? 'bg-green-100 text-green-800' : 
                              'bg-yellow-100 text-yellow-800'
                            }`}>
                              {invoice.status === 'paid' ? '已付款' : '待付款'}
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

        <DragOverlay>
          {activeId ? (
            <EmployeeCard 
              employee={employees.find(emp => emp.id === activeId)} 
              isDragging 
              isCompact={false}
            />
          ) : null}
        </DragOverlay>

        {/* Add Room Modal */}
        <Modal
          isOpen={showAddRoomModal}
          onClose={() => {
            setShowAddRoomModal(false);
            setRoomForm({ room_name: '', capacity: 2, amenities: [], selectedEmployees: [] });
          }}
          title="新增房間"
        >
          <form onSubmit={handleAddRoom} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                房間名稱 *
              </label>
              <input
                type="text"
                required
                value={roomForm.room_name}
                onChange={(e) => setRoomForm(prev => ({ ...prev, room_name: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                placeholder="例如: Room-301"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                容量 * {roomForm.selectedEmployees?.length > 0 && (
                  <span>(最少需要 {roomForm.selectedEmployees?.length || 0} 以容納選擇的員工)</span>
                )}
              </label>
              <input
                type="number"
                required
                min={Math.max(1, roomForm.selectedEmployees?.length || 0)}
                max="6"
                value={roomForm.capacity}
                onChange={(e) => setRoomForm(prev => ({ ...prev, capacity: parseInt(e.target.value) || 1 }))}
                                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 ${
                    (roomForm.selectedEmployees?.length || 0) > roomForm.capacity 
                      ? 'border-red-300 bg-red-50' 
                      : 'border-gray-300'
                  }`}
              />
                              {(roomForm.selectedEmployees?.length || 0) > roomForm.capacity && (
                  <p className="text-sm text-red-600 mt-1">
                    容量必須至少為 {roomForm.selectedEmployees?.length || 0} 以容納選擇的員工
                  </p>
                )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                設施 (用逗號分隔)
              </label>
              <input
                type="text"
                value={(roomForm.amenities || []).join(', ')}
                onChange={(e) => setRoomForm(prev => ({ 
                  ...prev, 
                  amenities: e.target.value.split(',').map(item => item.trim()).filter(item => item)
                }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                placeholder="WiFi, 冷氣, 獨立浴室"
              />
            </div>

            {/* Employee Assignment Section */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                預先分配員工 ({roomForm.selectedEmployees?.length || 0}/{roomForm.capacity})
              </label>
              <div className="border border-gray-200 rounded-md p-3 max-h-48 overflow-y-auto">
                {(() => {
                  const unassignedEmployees = getUnassignedEmployees();
                  const allAvailableEmployees = [...unassignedEmployees];
                  
                  // Also include employees currently in rooms (for reassignment)
                  rooms.forEach(room => {
                    const roomEmployees = getRoomEmployees(room.room_name);
                    allAvailableEmployees.push(...roomEmployees);
                  });

                  if (allAvailableEmployees.length === 0) {
                    return (
                      <p className="text-sm text-gray-500 italic text-center py-4">
                        沒有可分配的員工
                      </p>
                    );
                  }

                  return (
                    <div className="space-y-2">
                      {allAvailableEmployees.map((employee) => {
                        const isSelected = roomForm.selectedEmployees?.includes(employee.id) || false;
                        const currentRoom = employee.assigned_room_name || employee.roomNumber || null;
                        
                        return (
                          <label
                            key={employee.id}
                            className={`flex items-center p-2 rounded border cursor-pointer transition-colors ${
                              isSelected 
                                ? 'bg-primary-50 border-primary-200 dark:bg-primary-900/20 dark:border-primary-700' 
                                : 'bg-gray-50 border-gray-200 hover:bg-gray-100 dark:bg-gray-700 dark:border-gray-600 dark:hover:bg-gray-600'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                const { checked } = e.target;
                                setRoomForm(prev => ({
                                  ...prev,
                                  selectedEmployees: checked
                                    ? [...(prev.selectedEmployees || []), employee.id]
                                    : (prev.selectedEmployees || []).filter(id => id !== employee.id)
                                }));
                              }}
                              disabled={!isSelected && (roomForm.selectedEmployees?.length || 0) >= roomForm.capacity}
                              className="mr-3 h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                {employee.name || `${employee.firstName || ''} ${employee.lastName || ''}`.trim() || '未知員工'}
                              </p>
                              <div className="flex items-center justify-between">
                                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                  {employee.company || '無公司'}
                                </p>
                                {currentRoom && (
                                  <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 px-2 py-1 rounded">
                                    目前: {currentRoom}
                                  </span>
                                )}
                              </div>
                            </div>
                            <span className={`ml-2 px-2 py-1 text-xs rounded ${
                              employee.gender === 'male' ? 'bg-blue-100 text-blue-700' :
                              employee.gender === 'female' ? 'bg-pink-100 text-pink-700' :
                              'bg-gray-100 text-gray-700'
                            }`}>
                              {employee.gender === 'male' ? '男' : employee.gender === 'female' ? '女' : '其他'}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
              {(roomForm.selectedEmployees?.length || 0) > roomForm.capacity && (
                <p className="text-sm text-red-600 mt-1">
                  選擇的員工數量超過房間容量，請調整
                </p>
              )}
            </div>

            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => {
                  setShowAddRoomModal(false);
                  setRoomForm({ room_name: '', capacity: 2, amenities: [], selectedEmployees: [] });
                }}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                取消
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
                disabled={(roomForm.selectedEmployees?.length || 0) > roomForm.capacity}
              >
                新增房間{(roomForm.selectedEmployees?.length || 0) > 0 && ` 並分配 ${roomForm.selectedEmployees?.length || 0} 位員工`}
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
              <label className="block text-sm font-medium text-gray-700 mb-1">
                房間名稱 *
              </label>
              <input
                type="text"
                required
                value={roomForm.room_name}
                onChange={(e) => setRoomForm(prev => ({ ...prev, room_name: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                容量 *
              </label>
              <input
                type="number"
                required
                min="1"
                max="6"
                value={roomForm.capacity}
                onChange={(e) => setRoomForm(prev => ({ ...prev, capacity: parseInt(e.target.value) || 1 }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                設施 (用逗號分隔)
              </label>
              <input
                type="text"
                value={(roomForm.amenities || []).join(', ')}
                onChange={(e) => setRoomForm(prev => ({ 
                  ...prev, 
                  amenities: e.target.value.split(',').map(item => item.trim()).filter(item => item)
                }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              />
            </div>

            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setShowEditRoomModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                取消
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
              >
                更新房間
              </button>
            </div>
          </form>
        </Modal>

        {/* Maintenance Modal */}
        <Modal
          isOpen={showMaintenanceModal}
          onClose={() => setShowMaintenanceModal(false)}
          title="報告維修"
        >
          <form onSubmit={handleAddMaintenance} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                維修項目 *
              </label>
              <input
                type="text"
                required
                value={maintenanceForm.item}
                onChange={(e) => setMaintenanceForm(prev => ({ ...prev, item: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                placeholder="例如: 廁所漏水, 冷氣維修"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                預計費用 (HKD)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={maintenanceForm.cost}
                onChange={(e) => setMaintenanceForm(prev => ({ ...prev, cost: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                日期
              </label>
              <input
                type="date"
                value={maintenanceForm.date}
                onChange={(e) => setMaintenanceForm(prev => ({ ...prev, date: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                狀態
              </label>
              <select
                value={maintenanceForm.status}
                onChange={(e) => setMaintenanceForm(prev => ({ ...prev, status: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="pending">待處理</option>
                <option value="in_progress">進行中</option>
                <option value="completed">已完成</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                詳細描述
              </label>
              <textarea
                value={maintenanceForm.description}
                onChange={(e) => setMaintenanceForm(prev => ({ ...prev, description: e.target.value }))}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                placeholder="詳細說明維修問題..."
              />
            </div>

            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setShowMaintenanceModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                取消
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700"
              >
                提交報告
              </button>
            </div>
          </form>
        </Modal>

        {property.status === 'active' && todos && todos.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mt-8">
            <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">歷史待辦事項 (已完成/已關閉)</h2>
            <div className="space-y-2">
              {todos.map((todo, idx) => (
                <div key={idx} className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 py-2">
                  <div className="flex items-center space-x-2">
                    <span className={todo.completed ? 'line-through text-gray-400' : ''}>{todo.text}</span>
                    {todo.expectedDate && (
                      <span className="ml-2 text-xs text-gray-500">預計完成: {new Date(todo.expectedDate).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </DndContext>
  );
}

// Draggable Employee Card Component
function DraggableEmployee({ employee, isCompact = false }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: employee.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="cursor-grab active:cursor-grabbing"
    >
      <EmployeeCard employee={employee} isDragging={isDragging} isCompact={isCompact} />
    </div>
  );
}

// Employee Card Component
function EmployeeCard({ employee, isDragging, isCompact = false }) {
  const displayName = employee.name || 
                     `${employee.firstName || ''} ${employee.lastName || ''}`.trim() || 
                     '未知員工';

  if (isCompact) {
    return (
      <div className={`bg-blue-50 dark:bg-blue-900/20 rounded p-1.5 border border-blue-200 dark:border-blue-700 ${isDragging ? 'shadow-lg' : ''}`}>
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">
              {displayName}
            </p>
            {employee.company && (
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                {employee.company}
              </p>
            )}
          </div>
          <span className={`ml-1 px-1 py-0.5 text-xs rounded flex-shrink-0 ${
            employee.gender === 'male' ? 'bg-blue-100 text-blue-700' :
            employee.gender === 'female' ? 'bg-pink-100 text-pink-700' :
            'bg-gray-100 text-gray-700'
          }`}>
            {employee.gender === 'male' ? '男' : employee.gender === 'female' ? '女' : '其他'}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 border-2 border-blue-200 dark:border-blue-700 ${isDragging ? 'shadow-lg' : ''}`}>
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {displayName}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {employee.company || '無公司'}
          </p>
          {employee.arrival_time && (
            <p className="text-xs text-blue-600 dark:text-blue-400">
              到達: {employee.arrival_time.seconds ? 
                new Date(employee.arrival_time.seconds * 1000).toLocaleDateString('zh-HK') :
                new Date(employee.arrival_time).toLocaleDateString('zh-HK')
              }
            </p>
          )}
        </div>
        <span className={`px-2 py-1 text-xs rounded ${
          employee.gender === 'male' ? 'bg-blue-100 text-blue-700' :
          employee.gender === 'female' ? 'bg-pink-100 text-pink-700' :
          'bg-gray-100 text-gray-700'
        }`}>
          {employee.gender === 'male' ? '男' : employee.gender === 'female' ? '女' : '其他'}
        </span>
      </div>
    </div>
  );
}

// Room Card Component
function RoomCard({ room, employees, onEdit, onDelete, onMoveOut }) {
  const {
    setNodeRef,
    isOver,
  } = useSortable({ 
    id: room.room_name,
    data: {
      type: 'room',
      room,
    },
  });

  return (
    <div className="flex flex-col">
      <div 
        ref={setNodeRef}
        className={`border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg min-h-[200px] relative flex flex-col ${
          isOver ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : ''
        }`}
        style={{ minHeight: '200px' }} // Ensure consistent minimum height
      >
        {/* Header section - always visible and not part of drop zone collision */}
        <div className="flex justify-between items-start p-3 pb-2 flex-shrink-0 relative z-10">
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-gray-900 dark:text-gray-100 text-sm truncate">{room.room_name}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {employees.length}/{room.capacity}
            </p>
          </div>
          <div className="flex space-x-1 ml-1">
            <button
              onClick={onEdit}
              className="p-1 text-gray-400 hover:text-blue-600 dark:text-gray-500 dark:hover:text-blue-400"
              title="編輯房間"
            >
              <PencilIcon className="h-3 w-3" />
            </button>
            <button
              onClick={onDelete}
              className="p-1 text-gray-400 hover:text-red-600 dark:text-gray-500 dark:hover:text-red-400"
              title="刪除房間"
            >
              <TrashIcon className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* Amenities section */}
        {room.amenities && room.amenities.length > 0 && (
          <div className="px-3 pb-2 flex-shrink-0 relative z-10">
            <div className="flex flex-wrap gap-1">
              {room.amenities.slice(0, 2).map((amenity, index) => (
                <span key={index} className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs rounded">
                  {amenity.length > 4 ? amenity.substring(0, 4) + '...' : amenity}
                </span>
              ))}
              {room.amenities.length > 2 && (
                <span className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs rounded">
                  +{room.amenities.length - 2}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Main content area - full drop zone */}
        <div className="flex-1 px-3 pb-3 relative">
          {/* Drop zone overlay - covers the entire remaining area */}
          <div className={`absolute inset-0 ${isOver ? 'bg-primary-100 dark:bg-primary-900/10 rounded' : ''}`} />
          
          {employees.length === 0 ? (
            <div className="relative z-10 h-full flex items-center justify-center">
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-300 dark:text-gray-600 transform -rotate-12 select-none">
                  {room.room_name}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                  拖拽員工到此處
                </p>
              </div>
            </div>
          ) : (
            <div className="relative z-10 space-y-1">
              {employees.map((employee) => (
                <DraggableEmployee key={employee.id} employee={employee} isCompact={true} />
              ))}
              {/* Additional drop area for when room has employees */}
              <div className="h-8 flex items-center justify-center text-xs text-gray-400 dark:text-gray-500 border-2 border-dashed border-transparent hover:border-gray-300 dark:hover:border-gray-600 rounded transition-colors">
                拖拽新員工到此處
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Move Out Button */}
      {employees.length > 0 && (
        <button
          onClick={onMoveOut}
          className="mt-2 w-full bg-red-100 hover:bg-red-200 dark:bg-red-900/20 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 text-xs py-1 px-2 rounded border border-red-200 dark:border-red-800 transition-colors"
          title={`遷出 ${employees.length} 位住客`}
        >
          遷出 ({employees.length})
        </button>
      )}
    </div>
  );
}

// Unassigned Employees Drop Zone Component
function UnassignedEmployeesDropZone({ employees }) {
  const {
    setNodeRef,
    isOver,
  } = useSortable({ 
    id: 'unassigned-employees',
    data: {
      type: 'unassigned-zone',
    },
  });

  // Debug: Log what we're receiving
  console.log('UnassignedEmployeesDropZone received employees:', employees.length);

  return (
    <div 
      ref={setNodeRef}
      className={`p-6 min-h-[120px] ${
        isOver ? 'bg-primary-50 dark:bg-primary-900/20' : ''
      }`}
    >
      {employees.length === 0 ? (
        <div className="text-center py-8">
          <UserGroupIcon className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
          <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">暫無未分配員工</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            所有員工已分配房間，或從房間拖拽員工到此處取消分配。
          </p>
        </div>
      ) : (
        <div>
          <div className="mb-3 text-xs text-gray-500 dark:text-gray-400">
            顯示 {employees.length} 個未分配員工
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {employees.map((employee) => (
              <DraggableEmployee key={employee.id} employee={employee} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
} 