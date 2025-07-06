const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
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

const TEMPLATE_PATH = path.join(__dirname, '../public/invoice_template.docx');
const DEPOSIT_TEMPLATE_PATH = path.join(__dirname, '../public/deposit_template.docx');
const OUTPUT_DIR = path.join(__dirname, '../generated_invoices');

function formatNumber(num) {
  return num != null ? num.toLocaleString('en-US') : '';
}

function formatDateMMDDYYYY(date) {
  const d = date instanceof Date ? date : new Date(date);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

async function getPaymentFrequency(contractNumber) {
  // Query the financial__records collection for the matching contractNumber
  const snapshot = await db.collection('financial__records').where('contractNumber', '==', contractNumber).get();
  if (snapshot.empty) return 1;
  const record = snapshot.docs[0].data();
  return record.paymentFrequency || 1;
}

async function getCompanyName(employeeNames) {
  if (!employeeNames) return '';
  // employeeNames is a string or array
  const names = Array.isArray(employeeNames) ? employeeNames : employeeNames.split(',').map(n => n.trim());
  if (names.length === 0) return '';
  // Try to find the first employee in the employees collection
  const snapshot = await db.collection('employees').where('name', '==', names[0]).limit(1).get();
  if (snapshot.empty) return '';
  const employee = snapshot.docs[0].data();
  return employee.company || '';
}

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

  // Read all invoices from Firestore
  const invoicesSnapshot = await db.collection('invoices').get();
  const invoices = [];
  invoicesSnapshot.forEach(doc => {
    invoices.push({ id: doc.id, ...doc.data() });
  });

  console.log('Fetched', invoices.length, 'invoices from Firestore');
  if (invoices.length === 0) {
    console.log('No invoices found in Firestore.');
    return;
  }

  for (const invoice of invoices) {
    // Prepare data for the template
    const today = new Date();
    const formattedDate = formatDateMMDDYYYY(today);
    const formattedAmount = formatNumber(invoice.amount);
    let paymentFrequency = 1;
    let total = invoice.amount;
    try {
      paymentFrequency = await getPaymentFrequency(invoice.contract_number);
      total = invoice.amount * paymentFrequency;
    } catch (e) {
      // fallback to 1
      paymentFrequency = 1;
      total = invoice.amount;
    }
    const formattedTotal = formatNumber(total);
    // Fetch company name from employees collection
    const company = await getCompanyName(invoice.employee_names);

    const data = {
      ...invoice,
      start_date: invoice.start_date?.toDate ? invoice.start_date.toDate().toLocaleDateString() : invoice.start_date,
      end_date: invoice.end_date?.toDate ? invoice.end_date.toDate().toLocaleDateString() : invoice.end_date,
      created_at: invoice.created_at?.toDate ? invoice.created_at.toDate().toLocaleDateString() : invoice.created_at,
      employee_names: Array.isArray(invoice.employee_names) ? invoice.employee_names.join(', ') : invoice.employee_names,
      date: formattedDate,
      amount: formattedAmount,
      total: formattedTotal,
      company,
    };

    // Determine template type and load the correct template
    const templatePath = invoice.is_deposit ? DEPOSIT_TEMPLATE_PATH : TEMPLATE_PATH;
    const templateType = invoice.is_deposit ? 'deposit' : 'invoice';
    
    console.log(`📄 Processing ${invoice.invoice_number || invoice.id} - Type: ${templateType}, Template: ${templatePath}`);
    
    // Load the docx file as binary
    const content = fs.readFileSync(templatePath, 'binary');
    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    });
    doc.setData(data);

    try {
      doc.render();
    } catch (error) {
      console.error(`Error rendering invoice ${invoice.invoice_number || invoice.id}:`, error);
      continue;
    }

    // Generate the output docx
    const buf = doc.getZip().generate({ type: 'nodebuffer' });
    const docxPath = path.join(OUTPUT_DIR, `${invoice.invoice_number || invoice.id}.docx`);
    fs.writeFileSync(docxPath, buf);
    console.log(`Generated DOCX for invoice: ${invoice.invoice_number || invoice.id}`);
  }

  console.log('All invoices generated as DOCX files in:', OUTPUT_DIR);
}

main().catch(err => {
  console.error('Error generating invoices:', err);
  process.exit(1);
}); 