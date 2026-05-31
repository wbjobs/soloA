import bcrypt from 'bcryptjs';
import prisma from '../config/db';
import { AuthUser } from '../middleware/auth';

export class UserService {
  async register(email: string, password: string, username: string) {
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      throw new Error('用户已存在');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        username
      }
    });

    return {
      id: user.id,
      email: user.email,
      username: user.username
    };
  }

  async login(email: string, password: string): Promise<AuthUser> {
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      throw new Error('用户不存在');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new Error('密码错误');
    }

    return {
      userId: user.id,
      username: user.username,
      email: user.email
    };
  }

  async getById(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new Error('用户不存在');
    }

    return {
      id: user.id,
      email: user.email,
      username: user.username,
      createdAt: user.createdAt
    };
  }

  async verifyToken(token: string, jwtVerify: (token: string) => Promise<AuthUser>): Promise<AuthUser> {
    try {
      const payload = await jwtVerify(token);
      return payload;
    } catch (error) {
      throw new Error('无效的令牌');
    }
  }
}

export const userService = new UserService();
