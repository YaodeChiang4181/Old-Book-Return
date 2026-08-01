import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const book = await prisma.book.findUnique({
      where: { id: params.id },
    });

    if (!book || book.status !== "PENDING") {
      return NextResponse.json({ error: "Invalid book status" }, { status: 400 });
    }

    // 核准入箱：將狀態改為 IN_LOCKER 並紀錄 inLockerSince 為現在時間
    const updatedBook = await prisma.book.update({
      where: { id: params.id },
      data: {
        status: "IN_LOCKER",
        inLockerSince: new Date(),
      },
    });

    return NextResponse.json({ success: true, book: updatedBook });
  } catch (error: any) {
    console.error("Approve book error:", error);
    return NextResponse.json({ error: "Failed to approve book" }, { status: 500 });
  }
}
