const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, query, where } = require('firebase/firestore');

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

async function checkSpecificEmployees() {
  const targetIds = ['EE-00089', 'EE-00090', 'EE-00091'];
  
  console.log('检查特定员工的数据状况...\n');
  
  for (const id of targetIds) {
    console.log(`=== 检查员工 ${id} ===`);
    
    try {
      const q = query(collection(db, 'employees'), where('employeeId', '==', id));
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        console.log('未找到该员工');
        continue;
      }
      
      snapshot.forEach(doc => {
        const data = doc.data();
        console.log(`文档ID: ${doc.id}`);
        console.log(`assigned_property_id: ${data.assigned_property_id}`);
        console.log(`assignedProperty: ${data.assignedProperty}`);
        console.log(`姓名: ${data.name}`);
        console.log(`状态: ${data.status}`);
        console.log(`部门: ${data.department}`);
        console.log(`公司: ${data.company}`);
        console.log('---');
      });
      
    } catch (error) {
      console.error(`检查员工 ${id} 时出错:`, error.message);
    }
    
    console.log('');
  }
  
  // 检查是否有重复的员工ID
  console.log('\n=== 检查员工ID重复情况 ===');
  for (const id of targetIds) {
    const q = query(collection(db, 'employees'), where('employeeId', '==', id));
    const snapshot = await getDocs(q);
    if (snapshot.size > 1) {
      console.log(`员工 ${id} 有 ${snapshot.size} 条重复记录！`);
    }
  }
}

checkSpecificEmployees()
  .then(() => {
    console.log('检查完成');
    process.exit(0);
  })
  .catch(error => {
    console.error('检查失败:', error);
    process.exit(1);
  });