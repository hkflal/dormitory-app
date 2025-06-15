# Dormitory Management System

A comprehensive web application for managing dormitory properties, employee assignments, and financial operations. Built with Next.js, Tailwind CSS, and Firebase.

## Features

### 🏠 Dashboard
- Overview of properties, occupancy rates, and key metrics
- Real-time statistics and property status visualization
- Quick access to pending assignments and financial summaries

### 🏢 Properties Management
- Kanban-style property management interface
- Add, edit, and filter properties by location, gender type, and availability
- Room management with capacity tracking
- Visual occupancy indicators and status badges

### 👥 Employee Management
- Comprehensive employee database with CRUD operations
- Advanced filtering and search capabilities
- Status tracking (pending assignment, housed, departed)
- Contact information and assignment tracking

### 💰 Financial Management
- Rent status tracking and payment management
- Maintenance cost logging and categorization
- Financial summaries and revenue tracking

## Getting Started

### Prerequisites
- Node.js 18+
- Firebase project

### Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set up Firebase configuration in `.env.local`:
   ```env
   NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
   ```

3. Run the development server:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000)

## Tech Stack

- Next.js 15, React 18, Tailwind CSS
- Firebase (Firestore, Authentication)
- Headless UI, Heroicons

## Default Admin Credentials

- admin1@dormitory.com
- admin2@dormitory.com

(Set up these users in Firebase Authentication) 