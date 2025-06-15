import { useState } from 'react';
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import * as iconv from 'iconv-lite';

export default function SeedData() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const convertRoomNames = (roomsStr) => {
    if (!roomsStr) return [];
    
    const roomNames = roomsStr.split(',').map(name => name.trim());
    return roomNames.map(name => ({
      room_name: name, // Keep original: Room-A, Room-B, Room-C, Room-D
      capacity: 3, // Default capacity
      amenities: ['WiFi', 'Air Conditioning']
    }));
  };

  const seedData = async () => {
    setLoading(true);
    setMessage('开始导入真实数据...');

    try {
      // Clear existing data
      setMessage('清除现有数据...');
      const collections = ['properties', 'employees', 'contracts', 'invoices'];
      for (const collectionName of collections) {
        const snapshot = await getDocs(collection(db, collectionName));
        const deletePromises = snapshot.docs.map(docSnapshot => 
          deleteDoc(doc(db, collectionName, docSnapshot.id))
        );
        await Promise.all(deletePromises);
      }

      // Read and process property CSV
      setMessage('读取物业数据...');
      console.log('Attempting to fetch property CSV from:', '/csv/dormitory - property.csv');
      
      const propertyResponse = await fetch('/csv/dormitory - property.csv');
      console.log('Property response status:', propertyResponse.status);
      console.log('Property response ok:', propertyResponse.ok);
      
      if (!propertyResponse.ok) {
        throw new Error(`Failed to fetch property CSV: ${propertyResponse.status} ${propertyResponse.statusText}`);
      }
      
      const propertyArrayBuffer = await propertyResponse.arrayBuffer();
      const propertyBuffer = Buffer.from(propertyArrayBuffer);
      const propertyContent = iconv.decode(propertyBuffer, 'gb2312');
      
      console.log('Raw property content length:', propertyContent.length);
      console.log('First 200 chars of property content:', propertyContent.substring(0, 200));
      
      const allPropertyLines = propertyContent.split('\n');
      console.log('Total property lines:', allPropertyLines.length);
      
      const propertyLines = allPropertyLines.slice(1).filter(line => {
        const cols = line.split(',');
        const hasData = cols[0] && cols[0].trim() && cols[0] !== 'property' && cols[0].trim() !== '';
        console.log('Property line check:', cols[0]?.trim(), 'hasData:', hasData);
        return hasData;
      });

      console.log('Filtered property lines:', propertyLines.length);
      setMessage(`找到 ${propertyLines.length} 个物业数据 (预期15个)`);

      if (propertyLines.length === 0) {
        console.error('No valid property lines found!');
        console.log('First few lines:', allPropertyLines.slice(0, 5));
        throw new Error('No valid property data found in CSV file');
      }

      // Process properties - should be exactly 15
      setMessage('处理物业数据...');
      const propertyDocs = [];
      for (let i = 0; i < propertyLines.length; i++) {
        const line = propertyLines[i];
        const cols = line.split(',');
        console.log(`Processing property ${i + 1}:`, cols[0]?.trim(), 'columns:', cols.length);
        
        if (cols.length >= 6 && cols[0].trim()) {
          const rooms = convertRoomNames(cols[5]);
          const capacity = parseInt(cols[4]) || rooms.length * 3;
          
          const propertyData = {
            name: cols[0].trim(),
            address: cols[1].trim(),
            location: cols[1].trim().split(' ')[0] || '香港',
            target_gender_type: cols[3].trim() || 'any',
            genderTypes: cols[3].trim() === 'male' ? ['Male'] : 
                        cols[3].trim() === 'female' ? ['Female'] : 
                        ['Male', 'Female'],
            capacity: capacity,
            occupancy: 0,
            totalRooms: rooms.length,
            occupiedRooms: 0,
            rooms: rooms,
            monthlyRent: 3500, // Fixed rent per employee
            status: 'active', // lowercase for consistency
            expectedDate: cols[7]?.trim() || '2025-06-21',
            amenities: ['WiFi', 'Laundry'],
            remarks: cols[8] ? cols[8].trim() : '',
            cost: parseInt(cols[10]) || 18000, // Property cost from CSV
            createdAt: new Date(),
            updatedAt: new Date()
          };
          
          console.log(`Creating property ${i + 1}: ${propertyData.name} with ${propertyData.capacity} capacity`);
          const docRef = await addDoc(collection(db, 'properties'), propertyData);
          propertyDocs.push({ id: docRef.id, ...propertyData });
          
          setMessage(`已处理物业 ${i + 1}/${propertyLines.length}: ${propertyData.name}`);
        } else {
          console.log(`Skipping invalid property line ${i + 1}:`, line);
        }
      }

      // Read and process employee CSV
      setMessage('读取员工数据...');
      console.log('Attempting to fetch employee CSV from:', '/csv/dormitory - employee.csv');
      
      const employeeResponse = await fetch('/csv/dormitory - employee.csv');
      console.log('Employee response status:', employeeResponse.status);
      console.log('Employee response ok:', employeeResponse.ok);
      
      if (!employeeResponse.ok) {
        throw new Error(`Failed to fetch employee CSV: ${employeeResponse.status} ${employeeResponse.statusText}`);
      }
      
      const employeeArrayBuffer = await employeeResponse.arrayBuffer();
      const employeeBuffer = Buffer.from(employeeArrayBuffer);
      const employeeContent = iconv.decode(employeeBuffer, 'gb2312');
      
      console.log('Raw employee content length:', employeeContent.length);
      console.log('First 200 chars of employee content:', employeeContent.substring(0, 200));
      
      const employeeLines = employeeContent.split('\n').slice(1).filter(line => {
        const cols = line.split(',');
        return cols[0] && cols[0].trim() && cols[0] !== 'employee';
      });

      console.log('Filtered employee lines:', employeeLines.length);
      setMessage(`找到 ${employeeLines.length} 个员工数据`);

      if (employeeLines.length === 0) {
        console.error('No valid employee lines found!');
        throw new Error('No valid employee data found in CSV file');
      }

      // Process employees based on real CSV assignment data
      setMessage('处理员工数据...');
      const employeeDocs = [];
      for (const line of employeeLines) {
        const cols = line.split(',');
        if (cols.length >= 4 && cols[0].trim()) {
          const assignedProperty = cols[6] ? cols[6].trim() : null;
          const isAssigned = assignedProperty && assignedProperty !== '' && assignedProperty !== 'not assigned';
          
          // Find matching property
          let propertyMatch = null;
          let roomAssignment = null;
          
          if (isAssigned) {
            propertyMatch = propertyDocs.find(prop => prop.name === assignedProperty);
            if (propertyMatch && propertyMatch.rooms.length > 0) {
              const randomRoom = propertyMatch.rooms[Math.floor(Math.random() * propertyMatch.rooms.length)];
              roomAssignment = randomRoom.room_name;
            }
          }

          const employeeData = {
            name: cols[0].trim(),
            company: cols[1].trim() || '未知公司',
            gender: cols[3].trim() || 'male',
            preference: cols[4] ? cols[4].trim() : '',
            remarks: cols[5] ? cols[5].trim() : '',
            assigned_property_id: propertyMatch ? propertyMatch.id : null,
            assignedProperty: isAssigned ? assignedProperty : null,
            assigned_room_name: roomAssignment,
            roomNumber: roomAssignment,
            status: isAssigned ? 'housed' : 'pending_assignment',
            monthlyRent: 3500, // Fixed rate
            rentStatus: isAssigned ? 'Current' : 'Pending',
            arrival_time: new Date(),
            arrivalDate: new Date().toISOString().split('T')[0],
            checkInDate: isAssigned ? new Date().toISOString().split('T')[0] : null,
            contractNumber: null,
            billingPeriod: null,
            createdAt: new Date(),
            updatedAt: new Date()
          };
          
          const docRef = await addDoc(collection(db, 'employees'), employeeData);
          employeeDocs.push({ id: docRef.id, ...employeeData });

          // Update property occupancy
          if (propertyMatch) {
            propertyMatch.occupancy = (propertyMatch.occupancy || 0) + 1;
            propertyMatch.occupiedRooms = Math.min(propertyMatch.occupiedRooms + 1, propertyMatch.totalRooms);
          }
        }
      }

      // Update property occupancy in database
      setMessage('更新物业入住率...');
      for (const property of propertyDocs) {
        const propertyRef = doc(db, 'properties', property.id);
        await updateDoc(propertyRef, {
          occupancy: property.occupancy || 0,
          occupiedRooms: property.occupiedRooms || 0
        });
      }

      // Generate realistic contracts and invoices
      setMessage('生成合约和发票...');
      const assignedEmployees = employeeDocs.filter(emp => emp.status === 'housed');
      const companiesMap = {};
      
      assignedEmployees.forEach(emp => {
        if (!companiesMap[emp.company]) {
          companiesMap[emp.company] = [];
        }
        companiesMap[emp.company].push(emp);
      });

      const contracts = [];
      let contractCounter = 136;
      
      for (const [company, employees] of Object.entries(companiesMap)) {
        if (employees.length === 0) continue;
        
        const contractNumber = `D${contractCounter}`;
        contractCounter += 6;
        
        const contract = {
          contractNumber: contractNumber,
          company: company,
          employees: employees.map(emp => ({
            id: emp.id,
            name: emp.name,
            monthlyRent: 3500
          })),
          billingPeriod: 'monthly',
          monthlyRate: 3500,
          totalEmployees: employees.length,
          monthlyTotal: employees.length * 3500,
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-12-31'),
          status: 'active',
          createdAt: new Date()
        };
        
        const contractDoc = await addDoc(collection(db, 'contracts'), contract);
        contracts.push({ id: contractDoc.id, ...contract });
        
        // Update employees with contract info
        for (const employee of employees) {
          const empRef = doc(db, 'employees', employee.id);
          await updateDoc(empRef, {
            contractNumber: contractNumber,
            billingPeriod: 'monthly'
          });
        }
      }

      // Generate invoices
      for (const contract of contracts) {
        for (let i = 0; i < 3; i++) {
          const invoice = {
            invoice_number: `INV-${contract.contractNumber}-Z${String(i + 1).padStart(3, '0')}`,
            contract_id: contract.id,
            contractNumber: contract.contractNumber,
            company: contract.company,
            employee_count: contract.employees.length,
            billingPeriod: contract.billingPeriod,
            amount: contract.monthlyTotal,
            billing_date: new Date(2024, i * 2, 1),
            due_date: new Date(2024, i * 2, 30),
            status: Math.random() > 0.3 ? 'paid' : 'pending',
            employee_names: contract.employees.map(emp => emp.name).join(', '),
            createdAt: new Date()
          };
          
          await addDoc(collection(db, 'invoices'), invoice);
        }
      }

      setMessage(`✅ 真实数据导入完成！
        📊 统计信息:
        - 物业: ${propertyDocs.length}个 (应为15个)
        - 员工: ${employeeDocs.length}人
        - 已分配员工: ${assignedEmployees.length}人
        - 待分配员工: ${employeeDocs.length - assignedEmployees.length}人
        - 合约: ${contracts.length}份
        - 发票: ${contracts.length * 3}张
        
        🏢 物业统计:
        - 总容量: ${propertyDocs.reduce((sum, p) => sum + p.capacity, 0)}人
        - 当前入住: ${propertyDocs.reduce((sum, p) => sum + p.occupancy, 0)}人
        - 入住率: ${Math.round((propertyDocs.reduce((sum, p) => sum + p.occupancy, 0) / propertyDocs.reduce((sum, p) => sum + p.capacity, 0)) * 100)}%`);
        
    } catch (error) {
      console.error('Error seeding data:', error);
      setMessage(`❌ 导入失败: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">
          真实数据导入工具
        </h1>
        
        <div className="space-y-4">
          <p className="text-gray-600 dark:text-gray-400">
            此工具将从CSV文件导入真实数据，包括15个物业和217个员工的准确信息。
          </p>
          
          <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-md">
            <p className="text-yellow-800 dark:text-yellow-200 text-sm">
              ⚠️ 警告：此操作将清除所有现有数据并替换为CSV中的真实数据。
            </p>
          </div>
          
          <button
            onClick={seedData}
            disabled={loading}
            className="bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white px-6 py-3 rounded-md font-medium"
          >
            {loading ? '导入中...' : '导入真实数据'}
          </button>
          
          {message && (
            <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-md">
              <pre className="text-sm text-blue-800 dark:text-blue-200 whitespace-pre-wrap">
                {message}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}