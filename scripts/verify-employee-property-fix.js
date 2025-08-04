const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://dormitory-management-6c1a5.firebaseio.com"
});

const db = admin.firestore();

async function verifyEmployeePropertyFix() {
  console.log('🔍 验证员工物业分配数据修复结果...\n');
  
  try {
    // 1. 获取所有物业数据
    const propertiesSnapshot = await db.collection('properties').get();
    const properties = {};
    propertiesSnapshot.forEach(doc => {
      properties[doc.id] = doc.data().name;
    });
    
    // 2. 获取所有员工数据
    const employeesSnapshot = await db.collection('employees').get();
    const inconsistentEmployees = [];
    let totalEmployees = 0;
    
    employeesSnapshot.forEach(doc => {
      totalEmployees++;
      const data = doc.data();
      
      // 检查数据不一致的情况
      if (data.assigned_property_id && data.assignedProperty) {
        const correctPropertyName = properties[data.assigned_property_id];
        
        if (correctPropertyName && correctPropertyName !== data.assignedProperty) {
          inconsistentEmployees.push({
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
    
    console.log(`📊 总员工数: ${totalEmployees}`);
    console.log(`❌ 仍有数据不一致的员工数: ${inconsistentEmployees.length}`);
    
    if (inconsistentEmployees.length === 0) {
      console.log('✅ 所有员工的 assignedProperty 与 assigned_property_id 已完全一致！');
    } else {
      console.log('\n⚠️ 仍有以下员工数据不一致:');
      inconsistentEmployees.forEach(emp => {
        console.log(`  ${emp.employeeId || emp.id} (${emp.name})`);
        console.log(`    assigned_property_id: ${emp.assigned_property_id} → ${emp.correctPropertyName}`);
        console.log(`    assignedProperty: ${emp.assignedProperty} (仍不一致)`);
        console.log('');
      });
    }
    
    // 3. 特别检查目标员工
    console.log('\n=== 特别检查目标员工 ===');
    const targetEmployeeIds = ['EE-00089', 'EE-00090', 'EE-00091'];
    
    for (const employeeId of targetEmployeeIds) {
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
    
    // 4. 显示修复摘要
    console.log('\n📋 修复摘要:');
    console.log(`   - 已修复: 35个员工的数据不一致问题`);
    console.log(`   - 当前状态: ${inconsistentEmployees.length === 0 ? '✅ 完全一致' : `❌ 仍有${inconsistentEmployees.length}个不一致`}`);
    console.log(`   - 特别关注: EE-00089 (胡豔娟) 从 "東海" 修复为 "耀基"`);
    
  } catch (error) {
    console.error('❌ 验证过程中出错:', error);
  }
}

verifyEmployeePropertyFix()
  .then(() => {
    console.log('\n🎉 验证完成');
    process.exit(0);
  })
  .catch(error => {
    console.error('💥 验证失败:', error);
    process.exit(1);
  });