# Session Management in Altrion

## Overview

This application uses **MongoDB for persistent session storage** via `connect-mongo`. Sessions are used exclusively for OAuth authentication flows (Google and GitHub login).

## Session Storage

- **Storage**: MongoDB (`sessions` collection)
- **Duration**: 24 hours
- **Auto-cleanup**: MongoDB automatically removes expired sessions
- **Collection**: `sessions`

## Collections in Database

The database maintains only necessary collections:

### ✅ Essential Collections

1. **users** - User account data
   - Stores user profiles, credentials, and authentication info
   - Contains: name, email, password (hashed), provider, etc.

2. **sessions** - OAuth session data (only when using OAuth)
   - Stores session data for Google/GitHub OAuth flows
   - Auto-expires after 24 hours
   - Only created when users log in via OAuth

### ❌ No Unnecessary Data

All other collections are automatically removed by the cleanup script.

## Authentication Methods

### JWT Authentication (Default)
- Used for: Email/password signup and login
- No session storage needed
- Token stored in frontend localStorage
- Sessions collection remains empty

### OAuth Authentication (Google/GitHub)
- Used for: Social login via Google or GitHub
- Creates session in MongoDB
- Session persists across server restarts
- Session expires after 24 hours

## Database Maintenance

### Check Collections
```bash
cd backend
npm run db:check
```

This will show all collections and document counts.

### Cleanup Database
```bash
cd backend
npm run db:cleanup
```

This removes any unnecessary collections, keeping only:
- `users`
- `sessions`

## Session Configuration

See `backend/src/server.js` for session configuration:
- MongoDB URL from `.env` file
- Collection name: `sessions`
- TTL: 24 hours
- Auto-remove expired sessions
- Secure cookies in production

## How Sessions Work

1. **OAuth Login Flow**:
   - User clicks "Login with Google/GitHub"
   - Backend creates session in MongoDB
   - Session ID stored in cookie
   - Session persists across server restarts
   - Session expires after 24 hours

2. **Regular Login (Email/Password)**:
   - User signs up or logs in with email/password
   - No session created in MongoDB
   - JWT token returned to frontend
   - Token stored in localStorage
   - Sessions collection remains empty

## Real-time Session Updates

Sessions are updated in MongoDB in real-time:
- Session created immediately on OAuth login
- Session updated on each request (lazy update every 24 hours)
- Session removed automatically when expired
- No manual cleanup needed

## Monitoring Sessions

To see active sessions:
```bash
cd backend
npm run db:check
```

Look for the `sessions` collection. The document count shows active OAuth sessions.
