const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, doc, updateDoc, writeBatch } = require('firebase/firestore');

// Initialize Firebase (you'll need to set your config)
const firebaseConfig = {
  // Add your Firebase config here
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function fixAssignedPropertyData() {
  console.log('🔧 Starting assigned property data fix...');
  
  try {
    // Get all employees and properties
    const [employeesSnapshot, propertiesSnapshot] = await Promise.all([
      getDocs(collection(db, 'employees')),
      getDocs(collection(db, 'properties'))
    ]);

    const employees = employeesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const properties = propertiesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    console.log(`📊 Found ${employees.length} employees and ${properties.length} properties`);

    // Create property name to ID mapping
    const propertyNameToId = {};
    properties.forEach(prop => {
      if (prop.name) {
        propertyNameToId[prop.name] = prop.id;
      }
    });

    console.log('🗺️ Property name to ID mapping:', propertyNameToId);

    let fixedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    // Process employees in batches
    const batch = writeBatch(db);
    const batchSize = 500;
    let batchCount = 0;

    for (const employee of employees) {
      try {
        const updates = {};
        let needsUpdate = false;

        // Case 1: Has assignedProperty but no assigned_property_id
        if (employee.assignedProperty && !employee.assigned_property_id) {
          const propertyId = propertyNameToId[employee.assignedProperty];
          if (propertyId) {
            updates.assigned_property_id = propertyId;
            needsUpdate = true;
            console.log(`✅ ${employee.name || employee.id}: ${employee.assignedProperty} → ${propertyId}`);
          } else {
            console.warn(`⚠️ ${employee.name || employee.id}: Property '${employee.assignedProperty}' not found`);
          }
        }

        // Case 2: Has assigned_property_id but no assignedProperty (auto-fill)
        if (employee.assigned_property_id && !employee.assignedProperty) {
          const property = properties.find(p => p.id === employee.assigned_property_id);
          if (property && property.name) {
            updates.assignedProperty = property.name;
            needsUpdate = true;
            console.log(`🔄 ${employee.name || employee.id}: ${employee.assigned_property_id} → ${property.name}`);
          }
        }

        // Case 3: Both exist but inconsistent
        if (employee.assigned_property_id && employee.assignedProperty) {
          const property = properties.find(p => p.id === employee.assigned_property_id);
          if (property && property.name !== employee.assignedProperty) {
            updates.assignedProperty = property.name;
            needsUpdate = true;
            console.log(`🔧 ${employee.name || employee.id}: Fixed inconsistency ${employee.assignedProperty} → ${property.name}`);
          }
        }

        if (needsUpdate) {
          const employeeRef = doc(db, 'employees', employee.id);
          batch.update(employeeRef, {
            ...updates,
            updatedAt: new Date()
          });
          
          fixedCount++;
          batchCount++;

          // Execute batch when it reaches the limit
          if (batchCount >= batchSize) {
            await batch.commit();
            console.log(`📦 Batch committed: ${batchCount} updates`);
            batchCount = 0;
          }
        } else {
          skippedCount++;
        }

      } catch (error) {
        console.error(`❌ Error processing employee ${employee.id}:`, error);
        errorCount++;
      }
    }

    // Commit remaining batch
    if (batchCount > 0) {
      await batch.commit();
      console.log(`📦 Final batch committed: ${batchCount} updates`);
    }

    console.log('✅ Data fix completed!');
    console.log(`📊 Summary:`);
    console.log(`   - Fixed: ${fixedCount}`);
    console.log(`   - Skipped: ${skippedCount}`);
    console.log(`   - Errors: ${errorCount}`);

  } catch (error) {
    console.error('❌ Failed to fix data:', error);
  }
}

// Run the fix
fixAssignedPropertyData().then(() => {
  console.log('🎉 Script completed');
}).catch(error => {
  console.error('💥 Script failed:', error);
});