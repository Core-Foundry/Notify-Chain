import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
      <div className="text-center max-w-md p-8">
        <h1 className="text-4xl font-bold mb-4 text-slate-800 dark:text-slate-100">NotifyChain</h1>
        <p className="text-slate-600 dark:text-slate-400 mb-8">
          Your analytics dashboard is ready! Switch themes anytime — your preference is saved.
        </p>
        <Link
          href="/analytics"
          className="inline-flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-full text-white bg-indigo-600 hover:bg-indigo-700 transition-all"
        >
          View Analytics Dashboard
        </Link>
      </div>
    </div>
  );
}
