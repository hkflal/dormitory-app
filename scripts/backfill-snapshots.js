import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, addDoc, query, where } from 'firebase/firestore';

// Replace string imports where possible
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Helper function: Check if employee has paid this month
const checkIfEmployeeHasPaidThisMonth = (employee, invoices, year, month) => {
    const paymentFrequency = employee.paymentFrequency || employee.frequency || 1;
    if (paymentFrequency === 3) {
        const currentQuarter = Math.floor(month / 3);
        const quarterStartMonth = currentQuarter * 3;
        const quarterMonths = [quarterStartMonth, quarterStartMonth + 1, quarterStartMonth + 2];

        const employeePaidInvoices = invoices.filter(inv => {
            if (inv.status !== 'paid') return false;
            const isEmployeeInvoice = inv.employeeId === employee.id ||
                inv.employee_id === employee.id ||
                inv.employeeName === employee.name;
            if (!isEmployeeInvoice) return false;
            const issueDate = inv.issueDate?.toDate ? inv.issueDate.toDate() : new Date(inv.issueDate);
            if (issueDate.getFullYear() !== year) return false;
            return quarterMonths.includes(issueDate.getMonth());
        });
        return employeePaidInvoices.length > 0;
    } else {
        const employeePaidInvoices = invoices.filter(inv => {
            if (inv.status !== 'paid') return false;
            const isEmployeeInvoice = inv.employeeId === employee.id ||
                inv.employee_id === employee.id ||
                inv.employeeName === employee.name;
            if (!isEmployeeInvoice) return false;
            const issueDate = inv.issueDate?.toDate ? inv.issueDate.toDate() : new Date(inv.issueDate);
            return issueDate.getFullYear() === year && issueDate.getMonth() === month;
        });
        return employeePaidInvoices.length > 0;
    }
};

const calculateActualIncome = (employees, invoices, currentYear, currentMonth) => {
    return employees
        .reduce((total, emp) => {
            const empRent = parseFloat(emp.rent) || parseFloat(emp.monthlyRent) || 0;
            if (empRent === 0) return total;

            const hasPaidThisMonth = checkIfEmployeeHasPaidThisMonth(emp, invoices, currentYear, currentMonth);
            if (!hasPaidThisMonth) return total;
            return total + empRent;
        }, 0);
};

export const main = async () => {
    console.log("Starting backfill script...");

    try {
        const [invoicesSnapshot, propertiesSnapshot, employeesSnapshot, snapshotsSnapshot] = await Promise.all([
            getDocs(collection(db, 'invoices')),
            getDocs(collection(db, 'properties')),
            getDocs(collection(db, 'employees')),
            getDocs(collection(db, 'financial_snapshots')),
        ]);

        const invoices = invoicesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const properties = propertiesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const employees = employeesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const existingSnapshots = snapshotsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const totalMonthlyCost = properties.reduce((acc, prop) => acc + (parseFloat(prop.cost) || 0), 0);

        // Months to backfill (Sep 2025 to Jan 2026)
        const monthsToBackfill = [
            { year: 2025, month: 8 },  // September (0-indexed)
            { year: 2025, month: 9 },  // October
            { year: 2025, month: 10 }, // November
            { year: 2025, month: 11 }, // December
            { year: 2026, month: 0 },  // January
        ];

        for (let target of monthsToBackfill) {
            const { year, month } = target;

            const existing = existingSnapshots.find(s => s.year === year && s.month === month);
            if (existing) {
                console.log(`Snapshot for ${year}-${month + 1} already exists.`);
                continue;
            }

            const monthDate = new Date(year, month + 1, 0); // end of month

            // Use logic roughly corresponding to actual past logic:
            // Assuming if arrival_at is before end of month and they haven't departed before end of month, they count.
            const monthHousedEmployees = employees.filter(emp => {
                const arrivalDate = emp.arrival_at?.toDate ? emp.arrival_at.toDate() : (emp.arrival_at ? new Date(emp.arrival_at) : null);
                if (!arrivalDate || isNaN(arrivalDate.getTime())) return false;
                if (arrivalDate > monthDate) return false;

                const departureDate = emp.departure_date?.toDate ? emp.departure_date.toDate() : (emp.departure_date ? new Date(emp.departure_date) : null);
                if (departureDate && !isNaN(departureDate.getTime()) && departureDate < new Date(year, month, 1)) {
                    return false; // Departed before this month started
                }

                return true;
            });

            const monthInvoices = invoices.filter(inv => {
                const issueDate = inv.issueDate?.toDate ? inv.issueDate.toDate() : new Date(inv.issueDate);
                if (!issueDate || isNaN(issueDate.getTime())) return false;
                return issueDate.getFullYear() === year && issueDate.getMonth() === month;
            });

            const totalIncome = calculateActualIncome(monthHousedEmployees, monthInvoices, year, month);
            const pnl = totalIncome - totalMonthlyCost;

            const snapshot = {
                year,
                month,
                totalIncome,
                totalExpenses: totalMonthlyCost,
                pnl,
                employees: monthHousedEmployees.length,
                rooms: properties.length,
                createdAt: new Date().toISOString()
            };

            await addDoc(collection(db, 'financial_snapshots'), snapshot);
            console.log(`Added snapshot for ${year}-${month + 1}: ${JSON.stringify(snapshot)}`);
        }

        console.log("Backfill completed successfully.");
    } catch (e) {
        console.error("Backfill failed:", e);
    }
};

main();
