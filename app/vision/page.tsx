export const metadata = {
  title: 'Our Vision — Society of Explorers',
  description:
    'A new data economy where AI guides humans toward meaningful work, and that work is rewarded in crypto.',
};

export default function VisionPage() {
  return (
    <main className="min-h-screen bg-black text-stone-200">
      {/* Hero */}
      <section className="px-6 pt-28 pb-16 text-center">
        <div className="mx-auto max-w-4xl">
          <p
            className="text-xs md:text-sm tracking-[0.4em] text-[#c9a84c] mb-6"
            style={{ fontFamily: 'var(--font-cinzel), serif' }}
          >
            SOCIETY OF EXPLORERS
          </p>
          <h1
            className="text-5xl md:text-7xl font-light text-[#e8d9a7]"
            style={{ fontFamily: 'var(--font-cinzel), serif' }}
          >
            Our Vision
          </h1>
          <div className="mx-auto mt-10 h-px w-24 bg-[#c9a84c]/40" />
        </div>
      </section>

      {/* Body */}
      <section className="px-6 pb-24">
        <article
          className="mx-auto max-w-2xl space-y-8 text-xl md:text-2xl leading-relaxed text-stone-300"
          style={{ fontFamily: 'var(--font-cormorant), "Cormorant Garamond", serif' }}
        >
          <p>I didn&apos;t build this to give you daily journaling prompts.</p>

          <p>
            I built it because I believe we&apos;re heading into a world where AI can guide humans
            toward meaningful work — and those humans should be rewarded in crypto for doing it.
          </p>

          <div className="pt-8">
            <h2
              className="text-2xl md:text-3xl text-[#c9a84c] tracking-wide"
              style={{ fontFamily: 'var(--font-cinzel), serif' }}
            >
              Here&apos;s how it actually works
            </h2>
          </div>

          <p>
            Every day the AI gives you a real task.
            <br />
            <span className="text-stone-400">Not a reflection. A task.</span>
            <br />
            Something you can actually do in the real world.
          </p>

          <p>
            When you complete it and report back, you earn utility tokens. Those tokens come from
            people and organizations who need real work done — not from thin air.
          </p>

          <p>
            Over time, the AI learns what you&apos;re good at, what you care about, and starts
            giving you better tasks that line up with bigger visions.
          </p>

          <div className="my-12 border-l-2 border-[#c9a84c]/50 pl-6 italic text-stone-400">
            <p>
              The daily practice you see on the homepage is just the on-ramp.
              <br />
              The real system is what comes after.
            </p>
          </div>

          <p>
            This is how we build a new kind of data economy — one where your personal memory,
            wisdom, and effort have real value.
          </p>

          <p className="text-[#e8d9a7]">
            If that future excites you, start with today&apos;s question.
          </p>
        </article>

        {/* CTA */}
        <div className="mx-auto mt-16 max-w-2xl text-center">
          <a
            href="/practice"
            className="inline-block px-10 py-4 text-sm tracking-[0.2em] bg-[#c9a84c] text-black hover:bg-[#e8d9a7] transition-colors"
            style={{ fontFamily: 'var(--font-cinzel), serif' }}
          >
            BEGIN THE DAILY PRACTICE →
          </a>
        </div>
      </section>
    </main>
  );
}
