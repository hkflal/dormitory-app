import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { 
  PlusIcon, 
  BuildingOfficeIcon,
  UserIcon,
  FunnelIcon,
  EyeIcon,
  XMarkIcon,
  PencilIcon
} from '@heroicons/react/24/outline';
import Modal from '../components/Modal';
import { useRouter } from 'next/router';
import { 
  DndContext, 
  DragOverlay, 
  useSensor, 
  useSensors, 
  PointerSensor,
  closestCorners
} from '@dnd-kit/core';
import { 
  arrayMove, 
  SortableContext, 
  verticalListSortingStrategy 
} from '@dnd-kit/sortable';
import { 
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { 
  logPropertyCreate, 
  logPropertyUpdate, 
  logEmployeeAssignment, 
  logEmployeeUnassignment,
  logEmployeeUpdate,
  logRoomReassignment
} from '../lib/historyLogger';

export default function Properties() {
  const [properties, setProperties] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [filteredProperties, setFilteredProperties] = useState([]);
  const [pendingEmployees, setPendingEmployees] = useState([]);
  const [housedEmployees, setHousedEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPropertyModal, setShowPropertyModal] = useState(false);
  const [showEditPropertyModal, setShowEditPropertyModal] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState(null);
  const [editingProperty, setEditingProperty] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [filters, setFilters] = useState({
    location: '',
    gender: '',
    status: ''
  });

  // Form state for adding new property
  const [newProperty, setNewProperty] = useState({
    name: '',
    address: '',
    location: '',
    target_gender_type: 'any',
    rooms: [{ room_name: '', capacity: 1 }]
  });

  // Form state for editing property
  const [editPropertyForm, setEditPropertyForm] = useState({
    name: '',
    address: '',
    location: '',
    target_gender_type: 'any',
    monthlyRent: 800,
    expectedDate: '2025-06-21',
    amenities: ['WiFi', 'Laundry']
  });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const router = useRouter();

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [properties, filters]);

  const fetchData = async () => {
    try {
      // Fetch properties
      const propertiesRef = collection(db, 'properties');
      const propertiesSnapshot = await getDocs(propertiesRef);
      const propertiesData = propertiesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Fetch employees
      const employeesRef = collection(db, 'employees');
      const employeesSnapshot = await getDocs(employeesRef);
      const employeesData = employeesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      console.log('All employees fetched:', employeesData);

      setProperties(propertiesData);
      setEmployees(employeesData);
      
      // Filter pending employees - align with property detail page logic
      // Only count employees who are truly unassigned (no room assignment)
      const pending = employeesData.filter(emp => {
        // Check if employee is assigned to any room
        const hasRoomAssignment = emp.assigned_room_name || emp.roomNumber;
        
        // Check if employee is assigned to any property (but not to a specific room)
        const hasPropertyAssignment = emp.assigned_property_id || emp.assignedProperty;
        
        // Employee is pending if they have no room assignment
        // This aligns with property detail page logic
        const isPending = !hasRoomAssignment;
        
        console.log(`Employee ${emp.name || emp.firstName || 'Unknown'}: hasRoomAssignment=${hasRoomAssignment}, hasPropertyAssignment=${hasPropertyAssignment}, isPending=${isPending}`);
        return isPending;
      });
      
      console.log('Filtered pending employees:', pending);
      setPendingEmployees(pending);
      
      // Filter housed employees - must have property assignment AND non-pending status
      const housed = employeesData.filter(emp => {
        const status = emp.status?.toLowerCase(); 
        const hasPropertyAssignment = emp.assigned_property_id && emp.assigned_property_id !== '';
        
        // Employee is housed if they have property assignment AND status is housed/active
        const isHoused = hasPropertyAssignment && (status === 'housed' || status === 'active');
        
        console.log(`Employee ${emp.name || emp.firstName || 'Unknown'}: hasPropertyAssignment=${hasPropertyAssignment}, status=${emp.status}, isHoused=${isHoused}`);
        return isHoused;
      });
      
      console.log('Filtered housed employees:', housed);
      setHousedEmployees(housed);
      
      setLoading(false);
    } catch (error) {
      console.error('Error fetching data:', error);
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...properties];

    if (filters.location) {
      filtered = filtered.filter(prop => 
        prop.location?.toLowerCase().includes(filters.location.toLowerCase())
      );
    }

    if (filters.gender && filters.gender !== 'any') {
      filtered = filtered.filter(prop => {
        // Check both genderTypes array and target_gender_type string
        if (prop.genderTypes && Array.isArray(prop.genderTypes)) {
          return prop.genderTypes.includes(filters.gender);
        }
        // Handle different gender format variations
        const propertyGender = prop.target_gender_type?.toLowerCase();
        const filterGender = filters.gender.toLowerCase();
        
        if (filterGender === 'male') return propertyGender === 'male';
        if (filterGender === 'female') return propertyGender === 'female';
        if (filterGender === 'any' || filterGender === 'mixed') return propertyGender === 'any' || propertyGender === 'mixed';
        
        return false;
      });
    }

    if (filters.status) {
      filtered = filtered.filter(prop => {
        const occupancy = prop.occupancy || 0;
        const capacity = prop.capacity || 0;
        const occupancyRate = capacity > 0 ? (occupancy / capacity) : 0;
        
        // Check if expected date has passed
        const expectedDate = prop.expectedDate;
        const today = new Date();
        const isExpectedDatePassed = expectedDate && new Date(expectedDate) < today;
        
        if (filters.status === 'available') {
          // Available: not full and expected date hasn't passed
          return occupancyRate < 1 && !isExpectedDatePassed;
        }
        if (filters.status === 'in_progress') {
          // In progress: either full occupancy OR expected date has passed
          return occupancyRate >= 1 || isExpectedDatePassed;
        }
        return true;
      });
    }

    setFilteredProperties(filtered);
  };

  const handleDragStart = (event) => {
    setActiveId(event.active.id);
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const employeeId = active.id;
    const propertyId = over.id;

    // Find the employee and property
    const employee = pendingEmployees.find(emp => emp.id === employeeId);
    const property = properties.find(prop => prop.id === propertyId);

    if (!employee || !property) return;

    try {
      // Update employee with primary fields used by employees page
      const employeeRef = doc(db, 'employees', employeeId);
      const roomName = `Room-${Math.floor(Math.random() * 999) + 1}`;
      const updateData = {
        assigned_property_id: property.id,           // Primary field used by employees page
        assigned_room_name: roomName,                // Primary field
        status: 'housed',                            // Change status to housed
        updatedAt: new Date()
      };

      // Also add legacy fields for backward compatibility
      updateData.assignedProperty = property.name;   // Legacy field for compatibility
      updateData.roomNumber = updateData.assigned_room_name;  // Legacy field
      updateData.checkInDate = new Date().toISOString().split('T')[0];
      updateData.arrivalDate = new Date().toISOString().split('T')[0];
      updateData.arrival_time = new Date();
      updateData.monthlyRent = property.monthlyRent || 800;
      updateData.rentStatus = 'Pending';

      await updateDoc(employeeRef, updateData);

      // Log the assignment action
      await logEmployeeAssignment(
        employee.name || employee.firstName || 'Unknown',
        property.name,
        roomName,
        employeeId,
        propertyId
      );

      // Update property occupancy
      const propertyRef = doc(db, 'properties', propertyId);
      const newOccupancy = (property.occupancy || 0) + 1;
      const newOccupiedRooms = (property.occupiedRooms || 0) + 1;
      
      await updateDoc(propertyRef, {
        occupancy: newOccupancy,
        occupiedRooms: newOccupiedRooms,
        updatedAt: new Date()
      });

      // Refresh data to reflect changes
      fetchData();
      
      console.log(`Successfully assigned ${employee.name || employee.firstName} to ${property.name} (ID: ${property.id})`);
      
    } catch (error) {
      console.error('Error assigning employee:', error);
    }
  };

  const handleRoomReassignment = async (employeeId, newRoomNumber) => {
    try {
      const employee = employees.find(emp => emp.id === employeeId);
      const oldRoom = employee?.roomNumber || employee?.assigned_room_name || 'Unknown';
      const property = properties.find(p => p.id === employee?.assigned_property_id);
      
      const employeeRef = doc(db, 'employees', employeeId);
      await updateDoc(employeeRef, {
        roomNumber: newRoomNumber,
        assigned_room_name: newRoomNumber, // Update both fields
        updatedAt: new Date()
      });
      
      // Log the room reassignment
      await logRoomReassignment(
        employee?.name || 'Unknown',
        oldRoom,
        newRoomNumber,
        property?.name || 'Unknown Property',
        employeeId
      );
      
      fetchData();
      
    } catch (error) {
      console.error('Error reassigning room:', error);
    }
  };

  const handleEditEmployeeArrival = async (employeeId, newArrivalDate) => {
    try {
      const employee = employees.find(emp => emp.id === employeeId);
      const oldData = { arrival_time: employee?.arrival_time };
      const newData = { arrival_time: new Date(newArrivalDate) };
      
      const employeeRef = doc(db, 'employees', employeeId);
      await updateDoc(employeeRef, {
        arrival_time: new Date(newArrivalDate), // Primary field used by employees page
        arrivalDate: newArrivalDate, // Legacy field for compatibility
        updatedAt: new Date()
      });
      
      // Log the arrival date update
      await logEmployeeUpdate(
        employeeId,
        employee?.name || 'Unknown',
        oldData,
        newData
      );
      
      fetchData();
      
    } catch (error) {
      console.error('Error updating arrival date:', error);
    }
  };

  const handleKickEmployee = async (employeeId, propertyId) => {
    try {
      const employee = housedEmployees.find(emp => emp.id === employeeId);
      const property = properties.find(p => p.id === propertyId);
      
      // Update employee to remove property assignment
      const employeeRef = doc(db, 'employees', employeeId);
      await updateDoc(employeeRef, {
        assigned_property_id: '',        // Clear property assignment
        assigned_room_name: '',          // Clear room assignment
        assignedProperty: '',            // Clear legacy field
        roomNumber: '',                  // Clear legacy field
        status: 'pending_assignment',    // Change status back to pending
        updatedAt: new Date()
      });

      // Log the unassignment action
      await logEmployeeUnassignment(
        employee?.name || 'Unknown',
        property?.name || 'Unknown Property',
        employeeId,
        propertyId
      );

      // Update property occupancy
      if (property) {
        const propertyRef = doc(db, 'properties', propertyId);
        const newOccupancy = Math.max(0, (property.occupancy || 0) - 1);
        const newOccupiedRooms = Math.max(0, (property.occupiedRooms || 0) - 1);
        
        await updateDoc(propertyRef, {
          occupancy: newOccupancy,
          occupiedRooms: newOccupiedRooms,
          updatedAt: new Date()
        });
      }

      // Refresh data to reflect changes
      fetchData();
      
      console.log(`Successfully removed employee from property`);
      
    } catch (error) {
      console.error('Error removing employee from property:', error);
    }
  };

  const openPropertyModal = (property) => {
    setSelectedProperty(property);
    setShowPropertyModal(true);
  };

  const openEditPropertyModal = (property) => {
    setEditingProperty(property);
    setEditPropertyForm({
      name: property.name || '',
      address: property.address || '',
      location: property.location || '',
      target_gender_type: property.target_gender_type || 'any',
      monthlyRent: property.monthlyRent || 800,
      expectedDate: property.expectedDate || '2025-06-21',
      amenities: property.amenities || ['WiFi', 'Laundry']
    });
    setShowEditPropertyModal(true);
  };

  const handleEditProperty = async (e) => {
    e.preventDefault();
    try {
      const oldData = { ...editingProperty };
      
      const propertyRef = doc(db, 'properties', editingProperty.id);
      await updateDoc(propertyRef, {
        ...editPropertyForm,
        genderTypes: editPropertyForm.target_gender_type === 'any' ? ['Male', 'Female'] : [editPropertyForm.target_gender_type],
        updatedAt: new Date()
      });
      
      // Log the property update
      await logPropertyUpdate(
        editingProperty.id,
        editingProperty.name,
        oldData,
        editPropertyForm
      );
      
      setShowEditPropertyModal(false);
      setEditingProperty(null);
      fetchData();
    } catch (error) {
      console.error('Error updating property:', error);
    }
  };

  const getPropertyEmployees = (propertyName, propertyId) => {
    // Primary check: match by property ID (main field used by employees page)
    return housedEmployees.filter(emp => {
      const isAssignedById = emp.assigned_property_id === propertyId;
      const isAssignedByName = emp.assignedProperty === propertyName; // Legacy fallback
      
      console.log(`Employee ${emp.name || emp.firstName || 'Unknown'}: assigned_property_id="${emp.assigned_property_id}", checking for property "${propertyName}"(${propertyId}), match=${isAssignedById || isAssignedByName}`);
      return isAssignedById || isAssignedByName;
    });
  };

  const handleAddProperty = async (e) => {
    e.preventDefault();
    try {
      const totalCapacity = newProperty.rooms.reduce((sum, room) => sum + room.capacity, 0);
      
      const propertyData = {
        ...newProperty,
        capacity: totalCapacity,
        occupancy: 0,
        totalRooms: newProperty.rooms.length,
        occupiedRooms: 0,
        genderTypes: newProperty.target_gender_type === 'any' ? ['Male', 'Female'] : [newProperty.target_gender_type],
        amenities: ['WiFi', 'Laundry'],
        monthlyRent: 800,
        status: 'Available',
        expectedDate: '2025-06-21',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const docRef = await addDoc(collection(db, 'properties'), propertyData);
      
      // Log the property creation
      await logPropertyCreate({ ...propertyData, id: docRef.id });
      
      setShowAddModal(false);
      setNewProperty({
        name: '',
        address: '',
        location: '',
        target_gender_type: 'any',
        rooms: [{ room_name: '', capacity: 1 }]
      });
      fetchData();
    } catch (error) {
      console.error('Error adding property:', error);
    }
  };

  const addRoom = () => {
    setNewProperty(prev => ({
      ...prev,
      rooms: [...prev.rooms, { room_name: '', capacity: 1 }]
    }));
  };

  const updateRoom = (index, field, value) => {
    setNewProperty(prev => ({
      ...prev,
      rooms: prev.rooms.map((room, i) => 
        i === index ? { ...room, [field]: value } : room
      )
    }));
  };

  const removeRoom = (index) => {
    setNewProperty(prev => ({
      ...prev,
      rooms: prev.rooms.filter((_, i) => i !== index)
    }));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  return (
    <DndContext 
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">物業管理</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              管理宿舍物業及房間分配
            </p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-md flex items-center space-x-2"
          >
            <PlusIcon className="h-5 w-5" />
            <span>新增物業</span>
          </button>
        </div>

        {/* Filters */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 lg:p-6 mb-4 lg:mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4">
            <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2 sm:mb-0">篩選條件</h2>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                地點
              </label>
              <input
                type="text"
                placeholder="搜索地點..."
                value={filters.location}
                onChange={(e) => setFilters(prev => ({ ...prev, location: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                性別類型
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setFilters(prev => ({ ...prev, gender: '' }))}
                  className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    filters.gender === ''
                      ? 'bg-primary-600 text-white shadow-sm'
                      : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                  }`}
                >
                  全部
                </button>
                <button
                  onClick={() => setFilters(prev => ({ ...prev, gender: 'Male' }))}
                  className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    filters.gender === 'Male'
                      ? 'bg-primary-600 text-white shadow-sm'
                      : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                  }`}
                >
                  男性
                </button>
                <button
                  onClick={() => setFilters(prev => ({ ...prev, gender: 'Female' }))}
                  className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    filters.gender === 'Female'
                      ? 'bg-primary-600 text-white shadow-sm'
                      : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                  }`}
                >
                  女性
                </button>
                <button
                  onClick={() => setFilters(prev => ({ ...prev, gender: 'any' }))}
                  className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    filters.gender === 'any'
                      ? 'bg-primary-600 text-white shadow-sm'
                      : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                  }`}
                >
                  不限
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                狀態
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setFilters(prev => ({ ...prev, status: '' }))}
                  className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    filters.status === ''
                      ? 'bg-primary-600 text-white shadow-sm'
                      : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                  }`}
                >
                  全部
                </button>
                <button
                  onClick={() => setFilters(prev => ({ ...prev, status: 'available' }))}
                  className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    filters.status === 'available'
                      ? 'bg-primary-600 text-white shadow-sm'
                      : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                  }`}
                >
                  可入住
                </button>
                <button
                  onClick={() => setFilters(prev => ({ ...prev, status: 'in_progress' }))}
                  className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    filters.status === 'in_progress'
                      ? 'bg-primary-600 text-white shadow-sm'
                      : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                  }`}
                >
                  進行中
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content - Split Layout */}
        <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 h-auto lg:h-[calc(100vh-280px)]" style={{ marginTop: '25px', marginLeft: '10px' }}>
          {/* Left Side - Properties */}
          <div className="flex-1 flex flex-col">
            <div className="mb-4">
              <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                物業列表 ({filteredProperties.length})
              </h2>
            </div>
            
            <div className="flex-1 overflow-y-auto max-h-[60vh] lg:max-h-none">
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 lg:gap-6 pb-6 px-2 pt-2">
                {filteredProperties.map((property) => (
                  <PropertyCard 
                    key={property.id} 
                    property={property} 
                    housedEmployees={housedEmployees}
                    onViewDetails={openPropertyModal}
                    onEdit={openEditPropertyModal}
                  />
                ))}
              </div>

              {filteredProperties.length === 0 && (
                <div className="text-center py-12">
                  <BuildingOfficeIcon className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
                  <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">找不到物業</h3>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    請調整篩選條件或新增物業。
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Right Side - Pending Employees */}
          <div className="w-full lg:w-80 flex-shrink-0 flex flex-col">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow flex flex-col h-auto lg:h-full">
              <div className="p-4 lg:p-6 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                  待分配員工 ({pendingEmployees.length})
                </h3>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 lg:p-6 max-h-[40vh] lg:max-h-none">
                <div className="space-y-3">
                  {pendingEmployees.map((employee) => (
                    <DraggableEmployee 
                      key={employee.id} 
                      employee={employee} 
                      onEditArrival={handleEditEmployeeArrival}
                    />
                  ))}
                </div>

                {pendingEmployees.length === 0 && (
                  <div className="text-center py-8">
                    <UserIcon className="mx-auto h-8 w-8 text-gray-400 dark:text-gray-500" />
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                      暂无待分配员工
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <DragOverlay>
          {activeId ? (
            <EmployeeCard employee={pendingEmployees.find(emp => emp.id === activeId)} isDragging />
          ) : null}
        </DragOverlay>

        {/* Property Details Modal */}
        {showPropertyModal && selectedProperty && (
          <PropertyDetailsModal 
            property={selectedProperty}
            employees={getPropertyEmployees(selectedProperty.name, selectedProperty.id)}
            onClose={() => setShowPropertyModal(false)}
            onRoomReassignment={handleRoomReassignment}
            onEdit={() => {
              setShowPropertyModal(false);
              openEditPropertyModal(selectedProperty);
            }}
            onKickEmployee={handleKickEmployee}
          />
        )}

        {/* Edit Property Modal */}
                <Modal
          isOpen={showEditPropertyModal}
          onClose={() => setShowEditPropertyModal(false)}
          title="編輯物業"
        >
          <form onSubmit={handleEditProperty} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Property Name
                </label>
                <input
                  type="text"
                  required
                  value={editPropertyForm.name}
                  onChange={(e) => setEditPropertyForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Address
                </label>
                <input
                  type="text"
                  required
                  value={editPropertyForm.address}
                  onChange={(e) => setEditPropertyForm(prev => ({ ...prev, address: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Location
                </label>
                <input
                  type="text"
                  required
                  value={editPropertyForm.location}
                  onChange={(e) => setEditPropertyForm(prev => ({ ...prev, location: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Target Gender Type
                </label>
                <select
                  value={editPropertyForm.target_gender_type}
                  onChange={(e) => setEditPropertyForm(prev => ({ ...prev, target_gender_type: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                >
                  <option value="any">Any</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="mixed">Mixed</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Monthly Rent ($)
                </label>
                <input
                  type="number"
                  min="0"
                  step="50"
                  value={editPropertyForm.monthlyRent}
                  onChange={(e) => setEditPropertyForm(prev => ({ ...prev, monthlyRent: parseInt(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Expected Date
                </label>
                <input
                  type="date"
                  value={editPropertyForm.expectedDate}
                  onChange={(e) => setEditPropertyForm(prev => ({ ...prev, expectedDate: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Amenities (comma-separated)
              </label>
              <input
                type="text"
                value={editPropertyForm.amenities.join(', ')}
                onChange={(e) => setEditPropertyForm(prev => ({ 
                  ...prev, 
                  amenities: e.target.value.split(',').map(item => item.trim()).filter(item => item)
                }))}
                placeholder="WiFi, Laundry, Parking, etc."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              />
            </div>

            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setShowEditPropertyModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                取消
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
              >
                更新物業
              </button>
            </div>
          </form>
        </Modal>

        {/* Add Property Modal */}
                <Modal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          title="新增物業"
        >
          <form onSubmit={handleAddProperty} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Property Name
                </label>
                <input
                  type="text"
                  required
                  value={newProperty.name}
                  onChange={(e) => setNewProperty(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Address
                </label>
                <input
                  type="text"
                  required
                  value={newProperty.address}
                  onChange={(e) => setNewProperty(prev => ({ ...prev, address: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Location
                </label>
                <input
                  type="text"
                  required
                  value={newProperty.location}
                  onChange={(e) => setNewProperty(prev => ({ ...prev, location: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Target Gender Type
                </label>
                <select
                  value={newProperty.target_gender_type}
                  onChange={(e) => setNewProperty(prev => ({ ...prev, target_gender_type: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                >
                  <option value="any">Any</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="mixed">Mixed</option>
                </select>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-3">
                <label className="block text-sm font-medium text-gray-700">
                  Rooms
                </label>
                <button
                  type="button"
                  onClick={addRoom}
                  className="text-primary-600 hover:text-primary-700 text-sm font-medium"
                >
                  + Add Room
                </button>
              </div>
              
              <div className="space-y-3">
                {newProperty.rooms.map((room, index) => (
                  <div key={index} className="flex space-x-3 items-center">
                    <input
                      type="text"
                      placeholder="Room name (e.g., 101A)"
                      value={room.room_name}
                      onChange={(e) => updateRoom(index, 'room_name', e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                      required
                    />
                    <input
                      type="number"
                      placeholder="Capacity"
                      min="1"
                      value={room.capacity}
                      onChange={(e) => updateRoom(index, 'capacity', parseInt(e.target.value) || 1)}
                      className="w-24 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                      required
                    />
                    {newProperty.rooms.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeRoom(index)}
                        className="text-red-600 hover:text-red-700 px-2"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                取消
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
              >
                新增物業
              </button>
            </div>
          </form>
        </Modal>
      </div>
    </DndContext>
  );
}

function DraggableEmployee({ employee, onEditArrival }) {
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
      <EmployeeCard employee={employee} onEditArrival={onEditArrival} />
    </div>
  );
}

function EmployeeCard({ employee, isDragging, onEditArrival }) {
  const [isEditingArrival, setIsEditingArrival] = useState(false);
  const [arrivalDate, setArrivalDate] = useState(
    employee.arrival_time ? 
      (employee.arrival_time.seconds ? 
        new Date(employee.arrival_time.seconds * 1000).toISOString().slice(0, 10) :
        new Date(employee.arrival_time).toISOString().slice(0, 10)
      ) : 
      new Date().toISOString().slice(0, 10)
  );

  const displayName = employee.name || 
                     employee.firstName || 
                     `${employee.firstName || ''} ${employee.lastName || ''}`.trim() || 
                     '未知姓名';

  const handleSaveArrival = () => {
    onEditArrival(employee.id, arrivalDate);
    setIsEditingArrival(false);
  };

  return (
    <div className={`bg-gray-50 dark:bg-gray-700 rounded-lg p-3 border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-primary-500 dark:hover:border-primary-400 transition-colors ${isDragging ? 'shadow-lg' : ''}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2 flex-1 min-w-0">
          <div className="flex-shrink-0">
            <UserIcon className="h-6 w-6 text-gray-400 dark:text-gray-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
              {displayName}
            </p>
            <div className="flex items-center space-x-1 text-xs text-gray-500 dark:text-gray-400">
              <span className="truncate">{employee.company || '無公司'}</span>
              {employee.preference && (
                <>
                  <span>•</span>
                  <span className="text-primary-600 dark:text-primary-400 font-medium truncate">
                    {employee.preference}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        
        {/* Gender Badge - Compact */}
        <div className="flex-shrink-0 ml-2">
          <span className={`px-1.5 py-0.5 text-xs rounded ${
            employee.gender === 'male' ? 'bg-blue-100 text-blue-700' :
            employee.gender === 'female' ? 'bg-pink-100 text-pink-700' :
            'bg-gray-100 text-gray-700'
          }`}>
            {employee.gender === 'male' ? '男' : employee.gender === 'female' ? '女' : '其他'}
          </span>
        </div>
      </div>
      
      {/* Editable Arrival Date - Compact */}
      <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
        {isEditingArrival ? (
          <div className="flex items-center space-x-2">
            <input
              type="date"
              value={arrivalDate}
              onChange={(e) => setArrivalDate(e.target.value)}
              className="flex-1 text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded focus:ring-1 focus:ring-primary-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            />
            <button
              onClick={handleSaveArrival}
              className="text-xs px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700"
            >
              ✓
            </button>
            <button
              onClick={() => setIsEditingArrival(false)}
              className="text-xs px-2 py-1 bg-gray-500 text-white rounded hover:bg-gray-600"
            >
              ✗
            </button>
          </div>
        ) : (
          <div 
            className="flex items-center justify-between cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 rounded px-2 py-1 -mx-2 -my-1"
            onClick={() => setIsEditingArrival(true)}
          >
            <span className="text-xs text-gray-600 dark:text-gray-300">
              到達: {new Date(arrivalDate).toLocaleDateString('zh-HK')}
            </span>
            <PencilIcon className="h-3 w-3 text-gray-400 dark:text-gray-500" />
          </div>
        )}
      </div>
    </div>
  );
}

function PropertyCard({ property, housedEmployees, onViewDetails, onEdit }) {
  const {
    setNodeRef,
    isOver,
  } = useSortable({ 
    id: property.id,
    data: {
      type: 'property',
      property,
    },
  });

  const router = useRouter();

  // Get employees for this property to calculate rent due
  const propertyEmployees = housedEmployees.filter(emp => {
    return emp.assigned_property_id === property.id || 
           emp.assigned_property_id === property.name ||
           emp.assignedProperty === property.name;
  });

  // Generate rent due count (stable simulation based on employee ID)
  const employeesWithRentDue = propertyEmployees.filter(emp => {
    // Use employee ID to create deterministic "rent due" status (30% chance)
    const hash = emp.id.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0);
    return Math.abs(hash) % 10 < 3; // 30% chance for demo
  }).length;

  const getPropertyStatus = () => {
    const occupancy = property.occupancy || 0;
    const capacity = property.capacity || 0;
    const occupancyRate = capacity > 0 ? (occupancy / capacity) : 0;
    
    // Check if expected date has passed
    const expectedDate = property.expectedDate;
    const today = new Date();
    const isExpectedDatePassed = expectedDate && new Date(expectedDate) < today;
    
    // Property is active if either:
    // 1. Expected date has passed, OR
    // 2. Occupancy is at 100%
    if (isExpectedDatePassed || occupancyRate >= 1) {
      return {
        label: '運營中',
        className: 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200',
        borderColor: 'border-green-500 dark:border-green-400'
      };
    } else {
      // Format the expected date for display
      const formattedDate = expectedDate ? 
        new Date(expectedDate).toLocaleDateString('zh-HK', { 
          day: 'numeric', 
          month: 'short', 
          year: 'numeric' 
        }) : '2025年6月21日';
      
      return {
        label: `預計 ${formattedDate}`,
        className: 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200',
        borderColor: 'border-yellow-500 dark:border-yellow-400'
      };
    }
  };

  const status = getPropertyStatus();

  const handleCardClick = (e) => {
    // Don't navigate if clicking on buttons
    if (e.target.closest('button')) {
      return;
    }
    router.push(`/property-detail?id=${property.id}`);
  };

  return (
    <div 
      ref={setNodeRef}
      className={`bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-md transition-all p-6 border-2 relative overflow-visible cursor-pointer ${
        status.borderColor
      } ${
        isOver ? 'ring-2 ring-primary-500 bg-primary-50 dark:bg-primary-900/20' : ''
      }`}
      onClick={handleCardClick}
    >
      {/* Rent Due Notification Dot */}
      {employeesWithRentDue > 0 && (
        <div className="absolute -top-3 -right-3 z-20">
          <div className="relative">
            <div className="w-7 h-7 bg-red-500 rounded-full flex items-center justify-center shadow-lg ring-2 ring-white dark:ring-gray-800">
              <span className="text-white text-xs font-bold">
                {employeesWithRentDue > 9 ? '9+' : employeesWithRentDue}
              </span>
            </div>
            {/* Pulsing animation for attention */}
            <div className="absolute inset-0 w-7 h-7 bg-red-500 rounded-full animate-ping opacity-25"></div>
          </div>
        </div>
      )}

      {/* Header Section */}
      <div className="flex justify-between items-start mb-4">
        <div className="flex-1 pr-4">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
            {property.name || '未命名物業'}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">{property.address}</p>
        </div>
        
        {/* Prominent Occupancy Display */}
        <div className="flex flex-col items-end space-y-2">
          <div className="text-right">
            <div className="text-2xl font-bold text-primary-600 dark:text-primary-400">
              {property.occupancy || 0}/{property.capacity}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">入住情況</div>
          </div>
          
          <div className="flex items-center space-x-2">
            <span className={`px-2 py-1 text-xs rounded-full ${status.className}`}>
              {status.label}
            </span>
            <button
              onClick={() => onEdit(property)}
              className="p-1 text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              title="編輯物業"
            >
              <PencilIcon className="h-5 w-5" />
            </button>
            <button
              onClick={() => onViewDetails(property)}
              className="p-1 text-gray-400 dark:text-gray-500 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
              title="查看詳情"
            >
              <EyeIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-2 text-sm text-gray-600 dark:text-gray-300 mb-4">
        <p>地點: {property.location}</p>
        <p>性別: {property.genderTypes?.join(', ') || (property.target_gender_type === 'male' ? '男性' : property.target_gender_type === 'female' ? '女性' : '不限')}</p>
        {employeesWithRentDue > 0 && (
          <p className="text-red-600 dark:text-red-400 font-medium">
            🔴 {employeesWithRentDue} 筆租金待收
          </p>
        )}
      </div>

      <div className="mb-4">
        <div className="flex justify-between text-sm text-gray-600 dark:text-gray-300 mb-1">
          <span>入住率</span>
          <span>{Math.round(((property.occupancy || 0) / (property.capacity || 1)) * 100)}%</span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <div
            className="bg-primary-600 dark:bg-primary-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${((property.occupancy || 0) / (property.capacity || 1)) * 100}%` }}
          />
        </div>
      </div>

      {isOver && (
        <div className="border-2 border-dashed border-primary-400 dark:border-primary-500 rounded-lg p-4 text-center">
          <p className="text-sm text-primary-600 dark:text-primary-400 font-medium">拖放員工到此處進行分配</p>
        </div>
      )}

      {property.amenities && (
        <div className="mt-4">
          <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">設施</h4>
          <div className="flex flex-wrap gap-1">
            {property.amenities.map((amenity, index) => (
              <span key={index} className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs rounded">
                {amenity === 'WiFi' ? 'WiFi' : 
                 amenity === 'Laundry' ? '洗衣房' : 
                 amenity === 'Parking' ? '停車場' : 
                 amenity === 'Air Conditioning' ? '冷氣' : 
                 amenity === 'Kitchen' ? '廚房' : amenity}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PropertyDetailsModal({ property, employees, onClose, onRoomReassignment, onEdit, onKickEmployee }) {
  const [selectedRoom, setSelectedRoom] = useState('');

  console.log('PropertyDetailsModal employees:', employees);

  const getRoomEmployees = (roomNumber) => {
    return employees.filter(emp => 
      emp.roomNumber === roomNumber || 
      emp.assigned_room_name === roomNumber
    );
  };

  const availableRooms = property.rooms || [
    { room_name: 'Room-101', capacity: 2 },
    { room_name: 'Room-102', capacity: 2 },
    { room_name: 'Room-103', capacity: 1 },
    { room_name: 'Room-201', capacity: 2 },
    { room_name: 'Room-202', capacity: 2 }
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden">
        <div className="flex justify-between items-center p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{property.name}</h2>
          <div className="flex items-center space-x-2">
            <button
              onClick={onEdit}
              className="p-2 text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              title="編輯物業"
            >
              <PencilIcon className="h-5 w-5" />
            </button>
            <button
              onClick={onClose}
              className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>
        </div>
        
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Property Info */}
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-3">物業資訊</h3>
                <div className="space-y-2 text-sm">
                  <p><span className="font-medium">地址:</span> {property.address}</p>
                  <p><span className="font-medium">位置:</span> {property.location}</p>
                  <p><span className="font-medium">入住率:</span> {property.occupancy || 0}/{property.capacity}</p>
                  <p><span className="font-medium">月租:</span> ${property.monthlyRent || 800}</p>
                  <p><span className="font-medium">預期日期:</span> {property.expectedDate || '2025-06-21'}</p>
                </div>
              </div>

              {/* All Housed Employees */}
              <div>
                <h4 className="text-md font-medium text-gray-900 mb-2">
                  入住員工 ({employees.length})
                </h4>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {employees.length > 0 ? (
                    employees.map((employee) => (
                      <div key={employee.id} className="p-3 bg-gray-50 rounded-lg">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <p className="font-medium text-sm">
                              {employee.name || `${employee.firstName || ''} ${employee.lastName || ''}`.trim() || 'Unknown Employee'}
                            </p>
                            <p className="text-sm text-gray-500">{employee.company}</p>
                            <p className="text-sm text-gray-500">
                              Room: {employee.roomNumber || employee.assigned_room_name || 'Not assigned'}
                            </p>
                          </div>
                          <button
                            onClick={() => {
                              if (window.confirm(`確定要將 ${employee.name || '此員工'} 從 ${property.name} 移除嗎？`)) {
                                onKickEmployee(employee.id, property.id);
                              }
                            }}
                            className="ml-2 px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
                            title="從物業移除"
                          >
                            🚪 移除
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-gray-500 italic">No housed employees found</p>
                  )}
                </div>
              </div>

              {/* Quick Room Assignment */}
              <div>
                <h4 className="text-md font-medium text-gray-900 mb-2">快速房間分配</h4>
                <div className="space-y-2">
                  <select
                    value={selectedRoom}
                    onChange={(e) => setSelectedRoom(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  >
                    <option value="">Select room to reassign</option>
                    {availableRooms.map((room, index) => (
                      <option key={index} value={room.room_name}>
                        {room.room_name} (Capacity: {room.capacity})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Room Layout */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-3">
                房間分配
              </h3>
              <div className="space-y-3">
                {availableRooms.map((room, index) => {
                  const roomEmployees = getRoomEmployees(room.room_name);
                  return (
                    <div key={index} className="border rounded-lg p-4">
                      <div className="flex justify-between items-center mb-2">
                        <h4 className="font-medium text-gray-900">{room.room_name}</h4>
                        <span className="text-xs text-gray-500">
                          {roomEmployees.length}/{room.capacity}
                        </span>
                      </div>
                      
                      <div className="space-y-2">
                        {roomEmployees.length > 0 ? (
                          roomEmployees.map((employee) => (
                            <div key={employee.id} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                              <div className="flex-1">
                                <p className="text-sm font-medium">
                                  {employee.name || `${employee.firstName || ''} ${employee.lastName || ''}`.trim() || 'Unknown Employee'}
                                </p>
                                <p className="text-xs text-gray-500">{employee.company}</p>
                              </div>
                              <div className="flex items-center space-x-1">
                                {selectedRoom && selectedRoom !== (employee.roomNumber || employee.assigned_room_name) && (
                                  <button
                                    onClick={() => {
                                      onRoomReassignment(employee.id, selectedRoom);
                                      setSelectedRoom('');
                                    }}
                                    className="text-xs bg-primary-600 text-white px-2 py-1 rounded hover:bg-primary-700"
                                  >
                                    Move to {selectedRoom}
                                  </button>
                                )}
                                <button
                                  onClick={() => {
                                    if (window.confirm(`確定要將 ${employee.name || '此員工'} 從 ${property.name} 移除嗎？`)) {
                                      onKickEmployee(employee.id, property.id);
                                    }
                                  }}
                                  className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded hover:bg-red-200"
                                  title="從物業移除"
                                >
                                  🚪
                                </button>
                              </div>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-gray-500 italic">No residents assigned</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 