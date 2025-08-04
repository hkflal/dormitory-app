const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://dormitory-management-6c1a5.firebaseio.com"
  });
}

const db = admin.firestore();

async function checkEmployeeIds() {
  console.log('🔍 检查员工ID字段...\n');
  
  try {
    const employeesSnapshot = await db.collection('employees').get();
    
    console.log('包含胡豔娟的员工:');
    employeesSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.name && data.name.includes('胡豔娟')) {
        console.log(`  文档ID: ${doc.id}`);
        console.log(`  员工ID: ${data.employeeId || '无'}`);
        console.log(`  姓名: ${data.name}`);
        console.log(`  assigned_property_id: ${data.assigned_property_id}`);
        console.log(`  assignedProperty: ${data.assignedProperty}`);
        console.log('');
      }
    });
    
    console.log('所有类似EE-00089的员工ID:');
    const targetIds = ['00089', '00090', '00091'];
    employeesSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.employeeId) {
        targetIds.forEach(id => {
          if (data.employeeId.includes(id)) {
            console.log(`  ${data.employeeId} (${data.name})`);
          }
        });
      }
    });
    
  } catch (error) {
    console.error('❌ 检查过程中出错:', error);
  }
}

checkEmployeeIds()
  .then(() => {
    console.log('🎉 检查完成');
    process.exit(0);
  })
  .catch(error => {
    console.error('💥 检查失败:', error);
    process.exit(1);
  });