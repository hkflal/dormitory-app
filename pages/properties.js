import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, doc, query, where } from 'firebase/firestore';
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
  closestCorners,
  useDroppable
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
  const [overPropertyId, setOverPropertyId] = useState(null);
  const [filters, setFilters] = useState({
    location: '',
    gender: '',
    status: ''
  });
  const [unpaidInvoices, setUnpaidInvoices] = useState({});

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
      let propertiesData = propertiesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Ensure genderTypes is an array to handle data inconsistencies
      propertiesData = propertiesData.map(p => {
          const newP = { ...p };
          // Case 1: genderTypes is a string
          if (typeof newP.genderTypes === 'string') {
              newP.genderTypes = [newP.genderTypes];
          } 
          // Case 2: genderTypes is missing, but old field target_gender_type exists
          else if (!newP.genderTypes && newP.target_gender_type) {
              newP.genderTypes = [newP.target_gender_type];
          }
          // Case 3: genderTypes is not an array for some other reason, safe fallback
          else if (!Array.isArray(newP.genderTypes)) {
              newP.genderTypes = [];
          }
          return newP;
      });

      // Fetch employees
      const employeesRef = collection(db, 'employees');
      const employeesSnapshot = await getDocs(employeesRef);
      const employeesData = employeesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Fetch unpaid invoices
      const invoicesRef = collection(db, 'invoices');
      const q = query(invoicesRef, where('status', 'in', ['pending', 'overdue']));
      const invoicesSnapshot = await getDocs(q);
      const unpaidInvoicesData = {};
      invoicesSnapshot.docs.forEach(doc => {
        const invoice = doc.data();
        const propertyId = invoice.property_id || invoice.propertyId; // Check both possible fields
        if (propertyId) {
          if (!unpaidInvoicesData[propertyId]) {
            unpaidInvoicesData[propertyId] = { amount: 0, count: 0 };
          }
          const total = (invoice.amount || 0) * (invoice.n_employees || 1) * (invoice.frequency || 1);
          unpaidInvoicesData[propertyId].amount += total;
          unpaidInvoicesData[propertyId].count += 1;
        }
      });
      setUnpaidInvoices(unpaidInvoicesData);

      console.log('All employees fetched:', employeesData);

      setProperties(propertiesData);
      setEmployees(employeesData);
      
      // Filter pending employees - those NOT assigned to any property
      const pending = employeesData.filter(emp => {
        // Employee is pending if they have NO property assignment
        const hasPropertyAssignment = emp.assigned_property_id || emp.assignedProperty;
        const isPending = !hasPropertyAssignment;
        
        console.log(`Employee ${emp.name || emp.firstName || 'Unknown'}: hasPropertyAssignment=${!!hasPropertyAssignment}, isPending=${isPending}`);
        return isPending;
      });
      
      console.log('Filtered pending employees:', pending);
      setPendingEmployees(pending);
      
      // Filter housed employees - those WITH property assignment (regardless of status!)
      const housed = employeesData.filter(emp => {
        // Employee is housed if they have ANY property assignment
        const hasPropertyAssignment = emp.assigned_property_id || emp.assignedProperty;
        const isHoused = !!hasPropertyAssignment;
        
        console.log(`Employee ${emp.name || emp.firstName || 'Unknown'}: hasPropertyAssignment=${!!hasPropertyAssignment}, status=${emp.status}, isHoused=${isHoused}`);
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

  const handleDragOver = (event) => {
    const { over } = event;
    setOverPropertyId(over ? over.id : null);
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;

    setOverPropertyId(null);
    setActiveId(null);

    if (active.id && over && over.id) {
      const employeeId = active.id;
      const overId = over.id;

      // Check if we dropped onto a valid property drop area
      if (typeof overId === 'string' && overId.startsWith('property-drop-area-')) {
        const propertyId = overId.replace('property-drop-area-', '');

        // Find the employee and property
        const employee = pendingEmployees.find(emp => emp.id === employeeId);
        const property = properties.find(prop => prop.id === propertyId);

        if (!employee || !property) {
          console.error("Could not find employee or property for assignment.");
          return;
        }

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
      }
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
    if (!editingProperty) return;

    try {
      const propertyRef = doc(db, 'properties', editingProperty.id);
      const updatedData = { 
        ...editPropertyForm,
        genderTypes: [editPropertyForm.target_gender_type]
      };
      await updateDoc(propertyRef, updatedData);

      // Log the update
      await logPropertyUpdate(
        editingProperty.id,
        editingProperty.name,
        editingProperty,
        updatedData
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
      const propertyData = {
        ...newProperty,
        genderTypes: [newProperty.target_gender_type],
        capacity: newProperty.rooms.reduce((acc, room) => acc + Number(room.capacity || 0), 0),
        occupancy: 0,
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
    const updatedRooms = newProperty.rooms.filter((_, i) => i !== index);
    setNewProperty({ ...newProperty, rooms: updatedRooms });
  };

  const getPropertyForEmployee = (employeeId) => {
    const employee = employees.find(e => e.id === employeeId);
    if (!employee) return null;
    const propertyId = employee.assigned_property_id || employee.assignedProperty;
    return properties.find(p => p.id === propertyId);
  };

  const activeEmployee = employees.find(e => e.id === activeId);

  if (loading) {
    return <div>Loading...</div>;
  }

  const receivableRent = (property, housedEmployees) => {
    const propertyEmployees = housedEmployees.filter(emp => (emp.assigned_property_id || emp.assignedProperty) === property.id);
    return propertyEmployees.reduce((total, emp) => {
      return total + (emp.monthlyRent || property.monthlyRent || 0);
    }, 0);
  };

  return (
    <DndContext 
      sensors={sensors} 
      onDragStart={handleDragStart} 
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      collisionDetection={closestCorners}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="sm:flex sm:items-center sm:justify-between mb-6">
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

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 lg:p-6 mb-4 lg:mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">地點</label>
              <input
                type="text"
                placeholder="搜索地點..."
                value={filters.location}
                onChange={(e) => setFilters(prev => ({ ...prev, location: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>
            {/* Other filters can be restored here if needed */}
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-4 lg:gap-6" style={{ height: 'calc(100vh - 280px)' }}>
          <div className="flex-1 flex flex-col">
            <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
              物業列表 ({filteredProperties.length})
            </h2>
            <div className="flex-1 overflow-y-auto">
              <PropertiesTable 
                properties={filteredProperties}
                housedEmployees={housedEmployees}
                receivableRent={receivableRent}
                overPropertyId={overPropertyId}
              />
            </div>
          </div>

          <div className="w-full lg:w-80 flex-shrink-0 flex flex-col">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow flex flex-col h-full">
              <div className="p-4 lg:p-6 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                  待分配員工 ({pendingEmployees.length})
                </h3>
              </div>
              <div className="flex-1 overflow-y-auto p-4 lg:p-6">
                <SortableContext items={pendingEmployees.map(e => e.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-3">
                    {pendingEmployees.map((employee) => (
                      <DraggableEmployee key={employee.id} employee={employee} />
                    ))}
                  </div>
                </SortableContext>
              </div>
            </div>
          </div>
        </div>
      </div>
      <DragOverlay>
        {activeId && activeEmployee ? <EmployeeCard employee={activeEmployee} isDragging /> : null}
      </DragOverlay>

      {/* Add Property Modal */}
      <Modal 
        isOpen={showAddModal} 
        onClose={() => setShowAddModal(false)} 
        title="新增物業"
        size="max-w-2xl"
      >
        <form onSubmit={handleAddProperty} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                物業名稱 *
              </label>
              <input
                type="text"
                required
                value={newProperty.name}
                onChange={(e) => setNewProperty(prev => ({ ...prev, name: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                placeholder="請輸入物業名稱"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                地點 *
              </label>
              <input
                type="text"
                required
                value={newProperty.location}
                onChange={(e) => setNewProperty(prev => ({ ...prev, location: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                placeholder="請輸入地點"
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              地址
            </label>
            <textarea
              value={newProperty.address}
              onChange={(e) => setNewProperty(prev => ({ ...prev, address: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              rows="2"
              placeholder="請輸入詳細地址"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              目標性別類型
            </label>
            <select
              value={newProperty.target_gender_type}
              onChange={(e) => setNewProperty(prev => ({ ...prev, target_gender_type: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="any">任何性別</option>
              <option value="male">男性</option>
              <option value="female">女性</option>
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                房間配置
              </label>
              <button
                type="button"
                onClick={addRoom}
                className="text-sm text-primary-600 hover:text-primary-700 font-medium"
              >
                + 新增房間
              </button>
            </div>
            <div className="space-y-2">
              {newProperty.rooms.map((room, index) => (
                <div key={index} className="flex items-center space-x-2">
                  <input
                    type="text"
                    placeholder="房間名稱"
                    value={room.room_name}
                    onChange={(e) => updateRoom(index, 'room_name', e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  />
                  <input
                    type="number"
                    placeholder="容量"
                    min="1"
                    value={room.capacity}
                    onChange={(e) => updateRoom(index, 'capacity', parseInt(e.target.value) || 1)}
                    className="w-20 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  />
                  {newProperty.rooms.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeRoom(index)}
                      className="text-red-600 hover:text-red-700 p-1"
                    >
                      <XMarkIcon className="h-5 w-5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
            >
              新增物業
            </button>
          </div>
        </form>
      </Modal>
    </DndContext>
  );
}

function DraggableEmployee({ employee }) {
  const {attributes, listeners, setNodeRef, transform} = useSortable({id: employee.id});
  const style = {
    transform: CSS.Transform.toString(transform),
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
      <EmployeeCard employee={employee} />
    </div>
  );
}

function EmployeeCard({ employee, isDragging }) {
  const displayName = employee.name || 
                     `${employee.firstName || ''} ${employee.lastName || ''}`.trim() || 
                     '未知姓名';
  
  const cardClasses = `bg-gray-50 dark:bg-gray-700 rounded-lg p-3 border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-primary-500 dark:hover:border-primary-400 transition-colors ${isDragging ? 'shadow-lg opacity-75' : ''}`;
  
  return (
    <div className={cardClasses}>
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
            </div>
          </div>
        </div>
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
    </div>
  );
}

function PropertiesTable({ properties, housedEmployees, receivableRent, overPropertyId }) {
  return (
    <div className="overflow-x-auto">
      <div className="inline-block min-w-full align-middle">
        <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 rounded-lg">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 dark:text-white sm:pl-6">房源</th>
                <th scope="col" className="px-3 py-3.5 text-center text-sm font-semibold text-gray-900 dark:text-white">入住情況</th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-white">月租</th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-white">狀態</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
              {properties.map(property => {
                const propertyEmployees = housedEmployees.filter(emp => (emp.assigned_property_id || emp.assignedProperty) === property.id);
                const rent = receivableRent(property, housedEmployees);
                return (
                  <PropertyRow
                    key={property.id}
                    property={property}
                    employees={propertyEmployees}
                    receivableRent={rent}
                    isOver={overPropertyId === `property-drop-area-${property.id}`}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function PropertyRow({ property, employees, receivableRent, isOver }) {
  const router = useRouter();
  const { setNodeRef } = useDroppable({
    id: `property-drop-area-${property.id}`,
  });

  const occupancy = employees.length;
  const capacity = property.capacity;
  const occupancyRate = capacity > 0 ? (occupancy / capacity) * 100 : 0;

  const getPropertyStatus = () => {
    if (occupancy >= capacity) {
      return { text: '已滿', className: 'bg-red-100 text-red-800 dark:bg-red-800/20 dark:text-red-300' };
    }
    return { text: '營運中', className: 'bg-green-100 text-green-800 dark:bg-green-800/20 dark:text-green-300' };
  };
  const status = getPropertyStatus();

  const handleRowClick = () => {
    router.push(`/property-detail?id=${property.id}`);
  };

  const GenderTag = ({ gender }) => {
    if (!gender || typeof gender !== 'string') return null;

    const lowerGender = gender.toLowerCase();

    if (lowerGender === 'male') {
      return <span className="ml-2 inline-flex items-center rounded-md bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700 dark:bg-blue-700/30 dark:text-blue-300">Male</span>;
    }
    if (lowerGender === 'female') {
      return <span className="ml-2 inline-flex items-center rounded-md bg-pink-100 px-2 py-1 text-xs font-medium text-pink-700 dark:bg-pink-700/30 dark:text-pink-300">Female</span>;
    }
    return null;
  };

  return (
    <tr
      ref={setNodeRef}
      onClick={handleRowClick}
      className={`cursor-pointer bg-white dark:bg-gray-800 ${isOver ? 'bg-primary-50 dark:bg-primary-900/30' : ''} hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-200`}
    >
      <td className="whitespace-nowrap py-5 pl-4 pr-3 text-sm sm:pl-6">
        <div className="flex items-center">
          <div className="h-11 w-11 flex-shrink-0">
             <BuildingOfficeIcon className="h-11 w-11 text-gray-400 dark:text-gray-500"/>
          </div>
          <div className="ml-4">
            <div className="font-medium text-gray-900 dark:text-white flex items-center">
              {property.name}
              <GenderTag gender={property.target_gender_type} />
            </div>
            <div className="mt-1 text-gray-500 dark:text-gray-400">{property.location}</div>
          </div>
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-5 text-sm text-gray-500 dark:text-gray-400 text-center">
        <div className="text-lg font-medium text-gray-900 dark:text-white">{occupancy} / {capacity}</div>
        <div className="mt-1 text-gray-500">
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
            <div className="bg-primary-600 h-1.5 rounded-full" style={{ width: `${occupancyRate}%` }}></div>
          </div>
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-5 text-sm text-gray-500 dark:text-gray-400">
        <div className="text-gray-900 dark:text-white">${receivableRent}</div>
      </td>
      <td className="whitespace-nowrap px-3 py-5 text-sm text-gray-500 dark:text-gray-400">
        <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${status.className}`}>
          {status.text}
        </span>
      </td>
    </tr>
  );
}

function PropertyDetailsModal({ property, employees, onClose, onRoomReassignment, onEdit, onKickEmployee }) {
  if (!property) return null;
  
  const getRoomEmployees = (roomNumber) => {
    return employees.filter(emp => emp.assigned_room === roomNumber);
  };

  return (
    <Modal onClose={onClose}>
        <div className="p-6">
            <div className="flex justify-between items-start">
                <h2 className="text-2xl font-bold mb-4">{property.name}</h2>
                <div>
                  <button onClick={() => onEdit(property)} className="p-2 text-gray-600 hover:text-gray-900">
                      <PencilIcon className="h-5 w-5"/>
                  </button>
                  <button onClick={onClose} className="p-2 text-gray-600 hover:text-gray-900">
                      <XMarkIcon className="h-6 w-6"/>
                  </button>
                </div>
            </div>
            {/* Details content */}
        </div>
    </Modal>
  );
} 