# Frontend Setup for Altrion

## Environment Configuration

The frontend is already configured to work with your backend. No changes needed!

Your `.env.local` file contains:
```
VITE_API_URL=http://localhost:8000/api
```

This points to your FastAPI backend running on port 8000.

---

## Running the Frontend

```bash
cd /Users/revanthshada/Downloads/Altrion_main/Frontend-Main

# Install dependencies (if not done)
npm install

# Start development server
npm run dev
```

The frontend will start on: **http://localhost:5173**

---

## Testing the Demo Flow

### 1. Open the Frontend
Navigate to: http://localhost:5173

### 2. Sign Up
- Click "Sign Up" button
- Enter these details:
  - **Email**: demo@altrion.com
  - **Password**: demo123456
  - **Name**: Demo User
- Click "Create Account"

### 3. What Happens Behind the Scenes
1. Frontend sends POST to `/api/auth/signup`
2. Backend creates user in Supabase Auth
3. Backend creates user record in database
4. Backend returns JWT tokens
5. Frontend stores tokens in localStorage
6. Frontend redirects to dashboard

### 4. Verify in Supabase
- Go to Supabase Dashboard → Authentication → Users
- You should see: demo@altrion.com

### 5. View Dashboard
- After signup, you'll see the portfolio dashboard
- Initially empty (no accounts connected)

---

## Connecting Platforms (Optional)

To test the full flow with real data:

### 1. Add API Keys to Backend .env
```env
PLAID_CLIENT_ID=your-plaid-client-id
PLAID_SECRET=your-plaid-secret
COINBASE_CLIENT_ID=your-coinbase-client-id
COINBASE_CLIENT_SECRET=your-coinbase-client-secret
COINMARKETCAP_API_KEY=your-coinmarketcap-api-key
```

### 2. Restart Backend
```bash
# Stop backend (Ctrl+C)
python run.py
```

### 3. Connect Platform in Frontend
- Go to "Connect Platforms" page
- Select Coinbase or Plaid
- Follow OAuth flow
- Your holdings will appear in dashboard

---

## API Endpoints the Frontend Uses

### Authentication
- `POST /api/auth/signup` - Create account
- `POST /api/auth/signin` - Login
- `GET /api/auth/me` - Get current user
- `POST /api/auth/logout` - Logout

### Platforms
- `GET /api/platforms` - List available platforms
- `POST /api/platforms/{id}/connect` - Connect platform
- `GET /api/platforms/connected` - Get connected platforms
- `DELETE /api/platforms/{id}/connection` - Disconnect

### Portfolio
- `GET /api/portfolio` - Get aggregated portfolio
- `POST /api/portfolio/refresh` - Refresh data (rate-limited)

---

## Frontend Features

### Pages
- ✅ Login/Signup
- ✅ Dashboard (portfolio view)
- ✅ Connect platforms
- ✅ Loan application flow (UI only)

### Components
- ✅ Portfolio chart
- ✅ Assets table
- ✅ Asset allocation card
- ✅ Platform icons
- ✅ Theme toggle (dark/light mode)

### State Management
- ✅ Zustand stores (auth, portfolio, loan)
- ✅ React Query for API calls
- ✅ Local storage for auth tokens

---

## Troubleshooting

### CORS Errors
If you see CORS errors in browser console:
- Verify backend `.env` has: `ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000`
- Restart backend after changing

### API Connection Failed
```bash
# Check backend is running
curl http://localhost:8000/health

# Check frontend .env.local
cat .env.local
# Should show: VITE_API_URL=http://localhost:8000/api
```

### White screen / React errors
```bash
# Clear cache and rebuild
rm -rf node_modules/.vite
npm run dev
```

### Auth not working
- Check browser console for errors
- Verify JWT_SECRET in backend `.env` matches Supabase
- Clear localStorage: `localStorage.clear()` in browser console

---

## Dev Mode Features

### API Documentation
- **Backend Swagger**: http://localhost:8000/docs
- **Backend ReDoc**: http://localhost:8000/redoc

### React Query Devtools
- Automatically available in dev mode
- Shows all API queries and cache state

### Browser Console Commands
```javascript
// View stored auth
localStorage.getItem('altrion-auth')

// Clear auth (logout)
localStorage.clear()

// Check API connection
fetch('http://localhost:8000/health').then(r => r.json()).then(console.log)
```

---

## Building for Production

### Backend
```bash
# Set environment to production in .env
ENVIRONMENT=production

# Run with gunicorn (install first: pip install gunicorn)
gunicorn app.main:app -w 4 -k uvicorn.workers.UvicornWorker
```

### Frontend
```bash
npm run build
npm run preview
```

---

## Summary

**Your frontend is ready to use!**

Just:
1. Make sure backend is running on port 8000
2. Run `npm run dev` in Frontend-Main folder
3. Open http://localhost:5173
4. Sign up with demo@altrion.com

The frontend is fully integrated with your backend and will work immediately once the backend is running.
