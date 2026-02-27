import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ADMIN_EMAIL = 'admin@wingman.local';
const ADMIN_NAME = 'Admin';

async function seed() {
    console.log('Seeding database...');

    const admin = await prisma.user.upsert({
        where: { email: ADMIN_EMAIL },
        update: {},
        create: {
            email: ADMIN_EMAIL,
            name: ADMIN_NAME,
        },
    });

    console.log(`Default admin user ready: ${admin.id} (${admin.email})`);
    console.log('Seeding complete.');
}

seed()
    .catch((e) => {
        console.error('Seed failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
