import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const adminEmail = 'admin@example.com';
  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (existing) {
    console.log('Seed: admin user already exists, skipping.');
    return;
  }

  const passwordHash = await argon2.hash('ChangeMe123!', { type: argon2.argon2id });

  await prisma.user.create({
    data: {
      firstName: 'System',
      lastName: 'Administrator',
      email: adminEmail,
      username: 'admin',
      passwordHash,
      role: 'ADMIN',
      isEmailVerified: true,
    },
  });

  console.log('Seed: created default admin user.');
  console.log('  email:    admin@example.com');
  console.log('  password: ChangeMe123!');
  console.log('  -> Change this password immediately after first login.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
