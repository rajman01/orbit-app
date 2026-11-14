import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy policy" };

const UPDATED = "14 November 2026";

export default function Privacy() {
  return (
    <article>
      <h1>Privacy policy</h1>
      <p className="updated">Last updated {UPDATED}</p>

      <p>
        Orbit is a personal planning app: goals, tasks, habits, focus sessions, an AI coach and your calendar in one
        place. This policy explains what Orbit stores, why, who else sees it, and how to remove it. Orbit doesn&rsquo;t
        sell your data, show ads, or use your data for anything other than running the app for you.
      </p>

      <h2>What Orbit stores</h2>
      <ul>
        <li>
          <strong>Your account:</strong> your name, email address and a password (stored only as a secure hash), or your
          Google sign-in if you use it.
        </li>
        <li>
          <strong>What you put in Orbit:</strong> areas, goals, key results, milestones, tasks, habits, focus sessions,
          cycles, reviews, reminders, settings, the people you add (with what you note about them: dates, contact
          details, notes, gift ideas and a log of when you were in touch), and your conversations with the coach and
          what it remembers about you. This is kept on your devices (so Orbit works offline) and on Orbit&rsquo;s server
          (so it syncs between them).
        </li>
        <li>
          <strong>Notifications:</strong> if you turn them on, the push address your browser gives Orbit, so reminders
          can reach that device.
        </li>
      </ul>

      <h2>Google Calendar</h2>
      <p>If you choose to connect Google Calendar in Settings, Orbit asks Google for permission to:</p>
      <ul>
        <li>see the list of your calendars (so you can choose which ones Orbit shows);</li>
        <li>
          see your events, and create, change and delete events (to show your events in Orbit, and to write the time
          blocks you make in Orbit to your calendar);
        </li>
        <li>create a calendar called &ldquo;Orbit&rdquo; and manage the events in it (where your time blocks go).</li>
      </ul>
      <p>
        Orbit reads events from the calendars you choose, from two weeks ago to three months ahead, and shows them to
        you in Orbit on your devices. It only creates, changes or deletes events that are your Orbit time blocks, in the
        &ldquo;Orbit&rdquo; calendar, and only because you made, moved or deleted a block. It never changes or deletes
        your other events. Orbit&rsquo;s access to your Google account is stored encrypted on Orbit&rsquo;s server and
        never sent to your devices.
      </p>
      <p>
        Orbit&rsquo;s use and transfer of information received from Google APIs adheres to the{" "}
        <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements. Calendar data is used only to provide Orbit&rsquo;s calendar features
        to you. It is not sold, not used for advertising, not used to train AI models, and not read by people, except
        when you ask for help with a problem and agree to it, or when the law requires it.
      </p>
      <p>
        You can disconnect Google Calendar at any time in Settings &rarr; Calendars. Orbit then deletes your calendars
        and events from its server and your devices and revokes its access. You can also remove Orbit&rsquo;s access
        from your Google account at{" "}
        <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">
          myaccount.google.com/permissions
        </a>
        .
      </p>

      <h2>Google Contacts</h2>
      <p>
        If you choose &ldquo;Import from Google Contacts&rdquo; on the People page, Orbit asks Google for permission to{" "}
        <strong>see your contacts</strong> (read-only), for that import only. Orbit reads names, birthdays and other
        dates, phone numbers and email addresses, gives the access back to Google straight away, and keeps the list on
        its server for at most 15 minutes so you can choose who to bring in. Only the people you choose are saved in
        Orbit. Orbit never changes your Google contacts and doesn&rsquo;t keep access to them. Contacts data is used
        only to add the people you pick, under the same Google API Services User Data Policy and Limited Use
        requirements as calendar data.
      </p>

      <h2>The AI coach</h2>
      <p>
        When you use the coach (chat, brain dump or check-ins), Orbit sends your message and the parts of your plan the
        coach needs to answer it &mdash; for example your goals, tasks, free time and, when it&rsquo;s about the people
        in your life, their names and what you&rsquo;ve noted about them &mdash; to Anthropic, which provides the Claude
        AI models. Anthropic processes it to produce the reply and doesn&rsquo;t use it to train its models. Calendar
        data from Google is sent to the coach only to answer your own requests, as allowed by Google&rsquo;s Limited Use
        rules; contacts imported from Google become your own notes in Orbit, and the coach sees them only when your
        request needs them. You can turn proactive check-ins off in Settings, and see and delete what the coach
        remembers about you.
      </p>

      <h2>Who else processes your data</h2>
      <ul>
        <li>
          <strong>Vercel</strong> hosts the app, and <strong>MongoDB Atlas</strong> hosts its database.
        </li>
        <li>
          <strong>Anthropic</strong> runs the AI coach (above).
        </li>
        <li>
          <strong>Google</strong>, if you sign in with Google, connect Google Calendar or import Google Contacts.
        </li>
        <li>Your browser&rsquo;s push service delivers notifications, if you turn them on.</li>
      </ul>
      <p>They process data only to provide their service to Orbit.</p>

      <h2>Cookies</h2>
      <p>
        Orbit uses only the cookies it needs to keep you signed in and to connect your calendar safely. No tracking or
        advertising cookies.
      </p>

      <h2>Keeping and deleting your data</h2>
      <p>
        Your data is kept while you have an account. Disconnecting a calendar deletes its data straight away. To delete
        your account and everything in it, ask the person who runs your Orbit; it is deleted from the server within 30
        days, and from backups as they expire.
      </p>

      <h2>Security</h2>
      <p>
        Everything is sent over encrypted connections. Calendar access is encrypted on the server. Each person&rsquo;s
        data is kept separate, and the server checks every change belongs to the person making it.
      </p>

      <h2>Changes</h2>
      <p>If this policy changes, the date at the top changes too, and anything significant is shown in the app.</p>
    </article>
  );
}
