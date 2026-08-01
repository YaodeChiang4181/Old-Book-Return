import prisma from "@/lib/prisma";
import Image from "next/image";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { zhTW } from "date-fns/locale";

export const dynamic = 'force-dynamic';

export default async function BrowsePage() {
  // 取得狀態為 IN_LOCKER 的書本
  const books = await prisma.book.findMany({
    where: {
      status: "IN_LOCKER",
    },
    include: {
      donor: {
        select: {
          name: true,
          image: true,
        },
      },
    },
    orderBy: {
      inLockerSince: "desc",
    },
  });

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">找尋好書</h1>
          <p className="text-gray-600 mt-2">目前在舊書箱中等待新主人的書籍</p>
        </div>
      </div>

      {books.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 text-gray-400 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
          </div>
          <h3 className="text-xl font-medium text-gray-900 mb-2">目前書箱空空如也</h3>
          <p className="text-gray-500 mb-6">還沒有人捐贈書籍，或是書籍都已經被領取完畢了。</p>
          <Link href="/donate" className="text-blue-600 hover:text-blue-700 font-medium">
            搶先成為第一位捐書人 &rarr;
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {books.map((book) => (
            <div key={book.id} className="bg-white rounded-xl shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow">
              <div className="relative h-64 w-full bg-gray-100">
                {book.imageUrl ? (
                  <Image
                    src={book.imageUrl}
                    alt={book.title || "Book cover"}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-400">無圖片</div>
                )}
              </div>
              <div className="p-5 flex flex-col flex-1">
                <h3 className="text-lg font-bold text-gray-900 line-clamp-1 mb-1" title={book.title || ""}>
                  {book.title}
                </h3>
                {book.isbn && (
                  <p className="text-xs text-gray-500 mb-3">ISBN: {book.isbn}</p>
                )}
                <p className="text-sm text-gray-600 line-clamp-2 mb-4 flex-1">
                  {book.description || "無書籍狀況描述"}
                </p>
                
                <div className="flex items-center justify-between mt-auto pt-4 border-t border-gray-100">
                  <div className="flex items-center space-x-2">
                    {book.donor.image ? (
                      <Image src={book.donor.image} alt="Donor" width={24} height={24} className="rounded-full" />
                    ) : (
                      <div className="w-6 h-6 bg-gray-200 rounded-full" />
                    )}
                    <span className="text-xs text-gray-500 truncate max-w-[80px]">
                      {book.donor.name || "匿名"} 捐贈
                    </span>
                  </div>
                  <span className="text-xs text-gray-400">
                    {book.inLockerSince ? formatDistanceToNow(new Date(book.inLockerSince), { addSuffix: true, locale: zhTW }) : ""}
                  </span>
                </div>
                
                <Link
                  href={`/claim/${book.id}`}
                  className="mt-4 block w-full text-center bg-blue-50 text-blue-600 hover:bg-blue-100 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  我要這本書
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
