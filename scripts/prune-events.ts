import 'dotenv/config';
import { connectDatabase } from '../apps/api/src/database';
if (!process.env.MAINTENANCE_DATABASE_URL)
  throw new Error('Set MAINTENANCE_DATABASE_URL to the separately authorized maintenance role.');
const db = connectDatabase(process.env.MAINTENANCE_DATABASE_URL);
try {
  const result = await db.securityEvent.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } },
  });
  console.log(`Removed ${result.count} security events older than 90 days.`);
} finally {
  await db.$disconnect();
}
