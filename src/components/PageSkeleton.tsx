/** 换页时马上显示的骨架画面：资料还在 server 上准备，先让人知道按到了（各个 loading.tsx 共用） */
export function PageSkeleton() {
  return (
    <main aria-busy="true" aria-label="载入中" className="animate-pulse motion-reduce:animate-none">
      <div className="px-4 pt-[max(8px,env(safe-area-inset-top))]">
        <div className="min-h-12 pt-1" />
        <div className="mt-4 h-10 w-40 rounded-[12px] bg-fill-2" />
      </div>
      <div className="px-4">
        {[3, 4].map((rows, g) => (
          <section key={g} className="mt-8">
            <div className="mb-2.5 ml-1 h-3.5 w-24 rounded-full bg-fill" />
            <div className="overflow-hidden rounded-[24px] bg-surface">
              {Array.from({ length: rows }, (_, i) => (
                <div key={i} className="flex min-h-[60px] items-center gap-3 px-4 py-3">
                  <div className="size-10 shrink-0 rounded-full bg-fill-2" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="h-4 w-1/2 rounded-full bg-fill-2" />
                    <div className="h-3 w-1/3 rounded-full bg-fill" />
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
