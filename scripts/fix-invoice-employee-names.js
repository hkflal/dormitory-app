const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin SDK
try {
  const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'));
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
} catch (error) {
  console.error('Error initializing Firebase Admin SDK:', error);
  process.exit(1);
}

const db = admin.firestore();

// A simple mapping for characters that might differ.
// This is a basic approach. A more robust solution might use a library for character conversion.
const simplifiedToTraditionalMap = {
  '黄': '黃', '兰': '蘭', '香': '香', '陈': '陳', '梓': '梓', '梅': '梅', '叶': '葉',
  '钟': '鍾', '洁': '潔', '张': '張', '晓': '曉', '许': '許', '丽': '麗', '维': '維',
  '锡': '錫', '坚': '堅', '吴': '吳', '卢': '盧', '锦': '錦', '悦': '悅', '苏': '蘇',
  '国': '國', '罗': '羅', '长': '長', '结': '結', '华': '華', '谭': '譚', '荣': '榮',
  '谢': '謝', '远': '遠', '伟': '偉', '泽': '澤', '乐': '樂', '辉': '輝', '嘉': '嘉',
  '宁': '寧', '赖': '賴', '强': '強', '关': '關', '东': '東', '贵': '貴', '汉': '漢',
  '爱': '愛', '温': '溫', '欧': '歐', '颖': '穎', '练': '練', '潜': '潛', '邓': '鄧',
  '诺': '諾', '炜': '煒', '飞': '飛', '杰': '傑', '赐': '賜', '凤': '鳳', '晋': '晉',
  '刘': '劉', '银': '銀', '杨': '楊', '凯': '凱', '莲': '蓮', '艳': '豔', '开': '開',
  '劳': '勞', '发': '發', '冯': '馮', '腾': '騰', '绍': '紹', '贤': '賢', '焕': '煥',
  '连': '連', '荧': '螢', '劲': '勁', '阳': '陽', '达': '達', '铭': '銘', '颜': '顏'
  // Add other character mappings as needed
};

const convertToTraditional = (name) => {
  let traditionalName = '';
  for (const char of name) {
    traditionalName += simplifiedToTraditionalMap[char] || char;
  }
  return traditionalName;
};


async function fixInvoiceEmployeeNames() {
  console.log('Starting script to fix employee names in invoices...');

  try {
    // 1. Fetch all employees and group them by company
    const employeesSnapshot = await db.collection('employees').get();
    const employeesByCompany = {};
    employeesSnapshot.docs.forEach(doc => {
      const employee = doc.data();
      const company = employee.company || 'Unknown';
      if (!employeesByCompany[company]) {
        employeesByCompany[company] = [];
      }
      employeesByCompany[company].push(employee.name);
    });
    console.log(`Loaded ${employeesSnapshot.size} employees from ${Object.keys(employeesByCompany).length} companies.`);

    // 2. Fetch all invoices
    const invoicesSnapshot = await db.collection('invoices').get();
    console.log(`Found ${invoicesSnapshot.docs.length} invoices to check.`);

    const batch = db.batch();
    let updatedInvoicesCount = 0;
    const mappedNames = new Set();
    const unmappedNames = new Set();

    // 3. Iterate through invoices and update names
    invoicesSnapshot.forEach(doc => {
      const invoice = doc.data();
      const invoiceId = doc.id;
      const company = invoice.company || 'Unknown';
      const contractNumber = invoice.contract_number || 'N/A';
      let needsUpdate = false;

      if (invoice.employee_names && Array.isArray(invoice.employee_names)) {
        const companyEmployees = new Set(employeesByCompany[company] || []);
        
        if (companyEmployees.size === 0) {
          invoice.employee_names.forEach(name => {
            if(typeof name === 'string') unmappedNames.add(`${name.trim()} (Contract: ${contractNumber}, Company: ${company} - No employees found for this company)`);
          });
          return; // Skip to next invoice
        }

        const updatedNames = invoice.employee_names.map(name => {
          if (typeof name !== 'string') return name;

          // Clean name: remove suffixes like (1人)
          const cleanedName = name.replace(/\s*\(.*\)\s*/, '').trim();
          const traditionalNameGuess = convertToTraditional(cleanedName);

          if (companyEmployees.has(traditionalNameGuess)) {
            if (cleanedName !== traditionalNameGuess || name !== cleanedName) {
              needsUpdate = true;
            }
            mappedNames.add(`${name} -> ${traditionalNameGuess} (Contract: ${contractNumber})`);
            return traditionalNameGuess;
          }
          
          if (companyEmployees.has(cleanedName)) {
             if (name !== cleanedName) {
              needsUpdate = true;
            }
            mappedNames.add(`${name} -> ${cleanedName} (Contract: ${contractNumber})`);
            return cleanedName;
          }
          
          unmappedNames.add(`${name} (Contract: ${contractNumber}, Company: ${company})`);
          return name; // Return original name if no match
        });

        if (needsUpdate) {
          console.log(`Updating invoice ${invoiceId} (Contract: ${contractNumber}): [${invoice.employee_names.join(', ')}] -> [${updatedNames.join(', ')}]`);
          const invoiceRef = db.collection('invoices').doc(invoiceId);
          batch.update(invoiceRef, { employee_names: updatedNames });
          updatedInvoicesCount++;
        }
      }
    });

    // 4. Commit the batch update
    if (updatedInvoicesCount > 0) {
      await batch.commit();
      console.log(`Successfully updated ${updatedInvoicesCount} invoices.`);
    } else {
      console.log('No invoices needed updates.');
    }

    console.log('\n--- Mapping Report ---');
    console.log('\nSuccessfully Mapped Names:');
    if (mappedNames.size > 0) {
      mappedNames.forEach(name => console.log(`  - ${name}`));
    } else {
      console.log('  None');
    }

    console.log('\nUnmapped Names (Could not find in employees collection):');
    if (unmappedNames.size > 0) {
      unmappedNames.forEach(name => console.log(`  - ${name}`));
    } else {
      console.log('  None - All names were successfully mapped!');
    }

  } catch (error) {
    console.error('An error occurred:', error);
  } finally {
    console.log('Script finished.');
  }
}

fixInvoiceEmployeeNames().then(() => process.exit(0)); 