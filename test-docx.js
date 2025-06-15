const fs = require('fs');
const { createReport } = require('docx-templates');

const templateBuffer = fs.readFileSync('./public/test.docx');
const data = { contract_number: 'TEST123' };

createReport({
  template: templateBuffer,
  data,
}).then(docxBuffer => {
  fs.writeFileSync('./generated_invoices/test-output.docx', docxBuffer);
  console.log('Minimal test DOCX generated!');
}).catch(console.error);