const fs = require('fs');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');

// Load the docx file as binary
const content = fs.readFileSync('./public/test.docx', 'binary');

// Create a zip instance
const zip = new PizZip(content);

// Create a docxtemplater instance
const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
});

// Set the template variables
doc.setData({
    contract_number: 'TEST123',
    employee_names: 'Alice, Bob',
    amount: 3500,
    start_date: '2024-06-01',
    end_date: '2024-06-30',
    status: 'paid',
    created_at: '2024-06-10',
    invoice_number: 'INV-001',
    id: 'abc123'
});

try {
    // Render the document (replace all variables)
    doc.render();
} catch (error) {
    console.error(JSON.stringify({ error: error }, null, 2));
    throw error;
}

// Generate the output docx
const buf = doc.getZip().generate({ type: 'nodebuffer' });
if (!fs.existsSync('./generated_invoices')) fs.mkdirSync('./generated_invoices');
fs.writeFileSync('./generated_invoices/test-docxtemplater-output.docx', buf);

console.log('Generated DOCX with docxtemplater!'); 