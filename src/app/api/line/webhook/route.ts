import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import prisma from '@/lib/prisma';
import { messagingApi } from '@line/bot-sdk';

const { MessagingApiClient } = messagingApi;
const client = new MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || ''
});

const replyText = async (replyToken: string, text: string) => {
  try {
    await client.replyMessage({
      replyToken,
      messages: [{ type: 'text', text }]
    });
  } catch (error) {
    console.error('Reply Message Error:', error);
  }
};

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
        const text = event.message.text.trim();
        const replyToken = event.replyToken;

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

        // 取得當前對話狀態
        const stateRecord = await prisma.lineBotState.findUnique({
          where: { lineUserId: lineUserId }
        });
        
        let currentState = stateRecord?.state || '';

        // 取消機制 (防呆)
        if (text === '取消' || text === '重來' || text === '/取消') {
          if (stateRecord) {
            await prisma.lineBotState.delete({ where: { lineUserId } });
          }
          await replyText(replyToken, "✅ 已為你取消目前的動作。");
          continue;
        }

        // ==========================================
        // 捐書流程 (State Machine)
        // ==========================================
        if (text === '#我要捐書' || text === '我要捐書') {
          await prisma.lineBotState.upsert({
            where: { lineUserId },
            create: { lineUserId, state: 'WAITING_FOR_BOOK_TITLE', data: "{}" },
            update: { state: 'WAITING_FOR_BOOK_TITLE', data: "{}" }
          });
          await replyText(replyToken, "📚 感謝你的愛心！\n\n請問你要捐贈的「書名」是？");
          continue;
        }

        if (currentState === 'WAITING_FOR_BOOK_TITLE') {
          const bookTitle = text;
          await prisma.lineBotState.update({
            where: { lineUserId },
            data: { 
              state: 'WAITING_FOR_BOOK_DESC',
              data: JSON.stringify({ title: bookTitle })
            }
          });
          await replyText(replyToken, `你輸入的書名是：「${bookTitle}」\n\n請簡單描述一下這本書的「書況」（例如：九成新，有幾頁筆記）：`);
          continue;
        }

        if (currentState === 'WAITING_FOR_BOOK_DESC') {
          const description = text;
          const stateData = stateRecord?.data ? JSON.parse(stateRecord.data) : {};
          const bookTitle = stateData.title || '未知書籍';

          // 1. 在資料庫建立 Book (狀態預設為 PENDING)
          const newBook = await prisma.book.create({
            data: {
              title: bookTitle,
              description: description,
              status: 'PENDING',
              donorId: user.id
            }
          });

          // 2. 建立 Transaction (捐贈紀錄)
          await prisma.transaction.create({
            data: {
              bookId: newBook.id,
              userId: user.id,
              type: 'DONATE'
            }
          });

          // 3. 清空狀態機
          await prisma.lineBotState.delete({ where: { lineUserId } });

          await replyText(replyToken, "✅ 捐書登記成功！\n\n請將書本帶至系辦走廊，交給管理員審核放入舊書箱喔！\n審核通過後，我會再傳送 LINE 通知給你。");
          continue;
        }

        // 其他未辨識的指令
        if (!currentState) {
          await replyText(replyToken, "歡迎使用校園舊書箱！\n你可以點擊下方選單的「我要捐書」來捐贈書籍。");
        }
      }
    }

    return NextResponse.json({ status: 'success' });
  } catch (error) {
    console.error('Webhook Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
