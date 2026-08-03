import prisma from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import Image from "next/image";
import ClaimForm from "./ClaimForm";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export default async function ClaimPage(
  props: {
    params: Promise<{ id: string }>;
  }
) {
  const params = await props.params;
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    redirect("/api/auth/signin?callbackUrl=/browse");
  }

  const book = await prisma.book.findUnique({
    where: { id: params.id },
    include: {
      donor: {
        select: { name: true },
      },
    },
  });

  if (!book) {
    notFound();
  }

  if (book.status !== "IN_LOCKER") {
    return (
      <div className="max-w-xl mx-auto mt-20 p-8 bg-white rounded-xl shadow-sm text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">無法領取</h2>
        <p className="text-gray-600 mb-6">這本書目前不在書箱中，可能已經被其他人領走了。</p>
        <a href="/browse" className="text-blue-600 hover:underline">
          返回尋找其他好書
        </a>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-sm overflow-hidden flex flex-col md:flex-row">
      {/* 左側書籍資訊 */}
      <div className="md:w-1/2 bg-gray-50 p-8 border-b md:border-b-0 md:border-r border-gray-100 flex flex-col justify-center">
        <div className="relative w-full h-64 sm:h-80 mb-6 rounded-lg overflow-hidden shadow-sm">
          {book.imageUrl ? (
            <Image src={book.imageUrl} alt={book.title || "Book"} fill className="object-cover" />
          ) : (
            <div className="flex items-center justify-center h-full bg-gray-200 text-gray-400">無圖片</div>
          )}
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{book.title}</h1>
        {book.isbn && <p className="text-sm text-gray-500 mb-4">ISBN: {book.isbn}</p>}
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 mt-4">
          <p className="text-sm text-gray-700 italic">
            "{book.description || "無書籍狀況描述"}"
          </p>
          <p className="text-xs text-gray-500 mt-3 text-right">
            — {book.donor.name || "匿名"} 捐贈
          </p>
        </div>
      </div>

      {/* 右側領取表單 */}
      <div className="md:w-1/2 p-8 flex flex-col justify-center">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">填寫感謝語</h2>
          <p className="text-gray-600">
            送出一句感謝的話給捐贈者，並完成預約領取。請在當日結束前，儘速前往系辦書箱領取，書箱密碼請填寫在書箱旁的板子。
          </p>
        </div>
        <ClaimForm bookId={book.id} />
      </div>
    </div>
  );
}
