'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

export default function DonatePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  
  const [title, setTitle] = useState('');
  const [isbn, setIsbn] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | false>(false);

  if (status === 'loading') return <div className="text-center py-20">載入中...</div>;
  
  if (status === 'unauthenticated') {
    return (
      <div className="text-center py-20">
        <h2 className="text-2xl font-bold mb-4">請先登入</h2>
        <p className="text-gray-600 mb-8">您需要登入才能捐贈二手書。</p>
      </div>
    );
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setPreviewUrl(URL.createObjectURL(selectedFile));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !file) {
      setError('請填寫書名並上傳照片');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // 1. Upload image
      const formData = new FormData();
      formData.append('file', file);

      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!uploadRes.ok) throw new Error('圖片上傳失敗');
      const { url: imageUrl } = await uploadRes.json();

      // 2. Submit book data
      const bookRes = await fetch('/api/books', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          isbn,
          description,
          imageUrl,
        }),
      });

      if (!bookRes.ok) throw new Error('捐書資料送出失敗');

      const resultData = await bookRes.json();
      setSuccess(resultData.aiApproved ? 'ai_approved' : 'pending');
    } catch (err: any) {
      setError(err.message || '發生未知錯誤');
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="max-w-xl mx-auto bg-white p-8 rounded-xl shadow-sm text-center">
        <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">捐書申請已送出！</h2>
        {success === 'ai_approved' ? (
          <p className="text-green-600 font-medium mb-6">🎉 AI 影像審核通過！您的書籍已經自動入庫，其他學生現在可以立即領取這本書。</p>
        ) : (
          <p className="text-gray-600 mb-6">管理員審核通過後，其他學生即可在找書頁面看到您的書籍。</p>
        )}
        <button 
          onClick={() => router.push('/')}
          className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          回首頁
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto bg-white p-6 sm:p-10 rounded-xl shadow-sm">
      <h1 className="text-3xl font-bold text-gray-900 mb-8 text-center">我要捐書</h1>
      
      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            書名 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            placeholder="請輸入書本名稱"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            ISBN (選填)
          </label>
          <input
            type="text"
            value={isbn}
            onChange={(e) => setIsbn(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            placeholder="例如: 978986398XXXX"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            書本狀況描述 (選填)
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            placeholder="是否有劃線、筆記或是泛黃？"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            書本照片 <span className="text-red-500">*</span>
          </label>
          
          <div className="mt-2 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-lg hover:bg-gray-50 transition-colors">
            <div className="space-y-2 text-center">
              {previewUrl ? (
                <div className="relative w-40 h-40 mx-auto mb-4">
                  <Image src={previewUrl} alt="Preview" fill className="object-cover rounded-lg shadow-sm" />
                </div>
              ) : (
                <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
                  <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              <div className="flex text-sm text-gray-600 justify-center">
                <label className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none">
                  <span>上傳圖片</span>
                  <input type="file" className="sr-only" accept="image/jpeg,image/png,image/webp" onChange={handleFileChange} required />
                </label>
              </div>
              <p className="text-xs text-gray-500">PNG, JPG, WEBP 檔案</p>
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-colors"
        >
          {isLoading ? '處理中...' : '送出捐書申請'}
        </button>
      </form>
    </div>
  );
}
