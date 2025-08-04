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
  PencilIcon,
  XCircleIcon
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

// Helper function to get static bed capacity for a property (sum of room capacities)
const getStaticCapacity = (property) => {
  // Use stored capacity or calculate from room capacities
  return property.capacity || property.static_room_capacity ||
         (property.rooms ? property.rooms.reduce((sum, room) => sum + (room.capacity || 0), 0) : 0);
};

// Helper function to get actual occupancy (housed employees) for a property
const getActualOccupancy = (propertyId, housedEmployees, propertyName) => {
  // Count HOUSED employees (those who have arrived) for this property
  return housedEmployees.filter(emp => {
    const isAssigned = emp.assigned_property_id === propertyId;
    const isHoused = emp.status === 'housed'; // Only count housed employees
    return isAssigned && isHoused;
  }).length;
};

const getPropertyEmployees = (employees, propertyName, propertyId) => {
  // Primary check: match by property ID (main field used by employees page)
  return employees.filter(emp => {
    const isAssignedById = emp.assigned_property_id === propertyId;
    const isAssignedByName = emp.assignedProperty === propertyName; // Legacy fallback
    
    console.log(`Employee ${emp.name || emp.firstName || 'Unknown'}: assigned_property_id="${emp.assigned_property_id}", checking for property "${propertyName}"(${propertyId}), match=${isAssignedById}`);
    return isAssignedById;
  });
};

const receivableRent = (property, housedEmployees) => {
  const propertyEmployees = housedEmployees.filter(emp => 
    emp.assigned_property_id === property.id
  );
  return propertyEmployees.reduce((total, emp) => {
    const rent = parseFloat(emp.rent) || parseFloat(emp.monthlyRent) || parseFloat(property.monthlyRent) || 0;
    return total + rent;
  }, 0);
};

function DraggableEmployee({ employee }) {
  const {attributes, listeners, setNodeRef, transform} = useSortable({id: employee.id});
  const style = {
    transform: CSS.Transform.toString(transform),
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="p-2 bg-white border border-gray-300 rounded-md shadow-sm"
    >
      <p>{employee.name}</p>
    </div>
  );
}

function EmployeeCard({ employee, isDragging }) {
  return (
    <div className={`p-2 rounded-md shadow-lg ${isDragging ? 'bg-blue-100' : 'bg-white'}`}>
      <div className="flex items-center space-x-3">
        <div className="flex-shrink-0">
          <div className={`w-4 h-4 rounded-full ${employee.gender === 'female' ? 'bg-pink-400' : 'bg-blue-400'}`}></div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">
            {employee.name}
          </p>
          <p className="text-sm text-gray-500 truncate">
            {employee.company}
          </p>
        </div>
      </div>
    </div>
  );
}

function PropertiesTable({ properties, housedEmployees, receivableRent, overPropertyId }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
        <thead className="bg-gray-50 dark:bg-gray-700">
          <tr>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
              物業
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
              狀態
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
              入住情況
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
              應收租金
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
          {properties.map(property => (
            <PropertyRow
              key={property.id}
              property={property}
              employees={housedEmployees.filter(e => e.propertyId === property.id)}
              receivableRent={receivableRent(property, housedEmployees)}
              isOver={overPropertyId === property.id}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PropertyRow({ property, employees, receivableRent, isOver }) {
  const router = useRouter();

  const getPropertyStatus = () => {
    const capacity = property.rooms.reduce((acc, room) => acc + room.capacity, 0);
    const occupancy = employees.length;
    if (occupancy === 0) return { text: '空置', color: 'bg-gray-100 text-gray-800' };
    if (occupancy >= capacity) return { text: '滿房', color: 'bg-red-100 text-red-800' };
    return { text: '有空房', color: 'bg-green-100 text-green-800' };
  };

  const handleRowClick = () => {
    router.push(`/property-detail?id=${property.id}`);
  };

  const GenderTag = ({ gender }) => {
    if (gender === 'male') return <span className="text-xs font-semibold text-blue-600">男</span>;
    if (gender === 'female') return <span className="text-xs font-semibold text-pink-600">女</span>;
    return <span className="text-xs font-semibold text-gray-600">混合</span>;
  };

  return (
    <tr
      onClick={handleRowClick}
      className={`cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 ${isOver ? 'bg-blue-100 dark:bg-blue-900' : ''}`}
    >
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="flex items-center">
          <div className="ml-4">
            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{property.name}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">{property.location}</div>
          </div>
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getPropertyStatus().color}`}>
          {getPropertyStatus().text}
        </span>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="text-sm text-gray-900 dark:text-gray-100">
          {employees.length} / {property.rooms.reduce((acc, room) => acc + room.capacity, 0)}
        </div>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          <GenderTag gender={property.target_gender_type} />
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
        ${receivableRent.toLocaleString()}
      </td>
    </tr>
  );
}

function PropertyDetailsModal({ property, employees, onClose, onRoomReassignment, onEdit, onKickEmployee }) {
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [newArrivalDate, setNewArrivalDate] = useState('');

  const getRoomEmployees = (roomNumber) => {
    return employees.filter(e => e.room_number === roomNumber);
  };

  const handleEditArrival = (employee) => {
    setEditingEmployee(employee);
    setNewArrivalDate(employee.arrival_date || '');
  };

  const handleSaveArrival = () => {
    if (editingEmployee) {
      onRoomReassignment(editingEmployee.id, editingEmployee.room_number, newArrivalDate);
      setEditingEmployee(null);
    }
  };

  return (
    <Modal isOpen={true} onClose={onClose} title={`${property.name} - 房間詳情`} size="max-w-4xl">
      <div className="p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg leading-6 font-medium text-gray-900">{property.name}</h3>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">{property.address}</p>
          </div>
          <button
            onClick={() => onEdit(property)}
            className="ml-4 bg-gray-200 text-gray-700 hover:bg-gray-300 px-3 py-1 rounded-md text-sm"
          >
            編輯物業
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {property.rooms.map((room) => (
            <div key={room.room_name} className="bg-gray-50 rounded-lg p-4">
              <h4 className="text-md font-semibold text-gray-800 mb-3 border-b pb-2">
                {room.room_name} ({getRoomEmployees(room.room_name).length} / {room.capacity})
              </h4>
              <ul className="space-y-3">
                {getRoomEmployees(room.room_name).map((employee) => (
                  <li key={employee.id} className="text-sm text-gray-700 bg-white p-2 rounded-md shadow-sm">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-medium">{employee.name}</p>
                        <p className="text-xs text-gray-500">{employee.company}</p>
                        {editingEmployee && editingEmployee.id === employee.id ? (
                          <div className="mt-2">
                            <input
                              type="date"
                              value={newArrivalDate}
                              onChange={(e) => setNewArrivalDate(e.target.value)}
                              className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm"
                            />
                            <button
                              onClick={handleSaveArrival}
                              className="mt-1 text-xs bg-blue-500 text-white px-2 py-1 rounded"
                            >
                              保存
                            </button>
                            <button
                              onClick={() => setEditingEmployee(null)}
                              className="mt-1 ml-1 text-xs bg-gray-200 px-2 py-1 rounded"
                            >
                              取消
                            </button>
                          </div>
                        ) : (
                          <p className="text-xs text-gray-500">
                            入住: {employee.arrival_date ? new Date(employee.arrival_date).toLocaleDateString() : 'N/A'}
                            <button onClick={() => handleEditArrival(employee)} className="ml-2 text-blue-500 text-xs">(編輯)</button>
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => onKickEmployee(employee.id, property.id)}
                        className="text-red-500 hover:text-red-700"
                        title="移出宿舍"
                      >
                        <XCircleIcon className="h-5 w-5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

const HongKongPropertiesMap = ({ properties, housedEmployees, onPropertyClick, overPropertyId, getActualOccupancy, receivableRent }) => {
  const getPropertyData = (property) => {
    const capacity = getStaticCapacity(property);
    const occupancy = getActualOccupancy(property.id, housedEmployees, property.name);
    const housed = getPropertyEmployees(housedEmployees, property.name, property.id);
    const rent = receivableRent(property, housed);

    let status = 'available';
    if (occupancy >= capacity) status = 'full';
    if (occupancy === 0 && property.status !== 'pending') status = 'empty';
    if (property.status === 'pending') status = 'pending';

    return {
      id: property.id,
      name: property.name,
      address: property.address,
      occupancy,
      capacity,
      status,
      rent: rent.toLocaleString(),
      gender: property.target_gender_type
    };
  };

  return (
    <div className="w-full h-full bg-gray-50 dark:bg-gray-900 rounded-lg p-6 overflow-auto">
      {/* 图例 */}
      <div className="flex items-center justify-center mb-6 space-x-6 text-sm">
        <div className="flex items-center space-x-2">
          <div className="w-4 h-4 bg-blue-500 rounded-full"></div>
          <span className="text-gray-600 dark:text-gray-300">男性宿舍</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-4 h-4 bg-pink-500 rounded-full"></div>
          <span className="text-gray-600 dark:text-gray-300">女性宿舍</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-4 h-4 bg-gray-500 rounded-full"></div>
          <span className="text-gray-600 dark:text-gray-300">混合宿舍</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-4 h-4 bg-red-500 rounded-full"></div>
          <span className="text-gray-600 dark:text-gray-300">满房指示</span>
        </div>
      </div>
      
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
        {properties.map(property => (
          <PropertyCircle
            key={property.id}
            property={property}
            data={getPropertyData(property)}
            onPropertyClick={onPropertyClick}
            overPropertyId={overPropertyId}
          />
        ))}
      </div>
    </div>
  );
};

const PropertyCircle = ({ property, data, onPropertyClick, overPropertyId }) => {
  const { setNodeRef, isOver } = useDroppable({
    id: property.id,
    data: { property }
  });

  // 根据性别选择圆圈颜色
  const getCircleColor = () => {
    if (data.gender === 'male') return 'bg-blue-500';
    if (data.gender === 'female') return 'bg-pink-500';
    return 'bg-gray-500'; // any/mixed
  };

  // 根据入住率调整透明度
  const getOpacity = () => {
    if (data.capacity === 0) return 'opacity-30';
    const rate = data.occupancy / data.capacity;
    if (rate >= 1) return 'opacity-100'; // 满房
    if (rate >= 0.8) return 'opacity-90';
    if (rate >= 0.6) return 'opacity-80';
    if (rate >= 0.4) return 'opacity-70';
    if (rate >= 0.2) return 'opacity-60';
    return 'opacity-50'; // 空房或低入住率
  };

  const occupancyRate = data.capacity > 0 ? (data.occupancy / data.capacity) * 100 : 0;

  return (
    <div
      ref={setNodeRef}
      onClick={() => onPropertyClick(property)}
      className={`relative flex flex-col items-center cursor-pointer transition-all duration-200 hover:scale-105
        ${isOver || overPropertyId === property.id ? 'scale-110 z-10' : 'scale-100'}
      `}
    >
      {/* 圆圈 */}
      <div className={`relative w-20 h-20 rounded-full ${getCircleColor()} ${getOpacity()} 
        border-4 border-white dark:border-gray-700 shadow-lg flex items-center justify-center
        ${isOver || overPropertyId === property.id ? 'ring-4 ring-yellow-400' : ''}
      `}>
        {/* 入住率文字 */}
        <div className="text-center text-white font-bold">
          <div className="text-xs">{data.occupancy}/{data.capacity}</div>
          <div className="text-xs">{Math.round(occupancyRate)}%</div>
        </div>
        
        {/* 满房指示器 */}
        {occupancyRate >= 100 && (
          <div className="absolute -top-2 -right-2 w-4 h-4 bg-red-500 rounded-full border-2 border-white"></div>
        )}
      </div>
      
      {/* 物业名称 */}
      <div className="mt-2 text-center max-w-20">
        <div className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate" title={data.name}>
          {data.name}
        </div>
        <div className="text-xs text-gray-600 dark:text-gray-400">
          ${data.rent}
        </div>
      </div>
    </div>
  );
};

const DraggableEmployeeMinimized = ({ employee }) => {
  const {attributes, listeners, setNodeRef, transform} = useSortable({id: employee.id});
  const style = {
    transform: CSS.Transform.toString(transform),
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="p-1.5 bg-white border border-gray-200 rounded-md shadow-sm cursor-grab active:cursor-grabbing"
    >
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-gray-900 truncate">
            {employee.name || 'Unknown'}
          </p>
          <p className="text-xs text-gray-500 truncate">
            {employee.company || 'N/A'}
          </p>
        </div>
        <div className={`w-3 h-3 rounded-full ${employee.gender === 'female' ? 'bg-pink-500' : 'bg-blue-500'}`}></div>
      </div>
    </div>
  );
};

export default function Properties() {
  const router = useRouter();
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
    gender: '',
    status: '',
    occupancy: ''
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
        const hasPropertyAssignment = (emp.assigned_property_id && emp.assigned_property_id !== '') ||
                                     (emp.assignedProperty && emp.assignedProperty !== '');
        const isPending = !hasPropertyAssignment;

        console.log(`Employee ${emp.name || emp.firstName || 'Unknown'}: hasPropertyAssignment=${!!hasPropertyAssignment}, isPending=${isPending}`);
        return isPending;
      });

      console.log('Filtered pending employees:', pending);
      setPendingEmployees(pending);

      // Filter housed employees - those WITH property assignment AND have arrived (housed status)
      const housed = employeesData.filter(emp => {
        // Employee is housed if they have property assignment AND status is 'housed'
        const hasPropertyAssignment = (emp.assigned_property_id && emp.assigned_property_id !== '') ||
                                     (emp.assignedProperty && emp.assignedProperty !== '');
        const isHoused = hasPropertyAssignment && emp.status === 'housed';

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

    // Gender filter
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

    // Status filter (active/pending)
    if (filters.status) {
      filtered = filtered.filter(prop => {
        const actualOccupancy = getActualOccupancy(prop.id, housedEmployees, prop.name);
        const capacity = getStaticCapacity(prop);
        const occupancyRate = capacity > 0 ? (actualOccupancy / capacity) : 0;

        // Check if expected date has passed
        const expectedDate = prop.expectedDate;
        const today = new Date();
        const isExpectedDatePassed = expectedDate && new Date(expectedDate) < today;

        if (filters.status === 'active') {
          // Active: full occupancy OR expected date has passed
          return occupancyRate >= 1 || isExpectedDatePassed;
        }
        if (filters.status === 'pending') {
          // Pending: not full and expected date hasn't passed
          return occupancyRate < 1 && !isExpectedDatePassed;
        }
        return true;
      });
    }

    // Occupancy filter (full/available)
    if (filters.occupancy) {
      filtered = filtered.filter(prop => {
        const actualOccupancy = getActualOccupancy(prop.id, housedEmployees, prop.name);
        const capacity = getStaticCapacity(prop);
        const occupancyRate = capacity > 0 ? (actualOccupancy / capacity) : 0;

        if (filters.occupancy === 'full') {
          return occupancyRate >= 1;
        }
        if (filters.occupancy === 'available') {
          return occupancyRate < 1;
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

      // Check if we dropped onto a valid property (the over.id is now directly the property.id)
      const propertyId = overId;

      // Find the employee and property
      const employee = pendingEmployees.find(emp => emp.id === employeeId);
      const property = properties.find(prop => prop.id === propertyId);

      if (!employee || !property) {
        console.error("Could not find employee or property for assignment.");
        return;
      }

      // 🚨 CAPACITY CHECK: Prevent over-assignment
      const propertyCapacity = getStaticCapacity(property);
      const currentOccupancy = getActualOccupancy(propertyId, housedEmployees, property.name);
      
      if (currentOccupancy >= propertyCapacity) {
        alert(`⚠️ 無法分配：${property.name} 已滿房 (${currentOccupancy}/${propertyCapacity})\n請先移出其他員工或增加容量。`);
        return;
      }

      try {
        // Update employee with primary fields used by employees page
        const employeeRef = doc(db, 'employees', employeeId);
        const roomName = `Room-${Math.floor(Math.random() * 999) + 1}`;

        // Prepare arrival date - if not set, use today
        const arrivalDate = employee.arrival_at || new Date();

        const updateData = {
          assigned_property_id: property.id,           // Primary field used by employees page
          assigned_room_name: roomName,                // Primary field
          arrival_at: arrivalDate,                     // Set arrival date
          updatedAt: new Date()
        };

        // Calculate correct status using the same logic as in employees.js
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let statusArrivalDate = null;
        if (arrivalDate) {
          if (arrivalDate.seconds) {
            statusArrivalDate = new Date(arrivalDate.seconds * 1000);
          } else if (typeof arrivalDate === 'string') {
            statusArrivalDate = new Date(arrivalDate);
          } else if (arrivalDate instanceof Date) {
            statusArrivalDate = arrivalDate;
          }
          statusArrivalDate.setHours(0, 0, 0, 0);
        }

        // Auto-calculate status: housed if assigned and arrived, otherwise pending
        updateData.status = (statusArrivalDate && statusArrivalDate <= today) ? 'housed' : 'pending';

        // Also add legacy fields for backward compatibility
        updateData.assignedProperty = property.name;   // Legacy field for compatibility
        updateData.roomNumber = updateData.assigned_room_name;  // Legacy field
        updateData.checkInDate = new Date().toISOString().split('T')[0];
        updateData.arrivalDate = new Date().toISOString().split('T')[0];
        updateData.arrival_time = arrivalDate;
        updateData.rent = parseFloat(property.monthlyRent) || 800;
        updateData.monthlyRent = parseFloat(property.monthlyRent) || 800; // Keep for backward compatibility
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

  const getPropertyForEmployee = (employees, employeeId) => {
    const employee = employees.find(e => e.id === employeeId);
    if (!employee) return null;
    const propertyId = employee.assigned_property_id || employee.assignedProperty;
    return properties.find(p => p.id === propertyId);
  };

  const activeEmployee = employees.find(e => e.id === activeId);

  const handleAddProperty = async (e) => {
    e.preventDefault();
    try {
      const propertyData = {
        ...newProperty,
        genderTypes: [newProperty.target_gender_type],
        capacity: newProperty.rooms.reduce((acc, room) => acc + Number(room.capacity || 0), 0), // Total bed capacity
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

  // 🔍 Data consistency check for debugging
  if (!loading) {
    properties.forEach(property => {
      const capacity = getStaticCapacity(property);
      const housed = getActualOccupancy(property.id, housedEmployees);
      const assigned = employees.filter(emp => 
        emp.assigned_property_id === property.id
      ).length;
      
      if (housed > capacity) {
        console.warn(`⚠️ 數據不一致 - ${property.name}: ${housed} housed > ${capacity} capacity`);
      }
      if (assigned !== housed) {
        console.log(`📊 ${property.name}: ${assigned} assigned vs ${housed} housed vs ${capacity} capacity`);
      }
    });
  }

  if (loading) {
    return <div>Loading...</div>;
  }

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

        {/* Filter Toggle Buttons */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-6">
          <div className="flex flex-wrap gap-4">
            {/* Gender Filter */}
            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">性別:</span>
              <div className="flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
                <button
                  onClick={() => setFilters(prev => ({ ...prev, gender: '' }))}
                  className={`px-3 py-1 text-sm ${filters.gender === '' ? 'bg-blue-500 text-white' : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}
                >
                  全部
                </button>
                <button
                  onClick={() => setFilters(prev => ({ ...prev, gender: 'male' }))}
                  className={`px-3 py-1 text-sm ${filters.gender === 'male' ? 'bg-blue-500 text-white' : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}
                >
                  男性
                </button>
                <button
                  onClick={() => setFilters(prev => ({ ...prev, gender: 'female' }))}
                  className={`px-3 py-1 text-sm ${filters.gender === 'female' ? 'bg-pink-500 text-white' : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}
                >
                  女性
                </button>
              </div>
            </div>

            {/* Status Filter */}
            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">狀態:</span>
              <div className="flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
                <button
                  onClick={() => setFilters(prev => ({ ...prev, status: '' }))}
                  className={`px-3 py-1 text-sm ${filters.status === '' ? 'bg-green-500 text-white' : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}
                >
                  全部
                </button>
                <button
                  onClick={() => setFilters(prev => ({ ...prev, status: 'active' }))}
                  className={`px-3 py-1 text-sm ${filters.status === 'active' ? 'bg-green-500 text-white' : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}
                >
                  營運中
                </button>
                <button
                  onClick={() => setFilters(prev => ({ ...prev, status: 'pending' }))}
                  className={`px-3 py-1 text-sm ${filters.status === 'pending' ? 'bg-yellow-500 text-white' : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}
                >
                  籌備中
                </button>
              </div>
            </div>

            {/* Occupancy Filter */}
            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">入住率:</span>
              <div className="flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
                <button
                  onClick={() => setFilters(prev => ({ ...prev, occupancy: '' }))}
                  className={`px-3 py-1 text-sm ${filters.occupancy === '' ? 'bg-purple-500 text-white' : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}
                >
                  全部
                </button>
                <button
                  onClick={() => setFilters(prev => ({ ...prev, occupancy: 'full' }))}
                  className={`px-3 py-1 text-sm ${filters.occupancy === 'full' ? 'bg-purple-500 text-white' : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}
                >
                  滿房
                </button>
                <button
                  onClick={() => setFilters(prev => ({ ...prev, occupancy: 'available' }))}
                  className={`px-3 py-1 text-sm ${filters.occupancy === 'available' ? 'bg-purple-500 text-white' : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}
                >
                  有空房
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-4 lg:gap-6" style={{ height: 'calc(100vh - 320px)' }}>
          {/* Map-style Properties Visualization */}
          <div className="flex-1 flex flex-col">
            <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
              物業總覽 ({filteredProperties.length})
            </h2>
            <div className="flex-1 bg-white dark:bg-gray-800 rounded-lg shadow p-6 overflow-auto">
              <HongKongPropertiesMap
                properties={filteredProperties}
                housedEmployees={housedEmployees}
                onPropertyClick={(property) => router.push(`/property-detail?id=${property.id}`)}
                overPropertyId={overPropertyId}
                getActualOccupancy={getActualOccupancy}
                receivableRent={receivableRent}
              />
            </div>
          </div>

          {/* Minimized Pending Employees Sidebar */}
          <div className="w-full lg:w-80 flex-shrink-0 flex flex-col">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow flex flex-col h-full">
              <div className="p-3 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    待分配員工 ({pendingEmployees.length})
                  </h3>
                  <div className="flex items-center space-x-2 text-xs">
                    <span className="flex items-center space-x-1">
                      <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                      <span className="text-gray-600 dark:text-gray-400">
                        男: {pendingEmployees.filter(emp => emp.gender === 'male').length}
                      </span>
                    </span>
                    <span className="flex items-center space-x-1">
                      <div className="w-2 h-2 bg-pink-500 rounded-full"></div>
                      <span className="text-gray-600 dark:text-gray-400">
                        女: {pendingEmployees.filter(emp => emp.gender === 'female').length}
                      </span>
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-3">
                <SortableContext items={pendingEmployees.map(e => e.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">
                    {pendingEmployees.map((employee) => (
                      <DraggableEmployeeMinimized key={employee.id} employee={employee} />
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