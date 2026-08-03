import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";
import Image from "next/image";
import AdminBookActions from "./AdminBookActions";
import { formatDistanceToNow, format } from "date-fns";
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

  const allBooks = await prisma.book.findMany({
    include: {
      donor: { select: { name: true, email: true } },
      recipient: { select: { name: true, email: true } }
    },
    orderBy: { createdAt: "desc" },
  });

  const users = await prisma.user.findMany({
    include: {
      _count: {
        select: { donatedBooks: true, reservedBooks: true }
      }
    },
    orderBy: { role: 'desc' }
  });

  const statusMap: Record<string, { label: string, color: string }> = {
    PENDING: { label: "待審核", color: "bg-yellow-100 text-yellow-800" },
    IN_LOCKER: { label: "可領取", color: "bg-green-100 text-green-800" },
    RESERVED: { label: "已預約", color: "bg-blue-100 text-blue-800" },
    CLAIMED: { label: "已領取", color: "bg-gray-100 text-gray-800" },
    EXPIRED: { label: "已過期", color: "bg-red-100 text-red-800" },
    REJECTED: { label: "已退回", color: "bg-red-100 text-red-800" },
  };

  return (
    <div className="max-w-7xl mx-auto space-y-12">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">管理員後台</h1>
          <p className="text-gray-600 mt-2">系統管理、書籍紀錄與成員名單</p>
        </div>
      </div>

      {/* 待審核書籍區塊 */}
      <section>
        <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
          待審核書籍
          <span className="bg-red-100 text-red-800 text-sm py-1 px-3 rounded-full">{pendingBooks.length}</span>
        </h2>
        {pendingBooks.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-8 text-center text-gray-500">
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
                    <p>捐贈者：{book.donor?.name || "匿名"}</p>
                    <p>申請時間：{formatDistanceToNow(new Date(book.createdAt), { addSuffix: true, locale: zhTW })}</p>
                  </div>
                  <AdminBookActions bookId={book.id} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 投書紀錄區塊 */}
      <section>
        <h2 className="text-2xl font-bold mb-4">書籍總覽與投書紀錄</h2>
        <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-200">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">書籍名稱</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">狀態</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">捐贈者</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">領取者</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">上傳時間</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {allBooks.map((book) => {
                  const statusInfo = statusMap[book.status] || { label: book.status, color: "bg-gray-100" };
                  return (
                    <tr key={book.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {book.title || "未命名書籍"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusInfo.color}`}>
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {book.donor?.name || book.donor?.email || "未知"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {book.recipient?.name || book.recipient?.email || "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {format(new Date(book.createdAt), 'yyyy/MM/dd HH:mm')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* 登入成員名單區塊 */}
      <section>
        <h2 className="text-2xl font-bold mb-4">系統成員名單</h2>
        <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-200">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">姓名</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">信箱</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">身分</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">捐贈數量</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">領取數量</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {user.name || "未設定"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {user.email}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${user.role === 'ADMIN' ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-800'}`}>
                        {user.role === 'ADMIN' ? '管理員' : '一般使用者'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {user._count.donatedBooks} 本
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {user._count.reservedBooks} 本
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

    </div>
  );
}
