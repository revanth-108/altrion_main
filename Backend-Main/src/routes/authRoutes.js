import express from 'express';
import passport from 'passport';
import { signup, signin, getMe, logout } from '../controllers/authController.js';
import { oauthCallback, oauthFailure } from '../controllers/oauthController.js';
import { protect } from '../middleware/auth.js';
import { validateSignup, validateSignin, handleValidationErrors } from '../middleware/validation.js';

const router = express.Router();

// Local Auth Routes
router.post('/signup', validateSignup, handleValidationErrors, signup);
router.post('/signin', validateSignin, handleValidationErrors, signin);
router.get('/me', protect, getMe);
router.post('/logout', protect, logout);

// Google OAuth Routes
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get(
  '/google/callback',
  passport.authenticate('google', {
    failureRedirect: '/api/auth/oauth/failure',
    session: true
  }),
  oauthCallback
);

// GitHub OAuth Routes
router.get('/github', passport.authenticate('github', { scope: ['user:email'] }));
router.get(
  '/github/callback',
  passport.authenticate('github', {
    failureRedirect: '/api/auth/oauth/failure',
    session: true
  }),
  oauthCallback
);

// OAuth Failure Route
router.get('/oauth/failure', oauthFailure);

export default router;
