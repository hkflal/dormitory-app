const { onRequest } = require('firebase-functions/v2/https');
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { setGlobalOptions } = require('firebase-functions/v2');
const admin = require('firebase-admin');
const cors = require('cors')({ origin: true });
const fs = require('fs');
const path = require('path');
const { createReport } = require('docx-templates');

admin.initializeApp();

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

const formatCurrency = (amount) => {
    return `HK$${parseFloat(amount || 0).toFixed(2)}`;
};

const formatDate = (date) => {
    if (!date) return 'N/A';
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleDateString('zh-HK');
};

// Enhanced DOCX Template Processing Function
async function processDocxTemplate(templatePath, invoiceData) {
    try {
        console.log(`📄 Processing template: ${templatePath}`);
        console.log(`📋 Invoice data:`, {
            invoice_number: invoiceData.invoice_number,
            contract_number: invoiceData.contract_number,
            is_deposit: invoiceData.is_deposit,
            auto_generated: invoiceData.auto_generated,
            amount: invoiceData.amount,
            employee_names: invoiceData.employee_names
        });
        
        // Read the template file
        const templateBuffer = fs.readFileSync(templatePath);
        
        // Calculate total amount using computed fields
        const unitPrice = parseFloat(invoiceData.amount) || 0;
        const nEmployees = parseInt(invoiceData.n_employees) || 1;
        const frequency = parseInt(invoiceData.frequency) || 1;
        const totalAmount = calculateTotal(unitPrice, nEmployees, frequency);
        
        // Prepare template data with enhanced field mapping
        const templateData = {
            // Basic info - matching template placeholders
            issue_date: formatDate(invoiceData.created_at || new Date()),
            invoice_number: invoiceData.invoice_number || '',
            contract_number: invoiceData.contract_number || '',
            
            // Company info
            company: '港舍宿舍管理',
            company_address: '香港',
            
            // Employee info
            employee_names: Array.isArray(invoiceData.employee_names) 
                ? invoiceData.employee_names.join(', ') 
                : (invoiceData.employee_names || 'N/A'),
            n_employees: nEmployees,
            n: invoiceData.n || nEmployees, // For deposit template
            
            // Financial info
            amount: formatCurrency(unitPrice),
            frequency: frequency,
            total_amount: formatCurrency(totalAmount),
            unit_price: formatCurrency(unitPrice),
            
            // Date info
            start_date: formatDate(invoiceData.start_date),
            end_date: formatDate(invoiceData.end_date),
            
            // Property info
            property_name: invoiceData.property_name || '',
            room_number: invoiceData.room_number || '',
            
            // Other fields
            notes: invoiceData.notes || '',
            tenant_name: Array.isArray(invoiceData.employee_names) 
                ? invoiceData.employee_names[0] 
                : invoiceData.employee_names || '',
            due_date: formatDate(invoiceData.start_date),
            payment_method: '銀行轉帳',
            
            // Special fields for auto-generated invoices
            auto_generated_tag: invoiceData.auto_generated ? '自動生成' : '',
            renewal_tag: invoiceData.renewal_tag || '',
            
            // Legacy fields for backward compatibility
            date: new Date().toLocaleDateString('zh-HK'),
            is_deposit: invoiceData.is_deposit ? '押金' : '租金',
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
        const invoiceData = event.data.data();
        
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
        
        // Determine template type
        const templateName = invoiceData.is_deposit ? 'deposit_template.docx' : 'invoice_template.docx';
        const templatePath = path.join(__dirname, 'templates', templateName);
        
        console.log(`📄 Looking for template at: ${templatePath}`);
        console.log(`📄 Template exists: ${fs.existsSync(templatePath)}`);

        if (!fs.existsSync(templatePath)) {
            throw new Error(`Template not found: ${templateName} at ${templatePath}`);
        }
        
        // Generate DOCX
        const docxBuffer = await processDocxTemplate(templatePath, invoiceData);
        
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
        
        if (!fs.existsSync(templatePath)) {
            throw new Error(`Template not found: ${templateName} at ${templatePath}`);
        }
        
        const docxBuffer = await processDocxTemplate(templatePath, afterData);
        
        const bucket = admin.storage().bucket();
        const fileName = `invoices/${afterData.contract_number}/${afterData.invoice_number}.docx`;
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

            const invoiceData = invoiceDoc.data();
            console.log(`📄 Manual DOCX generation for: ${invoiceData.invoice_number}`);
            
            // Determine template type
            const templateName = invoiceData.is_deposit ? 'deposit_template.docx' : 'invoice_template.docx';
            const templatePath = path.join(__dirname, 'templates', templateName);
            
            if (!fs.existsSync(templatePath)) {
                return res.status(404).json({ error: `Template not found: ${templateName}` });
            }
            
            // Generate DOCX
            const docxBuffer = await processDocxTemplate(templatePath, invoiceData);
            
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
                    
                    // Generate DOCX using enhanced function
                    const templateName = invoiceData.is_deposit ? 'deposit_template.docx' : 'invoice_template.docx';
                    const templatePath = path.join(__dirname, 'templates', templateName);
                    
                    if (!fs.existsSync(templatePath)) {
                        results.push({
                            invoiceId,
                            success: false,
                            error: `Template not found: ${templateName}`
                        });
                        continue;
                    }
                    
                    const docxBuffer = await processDocxTemplate(templatePath, invoiceData);
                    
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