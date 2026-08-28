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

    // 計算 30 天前的日期
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // 尋找超過 30 天且狀態還在 IN_LOCKER 的書籍
    const expiredBooks = await prisma.book.findMany({
      where: {
        status: "IN_LOCKER",
        inLockerSince: {
          lte: thirtyDaysAgo,
        },
      },
    });

    if (expiredBooks.length === 0) {
      return NextResponse.json({ message: "沒有超過 30 天的書籍需要清運。" });
    }

    // 將這些書籍的狀態更新為 EXPIRED
    const expiredBookIds = expiredBooks.map((book) => book.id);
    await prisma.book.updateMany({
      where: {
        id: { in: expiredBookIds },
      },
      data: {
        status: "EXPIRED",
      },
    });

    // 準備通知管理員的訊息
    const bookTitles = expiredBooks.map((b) => `• ${b.title}`).join("\n");
    const notificationText = `🔔 【書籍清運通知】\n\n系統偵測到有 ${expiredBooks.length} 本書在書箱中放置超過 30 天，已自動將其狀態標記為「逾期 (EXPIRED)」。\n\n請管理員抽空前往實體書箱進行清運作業，清單如下：\n\n${bookTitles}\n\n辛苦了！`;

    // 取得所有管理員
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN", lineUserId: { not: null } },
    });
    const adminLineIds = admins
      .map((a) => a.lineUserId)
      .filter(Boolean) as string[];

    if (adminLineIds.length > 0) {
      // 透過 multicast 推播給多位管理員
      await client.multicast({
        to: adminLineIds,
        messages: [{ type: "text", text: notificationText }],
      });
    }

    return NextResponse.json({
      success: true,
      expiredCount: expiredBooks.length,
      message: "Notification sent",
    });
  } catch (error: any) {
    console.error("Cron check expired books error:", error);
    return NextResponse.json(
      { error: "Failed to process expired books" },
      { status: 500 }
    );
  }
}
