import Link from "next/link";
import { PageHead } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="shell">
      <PageHead
        n="404"
        rail="Not found"
        eyebrow="Nothing here"
        title="This page *doesn't exist.*"
        lede={
          <>
            The link may be old. Start from the <Link href="/">home page</Link>, or watch the <Link href="/tour">two-minute tour</Link>.
          </>
        }
      />
    </main>
  );
}
