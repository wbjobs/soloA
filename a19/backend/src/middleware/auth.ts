import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';

export interface AuthRequest extends Request {
  userId?: string;
}

export const authenticateJWT = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  
  if (authHeader) {
    const token = authHeader.split(' ')[1];
    
    jwt.verify(token, config.jwt.secret, (err: any, user: any) => {
      if (err) {
        return res.sendStatus(403);
      }
      
      req.userId = user.userId;
      next();
    });
  } else {
    res.sendStatus(401);
  }
};
