export default function TemplatesPage() {
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8">
          <div className="flex items-center space-x-4 mb-6">
            <div className="w-12 h-12 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-xl flex items-center justify-center">
              <span className="text-white text-2xl">📄</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Koçluk Modülü - PDF Şablonları</h1>
              <p className="text-gray-500">Rapor ve belge şablonları</p>
            </div>
          </div>
          
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 text-center">
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">🚧</span>
            </div>
            <h2 className="text-xl font-semibold text-amber-800 mb-2">Geliştirme Aşamasında</h2>
            <p className="text-amber-700">
              Bu sayfa henüz geliştirme aşamasındadır.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
