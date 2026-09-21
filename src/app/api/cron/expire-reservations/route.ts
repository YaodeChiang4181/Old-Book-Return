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
    if (
      process.env.CRON_SECRET &&
      authHeader !== `Bearer ${process.env.CRON_SECRET}`
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 計算 7 天前的日期
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // 尋找狀態為 RESERVED 且 updatedAt 超過 7 天的書籍
    const expiredReservations = await prisma.book.findMany({
      where: {
        status: "RESERVED",
        updatedAt: {
          lte: sevenDaysAgo,
        },
      },
      include: {
        recipient: true,
      }
    });

    if (expiredReservations.length === 0) {
      return NextResponse.json({ message: "沒有超過 7 天未領取的預約。" });
    }

    // 處理每一筆過期的預約
    for (const book of expiredReservations) {
      // 1. 更新書籍狀態回 IN_LOCKER
      await prisma.book.update({
        where: { id: book.id },
        data: {
          status: "IN_LOCKER",
          recipientId: null, // 清空領取者
          // updatedAt 將會自動更新
        },
      });

      // 2. 如果領取者有綁定 LINE，發送取消通知
      if (book.recipient?.lineUserId) {
        try {
          const notificationText = `⚠️ 【預約取消通知】\n\n您好，您預約的書籍《${book.title}》已超過 7 天未領取完成交接。\n系統已自動取消該筆預約，並恢復為可預約狀態。\n\n若您仍需要此書，請重新前往尋找與預約，謝謝！`;
          await client.pushMessage({
            to: book.recipient.lineUserId,
            messages: [{ type: "text", text: notificationText }],
          });
        } catch (e) {
          console.error(`Failed to send cancellation notice to ${book.recipient.lineUserId}`, e);
        }
      }
    }

    return NextResponse.json({
      success: true,
      expiredCount: expiredReservations.length,
      message: "Expired reservations processed",
    });
  } catch (error: any) {
    console.error("Cron check expired reservations error:", error);
    return NextResponse.json(
      { error: "Failed to process expired reservations" },
      { status: 500 }
    );
  }
}
