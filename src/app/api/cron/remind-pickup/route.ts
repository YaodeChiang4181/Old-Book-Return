import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { messagingApi } from "@line/bot-sdk";

const { MessagingApiClient } = messagingApi;
const client = new MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || "",
});

export async function GET(req: NextRequest) {
  try {
    // 簡單的授權檢查 (可選：Vercel Cron Secret)
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 計算 6 天前的日期 (距離 7 天到期只剩 1 天)
    const sixDaysAgo = new Date();
    sixDaysAgo.setDate(sixDaysAgo.getDate() - 6);
    
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

    // 尋找狀態為 RESERVED 且 updatedAt 在 6 天前到 5 天前之間的書籍，避免重複發送
    const expiringReservations = await prisma.book.findMany({
      where: {
        status: "RESERVED",
        updatedAt: {
          lte: fiveDaysAgo,
          gte: sixDaysAgo,
        },
      },
      include: {
        recipient: true,
      }
    });

    if (expiringReservations.length === 0) {
      return NextResponse.json({ message: "沒有即將到期的預約需要提醒。" });
    }

    // 處理每一筆即將過期的預約
    for (const book of expiringReservations) {
      if (book.recipient?.lineUserId) {
        try {
          const notificationText = `⏰ 【取書最後提醒】\n\n您好，您預約的書籍《${book.title}》將於明天到期！\n請盡快前往系辦走廊完成交接，否則預約將會被自動取消並釋出給其他同學喔！`;
          await client.pushMessage({
            to: book.recipient.lineUserId,
            messages: [{ type: "text", text: notificationText }],
          });
        } catch (e) {
          console.error(`Failed to send reminder notice to ${book.recipient.lineUserId}`, e);
        }
      }
    }

    return NextResponse.json({
      success: true,
      remindedCount: expiringReservations.length,
      message: "Pickup reminders processed",
    });
  } catch (error: any) {
    console.error("Cron check remind pickup error:", error);
    return NextResponse.json(
      { error: "Failed to process pickup reminders" },
      { status: 500 }
    );
  }
}
