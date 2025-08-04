const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, addDoc, getDocs, doc, deleteDoc } = require('firebase/firestore');

// Firebase configuration (use your existing config)
const firebaseConfig = {
  apiKey: "AIzaSyDPbwDZ2a0cgbRoRZiuoO2Ywh5vq4xKGFo",
  authDomain: "dormitory-management-6c1a5.firebaseapp.com",
  projectId: "dormitory-management-6c1a5",
  storageBucket: "dormitory-management-6c1a5.firebasestorage.app",
  messagingSenderId: "600480501319",
  appId: "1:600480501319:web:eb1350c03dbcba3cbeeb62"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Helper function to read CSV with proper encoding detection
function readCSVWithEncoding(filePath) {
  const buffer = fs.readFileSync(filePath);
  
  // Try different encodings common for Chinese text
  const encodings = ['utf8', 'gb2312', 'gbk', 'big5', 'utf16le'];
  
  for (const encoding of encodings) {
    try {
      const content = iconv.decode(buffer, encoding);
      // Check if we have readable Chinese characters
      if (content.includes('宝明') || content.includes('陶德') || content.includes('文苑')) {
        console.log(`✅ Successfully decoded ${filePath} using ${encoding} encoding`);
        return content;
      }
    } catch (error) {
      // Continue to next encoding
    }
  }
  
  // Fallback to UTF-8
  console.log(`⚠️  Using UTF-8 fallback for ${filePath}`);
  return iconv.decode(buffer, 'utf8');
}

// Helper function to parse CSV
function parseCSV(content) {
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  const data = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Handle CSV parsing with quoted fields
    const values = [];
    let currentValue = '';
    let inQuotes = false;
    
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"' && (j === 0 || line[j-1] === ',')) {
        inQuotes = true;
      } else if (char === '"' && inQuotes && (j === line.length - 1 || line[j+1] === ',')) {
        inQuotes = false;
      } else if (char === ',' && !inQuotes) {
        values.push(currentValue.trim());
        currentValue = '';
      } else {
        currentValue += char;
      }
    }
    values.push(currentValue.trim()); // Add the last value
    
    if (values.length >= headers.length && values[0] && values[0].trim() !== '') {
      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index] ? values[index].replace(/"/g, '') : '';
      });
      data.push(row);
    }
  }
  
  return data;
}

// Helper function to generate unique ID
function generatePropertyId(propertyName) {
  const propertyIdMap = {
    '宝明2号': 'baoming2',
    '陶德': 'taode', 
    '祥兴': 'xiangxing',
    '文苑楼': 'wenyuan',
    '文华楼': 'wenhua',
    '文英楼': 'wenying',
    '新興': 'xinxing',
    '宝明': 'baoming',
    '菊花': 'juhua',
    '通德街': 'tongde',
    '沙田': 'shatin',
    '洋松': 'yangsong',
    '要麦': 'yaomai'
  };
  
  return propertyIdMap[propertyName] || propertyName.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Helper function to generate contract numbers
function generateContractNumber(company, employeeIndex) {
  const companyMapping = {
    'A-1科技': 'D10136',
    'A-1酒店': 'D10136', // Same contract for related companies
    '远华贸易有限公司': 'D10142',
    '越美印刷有限公司': 'D10158',
    '远泰印刷公司': 'D10158', // Same contract
    '汇通贸易': 'D10165',
    '雅展电子': 'D10172',
    '赢森有限公司': 'D10189',
    '特智科技有限公司': 'D10196',
    '太越发展有限公司': 'D10203',
    '泛侨食品有限公司': 'D10210',
    '正联服装有限公司': 'D10217',
    '顶华通信有限公司': 'D10224',
    '凤誉餐饮服务': 'D10231',
    '恒星贸易有限公司': 'D10238',
    '新博纺织品有限公司': 'D10245',
    '马可波罗酒业': 'D10252'
  };
  
  // Generate contract based on company or create new one
  if (companyMapping[company]) {
    return companyMapping[company];
  } else if (company) {
    // Generate new contract for unknown companies
    const hashCode = company.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0);
    return `D${Math.abs(hashCode).toString().padStart(5, '0')}`;
  } else {
    // Individual contracts for employees without company
    return `D${(20000 + employeeIndex).toString()}`;
  }
}

// Helper function to generate billing periods
function generateBillingPeriod() {
  const periods = ['monthly', 'quarterly', 'half-yearly'];
  const weights = [0.6, 0.3, 0.1]; // 60% monthly, 30% quarterly, 10% half-yearly
  
  const random = Math.random();
  let cumulativeWeight = 0;
  
  for (let i = 0; i < periods.length; i++) {
    cumulativeWeight += weights[i];
    if (random <= cumulativeWeight) {
      return periods[i];
    }
  }
  
  return 'monthly'; // Default fallback
}

// Helper function to get next billing date
function getNextBillingDate(billingPeriod) {
  const today = new Date();
  const nextDate = new Date(today);
  
  switch (billingPeriod) {
    case 'quarterly':
      nextDate.setMonth(nextDate.getMonth() + 3);
      break;
    case 'half-yearly':
      nextDate.setMonth(nextDate.getMonth() + 6);
      break;
    default: // monthly
      nextDate.setMonth(nextDate.getMonth() + 1);
  }
  
  // Set to first day of the month
  nextDate.setDate(1);
  return nextDate;
}

// Helper function to get past billing date
function getPastBillingDate(billingPeriod, periodsAgo) {
  const today = new Date();
  const pastDate = new Date(today);
  
  let monthsToSubtract;
  switch (billingPeriod) {
    case 'quarterly':
      monthsToSubtract = periodsAgo * 3;
      break;
    case 'half-yearly':
      monthsToSubtract = periodsAgo * 6;
      break;
    default: // monthly
      monthsToSubtract = periodsAgo;
  }
  
  pastDate.setMonth(pastDate.getMonth() - monthsToSubtract);
  pastDate.setDate(1); // Set to first day of the month
  return pastDate;
}

// Helper function to convert Room-A/B/C/D format and keep original naming
function convertRoomNames(roomsString, capacity) {
  if (!roomsString) return [];
  
  const roomLetters = roomsString.split(',').map(r => r.trim());
  const rooms = [];
  
  // Calculate capacity per room (evenly distributed)
  const baseCapacity = Math.floor(capacity / roomLetters.length);
  const remainder = capacity % roomLetters.length;
  
  roomLetters.forEach((roomLetter, index) => {
    const roomCapacity = baseCapacity + (index < remainder ? 1 : 0);
    
    rooms.push({
      room_name: roomLetter, // Keep original Room-A, Room-B format
      capacity: Math.max(roomCapacity, 1), // Ensure at least 1 capacity
      amenities: ['WiFi', '冷氣', '書桌']
    });
  });
  
  return rooms;
}

// Helper function to convert expected date
function parseExpectedDate(dateStr) {
  if (!dateStr || dateStr.trim() === '') return null;
  
  // Handle formats like "25-may2025", "29-may-2025", "29-May-25"
  const match = dateStr.match(/(\d{1,2})-?([a-z]+)-?(\d{2,4})/i);
  if (match) {
    const [, day, month, year] = match;
    const fullYear = year.length === 2 ? `20${year}` : year;
    const monthMap = {
      'may': '05', 'jun': '06', 'jul': '07', 'aug': '08',
      'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12',
      'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04'
    };
    const monthNum = monthMap[month.toLowerCase()] || '06';
    return `${fullYear}-${monthNum}-${day.padStart(2, '0')}`;
  }
  
  return '2025-06-21'; // Default date
}

// Helper function to determine property status
function getPropertyStatus(expectedDate, capacity, assignedCount) {
  const today = new Date();
  const expected = expectedDate ? new Date(expectedDate) : null;
  
  if (assignedCount >= capacity) {
    return 'Full';
  } else if (expected && expected > today) {
    return 'Expected';
  } else {
    return 'Available';
  }
}

// Helper function to clear existing data
async function clearCollection(collectionName) {
  console.log(`🧹 Clearing ${collectionName} collection...`);
  const snapshot = await getDocs(collection(db, collectionName));
  const deletePromises = snapshot.docs.map(docSnap => deleteDoc(doc(db, collectionName, docSnap.id)));
  await Promise.all(deletePromises);
  console.log(`✅ Cleared ${snapshot.docs.length} documents from ${collectionName}`);
}

// Main seeding function
async function seedDatabase() {
  try {
    console.log('🚀 Starting database seeding...\n');

    // Clear existing data
    await clearCollection('properties');
    await clearCollection('employees');
    await clearCollection('invoices');
    await clearCollection('financials');
    await clearCollection('contracts');

    // Read CSV files with proper encoding
    const propertyCSV = readCSVWithEncoding(path.join(__dirname, '../csv/dormitory - property.csv'));
    const employeeCSV = readCSVWithEncoding(path.join(__dirname, '../csv/dormitory - employee.csv'));

    // Parse CSV data
    const propertyData = parseCSV(propertyCSV);
    const employeeData = parseCSV(employeeCSV);

    console.log(`📊 Found ${propertyData.length} properties and ${employeeData.length} employees`);
    console.log('🔍 Property names found:', propertyData.map(p => p.property).filter(Boolean));
    console.log('');

    // Count employees per property for occupancy calculation
    const employeeCountByProperty = {};
    employeeData.forEach(emp => {
      const assigned = emp.assigned && emp.assigned.trim() !== '' && emp.assigned !== 'not assigned' 
        ? emp.assigned.trim() 
        : null;
      if (assigned) {
        employeeCountByProperty[assigned] = (employeeCountByProperty[assigned] || 0) + 1;
      }
    });

    console.log('👥 Employee count by property:', employeeCountByProperty);

    // Seed Properties
    console.log('\n🏢 Seeding properties...');
    const propertyIdMapping = {};
    
    for (const prop of propertyData) {
      if (!prop.property || prop.property.trim() === '') continue;
      
      const propertyName = prop.property.trim();
      const propertyId = generatePropertyId(propertyName);
      const expectedDate = parseExpectedDate(prop.expected_date);
      const capacity = parseInt(prop.capacity) || 12;
      const occupancy = employeeCountByProperty[propertyName] || 0;
      const rooms = convertRoomNames(prop.Room, capacity);
      
      const propertyDoc = {
        name: propertyName,
        propertyId: propertyId,
        address: prop.address || `${propertyName} 宿舍`,
        location: propertyName.includes('文') ? '香港島' : '九龍',
        target_gender_type: prop.gender === 'female' ? 'female' : prop.gender === 'male' ? 'male' : 'any',
        genderTypes: prop.gender === 'female' ? ['Female'] : prop.gender === 'male' ? ['Male'] : ['Male', 'Female'],
        capacity: capacity, // Total bed capacity
        occupancy: occupancy,
        totalRooms: rooms.length,
        occupiedRooms: Math.ceil(occupancy / 2),
        expectedDate: expectedDate,
        status: getPropertyStatus(expectedDate, capacity, occupancy),
        progress: prop.progress || '',
        remarks: prop['remarks '] || prop.remarks || '', // Handle potential spacing in header
        contractor: prop.contractor || '',
        cost: prop.cost ? parseFloat(prop.cost) : 0,
        repair: prop.repair || '',
        amenities: ['WiFi', '洗衣房', '冷氣', '保安系統'],
        monthlyRent: 3500, // All properties charge 3500 per person
        rooms: rooms,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const docRef = await addDoc(collection(db, 'properties'), propertyDoc);
      propertyIdMapping[propertyName] = docRef.id;
      
      console.log(`   ✅ Added property: ${propertyName} (${occupancy} employees) - ${rooms.length} rooms`);
    }

    // Seed Employees
    console.log('\n👥 Seeding employees...');
    let employeeCount = 0;
    
    for (const emp of employeeData) {
      if (!emp.employee || emp.employee.trim() === '') continue;
      
      const isAssigned = emp.assigned && emp.assigned.trim() !== '' && emp.assigned !== 'not assigned';
      const assignedPropertyId = isAssigned ? propertyIdMapping[emp.assigned.trim()] : '';
      
      // Parse employee name and clean it
      let employeeName = emp.employee.trim();
      
      // Remove any special markers like "*", "HK" suffixes
      employeeName = employeeName.replace(/^\*/, '').replace(/\n.*HK.*$/, '').trim();
      
      // Generate a random room assignment for assigned employees
      let assignedRoom = '';
      if (isAssigned) {
        const property = propertyData.find(p => p.property === emp.assigned.trim());
        if (property && property.Room) {
          const roomOptions = property.Room.split(',').map(r => r.trim());
          const randomRoomIndex = Math.floor(Math.random() * roomOptions.length);
          assignedRoom = roomOptions[randomRoomIndex]; // Use original Room-A, Room-B format
        } else {
          assignedRoom = 'Room-A'; // Default
        }
      }
      
      const employeeDoc = {
        name: employeeName,
        company: emp.company || '',
        gender: emp.gender === 'female' ? 'female' : 'male',
        arrival_time: new Date(), // Default to now since arrival is empty
        status: isAssigned ? 'housed' : 'pending_assignment',
        assigned_property_id: assignedPropertyId || '',
        assigned_room_name: assignedRoom || '',
        assignedProperty: isAssigned ? emp.assigned.trim() : '', // Legacy field
        roomNumber: assignedRoom || '', // Legacy field for compatibility
        preference: emp.preference || '',
        contact_info: `+852 ${Math.floor(Math.random() * 90000000) + 10000000}`, // Generate phone
        remarks: emp.remarks || '',
        invoice: emp['invoice '] || emp.invoice || '', // Handle potential spacing
        payment: emp.payment || '',
        monthlyRent: 3500, // Fixed monthly rent for all employees
        rentStatus: Math.random() > 0.3 ? 'paid' : 'due', // Random status for demo
        checkInDate: isAssigned ? new Date().toISOString().split('T')[0] : '',
        arrivalDate: new Date().toISOString().split('T')[0],
        linked_invoices: [], // Empty array for invoice linking
        // Contract-based billing information
        contractNumber: generateContractNumber(emp.company || '', employeeCount),
        billingPeriod: generateBillingPeriod(), // monthly, quarterly, half-yearly
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await addDoc(collection(db, 'employees'), employeeDoc);
      employeeCount++;
      
      const statusIcon = isAssigned ? '🏠' : '⏳';
      const roomInfo = assignedRoom ? ` (${assignedRoom})` : '';
      console.log(`   ${statusIcon} Added employee: ${employeeName} -> ${isAssigned ? emp.assigned + roomInfo : 'Not Assigned'}`);
    }

    // Create Contracts and Invoices
    console.log('\n📄 Creating contracts and invoices...');
    
    // Collect all unique contracts from employees
    const contractsMap = new Map();
    const employeesSnapshot = await getDocs(collection(db, 'employees'));
    const allEmployees = employeesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // Group employees by contract
    allEmployees.forEach(employee => {
      const contractNumber = employee.contractNumber;
      if (!contractsMap.has(contractNumber)) {
        contractsMap.set(contractNumber, {
          contractNumber,
          billingPeriod: employee.billingPeriod,
          employees: [],
          company: employee.company,
          monthlyRentPerPerson: 3500
        });
      }
      contractsMap.get(contractNumber).employees.push(employee);
    });

    // Create contract documents
    let contractCount = 0;
    let invoiceCount = 0;
    
    for (const [contractNumber, contractData] of contractsMap) {
      // Calculate contract financial details
      const employeeCount = contractData.employees.length;
      const monthlyTotal = employeeCount * contractData.monthlyRentPerPerson;
      
      // Determine billing amount based on period
      let billingAmount;
      switch (contractData.billingPeriod) {
        case 'quarterly':
          billingAmount = monthlyTotal * 3;
          break;
        case 'half-yearly':
          billingAmount = monthlyTotal * 6;
          break;
        default: // monthly
          billingAmount = monthlyTotal;
      }

      // Create contract document
      const contractDoc = {
        contractNumber,
        company: contractData.company,
        billingPeriod: contractData.billingPeriod,
        employeeCount,
        monthlyRentPerPerson: contractData.monthlyRentPerPerson,
        monthlyTotal,
        billingAmount,
        employees: contractData.employees.map(emp => emp.id),
        status: 'active',
        startDate: new Date('2024-01-01'),
        nextBillingDate: getNextBillingDate(contractData.billingPeriod),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const contractDocRef = await addDoc(collection(db, 'contracts'), contractDoc);
      contractCount++;

      // Generate sample invoices for this contract (last 3 billing periods)
      for (let i = 1; i <= 3; i++) {
        const invoiceNumber = `INV-${contractNumber}-Z${i.toString().padStart(3, '0')}`;
        const billingDate = getPastBillingDate(contractData.billingPeriod, 4 - i);
        const dueDate = new Date(billingDate);
        dueDate.setDate(dueDate.getDate() + 30); // 30 days to pay
        
        const invoiceDoc = {
          invoiceNumber,
          contractId: contractDocRef.id,
          contractNumber,
          company: contractData.company,
          billingPeriod: contractData.billingPeriod,
          amount: billingAmount,
          billingDate,
          dueDate,
          status: i === 3 ? (Math.random() > 0.3 ? 'paid' : 'pending') : 'paid', // Latest might be pending
          paidDate: i < 3 ? new Date(billingDate.getTime() + Math.random() * 20 * 24 * 60 * 60 * 1000) : null,
          employees: contractData.employees.map(emp => ({
            id: emp.id,
            name: emp.name,
            monthlyRent: contractData.monthlyRentPerPerson
          })),
          createdAt: new Date(billingDate),
          updatedAt: new Date()
        };

        await addDoc(collection(db, 'invoices'), invoiceDoc);
        invoiceCount++;
      }

      console.log(`   📋 Contract ${contractNumber}: ${employeeCount} employees, ${contractData.billingPeriod} billing, $${billingAmount.toLocaleString()}`);
    }

    // Create sample financial data
    console.log('\n💰 Creating financial summary...');
    const financialDoc = {
      totalRevenue: employeeCount * 3500, // Fixed rent of 3500 per employee
      accountsReceivable: Math.floor(employeeCount * 3500 * 0.15), // 15% outstanding
      maintenanceCosts: [
        {
          item: '冷氣維修',
          cost: 2500,
          date: new Date('2024-11-15'),
          property_id: '宝明2号',
          description: '更換冷氣壓縮機'
        },
        {
          item: '水電檢修',
          cost: 1800,
          date: new Date('2024-11-20'),
          property_id: '陶德',
          description: '修復電力系統'
        },
        {
          item: '洗衣機維護',
          cost: 800,
          date: new Date('2024-11-25'),
          property_id: '文苑楼',
          description: '洗衣房設備保養'
        }
      ],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await addDoc(collection(db, 'financials'), financialDoc);

    console.log('\n✨ Database seeding completed successfully!');
    console.log(`📊 Summary:`);
    console.log(`   - Properties: ${propertyData.length}`);
    console.log(`   - Employees: ${employeeCount}`);
    console.log(`   - Contracts: ${contractCount}`);
    console.log(`   - Invoices: ${invoiceCount}`);
    console.log(`   - Assigned: ${Object.values(employeeCountByProperty).reduce((a, b) => a + b, 0)}`);
    console.log(`   - Unassigned: ${employeeCount - Object.values(employeeCountByProperty).reduce((a, b) => a + b, 0)}`);
    console.log(`   - Property mappings:`, Object.keys(propertyIdMapping));
    console.log(`   - NOTE: Property capacity is now calculated dynamically based on housed employees`);
    console.log('\n🚀 You can now run the application with real data!');

  } catch (error) {
    console.error('❌ Error seeding database:', error);
  }
}

// Run the seeding script
if (require.main === module) {
  seedDatabase().then(() => {
    console.log('\n🎉 Seeding process finished. Exiting...');
    process.exit(0);
  }).catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { seedDatabase }; 