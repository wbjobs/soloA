import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../config/database';
import { config } from '../config';
import { AppError } from '../middleware/errorHandler';

export const register = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { username, email, password, displayName } = req.body;
    
    if (!username || !email || !password) {
      return next(new AppError('Username, email, and password are required', 400));
    }
    
    const existingUser = await query(
      'SELECT id FROM users WHERE email = $1 OR username = $2',
      [email, username]
    );
    
    if (existingUser.rows.length > 0) {
      return next(new AppError('User with this email or username already exists', 400));
    }
    
    const passwordHash = await bcrypt.hash(password, 12);
    
    const result = await query(
      `INSERT INTO users (username, email, password_hash, display_name) 
       VALUES ($1, $2, $3, $4) 
       RETURNING id, username, email, display_name, avatar_url, created_at`,
      [username, email, passwordHash, displayName || username]
    );
    
    const user = result.rows[0];
    const token = jwt.sign({ userId: user.id }, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn
    });
    
    res.status(201).json({
      status: 'success',
      data: {
        user,
        token
      }
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return next(new AppError('Email and password are required', 400));
    }
    
    const result = await query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    
    if (result.rows.length === 0) {
      return next(new AppError('Invalid email or password', 401));
    }
    
    const user = result.rows[0];
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    
    if (!isPasswordValid) {
      return next(new AppError('Invalid email or password', 401));
    }
    
    const token = jwt.sign({ userId: user.id }, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn
    });
    
    const { password_hash, ...userWithoutPassword } = user;
    
    res.status(200).json({
      status: 'success',
      data: {
        user: userWithoutPassword,
        token
      }
    });
  } catch (error) {
    next(error);
  }
};

export const getCurrentUser = async (
  req: any,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await query(
      `SELECT id, username, email, display_name, avatar_url, created_at 
       FROM users WHERE id = $1`,
      [req.userId]
    );
    
    if (result.rows.length === 0) {
      return next(new AppError('User not found', 404));
    }
    
    res.status(200).json({
      status: 'success',
      data: {
        user: result.rows[0]
      }
    });
  } catch (error) {
    next(error);
  }
};

export const updateUser = async (
  req: any,
  res: Response,
  next: NextFunction
) => {
  try {
    const { displayName, avatarUrl } = req.body;
    
    const result = await query(
      `UPDATE users 
       SET display_name = COALESCE($1, display_name),
           avatar_url = COALESCE($2, avatar_url),
           updated_at = NOW()
       WHERE id = $3
       RETURNING id, username, email, display_name, avatar_url, created_at`,
      [displayName, avatarUrl, req.userId]
    );
    
    if (result.rows.length === 0) {
      return next(new AppError('User not found', 404));
    }
    
    res.status(200).json({
      status: 'success',
      data: {
        user: result.rows[0]
      }
    });
  } catch (error) {
    next(error);
  }
};
