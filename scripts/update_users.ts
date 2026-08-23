import { messagingApi } from '@line/bot-sdk';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

import prisma from '../src/lib/prisma';
const { MessagingApiClient } = messagingApi;

const client = new MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || ''
});

async function main() {
  const users = await prisma.user.findMany({
    where: {
      name: 'LINE 用戶',
      lineUserId: { not: null }
    }
  });

  console.log(`Found ${users.length} users to update.`);

  for (const user of users) {
    if (!user.lineUserId) continue;
    try {
      const profile = await client.getProfile(user.lineUserId);
      if (profile && profile.displayName) {
        await prisma.user.update({
          where: { id: user.id },
          data: { name: profile.displayName }
        });
        console.log(`Updated user ${user.id} to ${profile.displayName}`);
      }
    } catch (error: any) {
      console.error(`Error updating user ${user.id}:`, error.message);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
