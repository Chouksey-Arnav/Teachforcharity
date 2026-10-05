import { Logo } from "@/components/brand/logo";

const PROMISES = ["Free one-on-one lessons, always", "Online only, never recorded", "Parent consent before any lesson", "Hours verified by our nonprofit partner"];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.05fr] lg:p-[clamp(8px,1.2vw,18px)]">
      {/* The landing page's painted sky, carrying the program's promise. */}
      <aside className="lm-sky lm-panel relative hidden flex-col p-12 lg:flex xl:p-14">
        <svg className="pointer-events-none absolute inset-x-0 top-[16%] h-40 w-full text-pine-700 opacity-[0.18]" viewBox="0 0 1200 200" preserveAspectRatio="none" aria-hidden>
          {[60, 80, 100, 120, 140].map((y) => (
            <path key={y} d={`M0 ${y} C 260 ${y - 34}, 520 ${y + 30}, 760 ${y} S 1080 ${y - 26}, 1200 ${y + 6}`} fill="none" stroke="currentColor" strokeWidth="1.2" />
          ))}
        </svg>
        <Logo className="relative" />
        <div className="relative mt-auto max-w-lg">
          <p className="lm-eyebrow">Volunteer-run · Online · North Carolina</p>
          <p className="lm-h2 mt-5 text-ink">
            “The best teacher is often the one who <em>just</em> figured it out.”
          </p>
          <ul className="lm-frost mt-10 grid gap-3 rounded-[22px] p-5 text-[15px] text-ink-2">
            {PROMISES.map((p) => (
              <li key={p} className="flex items-center gap-3">
                <span className="size-2 shrink-0 rounded-full bg-pine-700" aria-hidden />
                {p}
              </li>
            ))}
          </ul>
        </div>
      </aside>
      <main className="lm-wash flex flex-col px-4 py-6 sm:px-10 lg:before:hidden">
        <div className="lg:hidden">
          <Logo />
        </div>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">{children}</div>
      </main>
    </div>
  );
}
