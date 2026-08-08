import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import prisma from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const signature = req.headers.get('x-line-signature') || '';
    
    // 驗證簽章
    const channelSecret = process.env.LINE_CHANNEL_SECRET || '0bf3c06b55f065b822ccf9bc22373adc';
    if (channelSecret) {
      const hash = crypto
        .createHmac('SHA256', channelSecret)
        .update(body)
        .digest('base64');
        
      if (hash !== signature) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
      }
    }

    const data = JSON.parse(body);
    
    // 處理 Webhook 事件
    for (const event of data.events) {
      if (event.type === 'message' && event.message.type === 'text') {
        const lineUserId = event.source.userId;
        const text = event.message.text;

        // Auto-provisioning 邏輯：檢查是否存在使用者
        let user = await prisma.user.findUnique({
          where: { lineUserId: lineUserId },
        });

        if (!user) {
          // 在系統中建立永久 ID
          user = await prisma.user.create({
            data: {
              lineUserId: lineUserId,
              name: "LINE 用戶",
              // 自動在 Account 表建立紀錄，讓 LINE Login 能無縫接軌
              accounts: {
                create: {
                  type: 'oauth',
                  provider: 'line',
                  providerAccountId: lineUserId,
                }
              }
            }
          });
        }

        // 狀態機邏輯 (暫時作為範例)
        const stateRecord = await prisma.lineBotState.findUnique({
          where: { lineUserId: lineUserId }
        });
        
        let currentState = stateRecord?.state || '';

        // TODO: 實作與舊書箱相關的功能邏輯 (捐書、預約、查詢)
        // 例如：
        if (text === '我要捐書') {
          await prisma.lineBotState.upsert({
            where: { lineUserId },
            create: { lineUserId, state: 'WAITING_FOR_BOOK_TITLE' },
            update: { state: 'WAITING_FOR_BOOK_TITLE' }
          });
          // 這裡應該呼叫 line_bot_api 回傳訊息
        }
      }
    }

    return NextResponse.json({ status: 'success' });
  } catch (error) {
    console.error('Webhook Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
