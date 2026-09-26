import { Logo } from "@/components/brand/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      <aside className="relative hidden overflow-hidden bg-pine-900 p-12 text-white lg:flex lg:flex-col">
        <div className="absolute inset-0 staff-bg opacity-[0.08] invert" aria-hidden />
        <Logo inverted className="relative" />
        <div className="relative mt-auto max-w-md">
          <p className="display text-5xl leading-[1.05]">
            “The best teacher is often the one who <em className="text-brass-300">just</em> figured it out.”
          </p>
          <ul className="mt-10 space-y-3 text-[15px] text-white/70">
            <li>· Free one-on-one lessons, always</li>
            <li>· Online only, never recorded</li>
            <li>· Parent consent before any lesson</li>
            <li>· Volunteer hours verified by our nonprofit partner</li>
          </ul>
        </div>
      </aside>
      <main className="flex flex-col px-4 py-8 sm:px-10">
        <div className="lg:hidden">
          <Logo />
        </div>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">{children}</div>
      </main>
    </div>
  );
}
