import { generateAccessToken, generateRefreshToken } from '../utils/jwt.js';

// @desc    Handle OAuth callback success
// @route   GET /api/auth/google/callback or /api/auth/github/callback
// @access  Public
export const oauthCallback = async (req, res) => {
  try {
    if (!req.user) {
      return res.redirect(`${process.env.FRONTEND_URL}/signin?error=auth_failed`);
    }

    // Generate tokens
    const accessToken = generateAccessToken(req.user._id);
    const refreshToken = generateRefreshToken(req.user._id);

    // Save refresh token
    req.user.refreshTokens.push({ token: refreshToken });
    await req.user.save();

    // Redirect to frontend with tokens
    const redirectUrl = `${process.env.FRONTEND_URL}/auth/callback?accessToken=${accessToken}&refreshToken=${refreshToken}`;
    res.redirect(redirectUrl);
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.redirect(`${process.env.FRONTEND_URL}/signin?error=server_error`);
  }
};

// @desc    Handle OAuth failure
// @route   GET /api/auth/oauth/failure
// @access  Public
export const oauthFailure = (req, res) => {
  res.redirect(`${process.env.FRONTEND_URL}/signin?error=oauth_failed`);
};
