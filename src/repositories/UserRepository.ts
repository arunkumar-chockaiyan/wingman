import { prisma } from '../config/prismaClient';
import { User } from '@prisma/client';

export class UserRepository {
  async findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } });
  }

  async findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { email } });
  }

  async upsertByEmail(email: string, name: string): Promise<User> {
    return prisma.user.upsert({
      where: { email },
      update: { name },
      create: { email, name },
    });
  }
}
