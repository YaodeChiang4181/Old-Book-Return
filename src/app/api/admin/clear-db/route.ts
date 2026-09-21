import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    // Delete all transactions and books
    await prisma.transaction.deleteMany();
    await prisma.book.deleteMany();
    
    return NextResponse.json({ success: true, message: "資料庫中的書籍與交易紀錄已全數清空" });
  } catch (error: any) {
    console.error("Clear DB error:", error);
    return NextResponse.json({ error: "清空失敗" }, { status: 500 });
  }
}
