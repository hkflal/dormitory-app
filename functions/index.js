const { onRequest } = require('firebase-functions/v2/https');
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { setGlobalOptions } = require('firebase-functions/v2');
const admin = require('firebase-admin');
const cors = require('cors')({ origin: true });
const fs = require('fs');
const path = require('path');
const { createReport } = require('docx-templates');

// Add Chinese character normalization support
let OpenCC;
let simplifiedToTraditional;
try {
  OpenCC = require('opencc-js');
  simplifiedToTraditional = OpenCC.Converter({ from: 'cn', to: 'hk' });
} catch (error) {
  console.warn('OpenCC not available for Chinese character normalization:', error.message);
}

admin.initializeApp();

// Import and re-export the scheduled invoice generation function
const { scheduledInvoiceGeneration, scheduledManagementFeeGeneration } = require('./scheduled-invoice-generation');
exports.scheduledInvoiceGeneration = scheduledInvoiceGeneration;
exports.scheduledManagementFeeGeneration = scheduledManagementFeeGeneration;

// Import and re-export the scheduled employee status update function
const { scheduledEmployeeStatusUpdate, checkEmployeeStatuses, fixEmployeeStatus } = require('./scheduled-employee-status-update');
exports.scheduledEmployeeStatusUpdate = scheduledEmployeeStatusUpdate;
exports.checkEmployeeStatuses = checkEmployeeStatuses;
exports.fixEmployeeStatus = fixEmployeeStatus;

// Import and re-export the scheduled monthly snapshot functions
const { 
  scheduledMonthlySnapshot, 
  createMonthlySnapshotManual, 
  getMonthlySnapshots,
  backfillMonthlySnapshots 
} = require('./scheduled-monthly-snapshot');
exports.scheduledMonthlySnapshot = scheduledMonthlySnapshot;
exports.createMonthlySnapshotManual = createMonthlySnapshotManual;
exports.getMonthlySnapshots = getMonthlySnapshots;
exports.backfillMonthlySnapshots = backfillMonthlySnapshots;

// Set global options for all functions
setGlobalOptions({ 
    maxInstances: 10,
    timeoutSeconds: 540,
    memory: '1GiB'
});

// Helper functions
const calculateTotal = (amount, nEmployees, frequency) => {
    const unitPrice = parseFloat(amount) || 0;
    const employees = parseInt(nEmployees) || 1;
    const period = parseInt(frequency) || 1;
    return unitPrice * employees * period;
};

// Chinese character normalization helper
const normalizeChineseNames = (employeeNames) => {
    if (!Array.isArray(employeeNames) || !simplifiedToTraditional) {
        return employeeNames;
    }
    
    return employeeNames.map(name => {
        if (typeof name === 'string') {
            const normalizedName = simplifiedToTraditional(name.trim());
            if (normalizedName !== name.trim()) {
                console.log(`🔤 Normalized Chinese characters: "${name.trim()}" → "${normalizedName}"`);
            }
            return normalizedName;
        }
        return name;
    });
};

// Enhanced currency utilities (inline for compatibility)

// We'll define the enhanced currency functions inline for compatibility
const cleanCurrencySymbols = (amount) => {
  if (typeof amount === 'number') return amount;
  if (!amount) return 0;
  
  // Convert to string and remove all currency symbols
  const cleanedAmount = String(amount)
    .replace(/\$HK/gi, '')  // Remove $HK
    .replace(/HK\$/gi, '')  // Remove HK$
    .replace(/\$/g, '')     // Remove $
    .replace(/港币|港元/g, '') // Remove Chinese currency terms
    .replace(/[^\d.,\-]/g, '') // Remove any other non-numeric characters except commas, dots, and minus
    .replace(/,/g, '');     // Remove commas
    
  return parseFloat(cleanedAmount) || 0;
};

/**
 * GATEKEEPING FUNCTION: Ensures invoice data has clean numeric amounts before generation
 * This function validates and cleans all amount-related fields in invoice data
 * @param {Object} invoiceData - Raw invoice data that may contain currency symbols
 * @returns {Object} Cleaned invoice data with numeric amounts only
 */
const validateAndCleanInvoiceAmounts = (invoiceData) => {
  console.log('🛡️ GATEKEEPING: Validating and cleaning invoice amounts...');
  
  // Log original data for debugging
  console.log('📥 Original amount data:', {
    amount: invoiceData.amount,
    total: invoiceData.total,
    amount_type: typeof invoiceData.amount,
    total_type: typeof invoiceData.total
  });
  
  const cleanedData = { ...invoiceData };
  
  // Clean the main amount field
  if (cleanedData.amount !== undefined && cleanedData.amount !== null) {
    const originalAmount = cleanedData.amount;
    cleanedData.amount = cleanCurrencySymbols(originalAmount);
    
    if (originalAmount !== cleanedData.amount) {
      console.log(`🧹 Cleaned amount: "${originalAmount}" → ${cleanedData.amount}`);
    }
  }
  
  // Clean the total field
  if (cleanedData.total !== undefined && cleanedData.total !== null) {
    const originalTotal = cleanedData.total;
    cleanedData.total = cleanCurrencySymbols(originalTotal);
    
    if (originalTotal !== cleanedData.total) {
      console.log(`🧹 Cleaned total: "${originalTotal}" → ${cleanedData.total}`);
    }
  }
  
  // Validate that amounts are valid numbers
  if (isNaN(cleanedData.amount) || cleanedData.amount <= 0) {
    console.warn(`⚠️ Invalid amount detected: ${cleanedData.amount}, setting to 0`);
    cleanedData.amount = 0;
  }
  
  // Fix edge case: handle null/undefined totals properly
  if (cleanedData.total === undefined || cleanedData.total === null || isNaN(cleanedData.total) || cleanedData.total < 0) {
    console.log(`🔧 Setting total to match amount: ${cleanedData.amount}`);
    cleanedData.total = cleanedData.amount;
  }
  
  // Log cleaned data for verification
  console.log('📤 Cleaned amount data:', {
    amount: cleanedData.amount,
    total: cleanedData.total,
    amount_type: typeof cleanedData.amount,
    total_type: typeof cleanedData.total
  });
  
  console.log('✅ GATEKEEPING: Invoice amounts validated and cleaned');
  return cleanedData;
};

const calculateTotalUtil = (amount, nEmployees, frequency) => {
  const unitPrice = cleanCurrencySymbols(amount);
  const employees = parseInt(nEmployees) || 1;
  const period = parseInt(frequency) || 1;
  return unitPrice * employees * period;
};

const formatCurrency = (amount) => {
    // Use enhanced currency formatting that strips all currency symbols
    const numericAmount = cleanCurrencySymbols(amount);
    return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
        useGrouping: true
    }).format(numericAmount);
};

const formatDate = (date) => {
    if (!date) return 'N/A';
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleDateString('zh-HK');
};

async function getCompanyName(employeeNames) {
    const fallbackCompany = ''; // Define fallback once
    if (!employeeNames || !Array.isArray(employeeNames) || employeeNames.length === 0) {
        console.log('No employee names provided, using fallback.');
        return fallbackCompany;
    }

    const db = admin.firestore();
    const employeesRef = db.collection('employees');
    
    // Clean the names list to ensure no empty strings are queried
    const validNames = employeeNames.filter(name => name && typeof name === 'string' && name.trim() !== '');
    if (validNames.length === 0) {
        console.log('Employee names array was empty after cleaning, using fallback.');
        return fallbackCompany;
    }
    
    try {
        console.log(`Querying for company name with employee names: ${validNames.join(', ')}`);
        const snapshot = await employeesRef.where('name', 'in', validNames).get();

        if (snapshot.empty) {
            console.log(`No employees found for names: [${validNames.join(', ')}]. Using fallback.`);
            return fallbackCompany;
        }

        // Find the first employee with a valid company name
        for (const doc of snapshot.docs) {
            const employee = doc.data();
            if (employee.company && employee.company.trim() !== '') {
                console.log(`Found company "${employee.company}" for employee "${employee.name}".`);
                return employee.company;
            }
        }
        
        console.log(`None of the found employees [${validNames.join(', ')}] had a valid company name. Using fallback.`);
        return fallbackCompany; // Fallback if no employee has a company
        
    } catch (error) {
        console.error(`Error fetching company name for [${validNames.join(', ')}]:`, error);
        return fallbackCompany; // Fallback on error
    }
}

// Enhanced DOCX Template Processing Function
async function processDocxTemplate(templatePath, invoiceData, companyName) {
    try {
        console.log(`📄 Processing template: ${templatePath}`);
        console.log(`�� Invoice data:`, {
            invoice_number: invoiceData.invoice_number,
            contract_number: invoiceData.contract_number,
            is_deposit: invoiceData.is_deposit,
            auto_generated: invoiceData.auto_generated,
            amount: invoiceData.amount,
            employee_names: invoiceData.employee_names
        });
        
        // Read the template file
        const templateBuffer = fs.readFileSync(templatePath);
        
        // APPLY GATEKEEPING: Clean all amounts before processing
        const cleanedInvoiceData = validateAndCleanInvoiceAmounts(invoiceData);
        
        // Calculate total amount using computed fields with enhanced fallback logic and currency cleaning
        const unitPrice = cleanedInvoiceData.amount; // Already cleaned by gatekeeping function
        
        // Normalize Chinese characters in employee names
        const normalizedEmployeeNames = normalizeChineseNames(cleanedInvoiceData.employee_names);
        
        // Enhanced fallback: if n_employees is missing, calculate from employee_names array
        let nEmployees = parseInt(cleanedInvoiceData.n_employees);
        if (!nEmployees || nEmployees <= 0) {
            nEmployees = Array.isArray(normalizedEmployeeNames) ? 
                normalizedEmployeeNames.filter(name => name && name.trim().length > 0).length : 1;
            
            // Log warning for missing computed field
            if (Array.isArray(normalizedEmployeeNames) && normalizedEmployeeNames.length > 1) {
                console.warn(`⚠️ Invoice ${cleanedInvoiceData.invoice_number} missing n_employees field, calculated from employee_names: ${nEmployees}`);
            }
        }
        
        const frequency = parseInt(cleanedInvoiceData.frequency) || 1;
        const totalAmount = calculateTotalUtil(unitPrice, nEmployees, frequency);
        
        // Prepare template data with enhanced field mapping
        const templateData = {
            // Basic info - matching template placeholders
            issue_date: formatDate(cleanedInvoiceData.created_at || new Date()),
            invoice_number: cleanedInvoiceData.invoice_number || '',
            contract_number: cleanedInvoiceData.contract_number || '',
            
            // Company info
            company: companyName,
            company_address: '香港',
            
            // Employee info (using normalized Chinese characters)
            employee_names: Array.isArray(normalizedEmployeeNames) 
                ? normalizedEmployeeNames.join(', ') 
                : (normalizedEmployeeNames || 'N/A'),
            n_employees: nEmployees,
            n: cleanedInvoiceData.n || nEmployees, // For deposit template
            
            // Financial info
            amount: formatCurrency(unitPrice),
            frequency: frequency,
            total_amount: formatCurrency(totalAmount),
            unit_price: formatCurrency(unitPrice),
            
            // Date info
            start_date: formatDate(cleanedInvoiceData.start_date),
            end_date: formatDate(cleanedInvoiceData.end_date),
            
            // Property info
            property_name: cleanedInvoiceData.property_name || '',
            room_number: cleanedInvoiceData.room_number || '',
            
            // Other fields
            notes: cleanedInvoiceData.notes || '',
            tenant_name: Array.isArray(normalizedEmployeeNames) 
                ? normalizedEmployeeNames[0] 
                : normalizedEmployeeNames || '',
            due_date: formatDate(cleanedInvoiceData.start_date),
            payment_method: '銀行轉帳',
            
            // Special fields for auto-generated invoices
            auto_generated_tag: cleanedInvoiceData.auto_generated ? '自動生成' : '',
            renewal_tag: cleanedInvoiceData.renewal_tag || '',
            
            // Legacy fields for backward compatibility
            date: new Date().toLocaleDateString('zh-HK'),
            is_deposit: cleanedInvoiceData.is_deposit ? '押金' : '租金',
            generated_at: new Date().toLocaleString('zh-HK')
        };
        
        console.log(`📊 Template data prepared:`, templateData);
        
        // Use docx-templates createReport with correct delimiters
        const docxBuffer = await createReport({
            template: templateBuffer,
            data: templateData,
            cmdDelimiter: ['{', '}'], // Single curly braces for your templates
            literalXmlDelimiter: ['{{', '}}'],
            processLineBreaks: true
        });
        
        console.log(`✅ DOCX buffer generated successfully (${docxBuffer.length} bytes)`);
        return docxBuffer;
        
    } catch (error) {
        console.error('❌ Error processing DOCX template:', error);
        console.error('Template path:', templatePath);
        console.error('Invoice data:', invoiceData);
        throw error;
    }
}

// Enhanced Auto-generate DOCX when new invoice is created
exports.generateInvoiceDocxTrigger = onDocumentCreated('invoices/{invoiceId}', async (event) => {
    try {
        const invoiceId = event.params.invoiceId;
        const rawInvoiceData = event.data.data();
        
        // APPLY GATEKEEPING: Clean amounts before processing
        const invoiceData = validateAndCleanInvoiceAmounts(rawInvoiceData);
        
        // FIXED: Use invoiceId as fallback for missing invoice_number and contract_number
        const invoiceNumber = invoiceData.invoice_number || invoiceId;
        const contractNumber = invoiceData.contract_number || 'UNKNOWN';
        
        console.log(`🤖 Auto-generating DOCX for invoice: ${invoiceNumber} (ID: ${invoiceId})`);
        console.log(`📋 Invoice type: ${invoiceData.auto_generated ? 'Auto-generated' : 'Manual'}`);
        console.log(`📋 Contract: ${contractNumber}`);
        
        // Add initial status update
        await admin.firestore().collection('invoices').doc(invoiceId).update({
            docx_generation_status: 'processing',
            docx_generation_started_at: admin.firestore.FieldValue.serverTimestamp()
        });
        
        // Determine template type - Use new templates from public directory
        const templateName = invoiceData.is_deposit ? 'deposit_template.docx' : 'invoice_template.docx';
        const templatePath = path.join(__dirname, 'templates', templateName);
        
        console.log(`📄 Auto-generation template selection:`, {
            templateName,
            templatePath,
            templateExists: fs.existsSync(templatePath)
        });

        if (!fs.existsSync(templatePath)) {
            console.error(`❌ Template not found: ${templateName} at ${templatePath}`);
            throw new Error(`Template not found: ${templateName} at ${templatePath}`);
        }
        
        console.log(`✅ Using template for auto-generation: ${templatePath}`);
        
        const companyName = await getCompanyName(invoiceData.employee_names);
        const docxBuffer = await processDocxTemplate(templatePath, invoiceData, companyName);
        
        // Upload to Firebase Storage - FIXED: Use fallback values
        const bucket = admin.storage().bucket();
        const fileName = `invoices/${contractNumber}/${invoiceNumber}.docx`;
        const file = bucket.file(fileName);
        
        console.log(`📤 Uploading to Storage: ${fileName}`);
        
        await file.save(docxBuffer, {
            metadata: {
                contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                cacheControl: 'public, max-age=31536000'
            }
        });
        
        // Make file publicly accessible
        await file.makePublic();
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
        
        console.log(`🔗 Public URL: ${publicUrl}`);
        
        // Update invoice record with download URL and success status
        await admin.firestore().collection('invoices').doc(invoiceId).update({
            docx_url: publicUrl,
            company: companyName, // Persist the fetched company name
            docx_generated_at: admin.firestore.FieldValue.serverTimestamp(),
            docx_file_path: fileName,
            docx_generation_status: 'success',
            docx_generation_completed_at: admin.firestore.FieldValue.serverTimestamp()
        });
        
        console.log(`✅ DOCX generated and uploaded: ${fileName}`);
        
    } catch (error) {
        console.error('❌ Error in generateInvoiceDocxTrigger:', error);
        
        try {
            await admin.firestore().collection('invoices').doc(event.params.invoiceId).update({
                docx_generation_error: error.message,
                docx_generation_failed_at: admin.firestore.FieldValue.serverTimestamp(),
                docx_generation_status: 'failed'
            });
        } catch (updateError) {
            console.error('❌ Failed to update error status:', updateError);
        }
    }
});

// Enhanced trigger for regeneration requests
exports.generateInvoiceDocxRegenerationTrigger = onDocumentUpdated('invoices/{invoiceId}', async (event) => {
    try {
        const invoiceId = event.params.invoiceId;
        const beforeData = event.data.before.data();
        const afterData = event.data.after.data();
        
        // Check if regeneration was requested
        const regenerationRequested = afterData.docx_regeneration_requested && 
                                    !beforeData.docx_regeneration_requested;
        
        if (!regenerationRequested) {
            return; // Not a regeneration request
        }
        
        console.log(`🔄 Regeneration requested for invoice: ${afterData.invoice_number}`);
        
        // Process the same way as new document creation
        await admin.firestore().collection('invoices').doc(invoiceId).update({
            docx_generation_status: 'processing',
            docx_generation_started_at: admin.firestore.FieldValue.serverTimestamp()
        });
        
        const templateName = afterData.is_deposit ? 'deposit_template.docx' : 'invoice_template.docx';
        const templatePath = path.join(__dirname, 'templates', templateName);
        
        console.log(`📄 Regeneration template selection:`, {
            templateName,
            templatePath,
            templateExists: fs.existsSync(templatePath)
        });
        
        if (!fs.existsSync(templatePath)) {
            console.error(`❌ Template not found: ${templateName} at ${templatePath}`);
            throw new Error(`Template not found: ${templateName} at ${templatePath}`);
        }
        
        console.log(`✅ Using template for regeneration: ${templatePath}`);
        
        // APPLY GATEKEEPING: Clean amounts before processing (same as other functions)
        const cleanedInvoiceData = validateAndCleanInvoiceAmounts(afterData);
        
        const companyName = await getCompanyName(cleanedInvoiceData.employee_names);
        const docxBuffer = await processDocxTemplate(templatePath, cleanedInvoiceData, companyName);
        
        const bucket = admin.storage().bucket();
        const fileName = `invoices/${cleanedInvoiceData.contract_number}/${cleanedInvoiceData.invoice_number}.docx`;
        const file = bucket.file(fileName);
        
        await file.save(docxBuffer, {
            metadata: {
                contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            }
        });
        
        await file.makePublic();
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
        
        await admin.firestore().collection('invoices').doc(invoiceId).update({
            docx_url: publicUrl,
            company: companyName, // Persist the fetched company name
            docx_regenerated_at: admin.firestore.FieldValue.serverTimestamp(),
            docx_file_path: fileName,
            docx_generation_status: 'success',
            docx_regeneration_requested: admin.firestore.FieldValue.delete()
        });
        
        console.log(`✅ DOCX regenerated successfully: ${fileName}`);
        
    } catch (error) {
        console.error('❌ Error in regeneration trigger:', error);
        
        try {
            await admin.firestore().collection('invoices').doc(event.params.invoiceId).update({
                docx_generation_error: error.message,
                docx_generation_failed_at: admin.firestore.FieldValue.serverTimestamp(),
                docx_generation_status: 'failed'
            });
        } catch (updateError) {
            console.error('Failed to update error status:', updateError);
        }
    }
});

// Enhanced Manual DOCX generation endpoint
exports.generateInvoiceDocxManual = onRequest(async (req, res) => {
    return cors(req, res, async () => {
        try {
            const { invoiceId } = req.query;
            
            if (!invoiceId) {
                return res.status(400).json({ error: 'Invoice ID is required' });
            }

            const invoiceDoc = await admin.firestore().collection('invoices').doc(invoiceId).get();
            
            if (!invoiceDoc.exists) {
                return res.status(404).json({ error: 'Invoice not found' });
            }

            const rawInvoiceData = invoiceDoc.data();
            
            // APPLY GATEKEEPING: Clean amounts before processing
            const invoiceData = validateAndCleanInvoiceAmounts(rawInvoiceData);
            console.log(`📄 Manual DOCX generation for: ${invoiceData.invoice_number}`);
            console.log(`📄 Invoice data:`, {
                is_deposit: invoiceData.is_deposit,
                status: invoiceData.status,
                template_type: invoiceData.template_type
            });
            
            // Determine template type - Use new templates from public directory
            const templateName = invoiceData.is_deposit ? 'deposit_template.docx' : 'invoice_template.docx';
            const templatePath = path.join(__dirname, 'templates', templateName);
            
            console.log(`📄 Template selection:`, {
                templateName,
                templatePath,
                templateExists: fs.existsSync(templatePath)
            });
            
            if (!fs.existsSync(templatePath)) {
                console.error(`❌ Template not found: ${templateName} at ${templatePath}`);
                return res.status(404).json({ error: `Template not found: ${templateName}` });
            }
            
            console.log(`✅ Using template: ${templatePath}`);
            
            const companyName = await getCompanyName(invoiceData.employee_names);

            // If the company name in the DB is wrong, update it
            if (invoiceData.company !== companyName) {
                await admin.firestore().collection('invoices').doc(invoiceId).update({ company: companyName });
            }

            // Generate DOCX
            const docxBuffer = await processDocxTemplate(templatePath, invoiceData, companyName);
            
            // Return the DOCX file directly
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
            res.setHeader('Content-Disposition', `attachment; filename="${invoiceData.invoice_number}.docx"`);
            res.send(docxBuffer);

        } catch (error) {
            console.error('Error in manual DOCX generation:', error);
            res.status(500).json({ error: 'Failed to process request', details: error.message });
        }
    });
});

// Keep existing regeneration function
exports.regenerateInvoiceDocx = onRequest(async (req, res) => {
    return cors(req, res, async () => {
        try {
            const { invoiceIds } = req.body;
            
            if (!invoiceIds || !Array.isArray(invoiceIds)) {
                return res.status(400).json({ error: 'Invoice IDs array is required' });
            }

            const results = [];
            
            for (const invoiceId of invoiceIds) {
                try {
                    const invoiceDoc = await admin.firestore().collection('invoices').doc(invoiceId).get();
                    
                    if (!invoiceDoc.exists) {
                        results.push({
                            invoiceId,
                            success: false,
                            error: 'Invoice not found'
                        });
                        continue;
                    }
                    
                    const invoiceData = invoiceDoc.data();
                    
                    // Generate DOCX using enhanced function - Use new templates from public directory
                    const templateName = invoiceData.is_deposit ? 'deposit_template.docx' : 'invoice_template.docx';
                    const templatePath = path.join(__dirname, 'templates', templateName);
                    
                    console.log(`📄 Bulk regeneration template selection for ${invoiceData.invoice_number}:`, {
                        templateName,
                        templatePath,
                        templateExists: fs.existsSync(templatePath)
                    });
                    
                    if (!fs.existsSync(templatePath)) {
                        console.error(`❌ Template not found: ${templateName} at ${templatePath}`);
                        results.push({
                            invoiceId,
                            success: false,
                            error: `Template not found: ${templateName}`
                        });
                        continue;
                    }
                    
                    console.log(`✅ Using template for bulk regeneration: ${templatePath}`);
                    
                    const companyName = await getCompanyName(invoiceData.employee_names);
                    const docxBuffer = await processDocxTemplate(templatePath, invoiceData, companyName);
                    
                    // Upload to Firebase Storage
                    const bucket = admin.storage().bucket();
                    const fileName = `invoices/${invoiceData.contract_number}/${invoiceData.invoice_number}.docx`;
                    const file = bucket.file(fileName);
                    
                    await file.save(docxBuffer, {
                        metadata: {
                            contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                        }
                    });
                    
                    await file.makePublic();
                    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
                    
                    // Update the invoice document
                    await admin.firestore().collection('invoices').doc(invoiceId).update({
                        docx_url: publicUrl,
                        company: companyName, // Persist the fetched company name
                        docx_regenerated_at: admin.firestore.FieldValue.serverTimestamp(),
                        docx_file_path: fileName,
                        docx_generation_status: 'success'
                    });
                    
                    results.push({
                        invoiceId,
                        success: true,
                        url: publicUrl,
                        filename: `${invoiceData.invoice_number}.docx`
                    });
                    
                } catch (error) {
                    results.push({
                        invoiceId,
                        success: false,
                        error: error.message
                    });
                }
            }

            res.json({ 
                success: true, 
                results,
                totalProcessed: invoiceIds.length,
                successCount: results.filter(r => r.success).length
            });

        } catch (error) {
            console.error('Error regenerating DOCX files:', error);
            res.status(500).json({ error: 'Bulk DOCX regeneration failed', details: error.message });
        }
    });
});

// Keep existing process invoice data function
exports.processInvoiceData = onRequest(async (req, res) => {
    return cors(req, res, async () => {
        try {
            const { action, data } = req.body;

            switch (action) {
                case 'bulk_update_status':
                    const { invoiceIds, newStatus } = data;
                    const batch = admin.firestore().batch();
                    
                    for (const id of invoiceIds) {
                        const ref = admin.firestore().collection('invoices').doc(id);
                        batch.update(ref, { status: newStatus, updated_at: admin.firestore.FieldValue.serverTimestamp() });
                    }
                    
                    await batch.commit();
                    res.json({ success: true, message: `Updated ${invoiceIds.length} invoices` });
                    break;

                case 'recalculate_computed_fields':
                    const invoicesSnapshot = await admin.firestore().collection('invoices').get();
                    const updateBatch = admin.firestore().batch();
                    let updateCount = 0;
                    
                    invoicesSnapshot.forEach(doc => {
                        const invoiceData = doc.data();
                        
                        // Calculate frequency
                        let frequency = 1;
                        if (invoiceData.start_date && invoiceData.end_date) {
                            const startDate = invoiceData.start_date.toDate ? invoiceData.start_date.toDate() : new Date(invoiceData.start_date);
                            const endDate = invoiceData.end_date.toDate ? invoiceData.end_date.toDate() : new Date(invoiceData.end_date);
                            const diffTime = Math.abs(endDate - startDate);
                            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                            
                            if (diffDays <= 45) {
                                frequency = 1;
                            } else if (diffDays <= 135) {
                                frequency = 3;
                            } else {
                                frequency = Math.round(diffDays / 30);
                            }
                        }
                        
                        // Calculate n_employees
                        const nEmployees = Array.isArray(invoiceData.employee_names) 
                            ? invoiceData.employee_names.filter(name => name && name.trim().length > 0).length 
                            : 0;
                        
                        updateBatch.update(doc.ref, {
                            frequency: frequency,
                            n_employees: nEmployees,
                            computed_fields_updated: admin.firestore.FieldValue.serverTimestamp()
                        });
                        
                        updateCount++;
                    });
                    
                    await updateBatch.commit();
                    res.json({ success: true, message: `Recalculated computed fields for ${updateCount} invoices` });
                    break;

                default:
                    res.status(400).json({ error: 'Unknown action' });
            }

        } catch (error) {
            console.error('Error processing invoice data:', error);
            res.status(500).json({ error: 'Processing failed', details: error.message });
        }
    });
});

// Health check function
exports.healthCheck = onRequest(async (req, res) => {
    return cors(req, res, async () => {
        try {
            // Check template files
            const invoiceTemplatePath = path.join(__dirname, 'templates', 'invoice_template.docx');
            const depositTemplatePath = path.join(__dirname, 'templates', 'deposit_template.docx');
            
            const templatesExist = {
                invoice_template: fs.existsSync(invoiceTemplatePath),
                deposit_template: fs.existsSync(depositTemplatePath)
            };
            
            // Get function status
            const status = {
                timestamp: new Date().toISOString(),
                functions: {
                    generateInvoiceDocxTrigger: 'active',
                    generateInvoiceDocxManual: 'active',
                    regenerateInvoiceDocx: 'active',
                    processInvoiceData: 'active'
                },
                templates: templatesExist,
                environment: {
                    node_version: process.version,
                    memory_usage: process.memoryUsage()
                }
            };
            
            res.json(status);
            
        } catch (error) {
            res.status(500).json({ error: 'Health check failed', details: error.message });
        }
    });
}); 