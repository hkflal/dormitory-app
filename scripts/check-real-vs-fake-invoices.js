const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs } = require('firebase/firestore');
const fs = require('fs');

const firebaseConfig = {
  apiKey: "AIzaSyBHnDNI7EOBI3-zQZQr8xTGVF7fhtw5_7o",
  authDomain: "dormitory-app-b5e18.firebaseapp.com",
  projectId: "dormitory-app-b5e18",
  storageBucket: "dormitory-app-b5e18.firebasestorage.app",
  messagingSenderId: "1070616951095",
  appId: "1:1070616951095:web:2ef7e3e7cdc8b4fe6be825"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkRealVsFakeInvoices() {
  try {
    console.log('🔍 Checking Real CSV vs Fake System Invoice Data...\n');

    // Read real CSV data
    const csvContent = fs.readFileSync('csv/financial.csv.csv', 'utf-8');
    const lines = csvContent.split('\n').filter(line => line.trim());
    
    // Parse real invoice numbers from CSV
    const realInvoices = new Set();
    const employeeInvoiceMap = new Map();
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;

      // Handle CSV parsing with quotes
      const cols = [];
      let currentCol = '';
      let inQuotes = false;
      
      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          cols.push(currentCol.trim());
          currentCol = '';
        } else {
          currentCol += char;
        }
      }
      cols.push(currentCol.trim());

      if (cols.length < 5) continue;

      const employee = cols[0]?.replace(/"/g, '').trim();
      const recentInvoice = cols[3]?.replace(/"/g, '').trim();
      const ctr = cols[4]?.replace(/"/g, '').trim();

      // Skip corrupted data
      if (!employee || employee.includes('�') || employee.length < 2) continue;

      if (recentInvoice && recentInvoice !== '' && !recentInvoice.includes('�')) {
        realInvoices.add(recentInvoice);
        if (!employeeInvoiceMap.has(recentInvoice)) {
          employeeInvoiceMap.set(recentInvoice, []);
        }
        employeeInvoiceMap.get(recentInvoice).push({ employee, ctr });
      }
    }

    console.log(`📄 REAL INVOICE DATA FROM CSV:`);
    console.log(`Total unique real invoices: ${realInvoices.size}\n`);

    // Show some examples including D10102
    console.log('Real invoices for contract D10102:');
    Array.from(realInvoices).filter(inv => inv.startsWith('D10102')).forEach(invoice => {
      const employees = employeeInvoiceMap.get(invoice);
      console.log(`  ${invoice}: ${employees.map(emp => emp.employee).join(', ')}`);
    });

    console.log('\nAll real invoice numbers (first 20):');
    Array.from(realInvoices).sort().slice(0, 20).forEach((invoice, index) => {
      const employees = employeeInvoiceMap.get(invoice);
      console.log(`  ${index + 1}. ${invoice} (${employees.length} employees)`);
    });

    // Check current system invoices
    console.log('\n💾 CURRENT SYSTEM INVOICE DATA:');
    const invoicesSnapshot = await getDocs(collection(db, 'invoices'));
    console.log(`Total system invoices: ${invoicesSnapshot.size}\n`);

    const systemInvoices = [];
    invoicesSnapshot.docs.forEach(doc => {
      const data = doc.data();
      systemInvoices.push(data.invoiceNumber);
    });

    console.log('System invoices (first 20):');
    systemInvoices.sort().slice(0, 20).forEach((invoice, index) => {
      console.log(`  ${index + 1}. ${invoice}`);
    });

    // Find fake invoices
    console.log('\n🚨 ANALYSIS - FAKE vs REAL:');
    const fakeInvoices = systemInvoices.filter(sysInv => !realInvoices.has(sysInv));
    const missingInvoices = Array.from(realInvoices).filter(realInv => !systemInvoices.includes(realInv));

    console.log(`❌ Fake invoices in system (not in CSV): ${fakeInvoices.length}`);
    if (fakeInvoices.length > 0) {
      console.log('Sample fake invoices:');
      fakeInvoices.slice(0, 10).forEach((invoice, index) => {
        console.log(`  ${index + 1}. ${invoice} (FAKE - not in CSV)`);
      });
    }

    console.log(`\n⚠️ Missing real invoices (in CSV but not in system): ${missingInvoices.length}`);
    if (missingInvoices.length > 0) {
      console.log('Missing real invoices:');
      missingInvoices.slice(0, 10).forEach((invoice, index) => {
        const employees = employeeInvoiceMap.get(invoice);
        console.log(`  ${index + 1}. ${invoice} (${employees.length} employees)`);
      });
    }

    console.log(`\n✅ Matching invoices: ${systemInvoices.filter(sysInv => realInvoices.has(sysInv)).length}`);

    console.log('\n🔍 SPECIFIC CHECK - D10102 Contract:');
    console.log('Real D10102 invoices from CSV:');
    Array.from(realInvoices).filter(inv => inv.startsWith('D10102')).forEach(invoice => {
      const employees = employeeInvoiceMap.get(invoice);
      console.log(`  ✅ ${invoice}: ${employees.map(emp => emp.employee).join(', ')}`);
    });

    console.log('\nSystem D10102 invoices:');
    systemInvoices.filter(inv => inv.startsWith('D10102')).forEach(invoice => {
      const isReal = realInvoices.has(invoice);
      console.log(`  ${isReal ? '✅' : '❌'} ${invoice} ${isReal ? '(REAL)' : '(FAKE)'}`);
    });

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkRealVsFakeInvoices(); 