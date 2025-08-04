const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://dormitory-management-6c1a5.firebaseio.com"
});

const db = admin.firestore();

async function fixEmployeePropertyAssignments() {
  console.log('开始修复员工物业分配数据不一致问题...\n');
  
  try {
    // 1. 获取所有物业数据
    const propertiesSnapshot = await db.collection('properties').get();
    const properties = {};
    propertiesSnapshot.forEach(doc => {
      properties[doc.id] = doc.data().name;
    });
    
    console.log('物业列表:');
    Object.entries(properties).forEach(([id, name]) => {
      console.log(`  ${id}: ${name}`);
    });
    console.log('');
    
    // 2. 获取所有员工数据
    const employeesSnapshot = await db.collection('employees').get();
    const problemEmployees = [];
    let totalEmployees = 0;
    
    employeesSnapshot.forEach(doc => {
      totalEmployees++;
      const data = doc.data();
      
      // 检查数据不一致的情况
      if (data.assigned_property_id && data.assignedProperty) {
        const correctPropertyName = properties[data.assigned_property_id];
        
        if (correctPropertyName && correctPropertyName !== data.assignedProperty) {
          problemEmployees.push({
            id: doc.id,
            employeeId: data.employeeId,
            name: data.name,
            assigned_property_id: data.assigned_property_id,
            assignedProperty: data.assignedProperty,
            correctPropertyName: correctPropertyName
          });
        }
      }
    });
    
    console.log(`总员工数: ${totalEmployees}`);
    console.log(`发现数据不一致的员工数: ${problemEmployees.length}\n`);
    
    if (problemEmployees.length === 0) {
      console.log('✅ 没有发现数据不一致的问题');
      return;
    }
    
    // 3. 显示问题员工
    console.log('发现以下数据不一致的员工:');
    problemEmployees.forEach(emp => {
      console.log(`  ${emp.employeeId || emp.id} (${emp.name})`);
      console.log(`    assigned_property_id: ${emp.assigned_property_id} → ${emp.correctPropertyName}`);
      console.log(`    assignedProperty: ${emp.assignedProperty} (不一致)`);
      console.log('');
    });
    
    // 4. 修复数据
    console.log('开始修复数据...\n');
    let fixedCount = 0;
    
    for (const emp of problemEmployees) {
      try {
        // 更新 assignedProperty 字段，使其与 assigned_property_id 对应的物业名称一致
        await db.collection('employees').doc(emp.id).update({
          assignedProperty: emp.correctPropertyName
        });
        
        console.log(`✅ 修复 ${emp.employeeId || emp.id} (${emp.name}): ${emp.assignedProperty} → ${emp.correctPropertyName}`);
        fixedCount++;
      } catch (error) {
        console.error(`❌ 修复 ${emp.employeeId || emp.id} 失败:`, error.message);
      }
    }
    
    console.log(`\n✅ 修复完成! 成功修复 ${fixedCount}/${problemEmployees.length} 个员工的数据`);
    
    // 5. 特别检查目标员工
    console.log('\n=== 特别检查目标员工 ===');
    const targetEmployees = ['EE-00089', 'EE-00090', 'EE-00091'];
    
    for (const employeeId of targetEmployees) {
      const snapshot = await db.collection('employees').where('employeeId', '==', employeeId).get();
      
      if (snapshot.empty) {
        console.log(`❌ 未找到员工: ${employeeId}`);
        continue;
      }
      
      snapshot.forEach(doc => {
        const data = doc.data();
        const propertyName = properties[data.assigned_property_id];
        console.log(`${employeeId} (${data.name}):`);
        console.log(`  assigned_property_id: ${data.assigned_property_id} → ${propertyName}`);
        console.log(`  assignedProperty: ${data.assignedProperty}`);
        console.log(`  状态: ${propertyName === data.assignedProperty ? '✅ 一致' : '❌ 不一致'}`);
        console.log('');
      });
    }
    
  } catch (error) {
    console.error('修复过程中出错:', error);
  }
}

fixEmployeePropertyAssignments()
  .then(() => {
    console.log('脚本执行完成');
    process.exit(0);
  })
  .catch(error => {
    console.error('脚本执行失败:', error);
    process.exit(1);
  });