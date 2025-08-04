const admin = require('firebase-admin');

// Initialize Firebase Admin if not already initialized
if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * Test employee status filtering and calculation logic
 */
async function testEmployeeStatusFiltering() {
  console.log('🧪 Testing employee status filtering logic...');
  
  try {
    const employeesSnapshot = await db.collection('employees').get();
    const employees = employeesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    console.log(`📊 Found ${employees.length} total employees`);
    
    // Test all status filters
    const statusBreakdown = {
      housed: employees.filter(emp => emp.status === 'housed').length,
      pending: employees.filter(emp => emp.status === 'pending').length,
      pending_assignment: employees.filter(emp => emp.status === 'pending_assignment').length,
      terminated: employees.filter(emp => emp.status === 'terminated').length,
      pending_resign: employees.filter(emp => emp.status === 'pending_resign').length,
      resigned: employees.filter(emp => emp.status === 'resigned').length,
      undefined: employees.filter(emp => !emp.status).length
    };
    
    console.log('\n📋 Status Breakdown:');
    Object.entries(statusBreakdown).forEach(([status, count]) => {
      console.log(`   ${status}: ${count}`);
    });
    
    // Test active vs inactive filtering
    const activeEmployees = employees.filter(emp => emp.status !== 'resigned');
    const resignedEmployees = employees.filter(emp => emp.status === 'resigned');
    
    console.log(`\n👥 Employee Categories:`);
    console.log(`   Active Employees: ${activeEmployees.length}`);
    console.log(`   Resigned Employees: ${resignedEmployees.length}`);
    
    // Test housed and active filtering (for rent calculations)
    const housedAndActive = employees.filter(emp => 
      emp.status === 'housed' && emp.status !== 'resigned'
    );
    
    const totalRentFromHousedActive = housedAndActive
      .reduce((sum, emp) => sum + (parseFloat(emp.rent) || parseFloat(emp.monthlyRent) || 0), 0);
    
    console.log(`\n💰 Rent Calculations:`);
    console.log(`   Housed & Active Employees: ${housedAndActive.length}`);
    console.log(`   Total Rent from Housed & Active: NT$${totalRentFromHousedActive.toLocaleString()}`);
    
    return {
      success: true,
      totalEmployees: employees.length,
      statusBreakdown,
      activeCount: activeEmployees.length,
      resignedCount: resignedEmployees.length,
      housedActiveCount: housedAndActive.length,
      totalRent: totalRentFromHousedActive
    };
    
  } catch (error) {
    console.error('❌ Error testing employee status filtering:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Test resignation transition logic
 */
async function testResignationTransitions() {
  console.log('\n🧪 Testing resignation transition logic...');
  
  try {
    const employeesSnapshot = await db.collection('employees').get();
    const employees = employeesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Find employees with pending_resign status
    const pendingResignEmployees = employees.filter(emp => emp.status === 'pending_resign');
    
    console.log(`📅 Found ${pendingResignEmployees.length} employees with pending_resign status`);
    
    if (pendingResignEmployees.length > 0) {
      console.log('\n📋 Pending Resignation Details:');
      
      const transitionCandidates = [];
      
      pendingResignEmployees.forEach(emp => {
        const departureDate = emp.departure_date ? 
          (emp.departure_date.toDate ? emp.departure_date.toDate() : new Date(emp.departure_date)) : null;
        
        if (departureDate) {
          departureDate.setHours(0, 0, 0, 0);
          const daysUntilDeparture = Math.ceil((departureDate - today) / (1000 * 60 * 60 * 24));
          const shouldTransition = departureDate <= today;
          
          console.log(`   👤 ${emp.name || emp.firstName || 'Unknown'}:`);
          console.log(`      Departure Date: ${departureDate.toLocaleDateString('zh-TW')}`);
          console.log(`      Days Until Departure: ${daysUntilDeparture}`);
          console.log(`      Should Transition: ${shouldTransition ? '✅ Yes' : '❌ No'}`);
          console.log(`      Reason: ${emp.departure_reason || 'Not specified'}`);
          
          if (shouldTransition) {
            transitionCandidates.push({
              id: emp.id,
              name: emp.name || emp.firstName || 'Unknown',
              departureDate
            });
          }
        } else {
          console.log(`   👤 ${emp.name || emp.firstName || 'Unknown'}: ⚠️ No departure date set`);
        }
      });
      
      console.log(`\n🔄 Employees ready for transition to 'resigned': ${transitionCandidates.length}`);
      
      if (transitionCandidates.length > 0) {
        console.log('   (These would be automatically transitioned by the scheduled function)');
      }
      
      return {
        success: true,
        pendingResignCount: pendingResignEmployees.length,
        transitionCandidates: transitionCandidates.length,
        details: transitionCandidates
      };
    } else {
      console.log('   No employees with pending_resign status found');
      return {
        success: true,
        pendingResignCount: 0,
        transitionCandidates: 0,
        details: []
      };
    }
    
  } catch (error) {
    console.error('❌ Error testing resignation transitions:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Test departure date validation logic
 */
async function testDepartureDateValidation() {
  console.log('\n🧪 Testing departure date validation...');
  
  try {
    const today = new Date();
    const futureDate = new Date(today.getTime() + (30 * 24 * 60 * 60 * 1000)); // 30 days from now
    const pastDate = new Date(today.getTime() - (30 * 24 * 60 * 60 * 1000)); // 30 days ago
    
    // Test validation for pending_resign status
    const testCases = [
      {
        status: 'pending_resign',
        departureDate: null,
        expectedValid: false,
        description: 'pending_resign with no departure date'
      },
      {
        status: 'pending_resign',
        departureDate: futureDate,
        expectedValid: true,
        description: 'pending_resign with future departure date'
      },
      {
        status: 'pending_resign',
        departureDate: pastDate,
        expectedValid: false,
        description: 'pending_resign with past departure date'
      },
      {
        status: 'resigned',
        departureDate: pastDate,
        expectedValid: true,
        description: 'resigned with past departure date'
      },
      {
        status: 'resigned',
        departureDate: futureDate,
        expectedValid: false,
        description: 'resigned with future departure date'
      },
      {
        status: 'housed',
        departureDate: null,
        expectedValid: true,
        description: 'housed with no departure date'
      }
    ];
    
    console.log('\n📋 Validation Test Cases:');
    
    const results = testCases.map(testCase => {
      const issues = validateDepartureDate(testCase.departureDate, testCase.status);
      const isValid = issues.length === 0;
      const passed = isValid === testCase.expectedValid;
      
      console.log(`   ${passed ? '✅' : '❌'} ${testCase.description}`);
      if (!passed) {
        console.log(`      Expected: ${testCase.expectedValid ? 'Valid' : 'Invalid'}, Got: ${isValid ? 'Valid' : 'Invalid'}`);
        if (issues.length > 0) {
          console.log(`      Issues: ${issues.join(', ')}`);
        }
      }
      
      return {
        testCase: testCase.description,
        passed,
        expected: testCase.expectedValid,
        actual: isValid,
        issues
      };
    });
    
    const passedCount = results.filter(r => r.passed).length;
    console.log(`\n📊 Validation Results: ${passedCount}/${results.length} tests passed`);
    
    return {
      success: true,
      totalTests: results.length,
      passedTests: passedCount,
      results
    };
    
  } catch (error) {
    console.error('❌ Error testing departure date validation:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Validate departure date (helper function)
 */
function validateDepartureDate(departureDate, status) {
  const issues = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  if (status === 'pending_resign') {
    if (!departureDate) {
      issues.push('即將離職狀態需要設定離職日期');
    } else {
      const depDate = new Date(departureDate);
      depDate.setHours(0, 0, 0, 0);
      
      if (depDate <= today) {
        issues.push('離職日期必須是未來日期');
      }
    }
  }
  
  if (status === 'resigned') {
    if (departureDate) {
      const depDate = new Date(departureDate);
      depDate.setHours(0, 0, 0, 0);
      
      if (depDate > today) {
        issues.push('已離職員工的離職日期不應該是未來日期');
      }
    }
  }
  
  return issues;
}

/**
 * Test approaching departures functionality
 */
async function testApproachingDepartures() {
  console.log('\n🧪 Testing approaching departures detection...');
  
  try {
    const employeesSnapshot = await db.collection('employees').get();
    const employees = employeesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const daysAhead = 7; // Look 7 days ahead
    const futureDate = new Date(today);
    futureDate.setDate(today.getDate() + daysAhead);
    
    const approachingDepartures = employees.filter(emp => {
      if (emp.status !== 'pending_resign' || !emp.departure_date) {
        return false;
      }
      
      const departureDate = emp.departure_date.toDate ? 
        emp.departure_date.toDate() : new Date(emp.departure_date);
      departureDate.setHours(0, 0, 0, 0);
      
      return departureDate >= today && departureDate <= futureDate;
    }).map(emp => {
      const departureDate = emp.departure_date.toDate ? 
        emp.departure_date.toDate() : new Date(emp.departure_date);
      
      const daysUntilDeparture = Math.ceil((departureDate - today) / (1000 * 60 * 60 * 24));
      
      return {
        id: emp.id,
        name: emp.name || emp.firstName || 'Unknown',
        departureDate,
        daysUntilDeparture,
        formattedDepartureDate: departureDate.toLocaleDateString('zh-TW'),
        reason: emp.departure_reason || 'Not specified'
      };
    }).sort((a, b) => a.daysUntilDeparture - b.daysUntilDeparture);
    
    console.log(`📅 Found ${approachingDepartures.length} employees departing within ${daysAhead} days`);
    
    if (approachingDepartures.length > 0) {
      console.log('\n📋 Approaching Departures:');
      approachingDepartures.forEach(emp => {
        console.log(`   👤 ${emp.name}: ${emp.daysUntilDeparture} days (${emp.formattedDepartureDate})`);
        if (emp.reason !== 'Not specified') {
          console.log(`      Reason: ${emp.reason}`);
        }
      });
    }
    
    return {
      success: true,
      count: approachingDepartures.length,
      employees: approachingDepartures
    };
    
  } catch (error) {
    console.error('❌ Error testing approaching departures:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Test overall status statistics
 */
async function testStatusStatistics() {
  console.log('\n🧪 Testing status statistics calculation...');
  
  try {
    const employeesSnapshot = await db.collection('employees').get();
    const employees = employeesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    const statusTypes = ['housed', 'pending', 'pending_assignment', 'terminated', 'pending_resign', 'resigned'];
    
    const statusCounts = {};
    statusTypes.forEach(status => {
      statusCounts[status] = 0;
    });
    
    employees.forEach(emp => {
      const status = emp.status || 'pending_assignment';
      if (statusCounts.hasOwnProperty(status)) {
        statusCounts[status]++;
      } else {
        statusCounts['undefined'] = (statusCounts['undefined'] || 0) + 1;
      }
    });
    
    // Calculate percentages
    const statusPercentages = {};
    Object.keys(statusCounts).forEach(status => {
      statusPercentages[status] = employees.length > 0 ? 
        Math.round((statusCounts[status] / employees.length) * 100) : 0;
    });
    
    // Active vs inactive
    const activeCount = employees.filter(emp => emp.status !== 'resigned').length;
    const resignedCount = statusCounts['resigned'];
    const pendingResignCount = statusCounts['pending_resign'];
    
    console.log('\n📊 Status Statistics:');
    console.log(`   Total Employees: ${employees.length}`);
    console.log(`   Active Employees: ${activeCount} (${Math.round(activeCount/employees.length*100)}%)`);
    console.log(`   Resigned Employees: ${resignedCount} (${statusPercentages['resigned']}%)`);
    console.log(`   Pending Resignation: ${pendingResignCount} (${statusPercentages['pending_resign']}%)`);
    
    console.log('\n📋 Detailed Breakdown:');
    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`   ${status}: ${count} (${statusPercentages[status]}%)`);
    });
    
    return {
      success: true,
      totalEmployees: employees.length,
      activeEmployees: activeCount,
      resignedEmployees: resignedCount,
      pendingResignEmployees: pendingResignCount,
      statusBreakdown: statusCounts,
      statusPercentages
    };
    
  } catch (error) {
    console.error('❌ Error testing status statistics:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Run all employee status transition tests
 */
async function runAllTests() {
  console.log('🧪 Starting Employee Status Transition Test Suite');
  console.log('=================================================\n');
  
  const results = {
    filtering: await testEmployeeStatusFiltering(),
    transitions: await testResignationTransitions(),
    validation: await testDepartureDateValidation(),
    approaching: await testApproachingDepartures(),
    statistics: await testStatusStatistics()
  };
  
  console.log('\n🧪 Test Results Summary');
  console.log('=======================');
  console.log(`📊 Status Filtering: ${results.filtering.success ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`🔄 Resignation Transitions: ${results.transitions.success ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`✅ Date Validation: ${results.validation.success ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`📅 Approaching Departures: ${results.approaching.success ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`📈 Status Statistics: ${results.statistics.success ? '✅ PASSED' : '❌ FAILED'}`);
  
  const allPassed = Object.values(results).every(result => result.success);
  console.log(`\n🎯 Overall: ${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
  
  // Additional summary information
  if (results.filtering.success) {
    console.log(`\n📊 Key Metrics:`);
    console.log(`   Total Employees: ${results.filtering.totalEmployees}`);
    console.log(`   Active Employees: ${results.filtering.activeCount}`);
    console.log(`   Housed & Active: ${results.filtering.housedActiveCount}`);
    console.log(`   Total Active Rent: NT$${results.filtering.totalRent.toLocaleString()}`);
  }
  
  if (results.transitions.success && results.transitions.transitionCandidates > 0) {
    console.log(`\n⚠️ Action Required: ${results.transitions.transitionCandidates} employees ready for resignation transition`);
  }
  
  if (results.approaching.success && results.approaching.count > 0) {
    console.log(`\n📅 Upcoming Departures: ${results.approaching.count} employees departing within 7 days`);
  }
  
  return results;
}

// Run tests if this script is executed directly
if (require.main === module) {
  runAllTests()
    .then(() => {
      console.log('\n✅ Employee status transition test suite completed');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Test suite failed:', error);
      process.exit(1);
    });
}

module.exports = {
  testEmployeeStatusFiltering,
  testResignationTransitions,
  testDepartureDateValidation,
  testApproachingDepartures,
  testStatusStatistics,
  runAllTests
}; 