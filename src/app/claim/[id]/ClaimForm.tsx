'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ClaimForm({ bookId }: { bookId: string }) {
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockerPassword, setLockerPassword] = useState<string | null>(null);
  
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      setError('請填寫感謝語');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/books/${bookId}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '配對失敗');
      }

      const data = await res.json();
      setLockerPassword(data.lockerPassword);
    } catch (err: any) {
      setError(err.message || '發生未知錯誤');
    } finally {
      setIsLoading(false);
    }
  };

  if (lockerPassword) {
    return (
      <div className="text-center animate-fade-in">
        <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
        </div>
        <h3 className="text-xl font-bold text-gray-900 mb-2">預約配對成功！</h3>
        <p className="text-gray-600 mb-6">請前往系辦走廊尋找舊書箱完成交接，書箱密碼已寫在書箱旁的板子上。</p>
        
        <p className="text-sm text-red-500 font-medium mb-6">
          ⚠️ 注意：請盡快前往完成交接。若遲遲未完成，書本將可能被重新釋出。
        </p>
        
        <button
          onClick={() => router.push('/browse')}
          className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors"
        >
          返回找書
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          給捐贈者的一句話 <span className="text-red-500">*</span>
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
          placeholder="謝謝您的捐贈，這對我下學期的課很有幫助！"
          required
        />
      </div>

      <button
        type="submit"
        disabled={isLoading || !message.trim()}
        className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-colors"
      >
        {isLoading ? '處理中...' : '送出並完成預約'}
      </button>
    </form>
  );
}
