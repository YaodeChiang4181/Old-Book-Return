import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import prisma from '@/lib/prisma';
import { messagingApi } from '@line/bot-sdk';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const { MessagingApiClient } = messagingApi;
const client = new MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || ''
});

// 設定 Cloudflare R2 Client
const s3Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT || '',
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '', // 注意：Vercel 也要設定這組
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  }
});

// 輔助函式：上傳圖片到 R2
async function uploadToR2(buffer: Buffer, filename: string): Promise<string> {
  const bucket = process.env.R2_BUCKET_NAME || '';
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: filename,
    Body: buffer,
    ContentType: 'image/jpeg',
  });
  await s3Client.send(command);
  const publicUrl = process.env.R2_PUBLIC_URL?.replace(/\/$/, '');
  return `${publicUrl}/${filename}`;
}

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

// 輔助函式：推播審核卡片給管理員
const pushAdminCard = async (admins: any[], book: any, donor: any) => {
  const adminLineIds = admins.map(a => a.lineUserId).filter(Boolean) as string[];
  if (adminLineIds.length === 0) return;

  const flexMessage = {
    type: "flex",
    altText: "🔔 新的捐書審核通知",
    contents: {
      type: "bubble",
      hero: {
        type: "image",
        url: book.imageUrl || "https://via.placeholder.com/1024x768?text=No+Image",
        size: "full",
        aspectRatio: "20:13",
        aspectMode: "cover"
      },
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          { type: "text", text: "新捐書審核", weight: "bold", size: "xl" },
          { type: "text", text: `書名: ${book.title}`, margin: "md", wrap: true },
          { type: "text", text: `捐贈者: ${donor.name || '學生'}`, margin: "sm", wrap: true },
          { type: "text", text: `書況: ${book.description}`, margin: "sm", wrap: true, color: "#666666" }
        ]
      },
      footer: {
        type: "box",
        layout: "horizontal",
        spacing: "sm",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#00B900",
            action: { type: "postback", label: "✅ 核准上架", data: `action=approve&bookId=${book.id}` }
          },
          {
            type: "button",
            style: "secondary",
            color: "#ff334b",
            action: { type: "postback", label: "❌ 退回", data: `action=reject&bookId=${book.id}` }
          }
        ]
      }
    }
  };

  try {
    // 透過 multicast 推播給多位管理員
    await client.multicast({
      to: adminLineIds,
      messages: [flexMessage as any]
    });
  } catch (e) {
    console.error("Push Admin Card Error", e);
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
      const lineUserId = event.source.userId;
      
      // Auto-provisioning 邏輯：檢查是否存在使用者
      let user = await prisma.user.findUnique({
        where: { lineUserId: lineUserId },
      });

      if (!user) {
        user = await prisma.user.create({
          data: {
            lineUserId: lineUserId,
            name: "LINE 用戶",
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

      // ==========================================
      // Postback 事件處理 (管理員點擊卡片)
      // ==========================================
      if (event.type === 'postback') {
        const postbackData = new URLSearchParams(event.postback.data);
        const action = postbackData.get('action');
        const bookId = postbackData.get('bookId');

        if (action === 'approve' && bookId) {
          const book = await prisma.book.update({
            where: { id: bookId },
            data: { status: 'IN_LOCKER' },
            include: { donor: true }
          });
          await replyText(event.replyToken, `✅ 已核准《${book.title}》上架！`);
          
          if (book.donor.lineUserId) {
            await client.pushMessage({
              to: book.donor.lineUserId,
              messages: [{ type: 'text', text: `📢 恭喜！您捐贈的愛心書籍《${book.title}》已審核通過並放入書箱，等待有緣人領取！` }]
            }).catch(console.error);
          }
        } else if (action === 'reject' && bookId) {
          const book = await prisma.book.update({
            where: { id: bookId },
            data: { status: 'REJECTED' },
            include: { donor: true }
          });
          await replyText(event.replyToken, `❌ 已退回《${book.title}》。`);
          
          if (book.donor.lineUserId) {
            await client.pushMessage({
              to: book.donor.lineUserId,
              messages: [{ type: 'text', text: `❌ 很抱歉，您捐贈的書籍《${book.title}》審核未通過，請至系辦取回喔。` }]
            }).catch(console.error);
          }
        }
        continue;
      }

      // ==========================================
      // 一般訊息處理 (State Machine)
      // ==========================================
      if (event.type === 'message') {
        const replyToken = event.replyToken;
        const text = event.message.type === 'text' ? event.message.text.trim() : '';
        
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

        // 秘密指令：升級管理員
        if (text === '/我是管理員') {
          await prisma.user.update({
            where: { id: user.id },
            data: { role: 'ADMIN' }
          });
          await replyText(replyToken, "👑 權限升級成功！你現在是「管理員 (ADMIN)」了，將會收到審核推播。");
          continue;
        }

        // --- 狀態 0：啟動捐書 ---
        if (text === '#我要捐書' || text === '我要捐書') {
          await prisma.lineBotState.upsert({
            where: { lineUserId },
            create: { lineUserId, state: 'WAITING_FOR_BOOK_TITLE', data: "{}" },
            update: { state: 'WAITING_FOR_BOOK_TITLE', data: "{}" }
          });
          await replyText(replyToken, "📚 感謝你的愛心！\n\n請問你要捐贈的「書名」是？");
          continue;
        }

        // --- 狀態 1：問書況 ---
        if (currentState === 'WAITING_FOR_BOOK_TITLE' && event.message.type === 'text') {
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

        // --- 狀態 2：要求上傳圖片 ---
        if (currentState === 'WAITING_FOR_BOOK_DESC' && event.message.type === 'text') {
          const description = text;
          const stateData = stateRecord?.data ? JSON.parse(stateRecord.data) : {};
          stateData.description = description;

          await prisma.lineBotState.update({
            where: { lineUserId },
            data: { 
              state: 'WAITING_FOR_BOOK_IMAGE',
              data: JSON.stringify(stateData)
            }
          });
          await replyText(replyToken, "✅ 書況已記錄。\n\n最後一步：請「拍照上傳」這本書的封面照，讓其他同學可以看見喔！📸");
          continue;
        }

        // --- 狀態 3：處理圖片上傳並完成捐書 ---
        if (currentState === 'WAITING_FOR_BOOK_IMAGE' && event.message.type === 'image') {
          // 在邊緣運算環境中，發送 HTTP 請求給 LINE 下載圖片
          let imageUrl = '';
          try {
            const messageId = event.message.id;
            const res = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
              headers: { Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` }
            });
            const arrayBuffer = await res.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            
            // 上傳到 Cloudflare R2
            const filename = `books/${Date.now()}_${lineUserId}.jpg`;
            imageUrl = await uploadToR2(buffer, filename);
          } catch (e) {
            console.error("Image Processing Error", e);
          }

          const stateData = stateRecord?.data ? JSON.parse(stateRecord.data) : {};
          const bookTitle = stateData.title || '未知書籍';
          const description = stateData.description || '';

          // 1. 在資料庫建立 Book (狀態預設為 PENDING)
          const newBook = await prisma.book.create({
            data: {
              title: bookTitle,
              description: description,
              imageUrl: imageUrl || null,
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

          // 推播給捐贈者 (用 replyToken 也行，但這裡直接 replyText)
          await replyText(replyToken, "✅ 捐書登記成功！\n\n請將書本帶至系辦走廊，交給管理員審核放入舊書箱喔！\n審核通過後，我會再傳送 LINE 通知給你。");

          // 4. 推播審核卡片給所有 Admin
          const admins = await prisma.user.findMany({ where: { role: 'ADMIN', lineUserId: { not: null } } });
          if (admins.length > 0) {
            await pushAdminCard(admins, newBook, user);
          }
          continue;
        }

        // 其他未辨識的文字指令
        if (!currentState && event.message.type === 'text') {
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
