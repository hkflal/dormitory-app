/**
 * Local test script to validate invoice amount gatekeeping fixes
 * This script tests the currency cleaning function without requiring Firestore access
 */

// Replicate the gatekeeping function locally for testing
const cleanCurrencySymbols = (amount) => {
  if (typeof amount === 'number') return amount;
  if (!amount) return 0;
  
  // Convert to string and remove all currency symbols
  const cleanedAmount = String(amount)
    .replace(/\$HK/gi, '')  // Remove $HK
    .replace(/HK\$/gi, '')  // Remove HK$
    .replace(/\$/g, '')     // Remove $
    .replace(/港币|港元/g, '') // Remove Chinese currency terms
    .replace(/[^\d.,\-]/g, '') // Remove any other non-numeric characters except commas, dots, and minus
    .replace(/,/g, '');     // Remove commas
    
  return parseFloat(cleanedAmount) || 0;
};

const validateAndCleanInvoiceAmounts = (invoiceData) => {
  console.log('🛡️ GATEKEEPING: Validating and cleaning invoice amounts...');
  
  // Log original data for debugging
  console.log('📥 Original amount data:', {
    amount: invoiceData.amount,
    total: invoiceData.total,
    amount_type: typeof invoiceData.amount,
    total_type: typeof invoiceData.total
  });
  
  const cleanedData = { ...invoiceData };
  
  // Clean the main amount field
  if (cleanedData.amount !== undefined && cleanedData.amount !== null) {
    const originalAmount = cleanedData.amount;
    cleanedData.amount = cleanCurrencySymbols(originalAmount);
    
    if (originalAmount !== cleanedData.amount) {
      console.log(`🧹 Cleaned amount: "${originalAmount}" → ${cleanedData.amount}`);
    }
  }
  
  // Clean the total field
  if (cleanedData.total !== undefined && cleanedData.total !== null) {
    const originalTotal = cleanedData.total;
    cleanedData.total = cleanCurrencySymbols(originalTotal);
    
    if (originalTotal !== cleanedData.total) {
      console.log(`🧹 Cleaned total: "${originalTotal}" → ${cleanedData.total}`);
    }
  }
  
  // Validate that amounts are valid numbers
  if (isNaN(cleanedData.amount) || cleanedData.amount <= 0) {
    console.warn(`⚠️ Invalid amount detected: ${cleanedData.amount}, setting to 0`);
    cleanedData.amount = 0;
  }
  
  if (cleanedData.total !== undefined && (isNaN(cleanedData.total) || cleanedData.total < 0)) {
    console.warn(`⚠️ Invalid total detected: ${cleanedData.total}, setting to amount value`);
    cleanedData.total = cleanedData.amount;
  }
  
  // Log cleaned data for verification
  console.log('📤 Cleaned amount data:', {
    amount: cleanedData.amount,
    total: cleanedData.total,
    amount_type: typeof cleanedData.amount,
    total_type: typeof cleanedData.total
  });
  
  console.log('✅ GATEKEEPING: Invoice amounts validated and cleaned');
  return cleanedData;
};

// Test formatCurrency function
const formatCurrency = (amount) => {
  const numericAmount = cleanCurrencySymbols(amount);
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true
  }).format(numericAmount);
};

// Test data with various problematic amount formats
const testCases = [
  {
    name: "Valid Number",
    input: { amount: 3500, total: 3500 },
    expected: { amount: 3500, total: 3500 }
  },
  {
    name: "Amount with $HK prefix",
    input: { amount: "$HK3,500.00", total: "$HK3,500.00" },
    expected: { amount: 3500, total: 3500 }
  },
  {
    name: "Amount with HK$ prefix", 
    input: { amount: "HK$4,200.50", total: "HK$4,200.50" },
    expected: { amount: 4200.5, total: 4200.5 }
  },
  {
    name: "String number with commas",
    input: { amount: "2,800.75", total: "2,800.75" },
    expected: { amount: 2800.75, total: 2800.75 }
  },
  {
    name: "Mixed currency symbols",
    input: { amount: "$HK 1,250.25", total: "HK$1,250.25" },
    expected: { amount: 1250.25, total: 1250.25 }
  },
  {
    name: "Chinese currency terms",
    input: { amount: "港币3500", total: "3500港元" },
    expected: { amount: 3500, total: 3500 }
  },
  {
    name: "Invalid/Empty amounts",
    input: { amount: "", total: null },
    expected: { amount: 0, total: 0 }
  },
  {
    name: "Non-numeric string",
    input: { amount: "abc", total: "xyz123" },
    expected: { amount: 0, total: 0 }
  }
];

function runLocalTests() {
  console.log('🚀 Starting Local Invoice Amount Gatekeeping Test\n');
  console.log('Testing currency cleaning and validation logic...\n');
  
  let passedTests = 0;
  let totalTests = testCases.length;
  
  testCases.forEach((testCase, index) => {
    console.log(`\n📝 Test ${index + 1}: ${testCase.name}`);
    console.log('=' + '='.repeat(50));
    
    try {
      // Create mock invoice data
      const mockInvoiceData = {
        invoice_number: `TEST-${index + 1}`,
        contract_number: `CTR-${index + 1}`,
        employee_names: ['Test Employee'],
        ...testCase.input,
        start_date: new Date(),
        end_date: new Date()
      };
      
      // Run the gatekeeping function
      const cleaned = validateAndCleanInvoiceAmounts(mockInvoiceData);
      
      // Verify results
      const amountMatch = cleaned.amount === testCase.expected.amount;
      const totalMatch = cleaned.total === testCase.expected.total;
      
      if (amountMatch && totalMatch) {
        console.log('✅ PASS - Amounts cleaned correctly');
        passedTests++;
      } else {
        console.log('❌ FAIL - Unexpected results');
        console.log(`   Expected amount: ${testCase.expected.amount}, got: ${cleaned.amount}`);
        console.log(`   Expected total: ${testCase.expected.total}, got: ${cleaned.total}`);
      }
      
      // Test formatting
      console.log(`\n🎨 Formatted amount: ${formatCurrency(cleaned.amount)}`);
      console.log(`🎨 Formatted total: ${formatCurrency(cleaned.total)}`);
      
    } catch (error) {
      console.log('❌ FAIL - Exception occurred:', error.message);
    }
  });
  
  console.log('\n' + '='.repeat(60));
  console.log(`📊 Test Results: ${passedTests}/${totalTests} tests passed`);
  
  if (passedTests === totalTests) {
    console.log('🎉 All tests passed! The gatekeeping function is working correctly.');
    console.log('\n✅ Currency symbols are properly cleaned before invoice generation.');
    console.log('✅ Invalid amounts are handled gracefully.');
    console.log('✅ Formatted output shows clean numbers like "3,500.00".');
  } else {
    console.log('⚠️ Some tests failed. Please review the gatekeeping logic.');
  }
  
  console.log('\n💡 The Firebase Functions have been updated with this gatekeeping logic.');
  console.log('   Any new invoices created will have their amounts cleaned automatically.');
}

// Run the tests
if (require.main === module) {
  runLocalTests();
}

module.exports = { 
  runLocalTests, 
  validateAndCleanInvoiceAmounts, 
  cleanCurrencySymbols,
  formatCurrency 
}; 