# Altrion Backend API

Backend API for the Altrion application with authentication, MongoDB integration, and OAuth support.

## Features

- **Authentication**
  - Email/Password signup and signin
  - JWT-based authentication
  - OAuth integration (Google & GitHub)
  - Password hashing with bcrypt
  - Refresh token support

- **Database**
  - MongoDB with Mongoose ODM
  - User model with validation
  - Automatic password hashing

- **Security**
  - CORS enabled
  - Input validation
  - Protected routes
  - HTTP-only cookies for sessions

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure environment variables:
   - Copy `.env.example` to `.env`
   - Update the MongoDB URI and other credentials

3. Start the server:
   ```bash
   # Development mode (with auto-reload)
   npm run dev

   # Production mode
   npm start
   ```

## API Endpoints

### Authentication

#### Local Authentication
- `POST /api/auth/signup` - Register new user
- `POST /api/auth/signin` - Login user
- `GET /api/auth/me` - Get current user (protected)
- `POST /api/auth/logout` - Logout user (protected)

#### OAuth Authentication
- `GET /api/auth/google` - Initiate Google OAuth
- `GET /api/auth/google/callback` - Google OAuth callback
- `GET /api/auth/github` - Initiate GitHub OAuth
- `GET /api/auth/github/callback` - GitHub OAuth callback

## Environment Variables

Required environment variables (see `.env.example`):

- `PORT` - Server port (default: 3000)
- `MONGODB_URI` - MongoDB connection string
- `JWT_SECRET` - Secret key for JWT tokens
- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret
- `GITHUB_CLIENT_ID` - GitHub OAuth client ID
- `GITHUB_CLIENT_SECRET` - GitHub OAuth client secret
- `FRONTEND_URL` - Frontend application URL

## Database Schema

### User Model
```javascript
{
  name: String,
  email: String (unique),
  password: String (hashed),
  avatar: String,
  googleId: String,
  githubId: String,
  provider: String (local/google/github),
  isEmailVerified: Boolean,
  refreshTokens: [{ token, createdAt }],
  timestamps: true
}
```

## OAuth Setup

### Google OAuth
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Google+ API
4. Create OAuth 2.0 credentials
5. Add authorized redirect URI: `http://localhost:3000/api/auth/google/callback`
6. Copy Client ID and Client Secret to `.env`

### GitHub OAuth
1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Create a new OAuth App
3. Set Authorization callback URL: `http://localhost:3000/api/auth/github/callback`
4. Copy Client ID and Client Secret to `.env`

## Project Structure

```
altrion_backend/
├── src/
│   ├── config/
│   │   ├── database.js      # MongoDB connection
│   │   └── passport.js      # Passport OAuth configuration
│   ├── controllers/
│   │   ├── authController.js    # Auth logic
│   │   └── oauthController.js   # OAuth logic
│   ├── middleware/
│   │   ├── auth.js          # JWT authentication
│   │   └── validation.js    # Input validation
│   ├── models/
│   │   └── User.js          # User model
│   ├── routes/
│   │   └── authRoutes.js    # Auth routes
│   ├── utils/
│   │   └── jwt.js           # JWT utilities
│   └── server.js            # Main server file
├── .env                     # Environment variables
├── .env.example             # Environment template
├── .gitignore
├── package.json
└── README.md
```
