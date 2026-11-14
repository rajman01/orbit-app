import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Terms of service" };

const UPDATED = "14 November 2026";

export default function Terms() {
  return (
    <article>
      <h1>Terms of service</h1>
      <p className="updated">Last updated {UPDATED}</p>

      <p>
        These terms cover your use of Orbit, a personal planning app. By creating an account or using Orbit, you agree
        to them.
      </p>

      <h2>Your account</h2>
      <p>
        Keep your sign-in details to yourself; you&rsquo;re responsible for what happens in your account. Tell the
        person who runs Orbit if you think someone else has used it.
      </p>

      <h2>Your content</h2>
      <p>
        What you put in Orbit stays yours. You let Orbit store, sync and process it only to run the app for you,
        including sending it to the AI coach when you use it. How that works is in the{" "}
        <Link href="/privacy">privacy policy</Link>.
      </p>

      <h2>Connected accounts</h2>
      <p>
        If you connect Google Calendar, Orbit reads the calendars you choose and writes your time blocks to an
        &ldquo;Orbit&rdquo; calendar. Your use of Google is also covered by Google&rsquo;s own terms. You can disconnect
        at any time in Settings.
      </p>

      <h2>The AI coach</h2>
      <p>
        The coach can be wrong. Its suggestions are not professional advice (medical, financial, legal or otherwise).
        Changes it makes to your plan are shown to you and can be undone; check anything important yourself.
      </p>

      <h2>Acceptable use</h2>
      <p>
        Don&rsquo;t use Orbit to break the law, to try to get into other people&rsquo;s data, or to overload or attack
        the service.
      </p>

      <h2>The service</h2>
      <p>
        Orbit is provided as it is, without guarantees that it will always be available or free of mistakes. Keep your
        own copies of anything you can&rsquo;t afford to lose. Features may change over time. To the extent the law
        allows, Orbit isn&rsquo;t liable for indirect losses, or for losses from using the app or not being able to.
      </p>

      <h2>Ending</h2>
      <p>
        You can stop using Orbit and ask for your account to be deleted at any time. An account that breaks these terms
        may be suspended.
      </p>

      <h2>Changes</h2>
      <p>If these terms change, the date at the top changes too, and anything significant is shown in the app.</p>
    </article>
  );
}
