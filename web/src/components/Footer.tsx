import Link from "next/link";
import { repoUrl } from "@/lib/env";

/** One footer for every page: the pitch, the links, and the wordmark in outline. */
export function Footer() {
  return (
    <footer className="foot">
      <div className="shell foot-in">
        <p className="foot-pitch">
          Don&apos;t give your agent a budget. Let it <em>earn</em> one.
        </p>
        <div className="foot-col">
          <p>See it</p>
          <Link href="/tour">Start here</Link>
          <Link href="/live">Live agents</Link>
          <Link href="/playground">Try it</Link>
          <Link href="/assistant">Ask the assistant</Link>
        </div>
        <div className="foot-col">
          <p>Learn</p>
          <Link href="/docs">How it works</Link>
          <Link href="/docs#hijack">What a hijacker can take</Link>
          <Link href="/docs#contracts">Contracts</Link>
        </div>
        <div className="foot-col">
          <p>Build</p>
          <a href={repoUrl} target="_blank" rel="noreferrer">
            GitHub
          </a>
          <Link href="/connect">Connect your agent</Link>
          <Link href="/agents">Every agent</Link>
          <Link href="/docs#run">Run it yourself</Link>
        </div>
      </div>
      <span className="foot-word" aria-hidden="true">
        kibble<b>.</b>
      </span>
      <div className="shell foot-base">
        <span>QDay Aevum testnet · chain 44005</span>
        <span>MIT licensed · DoraHacks Aevum Builder Challenge #1</span>
      </div>
    </footer>
  );
}
