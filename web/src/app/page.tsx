import type { Metadata } from "next";
import { Hero } from "@/components/landing/Hero";
import { Intro } from "@/components/landing/Intro";
import { More } from "@/components/landing/More";
import { Nav } from "@/components/landing/Nav";
import "@/components/landing/landing.css";
import "@/components/landing/more.css";

export const metadata: Metadata = { title: { absolute: "Kibble · Spending limits AI agents have to earn" } };

export default function LandingPage() {
  return (
    <main className="ld-main">
      <Nav />
      <Intro />
      <Hero />
      <More />
    </main>
  );
}
