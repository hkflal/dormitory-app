const fs = require('fs');
const path = require('path');
const { createReport } = require('docx-templates');
const admin = require('firebase-admin');

// Load Firebase service account key
const serviceAccountPath = path.join(__dirname, '../serviceAccountKey.json');
if (!fs.existsSync(serviceAccountPath)) {
  console.error('Missing serviceAccountKey.json. Download it from Firebase Console and place it in the project root.');
  process.exit(1);
}
const serviceAccount = require(serviceAccountPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

const TEMPLATE_PATH = path.join(__dirname, '../public/test.docx');
const OUTPUT_DIR = path.join(__dirname, '../generated_invoices');

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

  // Read all invoices from Firestore
  const invoicesSnapshot = await db.collection('invoices').get();
  const invoices = [];
  invoicesSnapshot.forEach(doc => {
    invoices.push({ id: doc.id, ...doc.data() });
  });

  console.log('Fetched', invoices.length, 'invoices from Firestore');
  if (invoices.length > 0) {
    const invoice = invoices[0];
    const data = {
      ...invoice,
      start_date: invoice.start_date?.toDate ? invoice.start_date.toDate().toLocaleDateString() : invoice.start_date,
      end_date: invoice.end_date?.toDate ? invoice.end_date.toDate().toLocaleDateString() : invoice.end_date,
      created_at: invoice.created_at?.toDate ? invoice.created_at.toDate().toLocaleDateString() : invoice.created_at,
      employee_names: Array.isArray(invoice.employee_names) ? invoice.employee_names.join(', ') : invoice.employee_names,
    };
    console.log('First data object:', data);
  }

  if (invoices.length === 0) {
    console.log('No invoices found in Firestore.');
    return;
  }

  for (const invoice of invoices) {
    // Prepare data for the template
    const data = {
      ...invoice,
      start_date: invoice.start_date?.toDate ? invoice.start_date.toDate().toLocaleDateString() : invoice.start_date,
      end_date: invoice.end_date?.toDate ? invoice.end_date.toDate().toLocaleDateString() : invoice.end_date,
      created_at: invoice.created_at?.toDate ? invoice.created_at.toDate().toLocaleDateString() : invoice.created_at,
      employee_names: Array.isArray(invoice.employee_names) ? invoice.employee_names.join(', ') : invoice.employee_names,
    };

    // Fill the docx template
    const templateBuffer = fs.readFileSync(TEMPLATE_PATH);
    const docxBuffer = await createReport({
      template: templateBuffer,
      data,
    });

    // Save the filled docx
    const docxPath = path.join(OUTPUT_DIR, `${invoice.invoice_number || invoice.id}.docx`);
    fs.writeFileSync(docxPath, docxBuffer);

    console.log(`Generated DOCX for invoice: ${invoice.invoice_number || invoice.id}`);
  }

  console.log('All invoices generated as DOCX files in:', OUTPUT_DIR);
}

main().catch(err => {
  console.error('Error generating invoices:', err);
  process.exit(1);
}); 