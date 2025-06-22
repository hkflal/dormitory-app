const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, writeBatch, doc } = require('firebase/firestore');

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDPbwDZ2a0cgbRoRZiuoO2Ywh5vq4xKGFo",
  authDomain: "dormitory-management-6c1a5.firebaseapp.com",
  projectId: "dormitory-management-6c1a5",
  storageBucket: "dormitory-management-6c1a5.appspot.com",
  messagingSenderId: "600480501319",
  appId: "1:600480501319:web:eb1350c03dbcba3cbeeb62"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function fixArrivalTimes() {
  console.log('Starting script to fix employee arrival times...');
  const employeesRef = collection(db, 'employees');
  const batch = writeBatch(db);
  let updatedCount = 0;

  try {
    const snapshot = await getDocs(employeesRef);
    console.log(`Found ${snapshot.docs.length} employee documents.`);

    snapshot.forEach(document => {
      const employee = document.data();
      const employeeId = document.id;

      if (employee.arrival_time && typeof employee.arrival_time === 'string') {
        const date = new Date(employee.arrival_time);
        
        // Check if the parsed date is valid
        if (!isNaN(date.getTime())) {
          console.log(`Updating employee ${employeeId}: converting arrival_time "${employee.arrival_time}" to timestamp.`);
          const docRef = doc(db, 'employees', employeeId);
          batch.update(docRef, { arrival_time: date });
          updatedCount++;
        } else {
          console.warn(`Skipping employee ${employeeId}: invalid date string "${employee.arrival_time}".`);
        }
      }
    });

    if (updatedCount > 0) {
      console.log(`Committing batch update for ${updatedCount} documents...`);
      await batch.commit();
      console.log('Successfully updated all employee arrival times.');
    } else {
      console.log('No employees needed an update. All arrival times seem to be in the correct format.');
    }
  } catch (error) {
    console.error('An error occurred while fixing arrival times:', error);
  } finally {
    console.log('Script finished.');
  }
}

fixArrivalTimes(); 