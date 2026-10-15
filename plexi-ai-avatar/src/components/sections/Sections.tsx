import { Bot, Boxes, Globe2, Megaphone, MonitorSmartphone, Sparkles } from "lucide-react";
import { analytics } from "../../services/analytics";

const CARDS = [
  { icon: Bot, title: "AI & Automation", text: "AI-powered business solutions and workflow automation." },
  { icon: Megaphone, title: "Digital Marketing", text: "Digital and performance marketing that is built around growth." },
  { icon: Sparkles, title: "Immersive XR", text: "Virtual Reality and Augmented Reality experiences." },
  { icon: Globe2, title: "Metaverse", text: "Immersive virtual worlds and spaces for brands." },
  { icon: MonitorSmartphone, title: "Web & App Development", text: "Modern websites and applications." },
  { icon: Boxes, title: "Digital Experiences", text: "Interactive, memorable experiences across channels." },
];

export function Sections({ onOpenLead }: { onOpenLead: () => void }) {
  return (
    <>
      <section id="meet-plexi" className="mx-auto max-w-5xl px-4 py-16 md:py-24">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-plexus-orange">Meet Plexi</p>
        <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight md:text-4xl">The virtual face of Plexus Digitals</h2>
        <p className="mt-4 max-w-2xl leading-relaxed text-softgray">
          Plexi is our AI virtual representative. Talk or type, and Plexi will help you understand what Plexus Digitals does and point you to the right service or team.
        </p>
      </section>

      <section id="help" className="mx-auto max-w-5xl px-4 pb-16 md:pb-24">
        <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">What can Plexi help with?</h2>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CARDS.map(({ icon: Icon, title, text }) => (
            <li key={title} className="rounded-2xl border border-white/10 bg-charcoal/60 p-5 transition-colors hover:border-plexus-orange/40">
              <Icon className="size-6 text-plexus-orange" aria-hidden />
              <h3 className="mt-4 font-medium">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-softgray">{text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section id="explore" className="mx-auto max-w-5xl px-4 pb-24">
        <div className="flex flex-col items-start justify-between gap-6 rounded-3xl border border-white/10 bg-charcoal/60 p-8 md:flex-row md:items-center">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Explore Plexus Digitals</h2>
            <p className="mt-2 text-sm text-softgray">Ready to talk to a person? Leave your details and the team will follow up.</p>
          </div>
          <button
            type="button"
            onClick={() => {
              analytics.track("cta_clicked", { cta: "talk_to_our_team_section" });
              onOpenLead();
            }}
            className="min-h-12 rounded-full bg-plexus-orange px-7 text-sm font-semibold text-black transition-colors hover:bg-plexus-orange-soft"
          >
            Talk to Our Team
          </button>
        </div>
      </section>

      <footer className="border-t border-white/10 px-4 py-8 text-center text-xs text-softgray/70">
        Demo prototype - {new Date().getFullYear()} Plexus Digitals
      </footer>
    </>
  );
}
