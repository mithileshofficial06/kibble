import type { Metadata } from "next";
import { Hero } from "@/components/landing/Hero";
import "@/components/landing/landing.css";

export const metadata: Metadata = {
  title: { absolute: "Kibble · Spending limits AI agents have to earn" },
};

export default function LandingPage() {
  return (
    <main className="ld-main">
      <Hero />
    </main>
  );
}
