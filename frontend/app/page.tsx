import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 sm:p-8">
      <div className="text-center max-w-md w-full">
        <h1 className="text-3xl sm:text-4xl font-bold mb-4 text-slate-800">NotifyChain</h1>
        <p className="text-slate-600 mb-8 text-sm sm:text-base">Your analytics dashboard is ready!</p>
        <Link
          href="/analytics"
          className="inline-flex items-center justify-center px-6 sm:px-8 py-3 border border-transparent text-base font-medium rounded-full text-white bg-indigo-600 hover:bg-indigo-700 transition-all w-full sm:w-auto"
        >
          View Analytics Dashboard
        </Link>
      </div>
    </div>
  );
}
