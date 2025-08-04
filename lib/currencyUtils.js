/**
 * Currency formatting utilities for the dormitory application
 * Formats amounts as "3,500.00" without currency symbols
 */

/**
 * Clean currency symbols from amount strings before processing
 * @param {number|string} amount - The amount to clean
 * @returns {number} Cleaned numeric amount
 */
export const cleanCurrencySymbols = (amount) => {
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
 * Format a number as currency string without currency symbol
 * @param {number|string} amount - The amount to format
 * @returns {string} Formatted amount like "3,500.00"
 */
export const formatCurrency = (amount) => {
  const numericAmount = cleanCurrencySymbols(amount);
  
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true
  }).format(numericAmount);
};

/**
 * Parse a formatted currency string back to a number
 * @param {string} formattedAmount - String like "3,500.00"
 * @returns {number} Numeric value
 */
export const parseCurrency = (formattedAmount) => {
  if (typeof formattedAmount === 'number') return formattedAmount;
  if (!formattedAmount) return 0;
  
  // Remove commas and parse as float
  return parseFloat(formattedAmount.replace(/,/g, '')) || 0;
};

/**
 * Calculate total from amount, employees, and frequency
 * @param {number|string} amount - Unit amount per person
 * @param {number} nEmployees - Number of employees
 * @param {number} frequency - Billing frequency (months)
 * @returns {number} Total calculated amount
 */
export const calculateTotal = (amount, nEmployees, frequency) => {
  const unitPrice = cleanCurrencySymbols(amount);
  const employees = parseInt(nEmployees) || 1;
  const period = parseInt(frequency) || 1;
  return unitPrice * employees * period;
}; 