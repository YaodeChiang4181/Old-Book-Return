import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { message } = await req.json();

    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const book = await prisma.book.findUnique({
      where: { id: params.id },
    });

    if (!book || book.status !== "IN_LOCKER") {
      return NextResponse.json({ error: "Book is not available" }, { status: 400 });
    }

    // 更新書籍狀態與建立交易紀錄 (Transaction)
    await prisma.$transaction([
      prisma.book.update({
        where: { id: params.id },
        data: {
          status: "CLAIMED",
          recipientId: session.user.id,
        },
      }),
      prisma.transaction.create({
        data: {
          bookId: params.id,
          userId: session.user.id,
          type: "CLAIM",
          message: message, // 感謝語
        },
      }),
    ]);

    // 從 R2 刪除書籍圖片以節省空間
    if (book.imageUrl) {
      try {
        const s3Client = new S3Client({
          region: "auto",
          endpoint: process.env.R2_ENDPOINT || "",
          credentials: {
            accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
          },
        });
        const urlObj = new URL(book.imageUrl);
        const key = urlObj.pathname.startsWith("/") ? urlObj.pathname.substring(1) : urlObj.pathname;
        const deleteCommand = new DeleteObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME || "",
          Key: key,
        });
        await s3Client.send(deleteCommand);
      } catch (r2Error) {
        console.error("Failed to delete image from R2:", r2Error);
        // 不影響領取流程，僅印出錯誤
      }
    }

    // 取得舊書箱密碼 (MVP階段如果沒有記錄就給預設)
    let locker = await prisma.lockerStatus.findFirst();
    if (!locker) {
      // 建立初始紀錄
      locker = await prisma.lockerStatus.create({
        data: { password: "0000" }
      });
    }

    return NextResponse.json({ 
      success: true, 
      lockerPassword: locker.password 
    });
  } catch (error: any) {
    console.error("Claim error:", error);
    return NextResponse.json({ error: "Failed to claim book" }, { status: 500 });
  }
}
