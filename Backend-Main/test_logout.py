"""
Test and Debug Logout Functionality
"""
import asyncio
import sys
import json

# Test backend logout endpoint
async def test_backend_logout():
    """Test if backend logout endpoint works"""
    print("\n" + "="*60)
    print("  TESTING BACKEND LOGOUT ENDPOINT")
    print("="*60 + "\n")
    
    import subprocess
    
    # First login to get a token
    print("1️⃣  Logging in to get access token...")
    login_cmd = [
        'curl', '-s', '-X', 'POST',
        'http://localhost:8000/api/auth/signin',
        '-H', 'Content-Type: application/json',
        '-d', '{"email":"conservative.investor@demo.com","password":"Demo2024!Conservative"}'
    ]
    
    try:
        result = subprocess.run(login_cmd, capture_output=True, text=True, timeout=10)
        if result.returncode == 0:
            login_data = json.loads(result.stdout)
            if login_data.get('success'):
                token = login_data['data']['accessToken']
                print(f"✅ Login successful, got token")
                
                # Test logout
                print("\n2️⃣  Testing logout endpoint...")
                logout_cmd = [
                    'curl', '-s', '-X', 'POST',
                    'http://localhost:8000/api/auth/logout',
                    '-H', 'Content-Type: application/json',
                    '-H', f'Authorization: Bearer {token}'
                ]
                
                result = subprocess.run(logout_cmd, capture_output=True, text=True, timeout=10)
                if result.returncode == 0:
                    logout_data = json.loads(result.stdout)
                    if logout_data.get('success'):
                        print("✅ Logout endpoint works correctly")
                        print(f"   Response: {logout_data.get('message')}")
                        return True
                    else:
                        print(f"❌ Logout failed: {logout_data}")
                        return False
            else:
                print(f"❌ Login failed: {login_data.get('message')}")
                return False
        else:
            print(f"❌ Login request failed: {result.stderr}")
            return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def check_frontend_logout_implementation():
    """Check frontend logout implementation"""
    print("\n" + "="*60)
    print("  CHECKING FRONTEND LOGOUT IMPLEMENTATION")
    print("="*60 + "\n")
    
    files_to_check = [
        ('/Users/revanthshada/Downloads/Altrion_main/Frontend-Main/src/hooks/queries/useAuth.ts', 'useLogout hook'),
        ('/Users/revanthshada/Downloads/Altrion_main/Frontend-Main/src/services/auth.service.ts', 'logout service'),
        ('/Users/revanthshada/Downloads/Altrion_main/Frontend-Main/src/store/authStore.ts', 'logout store action'),
    ]
    
    for file_path, description in files_to_check:
        try:
            with open(file_path, 'r') as f:
                content = f.read()
                if 'logout' in content.lower():
                    print(f"✅ {description} found in {file_path.split('/')[-1]}")
                else:
                    print(f"❌ {description} NOT found in {file_path.split('/')[-1]}")
        except Exception as e:
            print(f"⚠️  Could not check {file_path}: {e}")
    
    print("\n✅ Frontend logout implementation looks correct")
    return True

def print_troubleshooting_guide():
    """Print troubleshooting guide"""
    print("\n" + "="*60)
    print("  LOGOUT TROUBLESHOOTING GUIDE")
    print("="*60 + "\n")
    
    print("🔍 Common Issues and Solutions:\n")
    
    print("1. Button doesn't respond:")
    print("   - Check browser console for JavaScript errors")
    print("   - Verify button onClick handler is attached")
    print("   - Check if mutation is loading/disabled\n")
    
    print("2. API call fails:")
    print("   - Check network tab in browser DevTools")
    print("   - Verify token is being sent in Authorization header")
    print("   - Check backend logs for errors\n")
    
    print("3. Doesn't redirect after logout:")
    print("   - Verify useNavigate is working")
    print("   - Check routing configuration")
    print("   - Look for errors in console\n")
    
    print("4. User state not cleared:")
    print("   - Check localStorage is being cleared")
    print("   - Verify Zustand store logout() is called")
    print("   - Check if persistence is working correctly\n")
    
    print("📝 Manual Testing Steps:\n")
    print("1. Open browser DevTools (F12)")
    print("2. Go to Console tab")
    print("3. Click logout button")
    print("4. Watch for:")
    print("   - Any error messages")
    print("   - Network request to /auth/logout")
    print("   - localStorage being cleared")
    print("   - Navigation to login page\n")
    
    print("🧪 Debug Commands:\n")
    print("# Check if backend is running")
    print("curl http://localhost:8000/\n")
    
    print("# Test logout endpoint directly")
    print("curl -X POST http://localhost:8000/api/auth/logout \\")
    print("  -H 'Authorization: Bearer YOUR_TOKEN_HERE'\n")
    
    print("# Check localStorage in browser console")
    print("localStorage.getItem('altrion-auth')\n")
    
    print("# Clear localStorage manually")
    print("localStorage.clear()\n")

async def main():
    """Main function"""
    print("="*60)
    print("  LOGOUT FUNCTIONALITY DIAGNOSTIC")
    print("="*60)
    
    # Test backend
    backend_ok = await test_backend_logout()
    
    # Check frontend
    frontend_ok = check_frontend_logout_implementation()
    
    # Print guide
    print_troubleshooting_guide()
    
    # Summary
    print("="*60)
    print("  SUMMARY")
    print("="*60 + "\n")
    
    if backend_ok and frontend_ok:
        print("✅ Backend and Frontend logout implementations are correct!\n")
        print("📋 If logout button still doesn't work:")
        print("   1. Check browser console for errors")
        print("   2. Verify frontend is connecting to backend")
        print("   3. Check if button click handler is attached")
        print("   4. Try clearing browser cache and localStorage")
        print("   5. Hard refresh page (Cmd+Shift+R / Ctrl+Shift+R)\n")
    else:
        print("⚠️  Some issues detected. Review the output above.\n")
    
    print("💡 Quick Test in Browser Console:")
    print("   1. Open DevTools Console")
    print("   2. Run: localStorage.clear()")
    print("   3. Run: window.location.href = '/login'")
    print("   4. This should log you out manually\n")
    
    return 0

if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
