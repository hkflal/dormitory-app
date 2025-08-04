const functions = require('firebase-functions');
const admin = require('firebase-admin');

/**
 * UPDATED STATUS LOGIC with resignation support:
 * 
 * 1. "housed" (已入住) - Employee is assigned to a property AND has arrived (arrival_time <= today)
 * 2. "pending" (未入住) - Employee is assigned to a property BUT arrival_time > today OR no arrival_time
 * 3. "pending_assignment" (待分配) - Employee is NOT assigned to any property
 * 4. "terminated" (已終止) - Employee has been terminated (legacy status)
 * 5. "pending_resign" (即將離職) - Employee will leave on a specific departure date
 * 6. "resigned" (已離職) - Employee has already left
 */
async function checkAndUpdateEmployeeStatuses() {
  const db = admin.firestore();
  try {
    console.log('🔄 Starting employee status check and update...');
    
    // Fetch all employees
    const employeesRef = db.collection('employees');
    const employeesSnapshot = await employeesRef.get();
    const employees = employeesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    console.log(`📊 Found ${employees.length} employees to process`);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set to start of day for comparison
    
    let updatedCount = 0;
    const statusChanges = {
      housed: 0,
      pending: 0,
      pending_assignment: 0,
      terminated: 0,
      pending_resign: 0,
      resigned: 0
    };
    
    const resignationTransitions = [];
    const batch = db.batch();

    for (const employee of employees) {
      // Skip employees already resigned
      if (employee.status === 'resigned') {
        continue;
      }

      let newStatus = null;
      let updateData = { updatedAt: new Date() };
      
      // PRIORITY 1: Check for resignation transitions (pending_resign → resigned)
      if (employee.status === 'pending_resign' && employee.departure_date) {
        const departureDate = employee.departure_date.toDate ? 
          employee.departure_date.toDate() : new Date(employee.departure_date);
        departureDate.setHours(0, 0, 0, 0);
        
        if (departureDate <= today) {
          newStatus = 'resigned';
          updateData.status = 'resigned';
          updateData.actual_departure_date = employee.actual_departure_date || departureDate;
          
          resignationTransitions.push({
            employeeId: employee.id,
            employeeName: employee.name || employee.firstName || 'Unknown',
            departureDate: departureDate
          });
          
          statusChanges.resigned++;
          updatedCount++;
        } else {
          // Still pending resignation
          continue;
        }
      }
      // PRIORITY 2: Standard status logic for non-resignation statuses
      else if (employee.status !== 'pending_resign' && employee.status !== 'terminated') {
        // Check if employee is assigned to a property
        const hasPropertyAssignment = employee.assigned_property_id && employee.assigned_property_id !== '';
        
        // Parse arrival time (check both arrival_at and arrival_time for compatibility)
        let arrivalDate = null;
        const arrivalField = employee.arrival_at || employee.arrival_time;
        if (arrivalField) {
          if (arrivalField.seconds) {
            // Firestore Timestamp
            arrivalDate = new Date(arrivalField.seconds * 1000);
          } else if (typeof arrivalField === 'string') {
            arrivalDate = new Date(arrivalField);
          } else if (arrivalField instanceof Date) {
            arrivalDate = arrivalField;
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
          statusChanges[newStatus]++;
          updateData.status = newStatus;
          updatedCount++;
        } else {
          // No update needed
          continue;
        }
      } else {
        // Skip terminated employees and other special cases
        continue;
      }
      
      // Apply the update
      if (newStatus) {
        console.log(`👤 ${employee.name || employee.firstName || 'Unknown'}: ${employee.status || 'undefined'} → ${newStatus}`);
        
        const employeeRef = db.collection('employees').doc(employee.id);
        batch.update(employeeRef, updateData);
      }
    }
    
    if (updatedCount > 0) {
      await batch.commit();
      console.log('\n✅ Employee status update completed!');
      console.log(`📈 Updated ${updatedCount} employees:`);
      console.log(`   🏠 housed (已入住): ${statusChanges.housed}`);
      console.log(`   ⏳ pending (未入住): ${statusChanges.pending}`);
      console.log(`   📋 pending_assignment (待分配): ${statusChanges.pending_assignment}`);
      console.log(`   👋 resigned (已離職): ${statusChanges.resigned}`);
      
      // Log resignation transitions specifically
      if (resignationTransitions.length > 0) {
        console.log('\n📅 Resignation transitions:');
        resignationTransitions.forEach(transition => {
          console.log(`   👤 ${transition.employeeName} departed on ${transition.departureDate.toLocaleDateString('zh-TW')}`);
        });
      }
    } else {
      console.log('\n✅ No employee statuses needed updating.');
    }
    
    return {
      success: true,
      updatedCount,
      statusChanges,
      resignationTransitions,
      message: `檢查完成，更新了 ${updatedCount} 個員工狀態`
    };
    
  } catch (error) {
    console.error('❌ Error updating employee statuses:', error);
    throw error;
  }
}

exports.scheduledEmployeeStatusUpdate = functions.pubsub
  .schedule('0 0 * * *') // Run daily at midnight (better for resignation transitions)
  .timeZone('Asia/Taipei')
  .onRun(async (context) => {
    console.log('Running scheduled employee status update...');
    const result = await checkAndUpdateEmployeeStatuses();
    console.log('Scheduled update result:', result);
    return result;
  });

// Export the status update function for manual use
exports.checkEmployeeStatuses = functions.https.onCall(async (data, context) => {
  console.log('Manual employee status check triggered...');
  const result = await checkAndUpdateEmployeeStatuses();
  return result;
});

// Legacy function name for backwards compatibility
exports.fixEmployeeStatus = functions.https.onCall(async (data, context) => {
  console.log('Legacy manual employee status fix triggered...');
  const result = await checkAndUpdateEmployeeStatuses();
  return result;
}); 