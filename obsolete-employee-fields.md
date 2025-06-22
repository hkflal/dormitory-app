# Obsolete Employee Fields

This file lists fields in the `employees` collection that are no longer populated by the current data import pipeline (`scripts/update-from-xlsx.js`). They can likely be removed from Firestore to simplify the schema.

-   `assigned_property_id`: We now use the string `assignedProperty`.
-   `assigned_room_name`: The new schema doesn't include a room name.
-   `arrivalDate`: Replaced by the `arrival` timestamp.
-   `arrival_time`: Also replaced by `arrival`.
-   `billingPeriod`: This seems related to financials, which is not in the new pipeline.
-   `checkInDate`: Replaced by `arrival`.
-   `contact_info`: Not present in the XLSX file.
-   `contractNumber`: Replaced by `activeCtr`.
-   `financials`: This is a large, nested object that is no longer being updated.
-   `financialStatus`: Related to the `financials` object.
-   `lastFinancialUpdate`: Also related to `financials`.
-   `linked_invoices`: Invoice linking is now handled differently.
-   `monthlyRent`: Replaced by the top-level `rent` field.
-   `notes`: Not present in the XLSX file.
-   `preference`: Not present in the XLSX file.
-   `rentStatus`: Part of the old `financials` data model.
-   `remarks`: Not present in the XLSX file.
-   `roomNumber`: No longer specified. 