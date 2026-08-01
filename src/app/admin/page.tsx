import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";
import Image from "next/image";
import AdminBookActions from "./AdminBookActions";
import { formatDistanceToNow } from "date-fns";
import { zhTW } from "date-fns/locale";

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const session = await getServerSession(authOptions);

  if (!session || session.user?.role !== "ADMIN") {
    redirect("/");
  }

  const pendingBooks = await prisma.book.findMany({
    where: {
      status: "PENDING",
    },
    include: {
      donor: {
        select: { name: true },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8 border-b pb-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">管理員後台</h1>
          <p className="text-gray-600 mt-2">審核學生捐贈的二手書籍</p>
        </div>
      </div>

      <h2 className="text-xl font-bold mb-4">待審核書籍 ({pendingBooks.length})</h2>

      {pendingBooks.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center text-gray-500">
          目前沒有需要審核的書籍。
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {pendingBooks.map((book: any) => (
            <div key={book.id} className="bg-white rounded-xl shadow-sm overflow-hidden flex flex-col border border-gray-200">
              <div className="relative h-64 w-full bg-gray-100">
                {book.imageUrl ? (
                  <Image src={book.imageUrl} alt={book.title || "Book cover"} fill className="object-cover" />
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-400">無圖片</div>
                )}
              </div>
              <div className="p-5 flex flex-col flex-1">
                <h3 className="text-lg font-bold text-gray-900 mb-1">{book.title}</h3>
                {book.isbn && <p className="text-xs text-gray-500 mb-2">ISBN: {book.isbn}</p>}
                <p className="text-sm text-gray-600 mb-4 flex-1">
                  {book.description || "無書籍狀況描述"}
                </p>
                
                <div className="text-xs text-gray-500 mb-4 border-t pt-2">
                  <p>捐贈者：{book.donor.name || "匿名"}</p>
                  <p>申請時間：{formatDistanceToNow(new Date(book.createdAt), { addSuffix: true, locale: zhTW })}</p>
                </div>

                <AdminBookActions bookId={book.id} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
