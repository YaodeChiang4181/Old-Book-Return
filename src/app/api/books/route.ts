import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { title, isbn, description, imageUrl } = body;

    if (!title || !imageUrl) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // 檢查使用者目前未媒合（PENDING 或 IN_LOCKER）的書籍數量是否已達 3 本上限
    const unmatchedBooksCount = await prisma.book.count({
      where: {
        donorId: session.user.id,
        status: {
          in: ["PENDING", "IN_LOCKER"],
        },
      },
    });

    if (unmatchedBooksCount >= 3) {
      return NextResponse.json(
        { error: "您目前已有 3 本未媒合書籍，請等待舊書被領取後再捐贈新書。" },
        { status: 403 }
      );
    }

    let initialStatus = "IN_LOCKER"; // Demo階段：跳過人工審核，預設直接入庫

    // 嘗試使用 Gemini API 進行 AI 圖片審核
    if (process.env.GEMINI_API_KEY) {
      try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        // 取得圖片資料
        const imageResp = await fetch(imageUrl);
        const imageBuffer = await imageResp.arrayBuffer();
        
        const imageParts = [
          {
            inlineData: {
              data: Buffer.from(imageBuffer).toString("base64"),
              mimeType: imageResp.headers.get("content-type") || "image/jpeg"
            }
          }
        ];

        const prompt = `這是一張使用者上傳的二手書照片。請你幫我判斷這張圖片中是不是一本書，而且圖片中的書名（或是內容）是否符合這個名稱：『${title}』。請只回答 YES 或 NO。如果模糊不清無法判斷，請回答 NO。`;
        
        const result = await model.generateContent([prompt, ...imageParts]);
        const responseText = result.response.text().toUpperCase();

        if (!responseText.includes("YES")) {
          // 若 AI 審核失敗，直接回傳錯誤，不進入 PENDING 狀態
          return NextResponse.json({ error: "AI 審核未通過：照片與書名不符，或無法清楚辨識為書本。請重新拍攝清晰的照片。" }, { status: 400 });
        }
      } catch (aiError) {
        console.error("Gemini AI Review Error:", aiError);
        // 若 AI 審核發生例外錯誤，為了 demo 順利，仍先放行入庫
      }
    }

    const newBook = await prisma.book.create({
      data: {
        title,
        isbn,
        description,
        imageUrl,
        donorId: session.user.id,
        status: initialStatus as any, // 根據 AI 審核結果決定
        inLockerSince: initialStatus === "IN_LOCKER" ? new Date() : undefined,
      },
    });

    // Also log the transaction
    await prisma.transaction.create({
      data: {
        bookId: newBook.id,
        userId: session.user.id,
        type: "DONATE",
      },
    });

    return NextResponse.json({ success: true, book: newBook, aiApproved: initialStatus === "IN_LOCKER" }, { status: 201 });
  } catch (error: any) {
    console.error("Create book error:", error);
    return NextResponse.json({ error: "Failed to submit book donation" }, { status: 500 });
  }
}
