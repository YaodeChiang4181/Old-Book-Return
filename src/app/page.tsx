export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] text-center px-4">
      <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 tracking-tight mb-6">
        讓你的舊書重活一次
      </h1>
      <p className="text-lg sm:text-xl text-gray-600 mb-10 max-w-2xl">
        經濟系專屬的舊書循環與社群媒合平台，解決學期初購書成本高昂、學期末舊書閒置堆積的痛點，建立永續校園的美好循環。
      </p>
      
      <div className="flex flex-col sm:flex-row gap-4 w-full justify-center max-w-md">
        <a href="/browse" className="w-full sm:w-auto px-8 py-3 text-base font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow transition-colors">
          找尋好書
        </a>
        <a href="/donate" className="w-full sm:w-auto px-8 py-3 text-base font-medium text-blue-600 bg-white border border-blue-600 hover:bg-blue-50 rounded-lg shadow-sm transition-colors">
          我要捐書
        </a>
      </div>
    </div>
  );
}
