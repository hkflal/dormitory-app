#!/usr/bin/env node

const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, doc, updateDoc, writeBatch } = require('firebase/firestore');

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDPbwDZ2a0cgbRoRZiuoO2Ywh5vq4xKGFo",
  authDomain: "dormitory-management-6c1a5.firebaseapp.com",
  projectId: "dormitory-management-6c1a5",
  storageBucket: "dormitory-management-6c1a5.firebasestorage.app",
  messagingSenderId: "600480501319",
  appId: "1:600480501319:web:eb1350c03dbcba3cbeeb62"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function debugInvoiceCompany() {
  try {
    console.log('🔍 Debugging Invoice Company Fields\n');

    // Fetch all invoices
    const invoicesSnapshot = await getDocs(collection(db, 'invoices'));
    const invoicesData = invoicesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    console.log(`📊 Total invoices found: ${invoicesData.length}\n`);

    // Analyze company fields
    let hasCompany = 0;
    let noCompany = 0;
    let emptyCompany = 0;
    let uniqueCompanies = new Set();

    const problematicInvoices = [];

    invoicesData.forEach((invoice, index) => {
      if (invoice.company) {
        if (invoice.company.trim() !== '') {
          hasCompany++;
          uniqueCompanies.add(invoice.company);
        } else {
          emptyCompany++;
          problematicInvoices.push({
            id: invoice.id,
            invoice_number: invoice.invoice_number,
            issue: 'Empty company field'
          });
        }
      } else {
        noCompany++;
        problematicInvoices.push({
          id: invoice.id,
          invoice_number: invoice.invoice_number,
          issue: 'Missing company field'
        });
      }

      // Show first 5 invoices for debugging
      if (index < 5) {
        console.log(`Invoice ${index + 1}:`);
        console.log(`  ├── ID: ${invoice.id}`);
        console.log(`  ├── Invoice Number: ${invoice.invoice_number || 'N/A'}`);
        console.log(`  ├── Company: "${invoice.company || 'MISSING'}"`);
        console.log(`  ├── Contract Number: ${invoice.contract_number || 'N/A'}`);
        console.log(`  └── Employee Names: ${invoice.employee_names ? invoice.employee_names.join(', ') : 'N/A'}\n`);
      }
    });

    console.log('📈 Company Field Analysis:');
    console.log(`  ├── Has valid company: ${hasCompany}`);
    console.log(`  ├── Empty company: ${emptyCompany}`);
    console.log(`  ├── Missing company field: ${noCompany}`);
    console.log(`  └── Unique companies: ${uniqueCompanies.size}\n`);

    console.log('🏢 Found Companies:');
    Array.from(uniqueCompanies).forEach(company => {
      console.log(`  • ${company}`);
    });

    if (problematicInvoices.length > 0) {
      console.log(`\n⚠️  Problematic Invoices (${problematicInvoices.length}):`);
      problematicInvoices.slice(0, 10).forEach(invoice => {
        console.log(`  ├── ${invoice.invoice_number}: ${invoice.issue}`);
      });
      if (problematicInvoices.length > 10) {
        console.log(`  └── ... and ${problematicInvoices.length - 10} more`);
      }
    }

    // Check if we can fix some invoices by looking up employee data
    console.log('\n🔧 Attempting to fix missing company fields...');
    
    // Fetch employees for reference
    const employeesSnapshot = await getDocs(collection(db, 'employees'));
    const employeesData = employeesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    let fixed = 0;
    const batch = writeBatch(db);
    
    for (const invoice of problematicInvoices.slice(0, 20)) { // Fix first 20
      if (invoice.issue === 'Missing company field') {
        const invoiceData = invoicesData.find(inv => inv.id === invoice.id);
        if (invoiceData && invoiceData.employee_names && invoiceData.employee_names.length > 0) {
          // Try to find employee with matching name
          const employeeName = invoiceData.employee_names[0];
          const matchingEmployee = employeesData.find(emp => 
            emp.name === employeeName || emp.firstName === employeeName
          );
          
          if (matchingEmployee && matchingEmployee.company) {
            const invoiceRef = doc(db, 'invoices', invoice.id);
            batch.update(invoiceRef, { 
              company: matchingEmployee.company,
              updatedAt: new Date()
            });
            fixed++;
            console.log(`  ✅ Fixed ${invoice.invoice_number}: ${matchingEmployee.company}`);
          }
        }
      }
    }
    
    if (fixed > 0) {
      await batch.commit();
      console.log(`\n🎉 Fixed ${fixed} invoices with missing company fields!`);
    } else {
      console.log('\n📝 No invoices could be automatically fixed.');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

if (require.main === module) {
  debugInvoiceCompany().then(() => {
    console.log('\n✨ Debug completed. Exiting...');
    process.exit(0);
  }).catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}