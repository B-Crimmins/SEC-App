# SEC Wrapper Frontend

A modern React TypeScript frontend for the SEC Financial Data Wrapper application.

## Features

- **React 18** with TypeScript for type safety
- **Tailwind CSS** for rapid UI development
- **React Router** for client-side routing
- **React Query** for server state management
- **Lucide React** for beautiful icons
- **Responsive design** for all devices

## Prerequisites

- Node.js 18+ and npm
- Backend server running on port 8000

## Installation

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

The app will be available at `http://localhost:3000`

## Project Structure

```
src/
├── components/     # Reusable UI components
├── contexts/       # React contexts (Auth, etc.)
├── hooks/          # Custom React hooks
├── pages/          # Page components
├── services/       # API services
├── types/          # TypeScript type definitions
└── utils/          # Utility functions
```

## Key Components

- **Header**: Navigation and authentication buttons
- **Home**: Main analysis form with ticker input
- **Login/Register**: Authentication pages
- **AuthContext**: User authentication state management

## API Integration

The frontend communicates with the backend API through:
- `/api/auth/*` - Authentication endpoints
- `/api/analysis/*` - Financial analysis endpoints
- `/api/sec/*` - SEC data endpoints

## Development

- **Hot reload**: Changes reflect immediately
- **TypeScript**: Full type safety
- **ESLint**: Code quality enforcement
- **Tailwind**: Utility-first CSS framework

## Building for Production

```bash
npm run build
```

This creates optimized production files in the `dist/` directory.

## Environment Variables

Create a `.env` file for environment-specific configuration:

```env
VITE_API_BASE_URL=http://localhost:3010/api
``` 