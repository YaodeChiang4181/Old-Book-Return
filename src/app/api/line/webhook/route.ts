import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import prisma from '@/lib/prisma';
import { messagingApi } from '@line/bot-sdk';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { GoogleGenerativeAI } from '@google/generative-ai';

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

const pushText = async (to: string, text: string) => {
  try {
    await client.pushMessage({
      to,
      messages: [{ type: 'text', text }]
    });
  } catch (error) {
    console.error('Push Message Error:', error);
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
        let displayName = "LINE 用戶";
        try {
          const profile = await client.getProfile(lineUserId);
          displayName = profile.displayName || "LINE 用戶";
        } catch (error) {
          console.error("Error getting LINE profile:", error);
        }

        user = await prisma.user.create({
          data: {
            lineUserId: lineUserId,
            name: displayName,
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
      // Postback 事件處理 (管理員點擊卡片 或 學生預約)
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
        } else if (action === 'reserve' && bookId) {
          // 學生預約流程
          const book = await prisma.book.findUnique({ where: { id: bookId } });
          if (!book || book.status !== 'IN_LOCKER') {
            await replyText(event.replyToken, `❌ 預約失敗！這本書可能剛好被其他人預約或取走了。`);
            continue;
          }

          // 更新狀態為 RESERVED
          await prisma.book.update({
            where: { id: bookId },
            data: { status: 'RESERVED', recipientId: user.id }
          });

          // 紀錄交易
          await prisma.transaction.create({
            data: {
              bookId: bookId,
              userId: user.id,
              type: 'RESERVE'
            }
          });

          await replyText(event.replyToken, `✅ 預約成功！\n\n書箱密碼為：0000\n請於三天內前往系辦走廊的舊書箱領取您的書籍喔！`);
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

        // --- 狀態：處理綁定學號 ---
        if (currentState === 'WAITING_FOR_STUDENT_ID') {
          if (event.message.type !== 'text') {
            await replyText(replyToken, "⚠️ 請輸入文字格式的 9 位數學校學號進行綁定（例如：111409123）。");
            continue;
          }

          const inputId = text.trim();
          // 驗證是否為 9 位數字
          if (!/^\d{9}$/.test(inputId)) {
            await replyText(replyToken, "❌ 學號格式錯誤！請輸入 9 位數字（例如：111409123）。\n\n請重新輸入：");
            continue;
          }

          // 確認是否已被其他人綁定
          const existingUser = await prisma.user.findUnique({ where: { studentId: inputId } });
          if (existingUser && existingUser.id !== user.id) {
            await replyText(replyToken, "❌ 這個學號已經被其他 LINE 帳號綁定過了！如果這是您的學號，請聯繫管理員處理。\n\n請重新輸入：");
            continue;
          }

          // 更新學號
          await prisma.user.update({
            where: { id: user.id },
            data: { studentId: inputId }
          });

          // 清空狀態機
          await prisma.lineBotState.delete({ where: { lineUserId } });

          await replyText(replyToken, `✅ 學號 (${inputId}) 綁定成功！\n\n您可以開始點擊選單使用「我要找書」或「我要捐書」囉！`);
          continue;
        }

        // 攔截尚未綁定學號的用戶 (任何其他動作前)
        // 使用者如果有輸入密碼指令或是取消指令，已經在上方被處理掉
        if (!(user as any).studentId) {
            await prisma.lineBotState.upsert({
              where: { lineUserId },
              create: { lineUserId, state: 'WAITING_FOR_STUDENT_ID', data: "{}" },
              update: { state: 'WAITING_FOR_STUDENT_ID', data: "{}" }
            });
            await replyText(replyToken, "歡迎使用校園舊書箱！\n\n為了方便日後管理您的贈書與預約紀錄，初次使用請先輸入您的【9位數學校學號】進行綁定：");
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

        // --- 狀態 0：精準找書 ---
        if (text === '#精準找書' || text === '精準找書') {
          await prisma.lineBotState.upsert({
            where: { lineUserId },
            create: { lineUserId, state: 'WAITING_FOR_SEARCH_KEYWORD', data: "{}" },
            update: { state: 'WAITING_FOR_SEARCH_KEYWORD', data: "{}" }
          });
          await replyText(replyToken, "🔍 請輸入你想尋找的書名關鍵字（例如：微積分）：");
          continue;
        }

        // --- 狀態 0：啟動找書 ---
        if (text === '#我要找書' || text === '我要找書') {
          const books = await prisma.book.findMany({
            where: { status: 'IN_LOCKER' },
            orderBy: { updatedAt: 'desc' },
            take: 11
          });

          const searchCard = {
            type: "bubble",
            hero: {
              type: "image",
              url: "https://images.unsplash.com/photo-1588666309990-d68f08e3d4a6?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
              size: "full",
              aspectRatio: "20:13",
              aspectMode: "cover"
            },
            body: {
              type: "box",
              layout: "vertical",
              contents: [
                { type: "text", text: "🔍 精準搜尋", weight: "bold", size: "xl", wrap: true },
                { type: "text", text: "沒看到想找的書嗎？點擊下方按鈕，輸入關鍵字尋寶！", margin: "md", color: "#666666", wrap: true }
              ]
            },
            footer: {
              type: "box",
              layout: "vertical",
              spacing: "sm",
              contents: [
                {
                  type: "button",
                  style: "secondary",
                  action: {
                    type: "message",
                    label: "輸入關鍵字",
                    text: "#精準找書"
                  }
                }
              ]
            }
          };

          const bookBubbles = books.map(book => ({
            type: "bubble",
            hero: {
              type: "image",
              url: book.imageUrl || "https://fakeimg.pl/1024x768/E8F5E9/2E7D32/?text=暫無封面照片&font=noto",
              size: "full",
              aspectRatio: "20:13",
              aspectMode: "cover"
            },
            body: {
              type: "box",
              layout: "vertical",
              contents: [
                { type: "text", text: book.title || "未知書籍", weight: "bold", size: "xl", wrap: true },
                { 
                  type: "box", 
                  layout: "vertical",
                  margin: "md",
                  backgroundColor: "#E8F5E9",
                  cornerRadius: "md",
                  paddingAll: "sm",
                  contents: [
                    { type: "text", text: `#${book.description || "無"}`, color: "#2E7D32", size: "sm", weight: "bold", wrap: true }
                  ]
                }
              ]
            },
            footer: {
              type: "box",
              layout: "vertical",
              spacing: "sm",
              contents: [
                {
                  type: "button",
                  style: "primary",
                  color: "#1B4D3E",
                  action: {
                    type: "postback",
                    label: "一鍵預約",
                    data: `action=reserve&bookId=${book.id}`
                  }
                }
              ]
            }
          }));

          const flexMessage = {
            type: "flex",
            altText: "目前可預約的舊書列表",
            contents: {
              type: "carousel",
              contents: [searchCard, ...bookBubbles]
            }
          };

          try {
            await client.replyMessage({
              replyToken,
              messages: [flexMessage as any]
            });
          } catch (e) {
            console.error("Reply Flex Error", e);
          }
          continue;
        }

        // --- 狀態 1：問書況 (捐書流程) ---
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

        // --- 狀態 2：要求上傳圖片 (捐書流程) ---
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
        if (currentState === 'WAITING_FOR_BOOK_IMAGE') {
          if (event.message.type !== 'image') {
            await replyText(replyToken, "⚠️ 提醒：請傳送「相片」來完成封面照片上傳，或是輸入「取消」放棄捐書。");
            continue;
          }

          const stateData = stateRecord?.data ? JSON.parse(stateRecord.data) : {};
          const bookTitle = stateData.title || '未知書籍';
          const description = stateData.description || '';

          await replyText(replyToken, "⏳ 正在由 AI 審核照片並準備入庫，請稍候...");
          
          let imageUrl = '';
          try {
            // 下載 LINE 的圖片
            const messageId = event.message.id;
            const res = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
              headers: { Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` }
            });
            const arrayBuffer = await res.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            // --- 嘗試使用 Gemini API 進行 AI 圖片審核 ---
            if (process.env.GEMINI_API_KEY) {
              try {
                const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
                const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

                const imageParts = [
                  {
                    inlineData: {
                      data: buffer.toString("base64"),
                      mimeType: "image/jpeg"
                    }
                  }
                ];

                const prompt = `這是一張使用者上傳的二手書照片。請你幫我判斷這張圖片中是不是一本書，而且圖片中的書名（或是內容）是否符合這個名稱：『${bookTitle}』。請只回答 YES 或 NO。如果模糊不清無法判斷，請回答 NO。`;
                
                const result = await model.generateContent([prompt, ...imageParts]);
                const responseText = result.response.text().toUpperCase();

                if (!responseText.includes("YES")) {
                  // AI 審核未通過
                  await pushText(lineUserId, "❌ AI 審核未通過：照片與你輸入的書名不符，或無法清楚辨識為書本。\n\n請重新拍攝清晰的「書本封面」照片並再次上傳！📸");
                  continue; // 終止後續處理，讓使用者保持 WAITING_FOR_BOOK_IMAGE 狀態重新上傳
                }
              } catch (aiError) {
                console.error("Gemini AI Review Error in Webhook:", aiError);
                await pushText(lineUserId, "⚠️ AI 審核系統暫時無法連線，請確認 API Key 設定正確或稍後再試！");
                continue; // 終止後續處理，嚴格擋下
              }
            }
            
            // 上傳到 Cloudflare R2
            const filename = `books/${Date.now()}_${lineUserId}.jpg`;
            imageUrl = await uploadToR2(buffer, filename);
          } catch (e) {
            console.error("Image Processing Error", e);
            // 即使圖片失敗，依然繼續流程，只是沒圖片
          }

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

          // 推播給捐贈者 (因為 replyToken 已經被「審核中」使用，這裡必須用 pushText)
          await pushText(lineUserId, "✅ 捐書登記成功！\n\n請將書本帶至系辦走廊，交給管理員審核放入舊書箱喔！\n審核通過後，我會再傳送 LINE 通知給你。");

          // 4. 推播審核卡片給所有 Admin
          const admins = await prisma.user.findMany({ where: { role: 'ADMIN', lineUserId: { not: null } } });
          if (admins.length > 0) {
            await pushAdminCard(admins, newBook, user);
          }
          continue;
        }

        // --- 狀態：處理找書關鍵字 (找書流程) ---
        if (currentState === 'WAITING_FOR_SEARCH_KEYWORD' && event.message.type === 'text') {
          const keyword = text;
          
          // 不區分大小寫搜尋書名，狀態必須是 IN_LOCKER
          const books = await prisma.book.findMany({
            where: {
              status: 'IN_LOCKER',
              title: { contains: keyword, mode: 'insensitive' }
            },
            take: 12 // LINE carousel 最多 12 個泡泡
          });

          // 清空狀態機
          await prisma.lineBotState.delete({ where: { lineUserId } });

          if (books.length === 0) {
            await replyText(replyToken, `❌ 目前書箱中找不到包含「${keyword}」的書籍，請換個關鍵字再試一次！`);
            continue;
          }

          // 組裝旋轉木馬 Carousel (Flex Message)
          const bubbles = books.map(book => ({
            type: "bubble",
            hero: {
              type: "image",
              url: book.imageUrl || "https://fakeimg.pl/1024x768/E8F5E9/2E7D32/?text=暫無封面照片&font=noto",
              size: "full",
              aspectRatio: "20:13",
              aspectMode: "cover"
            },
            body: {
              type: "box",
              layout: "vertical",
              contents: [
                { type: "text", text: book.title || "未知書籍", weight: "bold", size: "xl", wrap: true },
                { 
                  type: "box", 
                  layout: "vertical",
                  margin: "md",
                  backgroundColor: "#E8F5E9",
                  cornerRadius: "md",
                  paddingAll: "sm",
                  contents: [
                    { type: "text", text: `#${book.description || "無"}`, color: "#2E7D32", size: "sm", weight: "bold", wrap: true }
                  ]
                }
              ]
            },
            footer: {
              type: "box",
              layout: "vertical",
              spacing: "sm",
              contents: [
                {
                  type: "button",
                  style: "primary",
                  color: "#1B4D3E",
                  action: {
                    type: "postback",
                    label: "一鍵預約",
                    data: `action=reserve&bookId=${book.id}`
                  }
                }
              ]
            }
          }));

          const flexMessage = {
            type: "flex",
            altText: `為你找到 ${books.length} 本書籍`,
            contents: {
              type: "carousel",
              contents: bubbles
            }
          };

          try {
            await client.replyMessage({
              replyToken,
              messages: [flexMessage as any]
            });
          } catch (e) {
            console.error('Flex Message Error', e);
          }
          continue;
        }

        // 其他未辨識的文字指令
        if (!currentState && event.message.type === 'text') {
          await replyText(replyToken, "歡迎使用校園舊書箱！\n你可以點擊下方選單的「我要捐書」來捐贈書籍，或點擊「我要找書」尋寶！");
        }
      }
    }

    return NextResponse.json({ status: 'success' });
  } catch (error) {
    console.error('Webhook Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
