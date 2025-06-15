const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = require('../serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

// Function to calculate frequency based on date difference
function calculateFrequency(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = Math.abs(end - start);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  // Round to nearest common frequency
  if (diffDays <= 45) {
    return 1; // Monthly
  } else if (diffDays <= 135) {
    return 3; // Quarterly
  } else {
    return Math.round(diffDays / 30); // Custom frequency in months
  }
}

// Function to count employees
function calculateNEmployees(employeeNames) {
  if (!employeeNames || !Array.isArray(employeeNames)) {
    return 0;
  }
  return employeeNames.filter(name => name && name.trim().length > 0).length;
}

async function addComputedFields() {
  console.log('🔄 Adding computed fields to existing invoices...');
  
  try {
    const invoicesSnapshot = await db.collection('invoices').get();
    
    if (invoicesSnapshot.empty) {
      console.log('❌ No invoices found in database');
      return;
    }
    
    console.log(`📊 Found ${invoicesSnapshot.size} invoices to update`);
    
    const batch = db.batch();
    let updateCount = 0;
    
    invoicesSnapshot.forEach(doc => {
      const data = doc.data();
      
      // Calculate frequency
      let frequency = 1; // Default to monthly
      if (data.start_date && data.end_date) {
        const startDate = data.start_date.toDate ? data.start_date.toDate() : new Date(data.start_date);
        const endDate = data.end_date.toDate ? data.end_date.toDate() : new Date(data.end_date);
        frequency = calculateFrequency(startDate, endDate);
      }
      
      // Calculate n_employees
      const nEmployees = calculateNEmployees(data.employee_names);
      
      // Update the document
      batch.update(doc.ref, {
        frequency: frequency,
        n_employees: nEmployees,
        computed_fields_added: new Date() // Timestamp for tracking
      });
      
      updateCount++;
      
      console.log(`  📄 ${data.invoice_number || doc.id}: frequency=${frequency}, n_employees=${nEmployees}`);
    });
    
    await batch.commit();
    console.log(`✅ Successfully updated ${updateCount} invoices with computed fields`);
    
  } catch (error) {
    console.error('❌ Error adding computed fields:', error);
  }
}

// Run the script
addComputedFields().then(() => {
  console.log('\n✅ Script completed');
  process.exit(0);
}).catch(error => {
  console.error('❌ Script failed:', error);
  process.exit(1);
}); 