'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminBookActions({ bookId }: { bookId: string }) {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleAction = async (action: 'approve' | 'reject') => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/admin/books/${bookId}/${action}`, {
        method: 'POST',
      });

      if (!res.ok) {
        throw new Error(`Failed to ${action} book`);
      }

      router.refresh();
    } catch (error) {
      alert(`操作失敗: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex gap-2">
      <button
        onClick={() => handleAction('approve')}
        disabled={isLoading}
        className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
      >
        核准入箱
      </button>
      <button
        onClick={() => handleAction('reject')}
        disabled={isLoading}
        className="flex-1 bg-red-100 hover:bg-red-200 text-red-700 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
      >
        退回
      </button>
    </div>
  );
}
