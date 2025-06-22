const admin = require('firebase-admin');

// Initialize Firebase Admin
if (!admin.apps.length) {
  const serviceAccount = require('../serviceAccountKey.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

async function fixPropertiesFields() {
  try {
    console.log('🔧 Starting properties field fix...');
    
    // Get all properties
    const propertiesRef = db.collection('properties');
    const snapshot = await propertiesRef.get();
    
    if (snapshot.empty) {
      console.log('No properties found in database');
      return;
    }
    
    console.log(`Found ${snapshot.size} properties to check`);
    
    let updatedCount = 0;
    const batch = db.batch();
    
    snapshot.forEach((doc) => {
      const data = doc.data();
      const updates = {};
      let needsUpdate = false;
      
      console.log(`\n📋 Checking property: ${data.name || doc.id}`);
      
      // Fix 1: Ensure genderTypes is an array
      if (typeof data.genderTypes === 'string') {
        updates.genderTypes = [data.genderTypes];
        needsUpdate = true;
        console.log(`  ✅ Converting genderTypes from string "${data.genderTypes}" to array`);
      } else if (!data.genderTypes && data.target_gender_type) {
        updates.genderTypes = [data.target_gender_type];
        needsUpdate = true;
        console.log(`  ✅ Creating genderTypes array from target_gender_type: "${data.target_gender_type}"`);
      } else if (!Array.isArray(data.genderTypes)) {
        updates.genderTypes = [];
        needsUpdate = true;
        console.log(`  ✅ Setting genderTypes to empty array (was ${typeof data.genderTypes})`);
      }
      
      // Fix 2: Ensure cost field exists (default to 800 if missing)
      if (data.cost === undefined || data.cost === null) {
        updates.cost = 800;
        needsUpdate = true;
        console.log(`  ✅ Adding missing cost field (set to 800)`);
      } else if (typeof data.cost === 'string') {
        updates.cost = parseFloat(data.cost) || 800;
        needsUpdate = true;
        console.log(`  ✅ Converting cost from string "${data.cost}" to number ${updates.cost}`);
      }
      
      // Fix 3: Ensure capacity field exists
      if (data.capacity === undefined || data.capacity === null) {
        updates.capacity = 10;
        needsUpdate = true;
        console.log(`  ✅ Adding missing capacity field (set to 10)`);
      } else if (typeof data.capacity === 'string') {
        updates.capacity = parseInt(data.capacity) || 10;
        needsUpdate = true;
        console.log(`  ✅ Converting capacity from string "${data.capacity}" to number ${updates.capacity}`);
      }
      
      // Fix 4: Ensure occupancy field exists
      if (data.occupancy === undefined || data.occupancy === null) {
        updates.occupancy = 0;
        needsUpdate = true;
        console.log(`  ✅ Adding missing occupancy field (set to 0)`);
      }
      
      // Fix 5: Ensure status field exists
      if (!data.status) {
        updates.status = 'Available';
        needsUpdate = true;
        console.log(`  ✅ Adding missing status field (set to "Available")`);
      }
      
      // Fix 6: Add updatedAt timestamp
      if (needsUpdate) {
        updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();
      }
      
      if (needsUpdate) {
        batch.update(doc.ref, updates);
        updatedCount++;
        console.log(`  🔄 Property will be updated`);
      } else {
        console.log(`  ✅ Property is already correct`);
      }
    });
    
    if (updatedCount > 0) {
      console.log(`\n💾 Committing batch update for ${updatedCount} properties...`);
      await batch.commit();
      console.log(`✅ Successfully updated ${updatedCount} properties!`);
    } else {
      console.log(`\n✅ All properties are already correct. No updates needed.`);
    }
    
    // Verification: Re-fetch and display summary
    console.log('\n📊 Final verification:');
    const verificationSnapshot = await propertiesRef.get();
    let totalCost = 0;
    let propertiesWithCost = 0;
    
    verificationSnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.cost && typeof data.cost === 'number') {
        totalCost += data.cost;
        propertiesWithCost++;
      }
      console.log(`  - ${data.name || doc.id}: cost=${data.cost}, genderTypes=${JSON.stringify(data.genderTypes)}`);
    });
    
    console.log(`\n📈 Summary:`);
    console.log(`  - Total properties: ${verificationSnapshot.size}`);
    console.log(`  - Properties with cost field: ${propertiesWithCost}`);
    console.log(`  - Total monthly cost: $${totalCost}`);
    console.log(`  - Average cost per property: $${propertiesWithCost > 0 ? (totalCost / propertiesWithCost).toFixed(2) : 0}`);
    
  } catch (error) {
    console.error('❌ Error fixing properties fields:', error);
  }
}

// Run the script
fixPropertiesFields().then(() => {
  console.log('\n🎉 Properties field fix completed!');
  process.exit(0);
}).catch((error) => {
  console.error('❌ Script failed:', error);
  process.exit(1);
}); 