const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: "AIzaSyDPbwDZ2a0cgbRoRZiuoO2Ywh5vq4xKGFo",
  authDomain: "dormitory-management-6c1a5.firebaseapp.com",
  projectId: "dormitory-management-6c1a5",
  storageBucket: "dormitory-management-6c1a5.firebasestorage.app",
  messagingSenderId: "600480501319",
  appId: "1:600480501319:web:eb1350c03dbcba3cbeeb62"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkEmployees() {
  try {
    const snapshot = await getDocs(collection(db, 'employees'));
    console.log('Total employees in database:', snapshot.size);
    
    if (snapshot.size > 0) {
      console.log('\nFirst 10 employees:');
      snapshot.docs.slice(0, 10).forEach((doc, index) => {
        const data = doc.data();
        console.log(`${index + 1}. ${data.name || 'No name'} (ID: ${doc.id})`);
      });
    } else {
      console.log('No employees found in database.');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkEmployees(); 