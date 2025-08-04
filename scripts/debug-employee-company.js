const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function debugEmployeeCompany() {
  console.log('Debugging employee company names...');

  console.log('\nFetching employees with company == "未知公司":');
  const querySnapshot = await db.collection('employees').where('company', '==', '未知公司').limit(5).get();
  if (querySnapshot.empty) {
    console.log('==> No employees found with exact match.');
  } else {
    querySnapshot.forEach(doc => {
      console.log(`==> Found: ${doc.id}, Company: "${doc.data().company}"`);
    });
  }

  console.log('\nFetching a few employees to check their company field:');
  const allEmployeesSnapshot = await db.collection('employees').limit(10).get();
  allEmployeesSnapshot.forEach(doc => {
    console.log(`==> All Employee Sample: ${doc.id}, Company: "${doc.data().company}"`);
  });
  
    console.log('\nFetching one employee who should have "未知公司" based on backups:');
    const specificEmployee = await db.collection('employees').doc('ADJ0004C').get();
    if(specificEmployee.exists){
        console.log(`==> Specific Employee: ${specificEmployee.id}, Company: "${specificEmployee.data().company}"`)
    } else {
        console.log('==> Specific employee ADJ0004C not found.');
    }
}

debugEmployeeCompany().catch(console.error); 