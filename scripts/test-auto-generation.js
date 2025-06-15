// Simple script to test auto-generation manually
const { exec } = require('child_process');

console.log('🧪 Testing auto-generation system...');

exec('node scripts/auto-generate-invoices.js', (error, stdout, stderr) => {
  if (error) {
    console.error(`❌ Error: ${error}`);
    return;
  }
  if (stderr) {
    console.error(`⚠️  Warning: ${stderr}`);
  }
  console.log(stdout);
  console.log('✅ Test completed!');
}); 