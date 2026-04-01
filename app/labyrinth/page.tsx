import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'The Labyrinth of Becoming | Society of Explorers',
};

export default function Labyrinth() {
  return (
    <div className="min-h-screen bg-black text-white font-serif overflow-hidden">
      {/* Entry Hall */}
      <section className="h-screen flex items-center justify-center relative bg-gradient-to-b from-black to-indigo-950">
        <div className="max-w-3xl text-center z-10 px-8">
          <h1 className="text-7xl font-light tracking-widest mb-6">THE LABYRINTH OF BECOMING</h1>
          <p className="text-2xl mb-12">Step through — truth hides in beauty.</p>
          <a href="#room-origins" className="px-12 py-6 border border-amber-300 text-amber-300 text-xl hover:bg-amber-300 hover:text-black transition-all">OPEN THE FIRST DOOR</a>
        </div>
        <img src="https://www.giovannidecunto.com/wp-content/uploads/2023/09/GOD-Series-1-scaled.jpg" className="absolute inset-0 w-full h-full object-cover opacity-20" alt="Giovanni DeCunto God Series" />
      </section>

      {/* Room 1: Origins */}
      <section id="room-origins" className="py-24 px-8 max-w-5xl mx-auto">
        <h2 className="text-5xl mb-8 border-b border-amber-300 pb-4">ROOM OF ORIGINS</h2>
        <p className="text-xl leading-relaxed">
          We create because existence demands it. Plato’s Demiurge shapes chaos into cosmos. Genesis tells us we are made in the image of God — co-creators. Dharma flows through mindful work. In the age of AI, we are not standing-reserve (Heidegger’s Gestell). We are the poets who reveal truth in beauty.
        </p>
        <div className="my-12 grid grid-cols-3 gap-6">
          <img src="https://www.giovannidecunto.com/wp-content/uploads/2023/09/GOD-Series-2-scaled.jpg" className="rounded border border-amber-300" alt="Giovanni DeCunto God Series" />
          <img src="https://www.giovannidecunto.com/wp-content/uploads/2023/09/GOD-Series-3-scaled.jpg" className="rounded border border-amber-300" alt="Giovanni DeCunto God Series" />
          <img src="https://www.giovannidecunto.com/wp-content/uploads/2023/09/GOD-Series-4-scaled.jpg" className="rounded border border-amber-300" alt="Giovanni DeCunto God Series" />
        </div>
        <a href="#room-enframing" className="text-amber-300 text-sm tracking-widest hover:text-amber-100">→ Next door: The Danger</a>
      </section>

      {/* Room 2: Enframing */}
      <section id="room-enframing" className="py-24 px-8 bg-zinc-900">
        <h2 className="text-5xl mb-8 border-b border-red-400 pb-4">CHAMBER OF ENFRAMING</h2>
        <p className="text-xl leading-relaxed">
          Heidegger’s “The Question Concerning Technology” (1962): modern tech turns everything into standing-reserve — forests into fuel, humans into data, Being itself into resource. We have lived this danger. Now we reclaim it with poetry and art first.
        </p>
        <a href="#room-founder" className="text-amber-300 text-sm tracking-widest hover:text-amber-100 mt-8 inline-block">→ Next door: The Founder’s Path</a>
      </section>

      {/* Room 3: Founder Story */}
      <section id="room-founder" className="py-24 px-8 max-w-5xl mx-auto">
        <h2 className="text-5xl mb-8 border-b border-amber-300 pb-4">YOUR STORY — THE FOUNDER</h2>
        <p className="text-xl leading-relaxed">
          Christopher Taylor studied the Great Books at Carthage College under primary mentor Christopher Lynch and focused deeply on Martin Heidegger with Professor Daniel Magurshak. In 2007 he traveled with Professor Daniel Magurshak to the phenomenology/transhumanism conference in Pittsburgh. He later dropped out of Columbia’s post-bac classics program to build in the real world — solar energy, battery systems, crypto grids.
        </p>
        <a href="#room-creation" className="text-amber-300 text-sm tracking-widest hover:text-amber-100 mt-8 inline-block">→ Next door: Why We Create</a>
      </section>

      {/* Room 4: Creation */}
      <section id="room-creation" className="py-24 px-8 bg-zinc-900">
        <h2 className="text-5xl mb-8 border-b border-amber-300 pb-4">WHY WE CREATE</h2>
        <p className="text-xl leading-relaxed">
          We are made in the image of the Creator. Plato’s Demiurge, Genesis, dharma — all point to the same truth: humans are co-creators. In the age of AI, machines mimic. We originate.
        </p>
        <a href="#room-pillars" className="text-amber-300 text-sm tracking-widest hover:text-amber-100 mt-8 inline-block">→ Next door: The Three Pillars</a>
      </section>

      {/* Room 5: Three Pillars */}
      <section id="room-pillars" className="py-24 px-8 max-w-5xl mx-auto">
        <h2 className="text-5xl mb-8 border-b border-amber-300 pb-4">THE THREE PILLARS</h2>
        <p className="text-xl leading-relaxed">
          Singularity — solve death and shape abundance. The Secret — focused intention manifests reality. Blockchain — decentralized creation and ownership returned to people.
        </p>
        <a href="#room-beauty" className="text-amber-300 text-sm tracking-widest hover:text-amber-100 mt-8 inline-block">→ Next door: Truth in Beauty</a>
      </section>

      {/* Room 6: Truth in Beauty */}
      <section id="room-beauty" className="py-24 px-8 bg-zinc-900">
        <h2 className="text-5xl mb-8 border-b border-amber-300 pb-4">TRUTH IN BEAUTY</h2>
        <p className="text-xl leading-relaxed">
          Beauty is not decoration. It is the form that truth takes when fully realized. Giovanni DeCunto’s God Series reminds us: art discloses what technology conceals.
        </p>
      </section>

      {/* Exit Portal */}
      <section className="h-screen flex items-center justify-center bg-gradient-to-b from-indigo-950 to-black text-center">
        <div>
          <h2 className="text-6xl mb-8">SOLVE DEATH. SHAPE ABUNDANCE. FREE THE MIND.</h2>
          <p className="text-2xl max-w-md mx-auto">This is not a company. It is a movement. Join us.</p>
          <a href="/salon" className="inline-block mt-12 px-12 py-6 border-2 border-white text-white hover:bg-white hover:text-black text-xl">RETURN TO THE SALON</a>
        </div>
      </section>
    </div>
  );
}
