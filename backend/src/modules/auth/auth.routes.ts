import { Router } from 'express';
import { AuthController } from './auth.controller';
import { validateRequest } from '../../middleware/validate.middleware';
import {
  forgotPasswordSchema,
  googleAuthSchema,
  loginSchema,
  logoutSchema,
  mfaVerifyLoginSchema,
  patientRegisterSchema,
  refreshSchema,
  registerSchema,
  requestOtpSchema,
  requestPatientOtpSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  verifyOtpLoginSchema,
  verifyPatientOtpSchema,
} from './auth.schema';
import { authenticate } from '../../middleware/auth.middleware';
import { authRateLimiter } from '../../middleware/rateLimit.middleware';

const router = Router();

// Web Staff & Admin Phone OTP + MFA + Google Sign-In
router.post('/otp/request', authRateLimiter, validateRequest(requestOtpSchema), AuthController.requestOtp);
router.post('/otp/verify', authRateLimiter, validateRequest(verifyOtpLoginSchema), AuthController.verifyOtp);
router.post('/mfa/verify-login', authRateLimiter, validateRequest(mfaVerifyLoginSchema), AuthController.verifyMfaLogin);
router.post('/google', authRateLimiter, validateRequest(googleAuthSchema), AuthController.googleAuth);

// Android Patient Phone/Email OTP Authentication
router.post(
  '/patient/otp/request',
  authRateLimiter,
  validateRequest(requestPatientOtpSchema),
  AuthController.requestPatientOtp
);
router.post(
  '/patient/otp/verify',
  authRateLimiter,
  validateRequest(verifyPatientOtpSchema),
  AuthController.verifyPatientOtp
);

// Registration & Password / Email Verification Endpoints
router.post('/register', authRateLimiter, validateRequest(registerSchema), AuthController.register);
router.post('/patient/register', authRateLimiter, validateRequest(patientRegisterSchema), AuthController.registerPatient);
router.post('/login', authRateLimiter, validateRequest(loginSchema), AuthController.login);
router.post('/patient/login', authRateLimiter, validateRequest(loginSchema), AuthController.loginPatient);
router.post('/forgot-password', authRateLimiter, validateRequest(forgotPasswordSchema), AuthController.forgotPassword);
router.post('/reset-password', authRateLimiter, validateRequest(resetPasswordSchema), AuthController.resetPassword);
router.post('/verify-email', authRateLimiter, validateRequest(verifyEmailSchema), AuthController.verifyEmail);
router.post('/resend-verification', authRateLimiter, validateRequest(resendVerificationSchema), AuthController.resendVerification);

// Session Lifecycle
router.post('/refresh', authRateLimiter, validateRequest(refreshSchema), AuthController.refresh);
router.post('/logout', authenticate, validateRequest(logoutSchema), AuthController.logout);
router.post('/logout-all', authenticate, AuthController.logoutAll);
router.get('/me', authenticate, AuthController.me);

export default router;
