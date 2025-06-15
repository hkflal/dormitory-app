# Setup Guide - Dormitory Management System

## Quick Start

### 1. Firebase Project Setup

1. **Create Firebase Project**
   - Go to [Firebase Console](https://console.firebase.google.com)
   - Click "Create a project"
   - Enter project name (e.g., "dormitory-management")
   - Follow the setup wizard

2. **Enable Authentication**
   - In Firebase Console, go to "Authentication" > "Sign-in method"
   - Enable "Email/Password" provider
   - Create admin users:
     - Email: `admin1@dormitory.com`, Password: (your choice)
     - Email: `admin2@dormitory.com`, Password: (your choice)

3. **Enable Firestore Database**
   - Go to "Firestore Database" > "Create database"
   - Choose "Start in test mode" for development
   - Select a location close to your users

4. **Get Firebase Configuration**
   - Go to Project Settings (gear icon)
   - Scroll down to "Your apps" section
   - Click "Web" icon to add a web app
   - Register app with name "Dormitory Management"
   - Copy the configuration object

### 2. Environment Configuration

1. **Create Environment File**
   ```bash
   # In the dormitory-app directory
   cp .env.example .env.local
   ```

2. **Update .env.local with your Firebase config:**
   ```env
   NEXT_PUBLIC_FIREBASE_API_KEY=your_actual_api_key
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_actual_project_id
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_actual_sender_id
   NEXT_PUBLIC_FIREBASE_APP_ID=your_actual_app_id
   ```

### 3. Run the Application

1. **Install Dependencies** (if not already done)
   ```bash
   npm install
   ```

2. **Start Development Server**
   ```bash
   npm run dev
   ```

3. **Access the Application**
   - Open http://localhost:3000
   - You should see the login page
   - Use one of the admin credentials you created

## Firestore Security Rules

For production, update your Firestore security rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow authenticated users to read/write all documents
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

## Sample Data

To test the application, you can add sample data through the UI:

### Sample Property
- Name: "Main Street Dormitory"
- Address: "123 Main Street"
- Location: "Downtown"
- Gender Type: "Any"
- Rooms: 
  - Room 101A (Capacity: 2)
  - Room 101B (Capacity: 2)
  - Room 102A (Capacity: 1)

### Sample Employee
- Name: "John Doe"
- Company: "Tech Corp"
- Gender: "Male"
- Status: "Pending Assignment"
- Contact: "john.doe@techcorp.com"

## Troubleshooting

### Firebase Authentication Error
- Ensure your Firebase API key is correct
- Check that Email/Password authentication is enabled
- Verify admin users are created in Firebase Auth

### Build Errors
- Make sure all environment variables are set
- Check that Firebase configuration is valid
- Ensure all dependencies are installed

### Permission Errors
- Update Firestore security rules
- Check that authenticated users have read/write permissions

## Production Deployment

### Vercel (Recommended)
1. Connect your GitHub repository to Vercel
2. Add environment variables in Vercel dashboard
3. Deploy automatically

### Firebase Hosting
1. Install Firebase CLI: `npm install -g firebase-tools`
2. Login: `firebase login`
3. Initialize: `firebase init hosting`
4. Build: `npm run build`
5. Deploy: `firebase deploy`

## Next Steps

After setup, you can:
1. Add properties and rooms
2. Create employee records
3. Assign employees to properties
4. Track financial data
5. Monitor occupancy rates

## Support

If you encounter issues:
1. Check the browser console for errors
2. Verify Firebase configuration
3. Ensure all environment variables are set
4. Check Firestore security rules 