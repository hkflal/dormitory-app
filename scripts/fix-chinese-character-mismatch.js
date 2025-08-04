const admin = require('firebase-admin');
const OpenCC = require('opencc-js');
const serviceAccount = require('../serviceAccountKey.json');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Convert from Simplified (China) to Traditional (Hong Kong/Taiwan)
const simplifiedToTraditional = OpenCC.Converter({ from: 'cn', to: 'hk' });
// Also create reverse converter for verification
const traditionalToSimplified = OpenCC.Converter({ from: 'hk', to: 'cn' });

async function fixChineseCharacterMismatch() {
  console.log('🔧 Starting Chinese character normalization fix...\n');
  
  try {
    // Step 1: Get all employees for reference (current database uses traditional)
    console.log('📚 Loading current employee database...');
    const employeesSnapshot = await db.collection('employees').get();
    const employeesByTraditionalName = new Map();
    const employeesBySimplifiedName = new Map();
    
    employeesSnapshot.forEach(doc => {
      const emp = doc.data();
      if (emp.name) {
        const traditionalName = emp.name.trim();
        const simplifiedName = traditionalToSimplified(traditionalName);
        
        employeesByTraditionalName.set(traditionalName, { id: doc.id, ...emp });
        employeesBySimplifiedName.set(simplifiedName, { id: doc.id, ...emp });
        
        // Log the specific employee we're looking for
        if (emp.employeeId === 'EE-00054' || traditionalName.includes('馬明令') || simplifiedName.includes('马明令')) {
          console.log(`   Found target employee: ${emp.employeeId} - "${traditionalName}" (traditional) / "${simplifiedName}" (simplified)`);
        }
      }
    });
    
    console.log(`   Loaded ${employeesByTraditionalName.size} employees\n`);
    
    // Step 2: Analyze all invoices for character mismatches
    console.log('🔍 Analyzing invoices for character mismatches...');
    const invoicesSnapshot = await db.collection('invoices').get();
    
    let totalInvoices = 0;
    let invoicesWithMismatches = [];
    let fixedEmployeeNames = new Set();
    
    invoicesSnapshot.forEach(doc => {
      const invoice = doc.data();
      totalInvoices++;
      
      if (!invoice.employee_names || !Array.isArray(invoice.employee_names)) {
        return;
      }
      
      let hasCharacterMismatch = false;
      let needsUpdate = false;
      const originalNames = [...invoice.employee_names];
      const normalizedNames = [];
      const matchedEmployees = [];
      
      invoice.employee_names.forEach(name => {
        if (!name || typeof name !== 'string') {
          normalizedNames.push(name);
          return;
        }
        
        const cleanName = name.trim();
        let matchedEmployee = null;
        let finalName = cleanName;
        
        // Try direct traditional match first
        if (employeesByTraditionalName.has(cleanName)) {
          matchedEmployee = employeesByTraditionalName.get(cleanName);
          finalName = cleanName;
        }
        // Try converting simplified to traditional
        else {
          const traditionalVersion = simplifiedToTraditional(cleanName);
          if (employeesByTraditionalName.has(traditionalVersion)) {
            matchedEmployee = employeesByTraditionalName.get(traditionalVersion);
            finalName = traditionalVersion;
            hasCharacterMismatch = true;
            needsUpdate = true;
            
            console.log(`   📝 Character mismatch found: "${cleanName}" → "${traditionalVersion}" (${matchedEmployee.employeeId})`);
            fixedEmployeeNames.add(`${cleanName} → ${traditionalVersion}`);
          }
          // Try simplified lookup as fallback
          else if (employeesBySimplifiedName.has(cleanName)) {
            matchedEmployee = employeesBySimplifiedName.get(cleanName);
            // Convert to traditional for consistency
            finalName = simplifiedToTraditional(cleanName);
            if (finalName !== cleanName) {
              hasCharacterMismatch = true;
              needsUpdate = true;
              console.log(`   📝 Simplified name standardized: "${cleanName}" → "${finalName}" (${matchedEmployee.employeeId})`);
              fixedEmployeeNames.add(`${cleanName} → ${finalName}`);
            }
          }
        }
        
        normalizedNames.push(finalName);
        if (matchedEmployee) {
          matchedEmployees.push(matchedEmployee);
        }
      });
      
      if (hasCharacterMismatch) {
        // Recalculate n_employees with matched employees
        const actualEmployeeCount = matchedEmployees.length;
        const currentNEmployees = invoice.n_employees || 0;
        
        invoicesWithMismatches.push({
          id: doc.id,
          invoice_number: invoice.invoice_number,
          contract_number: invoice.contract_number,
          auto_generated: invoice.auto_generated || false,
          original_names: originalNames,
          normalized_names: normalizedNames,
          matched_employees: matchedEmployees,
          old_n_employees: currentNEmployees,
          correct_n_employees: actualEmployeeCount,
          needs_employee_count_fix: currentNEmployees !== actualEmployeeCount,
          amount: invoice.amount,
          frequency: invoice.frequency || 1
        });
      }
    });
    
    console.log(`\n📊 Analysis Results:`);
    console.log(`   Total invoices: ${totalInvoices}`);
    console.log(`   Invoices with character mismatches: ${invoicesWithMismatches.length}`);
    console.log(`   Unique character fixes: ${fixedEmployeeNames.size}\n`);
    
    if (invoicesWithMismatches.length === 0) {
      console.log('✅ No character mismatches found!');
      return;
    }
    
    // Step 3: Show problematic invoices
    console.log('🚨 Invoices with character mismatches:\n');
    invoicesWithMismatches.forEach(inv => {
      console.log(`   Invoice: ${inv.invoice_number} (${inv.auto_generated ? 'AUTO-GENERATED' : 'MANUAL'})`);
      console.log(`   Contract: ${inv.contract_number}`);
      console.log(`   Original names: [${inv.original_names.join(', ')}]`);
      console.log(`   Normalized names: [${inv.normalized_names.join(', ')}]`);
      console.log(`   Matched employees: ${inv.matched_employees.length}`);
      console.log(`   Employee count: ${inv.old_n_employees} → ${inv.correct_n_employees}`);
      
      if (inv.needs_employee_count_fix) {
        const oldTotal = (inv.amount || 0) * inv.old_n_employees * inv.frequency;
        const newTotal = (inv.amount || 0) * inv.correct_n_employees * inv.frequency;
        console.log(`   💰 Revenue impact: HK$${oldTotal} → HK$${newTotal} (${newTotal > oldTotal ? '+' : ''}${newTotal - oldTotal})`);
      }
      console.log('');
    });
    
    // Step 4: Apply fixes
    console.log('🔧 Applying character normalization fixes...\n');
    
    const batch = db.batch();
    let batchCount = 0;
    let fixedCount = 0;
    
    for (const invoice of invoicesWithMismatches) {
      const updateData = {
        employee_names: invoice.normalized_names,
        n_employees: invoice.correct_n_employees,
        total: (invoice.amount || 0) * invoice.correct_n_employees * invoice.frequency,
        chinese_characters_normalized: admin.firestore.FieldValue.serverTimestamp(),
        chinese_normalization_note: `Fixed character encoding: ${invoice.original_names.join(', ')} → ${invoice.normalized_names.join(', ')}`
      };
      
      const docRef = db.collection('invoices').doc(invoice.id);
      batch.update(docRef, updateData);
      
      batchCount++;
      fixedCount++;
      
      console.log(`   ✅ Fixed: ${invoice.invoice_number} - Updated ${invoice.normalized_names.length} names, n_employees=${invoice.correct_n_employees}`);
      
      // Commit batch every 400 documents
      if (batchCount >= 400) {
        await batch.commit();
        console.log(`   📦 Committed batch of ${batchCount} updates`);
        batchCount = 0;
      }
    }
    
    // Commit remaining updates
    if (batchCount > 0) {
      await batch.commit();
      console.log(`   📦 Committed final batch of ${batchCount} updates`);
    }
    
    console.log(`\n✅ Character normalization complete!`);
    console.log(`   Invoices fixed: ${fixedCount}`);
    console.log(`   Character mappings applied: ${fixedEmployeeNames.size}`);
    
    // Step 5: Verify specific invoice D10124-Z003
    console.log(`\n🔍 Verifying invoice D10124-Z003...`);
    const specificInvoice = await db.collection('invoices')
      .where('invoice_number', '==', 'D10124-Z003')
      .get();
    
    if (!specificInvoice.empty) {
      const inv = specificInvoice.docs[0].data();
      console.log(`   Invoice: ${inv.invoice_number}`);
      console.log(`   Employee names: [${inv.employee_names?.join(', ') || 'None'}]`);
      console.log(`   n_employees: ${inv.n_employees}`);
      console.log(`   frequency: ${inv.frequency}`);
      console.log(`   amount: HK$${inv.amount}`);
      console.log(`   total: HK$${inv.total}`);
      
      const expectedTotal = (inv.amount || 0) * (inv.n_employees || 1) * (inv.frequency || 1);
      console.log(`   Expected calculation: HK$${inv.amount} × ${inv.n_employees} × ${inv.frequency} = HK$${expectedTotal}`);
      console.log(`   Status: ${inv.total === expectedTotal ? '✅ CORRECT' : '❌ STILL INCORRECT'}`);
    } else {
      console.log(`   ⚠️ Invoice D10124-Z003 not found`);
    }
    
    console.log(`\n📋 Summary of character fixes:`);
    Array.from(fixedEmployeeNames).forEach(fix => {
      console.log(`   • ${fix}`);
    });
    
  } catch (error) {
    console.error('❌ Error fixing character mismatches:', error);
  } finally {
    process.exit();
  }
}

// Run the fix
fixChineseCharacterMismatch(); 