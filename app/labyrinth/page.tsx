import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'The Labyrinth of Becoming | Society of Explorers',
};

export default function Labyrinth() {
  return (
    <div className="min-h-screen bg-black text-white overflow-x-hidden font-serif">
      {/* ENTRY HALL */}
      <section className="h-screen flex items-center justify-center relative bg-gradient-to-b from-black via-zinc-950 to-black">
        <div className="absolute inset-0 bg-[radial-gradient(at_center,#c9a84c22_0%,transparent_70%)]" />
        <div className="relative z-10 max-w-4xl text-center px-8">
          <h1 className="text-7xl md:text-8xl font-light tracking-[0.25em] mb-8 text-amber-300">THE LABYRINTH OF BECOMING</h1>
          <p className="text-2xl md:text-3xl mb-16 text-amber-100/90">Step through — truth hides in beauty.</p>
          <a href="#room-origins" className="inline-block px-16 py-8 border-2 border-amber-300 text-amber-300 text-2xl hover:bg-amber-300 hover:text-black transition-all duration-300 tracking-widest">OPEN THE FIRST DOOR</a>
        </div>
      </section>

      {/* ROOM 1 - Origins */}
      <section id="room-origins" className="min-h-screen py-24 px-8 bg-zinc-950 border-t-8 border-amber-300 flex items-center">
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-16 items-center">
          <div className="text-xl leading-relaxed space-y-8">
            <p>We create because existence demands it. Plato’s Demiurge shapes chaos into cosmos. Genesis tells us we are made in the image of God — co-creators. Dharma flows through mindful work.</p>
            <p>In the age of AI, we are not standing-reserve (Heidegger’s Gestell). We are the poets who reveal truth in beauty.</p>
          </div>
          <div className="bg-black border border-amber-300 p-4 rounded-2xl">
            <img src="https://picsum.photos/id/1015/800/800" alt="Giovanni DeCunto God Series" className="rounded-xl w-full" />
            <p className="text-center text-amber-300 text-sm mt-4">Giovanni DeCunto — God Series</p>
          </div>
        </div>
        <a href="#room-enframing" className="absolute bottom-12 right-12 text-amber-300 hover:text-amber-100 text-xl">→ Next door: The Danger</a>
      </section>

      {/* ROOM 2 - Enframing */}
      <section id="room-enframing" className="min-h-screen py-24 px-8 bg-black border-t-8 border-red-500 flex items-center">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-6xl mb-12 border-b border-red-400 pb-6 text-red-400">CHAMBER OF ENFRAMING</h2>
          <p className="text-2xl leading-relaxed max-w-3xl">Heidegger’s “The Question Concerning Technology” (1962): modern tech turns everything into standing-reserve — forests into fuel, humans into data, Being itself into resource.</p>
          <p className="text-xl mt-12 text-amber-100/70">We have lived this danger. Now we reclaim it with poetry and art first.</p>
          <a href="#room-founder" className="mt-16 text-amber-300 hover:text-amber-100 text-xl">→ Next door: The Founder’s Path</a>
        </div>
      </section>

      {/* ROOM 3 - Founder */}
      <section id="room-founder" className="min-h-screen py-24 px-8 bg-zinc-950 border-t-8 border-amber-300 flex items-center">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-6xl mb-12 border-b border-amber-300 pb-6">YOUR STORY — THE FOUNDER</h2>
          <p className="text-xl leading-relaxed max-w-3xl">Christopher Taylor studied the Great Books at Carthage College under Christopher Lynch and Martin Heidegger with Professor Daniel Magurshak. In 2007 he traveled with Magurshak to the phenomenology/transhumanism conference in Pittsburgh. He later dropped out of Columbia to build in the real world — solar energy, battery systems, crypto grids.</p>
          <a href="#room-creation" className="mt-16 text-amber-300 hover:text-amber-100 text-xl">→ Next door: Why We Create</a>
        </div>
      </section>

      {/* ROOM 4 - Creation */}
      <section id="room-creation" className="min-h-screen py-24 px-8 bg-black border-t-8 border-amber-300 flex items-center">
        <div className="max-w-5xl mx-auto text-center">
          <h2 className="text-6xl mb-12">WHY WE CREATE</h2>
          <p className="text-2xl max-w-2xl mx-auto leading-relaxed">We are made in the image of the Creator. Plato’s Demiurge, Genesis, dharma — all point to the same truth: humans are co-creators. In the age of AI, machines mimic. We originate.</p>
          <a href="#room-pillars" className="mt-20 text-amber-300 hover:text-amber-100 text-xl">→ Next door: The Three Pillars</a>
        </div>
      </section>

      {/* ROOM 5 - Pillars */}
      <section id="room-pillars" className="min-h-screen py-24 px-8 bg-zinc-950 border-t-8 border-amber-300 flex items-center">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-6xl mb-12 border-b border-amber-300 pb-6">THE THREE PILLARS</h2>
          <div className="grid md:grid-cols-3 gap-12 text-center text-xl">
            <div><span className="block text-amber-300 text-2xl">Singularity</span><p className="mt-4">Solve death and shape abundance</p></div>
            <div><span className="block text-amber-300 text-2xl">The Secret</span><p className="mt-4">Focused intention manifests reality</p></div>
            <div><span className="block text-amber-300 text-2xl">Blockchain</span><p className="mt-4">Decentralized creation and ownership returned to the people</p></div>
          </div>
          <a href="#room-beauty" className="mt-16 text-amber-300 hover:text-amber-100 text-xl">→ Next door: Truth in Beauty</a>
        </div>
      </section>

      {/* ROOM 6 - Beauty + Artifact */}
      <section id="room-beauty" className="min-h-screen py-24 px-8 bg-black border-t-8 border-amber-300 flex items-center">
        <div className="max-w-5xl mx-auto text-center">
          <h2 className="text-6xl mb-12">TRUTH IN BEAUTY</h2>
          <p className="text-2xl max-w-2xl mx-auto leading-relaxed">Beauty is not decoration. It is the form that truth takes when fully realized. Giovanni DeCunto’s God Series reminds us: art discloses what technology conceals.</p>
          
          <div className="mt-24 bg-zinc-900 border border-amber-300 rounded-3xl p-12 max-w-2xl mx-auto">
            <h3 className="text-3xl mb-6">THE SOCIETY ARTIFACT</h3>
            <p className="text-lg mb-8">Physical books and talismans with embedded NFC chips. Tap any Artifact with your phone → it mints your NFT on the blockchain and unlocks your place in The Book.</p>
            <a href="/salon" className="inline-block px-12 py-6 bg-amber-300 text-black font-medium tracking-widest text-xl hover:scale-105 transition-transform">CLAIM YOUR ARTIFACT →</a>
          </div>
        </div>
      </section>

      {/* EXIT PORTAL */}
      <section className="min-h-screen flex items-center justify-center bg-gradient-to-b from-black to-zinc-950 text-center px-8">
        <div>
          <h2 className="text-6xl md:text-7xl leading-none mb-8">SOLVE DEATH.<br />SHAPE ABUNDANCE.<br />FREE THE MIND.</h2>
          <p className="text-2xl text-amber-100/80">This is not a company. It is a movement.</p>
          <a href="/salon" className="mt-16 inline-block px-16 py-8 border-2 border-white text-xl hover:bg-white hover:text-black transition-all">RETURN TO THE SALON</a>
        </div>
      </section>
    </div>
  );
}
