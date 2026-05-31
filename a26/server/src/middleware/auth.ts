import { FastifyRequest, FastifyReply } from 'fastify';
import { FastifyInstance } from 'fastify';
import config from '../config/env';

export interface AuthUser {
  userId: string;
  username: string;
  email: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser | null;
  }
}

export async function authenticateJWT(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const token = request.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      reply.code(401).send({ error: '未提供认证令牌' });
      return;
    }
    
    const decoded = await request.jwtVerify<AuthUser>();
    request.user = decoded;
  } catch (error) {
    reply.code(401).send({ error: '认证失败' });
  }
}
