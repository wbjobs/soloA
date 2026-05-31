import { FastifyInstance } from 'fastify';
import { userService } from '../services/userService';
import config from '../config/env';

export async function authRoutes(app: FastifyInstance) {
  app.post('/api/auth/register', async (request, reply) => {
    try {
      const body = request.body as {
        email: string;
        password: string;
        username: string;
      };

      if (!body.email || !body.password || !body.username) {
        return reply.code(400).send({ error: '请提供邮箱、密码和用户名' });
      }

      const user = await userService.register(
        body.email,
        body.password,
        body.username
      );

      const token = app.jwt.sign(
        {
          userId: user.id,
          username: user.username,
          email: user.email
        },
        { expiresIn: config.jwtExpiresIn }
      );

      return reply.code(201).send({
        user,
        token
      });
    } catch (error) {
      return reply.code(400).send({
        error: error instanceof Error ? error.message : '注册失败'
      });
    }
  });

  app.post('/api/auth/login', async (request, reply) => {
    try {
      const body = request.body as {
        email: string;
        password: string;
      };

      if (!body.email || !body.password) {
        return reply.code(400).send({ error: '请提供邮箱和密码' });
      }

      const user = await userService.login(body.email, body.password);

      const token = app.jwt.sign(
        {
          userId: user.userId,
          username: user.username,
          email: user.email
        },
        { expiresIn: config.jwtExpiresIn }
      );

      return reply.code(200).send({
        user,
        token
      });
    } catch (error) {
      return reply.code(401).send({
        error: error instanceof Error ? error.message : '登录失败'
      });
    }
  });

  app.get('/api/auth/me', async (request, reply) => {
    try {
      const payload = await request.jwtVerify<{ userId: string; username: string; email: string }>();
      const user = await userService.getById(payload.userId);
      return reply.code(200).send({ user });
    } catch (error) {
      return reply.code(401).send({ error: '未授权' });
    }
  });
}
