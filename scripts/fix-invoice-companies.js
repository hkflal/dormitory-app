const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// --- Configuration ---
const BATCH_SIZE = 200;
const COLLECTION_NAME = 'invoices';
const FALLBACK_COMPANY = ''; // Set a desired fallback, or leave empty

// --- Helper Functions ---
async function getCompanyNameFromEmployees(employeeNames) {
    if (!employeeNames || !Array.isArray(employeeNames) || employeeNames.length === 0) {
        return FALLBACK_COMPANY;
    }

    const validNames = employeeNames.filter(name => name && typeof name === 'string' && name.trim() !== '');
    if (validNames.length === 0) {
        return FALLBACK_COMPANY;
    }

    try {
        const snapshot = await db.collection('employees').where('name', 'in', validNames).get();
        if (snapshot.empty) {
            return FALLBACK_COMPANY;
        }

        for (const doc of snapshot.docs) {
            const employee = doc.data();
            if (employee.company && employee.company.trim() !== '') {
                return employee.company;
            }
        }
        
        return FALLBACK_COMPANY;
    } catch (error) {
        console.error(`Error fetching company name for [${validNames.join(', ')}]:`, error);
        return FALLBACK_COMPANY;
    }
}

async function fixInvoiceCompanies() {
  console.log('Starting to fix invoice company names...');

  const invoicesRef = db.collection(COLLECTION_NAME);
  const snapshot = await invoicesRef.get();

  if (snapshot.empty) {
    console.log('No invoices found.');
    return;
  }

  let updatedCount = 0;
  const batches = [];
  let currentBatch = db.batch();
  let currentBatchSize = 0;

  for (const doc of snapshot.docs) {
    const invoice = doc.data();
    const correctCompany = await getCompanyNameFromEmployees(invoice.employee_names);

    if (invoice.company !== correctCompany) {
      console.log(`Updating invoice ${doc.id} (${invoice.invoice_number}): From "${invoice.company}" to "${correctCompany}"`);
      const docRef = invoicesRef.doc(doc.id);
      currentBatch.update(docRef, { company: correctCompany });
      currentBatchSize++;
      updatedCount++;
    }

    if (currentBatchSize === BATCH_SIZE) {
      batches.push(currentBatch);
      currentBatch = db.batch();
      currentBatchSize = 0;
    }
  }

  if (currentBatchSize > 0) {
    batches.push(currentBatch);
  }

  console.log(`\nFound ${updatedCount} invoices to update. Committing in ${batches.length} batches.`);

  for (let i = 0; i < batches.length; i++) {
    console.log(`Committing batch ${i + 1} of ${batches.length}...`);
    await batches[i].commit();
  }

  console.log(`\nSuccessfully updated ${updatedCount} invoices.`);
}

fixInvoiceCompanies().catch(console.error); 