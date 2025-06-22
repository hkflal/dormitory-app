import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs } from 'firebase/firestore';

// Firebase configuration (use your actual config)
const firebaseConfig = {
  // Your config here
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function seedEmployeesWithCorrectStatus() {
  try {
    console.log('🌱 Seeding employees with correct status logic...');
    
    // Fetch existing properties
    const propertiesRef = collection(db, 'properties');
    const propertiesSnapshot = await getDocs(propertiesRef);
    const properties = propertiesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    const today = new Date();
    const futureDate = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days from now
    const pastDate = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    
    const sampleEmployees = [
      // Housed employees (已入住) - assigned to property and arrived
      {
        name: '張三',
        company: 'ABC公司',
        gender: 'male',
        assigned_property_id: properties[0]?.id,
        assigned_room_name: 'Room-101',
        arrival_time: pastDate,
        status: 'housed'
      },
      {
        name: '李四',
        company: 'XYZ公司', 
        gender: 'female',
        assigned_property_id: properties[0]?.id,
        assigned_room_name: 'Room-102',
        arrival_time: pastDate,
        status: 'housed'
      },
      
      // Pending employees (未入住) - assigned to property but not arrived yet
      {
        name: '王五',
        company: 'DEF公司',
        gender: 'male',
        assigned_property_id: properties[1]?.id,
        assigned_room_name: null, // Will be assigned room when they arrive
        arrival_time: futureDate,
        status: 'pending'
      },
      
      // Pending assignment employees (待分配) - not assigned to any property
      {
        name: '趙六',
        company: 'GHI公司',
        gender: 'female',
        assigned_property_id: null,
        assigned_room_name: null,
        arrival_time: null,
        status: 'pending_assignment'
      }
    ];
    
    for (const employeeData of sampleEmployees) {
      // Add consistent fields
      const fullEmployeeData = {
        ...employeeData,
        // Legacy fields for backward compatibility
        assignedProperty: employeeData.assigned_property_id ? 
          properties.find(p => p.id === employeeData.assigned_property_id)?.name : null,
        roomNumber: employeeData.assigned_room_name,
        
        // Additional fields
        monthlyRent: 3500,
        rentStatus: employeeData.status === 'housed' ? 'Current' : 'Pending',
        checkInDate: employeeData.status === 'housed' ? 
          employeeData.arrival_time.toISOString().split('T')[0] : null,
        arrivalDate: employeeData.arrival_time ? 
          employeeData.arrival_time.toISOString().split('T')[0] : null,
        
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      await addDoc(collection(db, 'employees'), fullEmployeeData);
      console.log(`✅ Added employee: ${employeeData.name} (${employeeData.status})`);
    }
    
    console.log('🎉 Employee seeding completed with correct status logic!');
    
  } catch (error) {
    console.error('❌ Error seeding employees:', error);
  }
}

seedEmployeesWithCorrectStatus(); 