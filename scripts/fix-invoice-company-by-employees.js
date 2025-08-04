const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const BATCH_SIZE = 400;

async function getCompanyNameFromEmployees(employeeNames) {
  if (!employeeNames || !Array.isArray(employeeNames) || employeeNames.length === 0) {
    return null;
  }
  const validNames = employeeNames.filter(name => name && typeof name === 'string' && name.trim() !== '');
  if (validNames.length === 0) {
    return null;
  }
  try {
    const snapshot = await db.collection('employees').where('name', 'in', validNames).limit(1).get();
    if (snapshot.empty) {
      return null;
    }
    const employee = snapshot.docs[0].data();
    return employee.company || null;
  } catch (error) {
    console.error(`Error fetching company name for employees [${validNames.join(', ')}]:`, error);
    return null;
  }
}

async function fixInvoiceCompanies() {
  console.log('Starting to fix invoice company names by employee lookup...');
  const invoicesRef = db.collection('invoices');
  const snapshot = await invoicesRef.get();
  let updatedCount = 0;
  let batch = db.batch();
  let batchSize = 0;

  for (const doc of snapshot.docs) {
    const invoice = doc.data();
    const invoiceId = doc.id;

    if (!invoice.company) {
      const companyName = await getCompanyNameFromEmployees(invoice.employee_names);
      if (companyName) {
        batch.update(doc.ref, { company: companyName });
        batchSize++;
        updatedCount++;
        console.log(`Updating invoice ${invoiceId} with company "${companyName}"`);
      }
    }

    if (batchSize >= BATCH_SIZE) {
      await batch.commit();
      console.log(`Committed batch of ${batchSize} updates.`);
      batch = db.batch();
      batchSize = 0;
    }
  }

  if (batchSize > 0) {
    await batch.commit();
    console.log(`Committed final batch of ${batchSize} updates.`);
  }

  console.log(`Finished fixing invoice companies. Total updated: ${updatedCount}`);
}

fixInvoiceCompanies().catch(console.error); 