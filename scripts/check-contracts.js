const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs } = require('firebase/firestore');

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

async function checkContracts() {
  try {
    console.log('=== CONTRACT DATA CHECK ===\n');
    
    // Check contracts collection
    const contractsSnapshot = await getDocs(collection(db, 'contracts'));
    console.log(`📋 CONTRACTS:`);
    console.log(`Total contracts: ${contractsSnapshot.size}`);
    
    if (contractsSnapshot.size > 0) {
      console.log('\nSample contracts:');
      contractsSnapshot.docs.slice(0, 5).forEach((doc, index) => {
        const data = doc.data();
        console.log(`  ${index + 1}. ${data.contractNumber} - ${data.company || 'No company'}`);
        console.log(`     Employees: ${data.employees?.length || 0} | Status: ${data.status} | Billing: ${data.billingPeriod}`);
        if (data.employees && data.employees.length > 0) {
          console.log(`     Sample employees: ${data.employees.slice(0, 3).map(emp => emp.name || emp.id).join(', ')}${data.employees.length > 3 ? '...' : ''}`);
        }
        console.log('');
      });
      
      // Check if contracts seem fake
      const contractData = contractsSnapshot.docs.map(doc => doc.data());
      const companyCounts = {};
      contractData.forEach(contract => {
        if (contract.company) {
          companyCounts[contract.company] = (companyCounts[contract.company] || 0) + 1;
        }
      });
      
      console.log('Companies with contracts:');
      Object.entries(companyCounts).slice(0, 10).forEach(([company, count]) => {
        console.log(`  - ${company}: ${count} contract(s)`);
      });
      
      console.log(`\n🔍 ANALYSIS:`);
      console.log(`- Are these real companies from the CSV? They should match employee company data`);
      console.log(`- Contract numbers should follow the pattern from invoices (D10xxx)`);
      console.log(`- Check if contracts are generated from real employee data or are hardcoded samples`);
      
    } else {
      console.log('❌ No contracts found in database');
    }
    
  } catch (error) {
    console.error('Error checking contracts:', error);
  }
}

checkContracts(); 