const { onRequest } = require('firebase-functions/v2/https');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { setGlobalOptions } = require('firebase-functions/v2');
const admin = require('firebase-admin');
const puppeteer = require('puppeteer');
const handlebars = require('handlebars');
const cors = require('cors')({ origin: true });
const fs = require('fs');
const path = require('path');
const { createReport } = require('docx-templates');

admin.initializeApp();

// Set global options for all functions
setGlobalOptions({ maxInstances: 10 });

// PDF Invoice Template
const invoiceTemplate = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Invoice {{invoiceNumber}}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .header { text-align: center; margin-bottom: 40px; }
        .company-name { font-size: 24px; font-weight: bold; color: #333; }
        .invoice-title { font-size: 20px; margin-top: 10px; }
        .invoice-info { margin: 30px 0; }
        .invoice-details { display: flex; justify-content: space-between; margin: 20px 0; }
        .invoice-details div { flex: 1; }
        .table { width: 100%; border-collapse: collapse; margin: 30px 0; }
        .table th, .table td { border: 1px solid #ddd; padding: 12px; text-align: left; }
        .table th { background-color: #f5f5f5; }
        .total { text-align: right; font-size: 18px; font-weight: bold; margin-top: 20px; }
        .footer { margin-top: 50px; text-align: center; color: #666; }
    </style>
</head>
<body>
    <div class="header">
        <div class="company-name">Dormitory Management</div>
        <div class="invoice-title">INVOICE</div>
    </div>
    
    <div class="invoice-info">
        <div class="invoice-details">
            <div>
                <strong>Invoice Number:</strong> {{invoiceNumber}}<br>
                <strong>Contract Number:</strong> {{contractNumber}}<br>
                <strong>Issue Date:</strong> {{issueDate}}
            </div>
            <div>
                <strong>Rental Period:</strong><br>
                {{startDate}} to {{endDate}}
            </div>
        </div>
    </div>
    
    <table class="table">
        <thead>
            <tr>
                <th>Description</th>
                <th>Tenant(s)</th>
                <th>Period</th>
                <th>Amount (HK$)</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td>Dormitory Rental</td>
                <td>{{employeeNames}}</td>
                <td>{{startDate}} - {{endDate}}</td>
                <td>{{amount}}</td>
            </tr>
        </tbody>
    </table>
    
    <div class="total">
        Total Amount: HK$ {{amount}}
    </div>
    
    <div class="footer">
        <p>Please make payment by the due date to avoid late fees.</p>
        <p>Thank you for your business!</p>
    </div>
</body>
</html>
`;

// Generate Invoice PDF Function
exports.generateInvoicePDF = onRequest(async (req, res) => {
    return cors(req, res, async () => {
        try {
            const { invoiceId } = req.query;
            
            if (!invoiceId) {
                return res.status(400).json({ error: 'Invoice ID is required' });
            }

            // Get invoice data from Firestore
            const invoiceDoc = await admin.firestore().collection('invoices').doc(invoiceId).get();
            
            if (!invoiceDoc.exists) {
                return res.status(404).json({ error: 'Invoice not found' });
            }

            const invoiceData = invoiceDoc.data();
            
            // Format dates
            const formatDatePDF = (date) => {
                if (!date) return 'N/A';
                const d = date.toDate ? date.toDate() : new Date(date);
                return d.toLocaleDateString('en-GB');
            };

            // Calculate total amount using computed fields
            const unitPrice = parseFloat(invoiceData.amount) || 0;
            const nEmployees = parseInt(invoiceData.n_employees) || 1;
            const frequency = parseInt(invoiceData.frequency) || 1;
            const totalAmount = unitPrice * nEmployees * frequency;

            // Prepare template data
            const templateData = {
                invoiceNumber: invoiceData.invoice_number || 'N/A',
                contractNumber: invoiceData.contract_number || 'N/A',
                issueDate: formatDatePDF(invoiceData.created_at),
                startDate: formatDatePDF(invoiceData.start_date),
                endDate: formatDatePDF(invoiceData.end_date),
                employeeNames: Array.isArray(invoiceData.employee_names) 
                    ? invoiceData.employee_names.join(', ') 
                    : (invoiceData.employee_names || 'N/A'),
                amount: totalAmount.toFixed(2)
            };

            // Simple HTML template for PDF
            const htmlTemplate = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <title>Invoice ${templateData.invoiceNumber}</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 40px; }
                    .header { text-align: center; margin-bottom: 40px; }
                    .company-name { font-size: 24px; font-weight: bold; color: #333; }
                    .invoice-title { font-size: 20px; margin-top: 10px; }
                    .invoice-info { margin: 30px 0; }
                    .invoice-details { display: flex; justify-content: space-between; margin: 20px 0; }
                    .invoice-details div { flex: 1; }
                    .table { width: 100%; border-collapse: collapse; margin: 30px 0; }
                    .table th, .table td { border: 1px solid #ddd; padding: 12px; text-align: left; }
                    .table th { background-color: #f5f5f5; }
                    .total { text-align: right; font-size: 18px; font-weight: bold; margin-top: 20px; }
                    .footer { margin-top: 50px; text-align: center; color: #666; }
                </style>
            </head>
            <body>
                <div class="header">
                    <div class="company-name">Dormitory Management</div>
                    <div class="invoice-title">INVOICE</div>
                </div>
                
                <div class="invoice-info">
                    <div class="invoice-details">
                        <div>
                            <strong>Invoice Number:</strong> ${templateData.invoiceNumber}<br>
                            <strong>Contract Number:</strong> ${templateData.contractNumber}<br>
                            <strong>Issue Date:</strong> ${templateData.issueDate}
                        </div>
                        <div>
                            <strong>Rental Period:</strong><br>
                            ${templateData.startDate} to ${templateData.endDate}
                        </div>
                    </div>
                </div>
                
                <table class="table">
                    <thead>
                        <tr>
                            <th>Description</th>
                            <th>Tenant(s)</th>
                            <th>Period</th>
                            <th>Amount (HK$)</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>Dormitory Rental</td>
                            <td>${templateData.employeeNames}</td>
                            <td>${templateData.startDate} - ${templateData.endDate}</td>
                            <td>${templateData.amount}</td>
                        </tr>
                    </tbody>
                </table>
                
                <div class="total">
                    Total Amount: HK$ ${templateData.amount}
                </div>
                
                <div class="footer">
                    <p>Please make payment by the due date to avoid late fees.</p>
                    <p>Thank you for your business!</p>
                </div>
            </body>
            </html>
            `;

            // Generate PDF with Puppeteer
            const browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            
            const page = await browser.newPage();
            await page.setContent(htmlTemplate);
            
            const pdf = await page.pdf({
                format: 'A4',
                printBackground: true,
                margin: {
                    top: '20mm',
                    right: '20mm',
                    bottom: '20mm',
                    left: '20mm'
                }
            });
            
            await browser.close();

            // Set response headers for PDF download
            res.set({
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${invoiceData.invoice_number || 'invoice'}.pdf"`,
                'Content-Length': pdf.length
            });

            res.send(pdf);

        } catch (error) {
            console.error('Error generating PDF:', error);
            res.status(500).json({ error: 'Failed to generate PDF', details: error.message });
        }
    });
});

// Helper function to calculate total amount
const calculateTotal = (amount, nEmployees, frequency) => {
    const unitPrice = parseFloat(amount) || 0;
    const employees = parseInt(nEmployees) || 1;
    const period = parseInt(frequency) || 1;
    return unitPrice * employees * period;
};

// Helper function to format currency
const formatCurrency = (amount) => {
    return `HK$${parseFloat(amount || 0).toFixed(2)}`;
};

// Helper function to format date
const formatDate = (date) => {
    if (!date) return 'N/A';
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleDateString('zh-HK');
};

// DOCX Template Processing Function using docx-templates
async function processDocxTemplate(templatePath, invoiceData) {
    try {
        // Read the template file
        const templateBuffer = fs.readFileSync(templatePath);
        
        // Calculate total amount using computed fields
        const unitPrice = parseFloat(invoiceData.amount) || 0;
        const nEmployees = parseInt(invoiceData.n_employees) || 1;
        const frequency = parseInt(invoiceData.frequency) || 1;
        const totalAmount = calculateTotal(unitPrice, nEmployees, frequency);
        
        // Prepare template data
        const templateData = {
            ...invoiceData,
            start_date: formatDate(invoiceData.start_date),
            end_date: formatDate(invoiceData.end_date),
            created_at: formatDate(invoiceData.created_at),
            employee_names: Array.isArray(invoiceData.employee_names) 
                ? invoiceData.employee_names.join(', ') 
                : (invoiceData.employee_names || 'N/A'),
            date: new Date().toLocaleDateString('zh-HK'),
            amount: unitPrice.toLocaleString('en-US'),
            total: totalAmount.toLocaleString('en-US'),
            unit_price: `HK$${unitPrice.toFixed(2)}`,
            n_employees: nEmployees.toString(),
            frequency: frequency.toString(),
            total_amount: `HK$${totalAmount.toFixed(2)}`,
            property_name: invoiceData.property_name || '',
            room_number: invoiceData.room_number || '',
            notes: invoiceData.notes || '',
            is_deposit: invoiceData.is_deposit ? '押金' : '租金',
            auto_generated: invoiceData.auto_generated ? '自動生成' : '手動建立',
            generated_at: new Date().toLocaleString('zh-HK')
        };
        
        // Use docx-templates createReport
        const docxBuffer = await createReport({
            template: templateBuffer,
            data: templateData,
        });
        
        return docxBuffer;
        
    } catch (error) {
        console.error('Error processing DOCX template:', error);
        throw error;
    }
}

// Firestore Trigger: Auto-generate DOCX when invoice is created
exports.generateInvoiceDocx = onDocumentCreated('invoices/{invoiceId}', async (event) => {
    try {
        const invoiceId = event.params.invoiceId;
        const invoiceData = event.data.data();
        
        console.log(`🔄 Auto-generating DOCX for invoice: ${invoiceData.invoice_number}`);
        
        // Determine template type
        const templateName = invoiceData.is_deposit ? 'deposit_template.docx' : 'invoice_template.docx';
        const templatePath = path.join(__dirname, '..', 'public', templateName);
        
        // Check if template exists
        if (!fs.existsSync(templatePath)) {
            console.error(`❌ Template not found: ${templatePath}`);
            return;
        }
        
        // Generate DOCX
        const docxBuffer = await processDocxTemplate(templatePath, invoiceData);
        
        // Upload to Firebase Storage
        const bucket = admin.storage().bucket();
        const fileName = `invoices/${invoiceData.contract_number}/${invoiceData.invoice_number}.docx`;
        const file = bucket.file(fileName);
        
        await file.save(docxBuffer, {
            metadata: {
                contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                metadata: {
                    invoiceId: invoiceId,
                    invoiceNumber: invoiceData.invoice_number,
                    contractNumber: invoiceData.contract_number,
                    generatedAt: new Date().toISOString()
                }
            }
        });
        
        // Make the file publicly accessible
        await file.makePublic();
        
        // Get the public URL
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
        
        // Update the invoice document with the DOCX URL
        await admin.firestore().collection('invoices').doc(invoiceId).update({
            docx_url: publicUrl,
            docx_generated_at: admin.firestore.FieldValue.serverTimestamp(),
            docx_file_path: fileName
        });
        
        console.log(`✅ DOCX generated successfully: ${publicUrl}`);
        
    } catch (error) {
        console.error('❌ Error in generateInvoiceDocx:', error);
        
        // Update invoice with error status
        try {
            await admin.firestore().collection('invoices').doc(event.params.invoiceId).update({
                docx_generation_error: error.message,
                docx_generation_failed_at: admin.firestore.FieldValue.serverTimestamp()
            });
        } catch (updateError) {
            console.error('Failed to update error status:', updateError);
        }
    }
});

// Manual DOCX Generation Endpoint
exports.generateInvoiceDocxManual = onRequest(async (req, res) => {
    return cors(req, res, async () => {
        try {
            const { invoiceId } = req.query;
            
            if (!invoiceId) {
                return res.status(400).json({ error: 'Invoice ID is required' });
            }

            // Get invoice data from Firestore
            const invoiceDoc = await admin.firestore().collection('invoices').doc(invoiceId).get();
            
            if (!invoiceDoc.exists) {
                return res.status(404).json({ error: 'Invoice not found' });
            }

            const invoiceData = invoiceDoc.data();
            
            // Determine template type
            const templateName = invoiceData.is_deposit ? 'deposit_template.docx' : 'invoice_template.docx';
            const templatePath = path.join(__dirname, '..', 'public', templateName);
            
            // Check if template exists
            if (!fs.existsSync(templatePath)) {
                return res.status(500).json({ error: `Template not found: ${templateName}` });
            }
            
            // Generate DOCX
            const docxBuffer = await processDocxTemplate(templatePath, invoiceData);
            
            // Set response headers for DOCX download
            const filename = `${invoiceData.invoice_number || 'invoice'}${invoiceData.is_deposit ? '_deposit' : ''}.docx`;
            res.set({
                'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Content-Length': docxBuffer.length
            });

            res.send(docxBuffer);

        } catch (error) {
            console.error('Error generating DOCX manually:', error);
            res.status(500).json({ error: 'Failed to generate DOCX', details: error.message });
        }
    });
});

// Bulk DOCX Regeneration Function
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
                    
                    // Trigger the same logic as the auto-generation
                    const templateName = invoiceData.is_deposit ? 'deposit_template.docx' : 'invoice_template.docx';
                    const templatePath = path.join(__dirname, '..', 'public', templateName);
                    
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
                        docx_file_path: fileName
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

// Process Invoice Data Function (for future server-side processing)
exports.processInvoiceData = onRequest(async (req, res) => {
    return cors(req, res, async () => {
        try {
            const { action, data } = req.body;

            switch (action) {
                case 'bulk_update_status':
                    // Handle bulk status updates
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