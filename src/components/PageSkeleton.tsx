/**
 * 换页时马上显示的骨架画面：资料还在 server 上准备，先让人知道按到了（各个 loading.tsx 共用）。
 * 形状跟真正的页面差不多（首页的黄色区块、左上角的返回按钮），换过去时才不会跳一下。
 */
export function PageSkeleton({ hero = false, back = false }: { hero?: boolean; back?: boolean }) {
  return (
    <main aria-busy="true" aria-label="载入中" className="animate-pulse motion-reduce:animate-none">
      {hero ? (
        <section className="grid-lines on-color px-4 pt-[max(10px,env(safe-area-inset-top))] pb-8">
          <div className="flex h-12 items-center justify-between">
            <div className="h-5 w-32 rounded-full bg-ink/10" />
            <div className="h-3 w-14 rounded-full bg-ink/10" />
          </div>
          <div className="mt-9 h-3.5 w-24 rounded-full bg-ink/10" />
          <div className="mt-3 h-14 w-52 rounded-[14px] bg-ink/10" />
          <div className="mt-7 h-4 w-60 max-w-full rounded-full bg-ink/10" />
          <div className="mt-7 h-14 w-full rounded-full bg-ink/15" />
        </section>
      ) : (
        <div className="px-4 pt-[max(8px,env(safe-area-inset-top))]">
          <div className="flex min-h-12 items-center pt-1">{back && <div className="h-9 w-20 rounded-full bg-surface" />}</div>
          <div className="mt-4 h-10 w-40 rounded-[12px] bg-fill-2" />
        </div>
      )}
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
