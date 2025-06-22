const fs = require('fs');
const path = require('path');
const { createReport } = require('docx-templates');

// Updated test data with more fields
const testInvoiceData = {
    // Basic invoice info
    issue_date: '2024-12-16',
    invoice_number: 'D10103-Z001',
    contract_number: 'D10103',
    
    // Company info
    company: '測試公司有限公司',
    company_address: '香港測試地址',
    
    // Employee info
    employee_names: '張三, 李四',
    n_employees: 2,
    n: 2, // For deposit template
    
    // Financial info
    amount: '1000.00',
    frequency: 3,
    total_amount: '6000.00',
    unit_price: '1000.00',
    
    // Date info
    start_date: '2024-01-01',
    end_date: '2024-03-31',
    
    // Property info
    property_name: '測試物業',
    room_number: 'A101',
    
    // Other
    notes: '測試備註',
    
    // Common fields that might be in template
    tenant_name: '張三',
    rental_period: '3個月',
    due_date: '2024-01-15',
    payment_method: '銀行轉帳'
};

async function testDocxGeneration() {
    console.log('🧪 Testing DOCX generation locally...');
    console.log('📊 Using test data:', JSON.stringify(testInvoiceData, null, 2));
    
    // Create output directory
    const outputDir = path.join(__dirname, 'test-output');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir);
    }

    try {
        // Test regular invoice template
        console.log('📄 Testing regular invoice template...');
        const invoiceTemplate = fs.readFileSync(path.join(__dirname, '..', 'public', 'invoice_template.docx'));
        
        const invoiceReport = await createReport({
            template: invoiceTemplate,
            data: testInvoiceData,
            cmdDelimiter: ['{', '}'],
            literalXmlDelimiter: ['{{', '}}'],
            processLineBreaks: true,
            noSandbox: false // Enable sandbox for safety
        });
        
        const invoiceOutputPath = path.join(outputDir, 'test-invoice.docx');
        fs.writeFileSync(invoiceOutputPath, invoiceReport);
        console.log('✅ Generated:', invoiceOutputPath);

        // Test deposit template
        console.log('📄 Testing deposit template...');
        const depositTemplate = fs.readFileSync(path.join(__dirname, '..', 'public', 'deposit_template.docx'));
        
        const depositReport = await createReport({
            template: depositTemplate,
            data: testInvoiceData,
            cmdDelimiter: ['{', '}'],
            literalXmlDelimiter: ['{{', '}}'],
            processLineBreaks: true
        });
        
        const depositOutputPath = path.join(outputDir, 'test-deposit.docx');
        fs.writeFileSync(depositOutputPath, depositReport);
        console.log('✅ Generated:', depositOutputPath);

        console.log('✅ Test completed successfully!');
        console.log('📂 Check the files in:', outputDir);
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.log('\n💡 The template needs a field called "company" that we\'re not providing.');
        console.log('Please copy more text from your template so I can see all required fields.');
    }
}

testDocxGeneration(); 