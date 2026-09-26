import Image from "next/image";
import { CalendarCheck2, Check } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Photos are CC0 (see public/images/CREDITS.md). They're illustrative — the
 * people pictured aren't program participants — and the alt text says what's
 * shown, not who.
 */

export function HeroPhoto() {
  return (
    <div className="relative mx-auto w-full max-w-md lg:max-w-none">
      <div className="absolute -inset-y-8 inset-x-0 staff-bg sm:-inset-x-6 opacity-70 [mask-image:radial-gradient(closest-side,black,transparent)]" aria-hidden />
      <div className="relative overflow-hidden rounded-[28px] shadow-pop ring-1 ring-black/5">
        <Image
          src="/images/violin-lesson.jpg"
          alt="A teacher gently guides a young student's bow arm during a violin lesson"
          width={1024}
          height={971}
          priority
          sizes="(min-width: 1024px) 460px, (min-width: 640px) 448px, 92vw"
          className="aspect-[1.05] h-auto w-full object-cover"
        />
      </div>
      <div className="absolute -left-3 top-6 flex items-center gap-2 rounded-full bg-card/95 px-3 py-1.5 text-xs font-medium text-pine-800 shadow-lift ring-1 ring-line backdrop-blur sm:-left-6">
        <Check className="size-3.5" /> Great match · 94
      </div>
      <div className="absolute -bottom-5 right-3 w-[80%] max-w-xs rotate-[1.2deg] rounded-2xl border border-line bg-card p-3.5 shadow-lift sm:-right-5">
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brass-100 text-brass-800">
            <CalendarCheck2 className="size-[18px]" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Lesson booked</p>
            <p className="truncate text-xs text-muted">Thursday, 7 PM · Google Meet</p>
          </div>
        </div>
      </div>
    </div>
  );
}

const STRIP = [
  { src: "/images/violinist.jpg", w: 960, h: 640, alt: "A violinist playing outdoors in warm evening light", label: "Strings", sub: "Violin · viola · cello · bass" },
  { src: "/images/saxophone.jpg", w: 960, h: 1440, alt: "Hands holding a gold saxophone", label: "Woodwinds", sub: "Flute · clarinet · sax · oboe" },
  { src: "/images/sax-section.jpg", w: 960, h: 640, alt: "A band's saxophone section under warm stage lights", label: "Brass & band", sub: "Trumpet · horn · trombone · tuba" },
  { src: "/images/piano.jpg", w: 960, h: 640, alt: "An open book of sheet music on a piano", label: "Keys & percussion", sub: "Piano · mallets · drums" },
];

export function InstrumentStrip() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {STRIP.map((p, i) => (
        <figure key={p.src} className={cn("group relative overflow-hidden rounded-2xl bg-paper-3", i % 2 ? "lg:translate-y-6" : "")}>
          <Image
            src={p.src}
            alt={p.alt}
            width={p.w}
            height={p.h}
            sizes="(min-width: 1024px) 280px, 46vw"
            className="aspect-[4/5] h-auto w-full object-cover transition duration-700 group-hover:scale-[1.03]"
          />
          <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent p-3.5 pt-10 text-white sm:p-4 sm:pt-12">
            <p className="font-serif text-xl leading-tight sm:text-2xl">{p.label}</p>
            <p className="mt-0.5 text-[11.5px] text-white/80 sm:text-xs">{p.sub}</p>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

export function TutorPhoto() {
  return (
    <div className="relative overflow-hidden rounded-3xl">
      <Image
        src="/images/guitar.jpg"
        alt="Close-up of a musician's hand forming a chord on a guitar neck"
        width={960}
        height={639}
        sizes="(min-width: 1024px) 420px, 92vw"
        className="aspect-[4/3] h-auto w-full object-cover"
      />
    </div>
  );
}
