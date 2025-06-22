import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc } from 'firebase/firestore';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDNF7-xgKKDQz_5_gKKDQz_5_gKKDQz_5_g",
  authDomain: "dormitory-app-12345.firebaseapp.com",
  projectId: "dormitory-app-12345",
  storageBucket: "dormitory-app-12345.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef123456789012345678"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/**
 * NEW STATUS LOGIC:
 * 
 * 1. "housed" (已入住) - Employee is assigned to a property AND has arrived (arrival_time <= today)
 * 2. "pending" (未入住) - Employee is assigned to a property BUT arrival_time > today OR no arrival_time
 * 3. "pending_assignment" (待分配) - Employee is NOT assigned to any property
 * 4. "departed" (已離開) - Employee has left the property
 */

async function fixEmployeeStatus() {
  try {
    console.log('🔄 Starting employee status fix...');
    
    // Fetch all employees
    const employeesRef = collection(db, 'employees');
    const employeesSnapshot = await getDocs(employeesRef);
    const employees = employeesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    console.log(`📊 Found ${employees.length} employees to process`);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set to start of day for comparison
    
    let updatedCount = 0;
    const statusChanges = {
      housed: 0,
      pending: 0,
      pending_assignment: 0,
      departed: 0
    };
    
    for (const employee of employees) {
      let newStatus = null;
      let shouldUpdate = false;
      
      // Check if employee is assigned to a property
      const hasPropertyAssignment = employee.assigned_property_id && employee.assigned_property_id !== '';
      
      // Parse arrival time
      let arrivalDate = null;
      if (employee.arrival_time) {
        if (employee.arrival_time.seconds) {
          // Firestore Timestamp
          arrivalDate = new Date(employee.arrival_time.seconds * 1000);
        } else if (typeof employee.arrival_time === 'string') {
          arrivalDate = new Date(employee.arrival_time);
        } else if (employee.arrival_time instanceof Date) {
          arrivalDate = employee.arrival_time;
        }
      }
      
      // Determine correct status based on NEW LOGIC
      if (!hasPropertyAssignment) {
        // No property assignment = pending_assignment (待分配)
        newStatus = 'pending_assignment';
      } else if (arrivalDate && arrivalDate <= today) {
        // Has property assignment AND has arrived = housed (已入住)
        newStatus = 'housed';
      } else {
        // Has property assignment BUT hasn't arrived yet = pending (未入住)
        newStatus = 'pending';
      }
      
      // Check if status needs to be updated
      if (employee.status !== newStatus) {
        shouldUpdate = true;
        statusChanges[newStatus]++;
        
        console.log(`👤 ${employee.name || employee.firstName || 'Unknown'}: ${employee.status || 'undefined'} → ${newStatus}`);
        console.log(`   Property: ${employee.assigned_property_id || 'None'}`);
        console.log(`   Arrival: ${arrivalDate ? arrivalDate.toLocaleDateString() : 'Not set'}`);
        console.log(`   Room: ${employee.assigned_room_name || employee.roomNumber || 'None'}`);
        console.log('');
      }
      
      // Update employee if needed
      if (shouldUpdate) {
        const employeeRef = doc(db, 'employees', employee.id);
        await updateDoc(employeeRef, {
          status: newStatus,
          updatedAt: new Date(),
          // Ensure consistent field names
          assigned_property_id: employee.assigned_property_id || employee.assignedProperty || null,
          assigned_room_name: employee.assigned_room_name || employee.roomNumber || null,
          // Keep legacy fields for backward compatibility
          assignedProperty: employee.assignedProperty || employee.assigned_property_id || null,
          roomNumber: employee.roomNumber || employee.assigned_room_name || null
        });
        
        updatedCount++;
      }
    }
    
    console.log('\n✅ Employee status fix completed!');
    console.log(`📈 Updated ${updatedCount} employees:`);
    console.log(`   🏠 housed (已入住): ${statusChanges.housed}`);
    console.log(`   ⏳ pending (未入住): ${statusChanges.pending}`);
    console.log(`   📋 pending_assignment (待分配): ${statusChanges.pending_assignment}`);
    console.log(`   🚪 departed (已離開): ${statusChanges.departed}`);
    
    // Verify the fix by counting final status distribution
    console.log('\n🔍 Final status distribution:');
    const finalEmployeesSnapshot = await getDocs(employeesRef);
    const finalEmployees = finalEmployeesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    const finalCounts = {
      housed: 0,
      pending: 0,
      pending_assignment: 0,
      departed: 0,
      other: 0
    };
    
    finalEmployees.forEach(emp => {
      if (finalCounts[emp.status] !== undefined) {
        finalCounts[emp.status]++;
      } else {
        finalCounts.other++;
      }
    });
    
    console.log(`   🏠 housed (已入住): ${finalCounts.housed}`);
    console.log(`   ⏳ pending (未入住): ${finalCounts.pending}`);
    console.log(`   📋 pending_assignment (待分配): ${finalCounts.pending_assignment}`);
    console.log(`   🚪 departed (已離開): ${finalCounts.departed}`);
    console.log(`   ❓ other: ${finalCounts.other}`);
    
  } catch (error) {
    console.error('❌ Error fixing employee status:', error);
  }
}

// Run the fix
fixEmployeeStatus(); 