import type { Metadata } from "next";
import { Hero } from "@/components/landing/Hero";
import { Intro } from "@/components/landing/Intro";
import { Nav } from "@/components/landing/Nav";
import "@/components/landing/landing.css";

export const metadata: Metadata = { title: { absolute: "Kibble · Spending limits AI agents have to earn" } };

export default function LandingPage() {
  return (
    <main className="ld-main">
      <Nav />
      <Intro />
      <Hero />
    </main>
  );
}
