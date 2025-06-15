const fs = require('fs');
const path = require('path');

async function prepareTemplates() {
    console.log('📋 Preparing DOCX templates...');
    
    const publicDir = path.join(__dirname, '..', 'public');
    const invoiceTemplate = path.join(publicDir, 'invoice_template.docx');
    const depositTemplate = path.join(publicDir, 'deposit_template.docx');
    
    // Check if templates exist
    if (fs.existsSync(invoiceTemplate)) {
        console.log('✅ invoice_template.docx found');
    } else {
        console.log('❌ invoice_template.docx NOT found');
    }
    
    if (fs.existsSync(depositTemplate)) {
        console.log('✅ deposit_template.docx found');
    } else {
        console.log('❌ deposit_template.docx NOT found');
    }
    
    console.log('\n📝 Template placeholders that should be in your DOCX files:');
    console.log('   {invoice_number} - Invoice number');
    console.log('   {contract_number} - Contract number');
    console.log('   {issue_date} - Issue date');
    console.log('   {start_date} - Start date');
    console.log('   {end_date} - End date');
    console.log('   {employee_names} - Employee names');
    console.log('   {unit_price} - Unit price');
    console.log('   {n_employees} - Number of employees');
    console.log('   {frequency} - Frequency in months');
    console.log('   {total_amount} - Total amount');
    console.log('   {property_name} - Property name');
    console.log('   {notes} - Notes');
    console.log('   {is_deposit} - "押金" or "租金"');
    console.log('   {auto_generated} - "自動生成" or "手動建立"');
    console.log('   {generated_at} - Generation timestamp');
}

prepareTemplates(); 