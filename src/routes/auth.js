import { Router } from 'express';
import bcrypt from 'bcryptjs';
import Joi from 'joi';
import { User } from '../models/User.js';
import { validate } from '../middleware/validate.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { AppError } from '../middleware/errorHandler.js';
import {
  signAccessToken,
  signRefreshToken,
  setRefreshCookie,
  requireAuth,
} from '../middleware/auth.js';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export const authRouter = Router();

const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  businessName: Joi.string().min(2).max(80).required(),
});

authRouter.post('/register', authLimiter, validate(registerSchema), async (req, res) => {
  const { email, password, businessName } = req.body;

  const existing = await User.findOne({ email });
  if (existing) throw new AppError(409, 'An account with this email already exists');

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({ email, passwordHash, businessName });

  const accessToken = signAccessToken(user.id);
  setRefreshCookie(res, signRefreshToken(user.id));
  res.status(201).json({ accessToken, seller: user });
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

authRouter.post('/login', authLimiter, validate(loginSchema), async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });
  const valid = user && (await bcrypt.compare(password, user.passwordHash));
  if (!valid) throw new AppError(401, 'Invalid email or password');

  const accessToken = signAccessToken(user.id);
  setRefreshCookie(res, signRefreshToken(user.id));
  res.json({ accessToken, seller: user });
});

authRouter.post('/refresh', (req, res) => {
  const token = req.cookies?.refreshToken;
  if (!token) throw new AppError(401, 'Missing refresh token');

  try {
    const payload = jwt.verify(token, env.jwt.refreshSecret);
    const accessToken = signAccessToken(payload.sub);
    res.json({ accessToken });
  } catch {
    throw new AppError(401, 'Invalid or expired refresh token');
  }
});

authRouter.post('/logout', (_req, res) => {
  res.clearCookie('refreshToken', { path: '/api/auth' });
  res.status(204).end();
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await User.findById(req.sellerId);
  if (!user) throw new AppError(404, 'Seller not found');
  res.json({ seller: user });
});
