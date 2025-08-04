const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json'); // Update this path if needed

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function fixEmployeeCompany() {
  console.log('Starting to fix employee company names...');

  const employeesRef = db.collection('employees');
  const snapshot = await employeesRef.where('company', '==', '未知公司').get();

  if (snapshot.empty) {
    console.log('No employees with "未知公司" found.');
    return;
  }

  const batch = db.batch();
  snapshot.docs.forEach(doc => {
    console.log(`Updating employee ${doc.id} (${doc.data().name})`);
    const docRef = employeesRef.doc(doc.id);
    batch.update(docRef, { company: '' });
  });

  await batch.commit();

  console.log(`Successfully updated ${snapshot.size} employees.`);
}

fixEmployeeCompany().catch(console.error); 