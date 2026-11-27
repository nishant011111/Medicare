import { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service';
import { ApiError } from '../../utils/errors';
import { env } from '../../config/env';

const REFRESH_COOKIE_NAME = 'medicore_rt';

function extractCookieValue(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const [rawKey, ...rawVal] = part.trim().split('=');
    if (rawKey === name) {
      return decodeURIComponent(rawVal.join('='));
    }
  }
  return undefined;
}

function isSecureRequest(req: Request): boolean {
  return req.secure || req.headers['x-forwarded-proto'] === 'https';
}

function setRefreshTokenCookie(req: Request, res: Response, refreshToken: string) {
  const maxAgeMs = env.JWT_REFRESH_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000;
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production' && isSecureRequest(req),
    sameSite: 'lax',
    path: '/api',
    maxAge: maxAgeMs,
  });
}

function clearRefreshTokenCookie(req: Request, res: Response) {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production' && isSecureRequest(req),
    sameSite: 'lax',
    path: '/api',
  });
}

export class AuthController {
  static async requestOtp(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await AuthService.requestOtp({
        ...req.body,
        ipAddress: req.ip,
      });
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async verifyOtp(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await AuthService.verifyLoginOtp({
        ...req.body,
        ipAddress: req.ip,
      });
      if (!result.mfaRequired && 'refreshToken' in result && result.refreshToken) {
        setRefreshTokenCookie(req, res, result.refreshToken);
      }
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async requestPatientOtp(req: Request, res: Response, next: NextFunction) {
    try {
      const result =
        typeof req.body?.emailOrPhone === 'string' && req.body.emailOrPhone.trim().length > 0
          ? await AuthService.requestPatientOtp({
              ...req.body,
              ipAddress: req.ip,
            })
          : await AuthService.requestOtp({
              ...req.body,
              ipAddress: req.ip,
            });
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async verifyPatientOtp(req: Request, res: Response, next: NextFunction) {
    try {
      if (typeof req.body?.emailOrPhone === 'string' && req.body.emailOrPhone.trim().length > 0) {
        const result = await AuthService.verifyPatientOtp({
          ...req.body,
          ipAddress: req.ip,
        });
        if (result.refreshToken) {
          setRefreshTokenCookie(req, res, result.refreshToken);
        }
        res.status(200).json({
          success: true,
          data: result,
        });
        return;
      }

      const result = await AuthService.verifyLoginOtp(
        {
          ...req.body,
          ipAddress: req.ip,
        },
        { requirePatientRole: true }
      );
      if (!result.mfaRequired && 'refreshToken' in result && result.refreshToken) {
        setRefreshTokenCookie(req, res, result.refreshToken);
      }
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async register(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await AuthService.register({
        ...req.body,
        ipAddress: req.ip,
      });
      setRefreshTokenCookie(req, res, result.refreshToken);
      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async registerPatient(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await AuthService.register({
        ...req.body,
        ipAddress: req.ip,
      });
      setRefreshTokenCookie(req, res, result.refreshToken);
      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async login(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await AuthService.login({
        ...req.body,
        ipAddress: req.ip,
      });
      setRefreshTokenCookie(req, res, result.refreshToken);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async loginPatient(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await AuthService.login(
        {
          ...req.body,
          ipAddress: req.ip,
        },
        { requirePatientRole: true }
      );
      setRefreshTokenCookie(req, res, result.refreshToken);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async googleAuth(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await AuthService.authenticateWithGoogle({
        ...req.body,
        ipAddress: req.ip,
      });
      if (!result.mfaRequired && 'refreshToken' in result && result.refreshToken) {
        setRefreshTokenCookie(req, res, result.refreshToken);
      }
      res.status(result.isNewAccount ? 201 : 200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async verifyMfaLogin(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await AuthService.verifyMfaLogin({
        ...req.body,
        ipAddress: req.ip,
      });
      setRefreshTokenCookie(req, res, result.refreshToken);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async forgotPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await AuthService.forgotPassword(req.body.emailOrPhone);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async resetPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await AuthService.resetPassword(req.body);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async verifyEmail(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await AuthService.verifyEmail(req.body);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async resendVerification(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await AuthService.resendVerification(req.body.email);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async refresh(req: Request, res: Response, next: NextFunction) {
    try {
      const rawToken =
        req.body?.refreshToken || extractCookieValue(req.headers.cookie, REFRESH_COOKIE_NAME);
      if (!rawToken || typeof rawToken !== 'string' || rawToken.length < 10) {
        throw ApiError.badRequest('Refresh token is required', 'VALIDATION_ERROR');
      }
      const result = await AuthService.refresh(rawToken, req.ip);
      setRefreshTokenCookie(req, res, result.refreshToken);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      clearRefreshTokenCookie(req, res);
      next(err);
    }
  }

  static async logout(req: Request, res: Response, next: NextFunction) {
    try {
      const rawToken =
        req.body?.refreshToken || extractCookieValue(req.headers.cookie, REFRESH_COOKIE_NAME);
      const result = await AuthService.logout(req.auth!.userId, rawToken);
      clearRefreshTokenCookie(req, res);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async logoutAll(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await AuthService.logoutAll(req.auth!.userId);
      clearRefreshTokenCookie(req, res);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async me(req: Request, res: Response, next: NextFunction) {
    try {
      const profile = AuthService.buildMeProfile(req.auth!.userId);
      res.status(200).json({
        success: true,
        data: profile,
      });
    } catch (err) {
      next(err);
    }
  }
}
