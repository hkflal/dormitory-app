const { getCurrentMonthRentMetrics } = require('../lib/rentCalculations');

/**
 * Test script to verify invoice filtering fix
 * This tests that invoices are filtered by coverage period, not just issue date
 */

// Mock data for testing
const mockEmployees = [
  { status: 'housed', rent: 5000 },
  { status: 'housed', monthlyRent: 4000 },
  { status: 'resigned', rent: 3000 }, // Should be excluded
];

const mockInvoices = [
  {
    // Monthly invoice for August 2024 (issued in August)
    issueDate: new Date('2024-08-01'),
    start_date: new Date('2024-08-01'),
    end_date: new Date('2024-08-31'),
    status: 'paid',
    amount: 5000
  },
  {
    // Quarterly invoice issued in June but covers June-July-August
    issueDate: new Date('2024-06-01'),
    start_date: new Date('2024-06-01'),
    end_date: new Date('2024-08-31'),
    status: 'paid',
    amount: 15000 // 3 months * 5000
  },
  {
    // Invoice for July only (should NOT be counted for August)
    issueDate: new Date('2024-07-01'),
    start_date: new Date('2024-07-01'),
    end_date: new Date('2024-07-31'),
    status: 'paid',
    amount: 4000
  },
  {
    // Outstanding invoice for August (not yet paid)
    issueDate: new Date('2024-08-01'),
    start_date: new Date('2024-08-01'),
    end_date: new Date('2024-08-31'),
    status: 'pending',
    amount: 3500
  },
  {
    // Quarterly invoice covering Aug-Sep-Oct (issued in August)
    issueDate: new Date('2024-08-01'),
    start_date: new Date('2024-08-01'),
    end_date: new Date('2024-10-31'),
    status: 'due',
    amount: 12000 // 3 months * 4000
  }
];

function runTest() {
  console.log('🧪 Testing Invoice Filtering Fix for August 2024...\n');
  
  // Test for August 2024 (month = 7, 0-based)
  const result = getCurrentMonthRentMetrics(mockEmployees, mockInvoices, 2024, 7);
  
  console.log('📊 Test Results:');
  console.log(`Total Receivable Rent: $${result.totalReceivableRent}`);
  console.log(`Received Rent: $${result.receivedRent}`);
  console.log(`Not Yet Received Rent: $${result.notYetReceivedRent}`);
  console.log(`Collection Rate: ${result.collectionRate}%\n`);
  
  // Expected calculations:
  const expectedReceivableRent = 5000 + 4000; // Two housed employees, exclude resigned
  const expectedReceivedRent = 5000 + 15000; // Monthly + Quarterly paid invoices covering August
  const expectedNotYetReceived = 3500 + 12000; // Pending + Due invoices covering August
  const expectedCollectionRate = (expectedReceivedRent / expectedReceivableRent * 100);
  
  console.log('🎯 Expected Values:');
  console.log(`Total Receivable Rent: $${expectedReceivableRent}`);
  console.log(`Received Rent: $${expectedReceivedRent}`);
  console.log(`Not Yet Received Rent: $${expectedNotYetReceived}`);
  console.log(`Collection Rate: ${expectedCollectionRate.toFixed(2)}%\n`);
  
  // Verify results
  const tests = [
    {
      name: 'Total Receivable Rent',
      actual: result.totalReceivableRent,
      expected: expectedReceivableRent
    },
    {
      name: 'Received Rent',
      actual: result.receivedRent,
      expected: expectedReceivedRent
    },
    {
      name: 'Not Yet Received Rent',
      actual: result.notYetReceivedRent,
      expected: expectedNotYetReceived
    }
  ];
  
  console.log('✅ Test Results:');
  let allPassed = true;
  
  tests.forEach(test => {
    const passed = test.actual === test.expected;
    const status = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} ${test.name}: ${test.actual} (expected: ${test.expected})`);
    if (!passed) allPassed = false;
  });
  
  console.log(`\n🎉 Overall Test Status: ${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
  
  if (allPassed) {
    console.log('\n🎯 The invoice filtering fix is working correctly!');
    console.log('📋 Invoices are now properly filtered by coverage period (start_date to end_date)');
    console.log('📅 August invoices now include:');
    console.log('   - Monthly invoices for August');
    console.log('   - Quarterly invoices covering June-August'); 
    console.log('   - Any invoices with periods overlapping August');
  } else {
    console.log('\n❌ The fix needs further investigation.');
  }
}

// Run the test
if (require.main === module) {
  runTest();
}

module.exports = { runTest }; 