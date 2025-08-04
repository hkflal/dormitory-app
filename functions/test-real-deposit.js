const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const { createReport } = require('docx-templates');

// Initialize Firebase Admin
const serviceAccount = require('../firebase-service-account.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

// Helper function to format currency
const formatCurrency = (amount) => {
  const numericAmount = parseFloat(amount || 0);
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true
  }).format(numericAmount);
};

// Helper function to format date
const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-HK');
};

// Helper function to calculate total
const calculateTotal = (amount, nEmployees, frequency) => {
    const unitPrice = parseFloat(amount) || 0;
    const employees = parseInt(nEmployees) || 1;
    const period = parseInt(frequency) || 1;
    return unitPrice * employees * period;
};

async function testRealDepositRecords() {
    console.log('🧪 Testing DOCX generation with real deposit records...');
    
    try {
        // Fetch real deposit records
        console.log('📊 Fetching deposit records from database...');
        const depositsQuery = db.collection('invoices').where('is_deposit', '==', true).limit(3);
        const depositsSnapshot = await depositsQuery.get();
        
        if (depositsSnapshot.empty) {
            console.log('❌ No deposit records found in database');
            console.log('💡 Creating a test deposit record...');
            
            // Create a test deposit record
            const testDepositData = {
                invoice_number: 'D10103-A001',
                contract_number: 'D10103',
                employee_names: ['張三', '李四'],
                amount: 1500,
                n_employees: 2,
                frequency: 1,
                start_date: '2024-01-01',
                end_date: '2024-01-31',
                property_name: '測試物業',
                room_number: 'A101',
                is_deposit: true,
                status: 'pending',
                created_at: new Date(),
                notes: '按金發票測試'
            };
            
            await db.collection('invoices').add(testDepositData);
            console.log('✅ Created test deposit record');
            
            // Use the test data for generation
            await generateDepositDocx(testDepositData, 'test-deposit-record');
            
        } else {
            console.log(`📋 Found ${depositsSnapshot.size} deposit records`);
            
            // Process each real deposit record
            let index = 0;
            for (const doc of depositsSnapshot.docs) {
                const depositData = doc.data();
                console.log(`\n📄 Processing deposit: ${depositData.invoice_number}`);
                console.log('📊 Data:', JSON.stringify(depositData, null, 2));
                
                await generateDepositDocx(depositData, `real-deposit-${index}`);
                index++;
            }
        }
        
        console.log('✅ All real deposit tests completed!');
        
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

async function generateDepositDocx(depositData, filename) {
    try {
        // Create output directory
        const outputDir = path.join(__dirname, 'test-output');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir);
        }
        
        // Prepare data for template
        const templateData = {
            // Basic info
            issue_date: formatDate(depositData.created_at?.toDate?.() || new Date()),
            invoice_number: depositData.invoice_number || '',
            contract_number: depositData.contract_number || '',
            
            // Company info (you may need to adjust these)
            company: '宿舍管理公司',
            company_address: '香港',
            
            // Employee info
            employee_names: Array.isArray(depositData.employee_names) 
                ? depositData.employee_names.join(', ') 
                : depositData.employee_names || '',
            n_employees: depositData.n_employees || 1,
            n: depositData.n_employees || 2, // For deposit template
            
            // Financial info
            amount: formatCurrency(depositData.amount),
            frequency: depositData.frequency || 1,
            total_amount: formatCurrency(calculateTotal(
                depositData.amount, 
                depositData.n_employees, 
                depositData.frequency
            )),
            unit_price: formatCurrency(depositData.amount),
            
            // Date info
            start_date: formatDate(depositData.start_date),
            end_date: formatDate(depositData.end_date),
            
            // Property info
            property_name: depositData.property_name || '',
            room_number: depositData.room_number || '',
            
            // Other
            notes: depositData.notes || '',
            tenant_name: Array.isArray(depositData.employee_names) 
                ? depositData.employee_names[0] 
                : depositData.employee_names || '',
            due_date: formatDate(depositData.start_date),
            payment_method: '銀行轉帳'
        };
        
        console.log('📊 Template data:', JSON.stringify(templateData, null, 2));
        
        // Generate DOCX
        const depositTemplate = fs.readFileSync(path.join(__dirname, '..', 'public', 'deposit_template.docx'));
        
        const depositReport = await createReport({
            template: depositTemplate,
            data: templateData,
            cmdDelimiter: ['{', '}'],
            literalXmlDelimiter: ['{{', '}}'],
            processLineBreaks: true
        });
        
        const outputPath = path.join(outputDir, `${filename}.docx`);
        fs.writeFileSync(outputPath, depositReport);
        console.log('✅ Generated:', outputPath);
        
    } catch (error) {
        console.error('❌ Error generating DOCX:', error);
    }
}

testRealDepositRecords(); 