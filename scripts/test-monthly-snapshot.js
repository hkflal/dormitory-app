const admin = require('firebase-admin');

// Initialize Firebase Admin if not already initialized
if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * Test the monthly snapshot calculation logic
 */
async function testMonthlySnapshotCalculation() {
  console.log('🧪 Testing monthly snapshot calculation...');
  
  try {
    // Get current date for testing
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    
    console.log(`📅 Testing snapshot for ${year}-${month + 1}`);
    
    // Fetch test data
    const [employeesSnapshot, propertiesSnapshot, invoicesSnapshot] = await Promise.all([
      db.collection('employees').limit(10).get(),
      db.collection('properties').limit(5).get(),
      db.collection('invoices').limit(20).get()
    ]);

    const employees = employeesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const properties = propertiesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const invoices = invoicesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    console.log(`📊 Test data: ${employees.length} employees, ${properties.length} properties, ${invoices.length} invoices`);

    // Calculate metrics manually for verification
    const total_rent_cost = properties.reduce((sum, prop) => 
      sum + (parseFloat(prop.cost) || 0), 0);
    
    const active_employees = employees.filter(emp => emp.status === 'housed' && emp.status !== 'resigned');
    const total_receivable_rent = active_employees
      .reduce((sum, emp) => sum + (parseFloat(emp.rent) || parseFloat(emp.monthlyRent) || 0), 0);
    
    const current_month_invoices = invoices.filter(inv => {
      const issueDate = inv.issueDate?.toDate ? inv.issueDate.toDate() : new Date(inv.issueDate);
      return issueDate.getFullYear() === year && issueDate.getMonth() === month;
    });
    
    const actual_received_rent = current_month_invoices
      .filter(inv => inv.status === 'paid')
      .reduce((sum, inv) => sum + (parseFloat(inv.amount) || 0), 0);
    
    const number_of_employees = active_employees.length;
    const collection_rate = total_receivable_rent > 0 ? 
      (actual_received_rent / total_receivable_rent * 100) : 0;

    console.log('\n📋 Calculated Snapshot Data:');
    console.log(`   💰 Total Rent Cost: NT$${total_rent_cost.toLocaleString()}`);
    console.log(`   📈 Total Receivable Rent: NT$${total_receivable_rent.toLocaleString()}`);
    console.log(`   ✅ Actual Received Rent: NT$${actual_received_rent.toLocaleString()}`);
    console.log(`   👥 Number of Employees: ${number_of_employees}`);
    console.log(`   📊 Collection Rate: ${collection_rate.toFixed(2)}%`);
    console.log(`   🏢 Properties Count: ${properties.length}`);
    
    // Validation checks
    const issues = [];
    if (total_rent_cost < 0) issues.push('總租金成本不能為負數');
    if (total_receivable_rent < 0) issues.push('應收租金總額不能為負數');
    if (actual_received_rent < 0) issues.push('實際收到租金不能為負數');
    if (actual_received_rent > total_receivable_rent * 1.1) {
      issues.push('實際收到租金明顯超過應收租金，請檢查資料');
    }
    if (number_of_employees === 0 && total_receivable_rent > 0) {
      issues.push('沒有員工但有應收租金，請檢查員工狀態');
    }
    
    if (issues.length > 0) {
      console.log('\n⚠️ Validation Issues:');
      issues.forEach(issue => console.log(`   - ${issue}`));
    } else {
      console.log('\n✅ Validation passed - data looks consistent');
    }
    
    return {
      success: true,
      data: {
        total_rent_cost,
        total_receivable_rent,
        actual_received_rent,
        number_of_employees,
        properties_count: properties.length,
        collection_rate: Math.round(collection_rate * 100) / 100
      },
      validation: {
        isValid: issues.length === 0,
        issues
      }
    };
    
  } catch (error) {
    console.error('❌ Error testing monthly snapshot calculation:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Test manual snapshot creation
 */
async function testManualSnapshotCreation() {
  console.log('\n🧪 Testing manual snapshot creation...');
  
  try {
    const today = new Date();
    const testYear = today.getFullYear();
    const testMonth = today.getMonth() - 1; // Previous month for testing
    
    const snapshotId = `${testYear}-${String(testMonth + 1).padStart(2, '0')}-31`;
    
    // Check if test snapshot already exists
    const existingSnapshot = await db.collection('monthly_financial_snapshots').doc(snapshotId).get();
    
    if (existingSnapshot.exists) {
      console.log(`⚠️ Test snapshot ${snapshotId} already exists, reading existing data...`);
      const existingData = existingSnapshot.data();
      
      console.log('\n📋 Existing Snapshot Data:');
      console.log(`   💰 Total Rent Cost: NT$${existingData.data.total_rent_cost.toLocaleString()}`);
      console.log(`   📈 Total Receivable Rent: NT$${existingData.data.total_receivable_rent.toLocaleString()}`);
      console.log(`   ✅ Actual Received Rent: NT$${existingData.data.actual_received_rent.toLocaleString()}`);
      console.log(`   👥 Number of Employees: ${existingData.data.number_of_employees}`);
      console.log(`   📊 Collection Rate: ${existingData.data.collection_rate}%`);
      console.log(`   📅 Created: ${existingData.created_at.toDate().toLocaleString('zh-TW')}`);
      console.log(`   🔧 Method: ${existingData.calculation_method}`);
      
      return { success: true, snapshotId, exists: true, data: existingData };
    }
    
    // Test creating a new snapshot (but don't actually save to avoid clutter)
    const calculationResult = await testMonthlySnapshotCalculation();
    
    if (!calculationResult.success) {
      throw new Error('Calculation test failed, cannot proceed with creation test');
    }
    
    const testSnapshot = {
      id: snapshotId,
      year: testYear,
      month: testMonth,
      snapshot_date: new Date(),
      data: {
        ...calculationResult.data,
        notes: `測試快照 - ${testYear}年${testMonth + 1}月`
      },
      created_at: new Date(),
      calculation_method: 'manual'
    };
    
    console.log('\n📋 Test Snapshot (NOT SAVED):');
    console.log(`   📅 ID: ${testSnapshot.id}`);
    console.log(`   💰 Total Rent Cost: NT$${testSnapshot.data.total_rent_cost.toLocaleString()}`);
    console.log(`   📈 Total Receivable Rent: NT$${testSnapshot.data.total_receivable_rent.toLocaleString()}`);
    console.log(`   ✅ Actual Received Rent: NT$${testSnapshot.data.actual_received_rent.toLocaleString()}`);
    console.log(`   👥 Number of Employees: ${testSnapshot.data.number_of_employees}`);
    console.log(`   📊 Collection Rate: ${testSnapshot.data.collection_rate}%`);
    console.log(`   📝 Notes: ${testSnapshot.data.notes}`);
    
    // To actually create the snapshot, uncomment the following line:
    // await db.collection('monthly_financial_snapshots').doc(snapshotId).set(testSnapshot);
    // console.log('✅ Test snapshot created successfully');
    
    console.log('ℹ️ Test snapshot NOT saved to database (remove comment to save)');
    
    return { success: true, snapshotId, exists: false, testData: testSnapshot };
    
  } catch (error) {
    console.error('❌ Error testing manual snapshot creation:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Test snapshot data retrieval and formatting
 */
async function testSnapshotRetrieval() {
  console.log('\n🧪 Testing snapshot data retrieval...');
  
  try {
    const snapshotsQuery = db.collection('monthly_financial_snapshots')
      .orderBy('year', 'desc')
      .orderBy('month', 'desc')
      .limit(5);
    
    const snapshot = await snapshotsQuery.get();
    const snapshots = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    console.log(`📊 Found ${snapshots.length} existing snapshots`);
    
    if (snapshots.length > 0) {
      console.log('\n📋 Recent Snapshots:');
      snapshots.forEach((snap, index) => {
        const month = snap.month + 1;
        console.log(`   ${index + 1}. ${snap.year}年${month}月 - NT$${snap.data.total_receivable_rent.toLocaleString()} (${snap.data.collection_rate}%)`);
      });
      
      // Test formatting for display
      const latestSnapshot = snapshots[0];
      const formatted = formatSnapshotForDisplay(latestSnapshot);
      
      console.log('\n📋 Latest Snapshot Formatted:');
      console.log(`   📅 Title: ${formatted.formatted.title}`);
      console.log(`   💰 Total Rent Cost: ${formatted.formatted.total_rent_cost}`);
      console.log(`   📈 Total Receivable Rent: ${formatted.formatted.total_receivable_rent}`);
      console.log(`   ✅ Actual Received Rent: ${formatted.formatted.actual_received_rent}`);
      console.log(`   📊 Collection Rate: ${formatted.formatted.collection_rate}`);
      console.log(`   👥 Number of Employees: ${formatted.formatted.number_of_employees}`);
    }
    
    return { success: true, count: snapshots.length, snapshots };
    
  } catch (error) {
    console.error('❌ Error testing snapshot retrieval:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Format snapshot data for display (helper function)
 */
function formatSnapshotForDisplay(snapshot) {
  const data = snapshot.data;
  const month = snapshot.month + 1;
  
  return {
    ...snapshot,
    formatted: {
      title: `${snapshot.year}年${month}月`,
      total_rent_cost: new Intl.NumberFormat('zh-TW', { 
        style: 'currency', 
        currency: 'TWD',
        minimumFractionDigits: 0 
      }).format(data.total_rent_cost),
      total_receivable_rent: new Intl.NumberFormat('zh-TW', { 
        style: 'currency', 
        currency: 'TWD',
        minimumFractionDigits: 0 
      }).format(data.total_receivable_rent),
      actual_received_rent: new Intl.NumberFormat('zh-TW', { 
        style: 'currency', 
        currency: 'TWD',
        minimumFractionDigits: 0 
      }).format(data.actual_received_rent),
      collection_rate: `${data.collection_rate}%`,
      number_of_employees: `${data.number_of_employees} 人`,
      properties_count: `${data.properties_count} 間`
    }
  };
}

/**
 * Test employee status filtering for resignation logic
 */
async function testEmployeeFiltering() {
  console.log('\n🧪 Testing employee status filtering...');
  
  try {
    const employeesSnapshot = await db.collection('employees').get();
    const employees = employeesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // Test filtering logic
    const activeEmployees = employees.filter(emp => emp.status !== 'resigned');
    const housedEmployees = employees.filter(emp => emp.status === 'housed' && emp.status !== 'resigned');
    const resignedEmployees = employees.filter(emp => emp.status === 'resigned');
    const pendingResignEmployees = employees.filter(emp => emp.status === 'pending_resign');
    
    console.log(`📊 Employee Status Breakdown:`);
    console.log(`   Total Employees: ${employees.length}`);
    console.log(`   Active Employees: ${activeEmployees.length}`);
    console.log(`   Housed Employees: ${housedEmployees.length}`);
    console.log(`   Resigned Employees: ${resignedEmployees.length}`);
    console.log(`   Pending Resignation: ${pendingResignEmployees.length}`);
    
    // Check for employees with departure dates
    const employeesWithDepartureDates = employees.filter(emp => emp.departure_date);
    console.log(`   With Departure Dates: ${employeesWithDepartureDates.length}`);
    
    if (employeesWithDepartureDates.length > 0) {
      console.log('\n📅 Employees with Departure Dates:');
      employeesWithDepartureDates.forEach(emp => {
        const departureDate = emp.departure_date.toDate ? 
          emp.departure_date.toDate() : new Date(emp.departure_date);
        console.log(`   👤 ${emp.name || emp.firstName || 'Unknown'}: ${emp.status} - ${departureDate.toLocaleDateString('zh-TW')}`);
      });
    }
    
    // Test rent calculation from active employees only
    const totalRentFromActive = housedEmployees
      .reduce((sum, emp) => sum + (parseFloat(emp.rent) || parseFloat(emp.monthlyRent) || 0), 0);
    
    console.log(`\n💰 Total Rent from Active Housed Employees: NT$${totalRentFromActive.toLocaleString()}`);
    
    return {
      success: true,
      stats: {
        total: employees.length,
        active: activeEmployees.length,
        housed: housedEmployees.length,
        resigned: resignedEmployees.length,
        pendingResign: pendingResignEmployees.length,
        withDepartureDates: employeesWithDepartureDates.length
      },
      totalRentFromActive
    };
    
  } catch (error) {
    console.error('❌ Error testing employee filtering:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log('🧪 Starting Monthly Snapshot Test Suite');
  console.log('=====================================\n');
  
  const results = {
    calculation: await testMonthlySnapshotCalculation(),
    creation: await testManualSnapshotCreation(),
    retrieval: await testSnapshotRetrieval(),
    filtering: await testEmployeeFiltering()
  };
  
  console.log('\n🧪 Test Results Summary');
  console.log('=======================');
  console.log(`📊 Calculation Test: ${results.calculation.success ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`📝 Creation Test: ${results.creation.success ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`📋 Retrieval Test: ${results.retrieval.success ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`👥 Filtering Test: ${results.filtering.success ? '✅ PASSED' : '❌ FAILED'}`);
  
  const allPassed = Object.values(results).every(result => result.success);
  console.log(`\n🎯 Overall: ${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
  
  return results;
}

// Run tests if this script is executed directly
if (require.main === module) {
  runAllTests()
    .then(() => {
      console.log('\n✅ Test suite completed');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Test suite failed:', error);
      process.exit(1);
    });
}

module.exports = {
  testMonthlySnapshotCalculation,
  testManualSnapshotCreation,
  testSnapshotRetrieval,
  testEmployeeFiltering,
  runAllTests
}; 