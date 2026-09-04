'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminHandoverButton({ bookId }: { bookId: string }) {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleAction = async () => {
    if (!confirm('確定已經與學生完成交接了嗎？')) return;
    
    setIsLoading(true);
    try {
      const res = await fetch(`/api/admin/books/${bookId}/handover`, {
        method: 'POST',
      });

      if (!res.ok) {
        throw new Error('交接失敗');
      }

      router.refresh();
    } catch (error) {
      alert(`操作失敗: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={handleAction}
      disabled={isLoading}
      className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-md text-xs font-medium transition-colors disabled:opacity-50"
    >
      {isLoading ? '處理中' : '確認交接完成'}
    </button>
  );
}
