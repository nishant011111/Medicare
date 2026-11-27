import { z } from 'zod';

const phoneInputSchema = z
  .string()
  .trim()
  .min(8, 'Mobile number must be at least 8 digits')
  .max(20, 'Mobile number must not exceed 20 characters');

const otpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Enter the 6-digit verification OTP code');

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters long')
  .max(128, 'Password must not exceed 128 characters');

const emailSchema = z
  .string()
  .email('Valid email address is required')
  .transform((v) => v.toLowerCase().trim());

const EMAIL_IDENTIFIER_REGEX = /^[A-Za-z0-9+_.-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const PHONE_IDENTIFIER_REGEX = /^\+?[0-9\s()-]{8,20}$/;

function isValidEmailOrPhone(value: string): boolean {
  const trimmed = value.trim();
  if (EMAIL_IDENTIFIER_REGEX.test(trimmed)) return true;
  const digits = trimmed.replace(/\D/g, '');
  return PHONE_IDENTIFIER_REGEX.test(trimmed) && digits.length >= 8 && digits.length <= 15;
}

export const requestOtpSchema = z.object({
  phone: phoneInputSchema,
  purpose: z.enum(['LOGIN', 'REGISTER']).optional().default('LOGIN'),
  role: z.string().optional(),
  deviceInfo: z.string().max(200).optional(),
});

export const verifyOtpLoginSchema = z.object({
  phone: phoneInputSchema,
  otpCode: otpCodeSchema,
  role: z.string().optional(),
  totpCode: z.string().trim().optional(),
  rememberMe: z.boolean().optional(),
  deviceInfo: z.string().max(200).optional(),
});

const phoneOtpRegisterBaseSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name must be at least 2 characters').max(120),
  phone: phoneInputSchema,
  otpCode: otpCodeSchema,
  email: emailSchema.optional(),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be YYYY-MM-DD')
    .optional(),
  gender: z.enum(['Male', 'Female', 'Other', 'Prefer not to say']).optional(),
  termsAccepted: z.boolean().optional(),
  role: z.string().optional(),
  roles: z.array(z.string()).optional(),
  globalRoles: z.array(z.string()).optional(),
  hospitalId: z.string().uuid().optional(),
  deviceInfo: z.string().max(200).optional(),
});

const passwordRegisterBaseSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name must be at least 2 characters').max(120),
  email: emailSchema,
  password: passwordSchema,
  confirmPassword: z.string().optional(),
  phone: phoneInputSchema.optional(),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be YYYY-MM-DD')
    .optional(),
  gender: z.enum(['Male', 'Female', 'Other', 'Prefer not to say']).optional(),
  termsAccepted: z.boolean().optional(),
  role: z.string().optional(),
  roles: z.array(z.string()).optional(),
  globalRoles: z.array(z.string()).optional(),
  hospitalId: z.string().uuid().optional(),
  deviceInfo: z.string().max(200).optional(),
});

export const registerSchema = z.union([phoneOtpRegisterBaseSchema, passwordRegisterBaseSchema]);

const termsRequiredError = {
  errorMap: () => ({ message: 'You must accept the Terms of Service and Privacy Policy' }),
};

export const patientRegisterSchema = z.union([
  phoneOtpRegisterBaseSchema.extend({
    termsAccepted: z.literal(true, termsRequiredError),
  }),
  passwordRegisterBaseSchema.extend({
    termsAccepted: z.literal(true, termsRequiredError),
  }),
]);

export const loginSchema = z.object({
  emailOrPhone: z
    .string()
    .trim()
    .min(3, 'Email or mobile number is required')
    .max(160),
  password: z.string().min(1, 'Password is required').max(128),
  role: z.string().optional(),
  deviceInfo: z.string().max(200).optional(),
});

export const forgotPasswordSchema = z.object({
  emailOrPhone: z.string().trim().min(3, 'Email or mobile number is required').max(160),
});

export const resetPasswordSchema = z.object({
  emailOrPhone: z.string().trim().min(3, 'Email or mobile number is required').max(160),
  otpCode: otpCodeSchema,
  newPassword: passwordSchema,
});

export const verifyEmailSchema = z.object({
  email: emailSchema,
  code: otpCodeSchema,
});

export const resendVerificationSchema = z.object({
  email: emailSchema,
});

export const mfaVerifyLoginSchema = z.object({
  mfaChallengeToken: z.string().min(10, 'MFA challenge token is required'),
  totpCode: z.string().trim().min(6, '6-digit TOTP or backup verification code is required'),
  deviceInfo: z.string().max(200).optional(),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(10, 'Refresh token is required').optional(),
});

export const logoutSchema = z.object({
  refreshToken: z.string().optional(),
});

export const googleAuthSchema = z.object({
  idToken: z.string().min(20, 'Google ID token is required'),
  mode: z.enum(['SIGN_IN', 'SIGN_UP']).optional().default('SIGN_IN'),
  role: z
    .enum([
      'ANY',
      'DOCTOR',
      'NURSE',
      'RECEPTIONIST',
      'PHARMACIST',
      'LAB_TECHNICIAN',
      'ACCOUNTANT',
      'HOSPITAL_ADMIN',
      'SUPER_ADMIN',
    ])
    .optional(),
  department: z.string().trim().max(120).optional(),
  termsAccepted: z.boolean().optional(),
  deviceInfo: z.string().max(200).optional(),
});

export const requestPatientOtpSchema = z.union([
  z.object({
    emailOrPhone: z
      .string()
      .trim()
      .min(5, 'Valid phone number or email address is required')
      .max(160)
      .refine(isValidEmailOrPhone, 'Enter a valid mobile number or email address'),
    channel: z.enum(['PHONE', 'EMAIL']).optional(),
  }),
  requestOtpSchema,
]);

export const verifyPatientOtpSchema = z.union([
  z.object({
    emailOrPhone: z
      .string()
      .trim()
      .min(5, 'Valid phone number or email address is required')
      .max(160)
      .refine(isValidEmailOrPhone, 'Enter a valid mobile number or email address'),
    otpCode: z
      .string()
      .trim()
      .regex(/^\d{6}$/, 'Verification code must be exactly 6 digits'),
    channel: z.enum(['PHONE', 'EMAIL']).optional(),
    deviceInfo: z.string().max(200).optional(),
  }),
  verifyOtpLoginSchema,
]);
