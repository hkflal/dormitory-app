import { addDoc, collection } from 'firebase/firestore';
import { db } from './firebase';

// Get current user email or default to 'System'
const getCurrentUser = () => {
  // In a real app, you'd get this from your auth context
  // For now, using a placeholder
  return 'admin@dormitory.com'; // Replace with actual user from auth context
};

// Core logging function
export const logAction = async (action, description, targetId = null, targetType = null, targetName = null, oldData = null, newData = null) => {
  try {
    const logEntry = {
      action,
      description,
      user: getCurrentUser(),
      timestamp: new Date(),
      targetId,
      targetType,
      targetName,
      oldData,
      newData,
      reverted: false
    };

    await addDoc(collection(db, 'history_logs'), logEntry);
    console.log('Action logged:', logEntry);
  } catch (error) {
    console.error('Error logging action:', error);
  }
};

// Employee-related logging functions
export const logEmployeeCreate = async (employee) => {
  await logAction(
    'CREATE_EMPLOYEE',
    `Created new employee: ${employee.name || 'Unknown'} from ${employee.company || 'Unknown Company'}`,
    employee.id,
    'Employee',
    employee.name,
    null,
    employee
  );
};

export const logEmployeeUpdate = async (employeeId, employeeName, oldData, newData) => {
  const changes = [];
  
  // Safely check for changes with null/undefined handling
  if ((oldData?.name || '') !== (newData?.name || '')) {
    changes.push(`name from "${oldData?.name || 'N/A'}" to "${newData?.name || 'N/A'}"`);
  }
  if ((oldData?.company || '') !== (newData?.company || '')) {
    changes.push(`company from "${oldData?.company || 'N/A'}" to "${newData?.company || 'N/A'}"`);
  }
  if ((oldData?.status || '') !== (newData?.status || '')) {
    changes.push(`status from "${oldData?.status || 'N/A'}" to "${newData?.status || 'N/A'}"`);
  }
  if ((oldData?.assigned_property_id || '') !== (newData?.assigned_property_id || '')) {
    changes.push(`property assignment`);
  }
  if ((oldData?.assigned_room_name || '') !== (newData?.assigned_room_name || '')) {
    changes.push(`room assignment from "${oldData?.assigned_room_name || 'None'}" to "${newData?.assigned_room_name || 'None'}"`);
  }

  const description = changes.length > 0 
    ? `Updated employee ${employeeName}: ${changes.join(', ')}`
    : `Updated employee ${employeeName}`;

  await logAction(
    'UPDATE_EMPLOYEE',
    description,
    employeeId,
    'Employee',
    employeeName,
    oldData,
    newData
  );
};

export const logEmployeeDelete = async (employee) => {
  await logAction(
    'DELETE_EMPLOYEE',
    `Deleted employee: ${employee.name || 'Unknown'} from ${employee.company || 'Unknown Company'}`,
    employee.id,
    'Employee',
    employee.name,
    employee,
    null
  );
};

export const logEmployeeAssignment = async (employeeName, propertyName, roomName, employeeId, propertyId) => {
  await logAction(
    'ASSIGN_EMPLOYEE',
    `Assigned employee ${employeeName} to property "${propertyName}" in room "${roomName}"`,
    employeeId,
    'Employee',
    employeeName,
    null,
    { propertyId, propertyName, roomName }
  );
};

export const logEmployeeUnassignment = async (employeeName, propertyName, employeeId, propertyId) => {
  await logAction(
    'UNASSIGN_EMPLOYEE',
    `Removed employee ${employeeName} from property "${propertyName}"`,
    employeeId,
    'Employee',
    employeeName,
    { propertyId, propertyName },
    null
  );
};

// Property-related logging functions
export const logPropertyCreate = async (property) => {
  await logAction(
    'CREATE_PROPERTY',
    `Created new property: ${property.name} at ${property.address} (Capacity: ${property.capacity})`,
    property.id,
    'Property',
    property.name,
    null,
    property
  );
};

export const logPropertyUpdate = async (propertyId, propertyName, oldData, newData) => {
  const changes = [];
  
  if (oldData.name !== newData.name) {
    changes.push(`name from "${oldData.name}" to "${newData.name}"`);
  }
  if (oldData.address !== newData.address) {
    changes.push(`address from "${oldData.address}" to "${newData.address}"`);
  }
  if (oldData.monthlyRent !== newData.monthlyRent) {
    changes.push(`monthly rent from $${oldData.monthlyRent} to $${newData.monthlyRent}`);
  }
  if (oldData.target_gender_type !== newData.target_gender_type) {
    changes.push(`gender type from "${oldData.target_gender_type}" to "${newData.target_gender_type}"`);
  }

  const description = changes.length > 0 
    ? `Updated property ${propertyName}: ${changes.join(', ')}`
    : `Updated property ${propertyName}`;

  await logAction(
    'UPDATE_PROPERTY',
    description,
    propertyId,
    'Property',
    propertyName,
    oldData,
    newData
  );
};

export const logPropertyDelete = async (property) => {
  await logAction(
    'DELETE_PROPERTY',
    `Deleted property: ${property.name} at ${property.address}`,
    property.id,
    'Property',
    property.name,
    property,
    null
  );
};

// Room-related logging functions
export const logRoomCreate = async (room, propertyName, propertyId) => {
  await logAction(
    'CREATE_ROOM',
    `Created new room "${room.room_name}" in property "${propertyName}" (Capacity: ${room.capacity})`,
    room.id,
    'Room',
    room.room_name,
    null,
    { ...room, propertyId, propertyName }
  );
};

export const logRoomUpdate = async (roomId, roomName, propertyName, oldData, newData) => {
  const changes = [];
  
  if (oldData.room_name !== newData.room_name) {
    changes.push(`name from "${oldData.room_name}" to "${newData.room_name}"`);
  }
  if (oldData.capacity !== newData.capacity) {
    changes.push(`capacity from ${oldData.capacity} to ${newData.capacity}`);
  }

  const description = changes.length > 0 
    ? `Updated room "${roomName}" in property "${propertyName}": ${changes.join(', ')}`
    : `Updated room "${roomName}" in property "${propertyName}"`;

  await logAction(
    'UPDATE_ROOM',
    description,
    roomId,
    'Room',
    roomName,
    oldData,
    newData
  );
};

export const logRoomDelete = async (room, propertyName, propertyId) => {
  await logAction(
    'DELETE_ROOM',
    `Deleted room "${room.room_name}" from property "${propertyName}"`,
    room.id,
    'Room',
    room.room_name,
    { ...room, propertyId, propertyName },
    null
  );
};

// Invoice-related logging functions
export const logInvoiceCreate = async (invoice) => {
  await logAction(
    'CREATE_INVOICE',
    `Created new invoice ${invoice.invoice_number} for amount $${invoice.amount} (Status: ${invoice.status})`,
    invoice.id,
    'Invoice',
    invoice.invoice_number,
    null,
    invoice
  );
};

export const logInvoiceUpdate = async (invoiceId, invoiceNumber, oldData, newData) => {
  const changes = [];
  
  if (oldData.amount !== newData.amount) {
    changes.push(`amount from $${oldData.amount} to $${newData.amount}`);
  }
  if (oldData.status !== newData.status) {
    changes.push(`status from "${oldData.status}" to "${newData.status}"`);
  }
  if (oldData.employee_id !== newData.employee_id) {
    changes.push(`employee assignment`);
  }

  const description = changes.length > 0 
    ? `Updated invoice ${invoiceNumber}: ${changes.join(', ')}`
    : `Updated invoice ${invoiceNumber}`;

  await logAction(
    'UPDATE_INVOICE',
    description,
    invoiceId,
    'Invoice',
    invoiceNumber,
    oldData,
    newData
  );
};

export const logInvoiceDelete = async (invoice) => {
  await logAction(
    'DELETE_INVOICE',
    `Deleted invoice ${invoice.invoice_number} for amount $${invoice.amount}`,
    invoice.id,
    'Invoice',
    invoice.invoice_number,
    invoice,
    null
  );
};

// Maintenance-related logging functions
export const logMaintenanceCreate = async (maintenance, propertyName) => {
  await logAction(
    'CREATE_MAINTENANCE',
    `Created maintenance request for "${maintenance.item}" at property "${propertyName}" (Cost: $${maintenance.cost})`,
    maintenance.id,
    'Maintenance',
    maintenance.item,
    null,
    { ...maintenance, propertyName }
  );
};

export const logMaintenanceUpdate = async (maintenanceId, maintenanceItem, oldData, newData) => {
  const changes = [];
  
  if (oldData.status !== newData.status) {
    changes.push(`status from "${oldData.status}" to "${newData.status}"`);
  }
  if (oldData.cost !== newData.cost) {
    changes.push(`cost from $${oldData.cost} to $${newData.cost}`);
  }

  const description = changes.length > 0 
    ? `Updated maintenance request "${maintenanceItem}": ${changes.join(', ')}`
    : `Updated maintenance request "${maintenanceItem}"`;

  await logAction(
    'UPDATE_MAINTENANCE',
    description,
    maintenanceId,
    'Maintenance',
    maintenanceItem,
    oldData,
    newData
  );
};

export const logMaintenanceDelete = async (maintenance, propertyName) => {
  await logAction(
    'DELETE_MAINTENANCE',
    `Deleted maintenance request "${maintenance.item}" from property "${propertyName}" (Cost: $${maintenance.cost})`,
    maintenance.id,
    'Maintenance',
    maintenance.item,
    { ...maintenance, propertyName },
    null
  );
};

// Utility function to log room reassignment
export const logRoomReassignment = async (employeeName, oldRoom, newRoom, propertyName, employeeId) => {
  await logAction(
    'UPDATE_EMPLOYEE',
    `Reassigned employee ${employeeName} from room "${oldRoom}" to room "${newRoom}" in property "${propertyName}"`,
    employeeId,
    'Employee',
    employeeName,
    { roomName: oldRoom },
    { roomName: newRoom }
  );
}; 