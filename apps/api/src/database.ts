import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

export function connectDatabase(connectionString: string) {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString, connectionTimeoutMillis: 5000, max: 10 }),
  });
}
