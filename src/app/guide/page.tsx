import type { Metadata } from "next";
import Link from "next/link";
import { OrbitMark } from "@/components/app/app-shell";
import { PrimaryCta } from "@/components/landing/cta";
import { GuideToc, type TocItem } from "@/components/guide/toc";

export const metadata: Metadata = {
  title: { absolute: "How to use Orbit — the guide" },
  description:
    "Everything Orbit does and how to use it as intended: the daily, two-weekly and quarterly rhythm, the coach, goals, habits, people, career and more, in plain language.",
  openGraph: {
    title: "How to use Orbit — the guide",
    description: "The daily, two-weekly and quarterly rhythm, and every part of Orbit, in plain language.",
    url: "/guide",
  },
};

const SECTIONS: TocItem[] = [
  { id: "idea", title: "The idea in one minute" },
  { id: "start", title: "Start here: your first week" },
  { id: "rhythm", title: "The rhythm" },
  { id: "capture", title: "Capture everything" },
  { id: "goals", title: "Vision, areas and goals" },
  { id: "tasks", title: "Tasks" },
  { id: "today", title: "Today" },
  { id: "focus", title: "Focus mode" },
  { id: "accountability", title: "Accountability and skipping" },
  { id: "cycles", title: "Cycles" },
  { id: "quarters", title: "Quarters and the year" },
  { id: "habits", title: "Habits and routines" },
  { id: "coach", title: "The coach" },
  { id: "calendar", title: "Calendar" },
  { id: "people", title: "People" },
  { id: "money", title: "Money" },
  { id: "career", title: "Career: skills, learning, jobs" },
  { id: "reflect", title: "Journal and wins" },
  { id: "progress", title: "Insights, reports and levels" },
  { id: "notifications", title: "Notifications and email" },
  { id: "phone", title: "Your phone and offline" },
  { id: "keyboard", title: "Keyboard shortcuts" },
  { id: "settings", title: "Settings and your data" },
  { id: "faq", title: "Questions" },
];

export default function GuidePage() {
  return (
    <div className="min-h-dvh bg-bg text-label">
      <header className="sticky top-0 z-30 border-b border-separator bg-bg/95 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2" aria-label="Orbit home">
            <OrbitMark size={26} />
            <span className="text-[17px] font-semibold tracking-[-0.01em]">Orbit</span>
            <span className="ml-1 rounded-full bg-fill px-2 py-0.5 text-[12px] font-semibold text-label-secondary">
              Guide
            </span>
          </Link>
          <PrimaryCta size="default" />
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="py-14 lg:py-20">
          <p className="text-[13px] font-semibold tracking-[0.08em] text-accent-text uppercase">The guide</p>
          <h1 className="mt-3 max-w-3xl text-[clamp(2.2rem,5vw,3.5rem)] leading-[1.05] font-bold tracking-[-0.03em]">
            How to use Orbit, all of it.
          </h1>
          <p className="mt-5 max-w-2xl text-[18px] leading-[1.55] text-label-secondary">
            Orbit does a lot, but it&rsquo;s built around one simple loop. Read the first three sections to get going
            today; dip into the rest when you reach that part of the app.
          </p>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-10 pb-24 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-14">
          <aside>
            <GuideToc items={SECTIONS} />
          </aside>

          <main className="guide max-w-[720px]">
            {/* 1 */}
            <Section id="idea" title="The idea in one minute">
              <p>
                Most planning apps either hold big dreams that never reach your day, or a to-do list that forgets why
                any of it matters. Orbit connects the two, from the long view down to the next five minutes:
              </p>
              <Ladder
                rungs={[
                  ["Vision", "What you value and where you want to be in 1, 5 and 10 years."],
                  ["Areas", "The parts of your life: Career, Relationships, Finance, Learning, and any you add."],
                  ["Goals", "Outcomes with a date, measured by key results and broken into milestones."],
                  ["Quarter", "The 3–5 goals you're committing to for the next three months."],
                  ["Cycle", "Two weeks of tasks you commit to, sized to what you can really do."],
                  ["Today", "At most three must-dos, each with a first step small enough to start."],
                ]}
              />
              <p>
                Then a rhythm keeps it moving: plan each morning, shut down each evening, review every two weeks and
                every quarter. And when you put something off, Orbit asks why and helps you deal with the reason, which
                is the part most apps leave out.
              </p>
            </Section>

            {/* 2 */}
            <Section id="start" title="Start here: your first week">
              <p>Do these in order. The first day takes about 20 minutes; after that it&rsquo;s minutes a day.</p>
              <Steps
                items={[
                  <>
                    <b>Install it on your phone</b> and turn on notifications (see{" "}
                    <a href="#phone">Your phone and offline</a>). The reminders are what make the rhythm happen.
                  </>,
                  <>
                    <b>Finish the welcome setup:</b> pick your areas, your week&rsquo;s start day, cycle length (two
                    weeks is the default) and working hours. You can change all of it later in Settings.
                  </>,
                  <>
                    <b>Empty your head.</b> Open the Inbox and use <b>Brain dump</b>: type or say everything on your
                    mind in one go and the coach turns it into tasks. Don&rsquo;t sort yet.
                  </>,
                  <>
                    <b>Make one real goal.</b> Easiest: open the Coach and say what you want (&ldquo;I want a better
                    role by June&rdquo;). It drafts the goal, key results, milestones and first tasks for you to check.
                  </>,
                  <>
                    <b>Plan your first cycle</b> on the Cycle page: pull in the tasks that matter for the next two weeks
                    until the capacity bar is about full, then commit.
                  </>,
                  <>
                    <b>Every morning, do the Daily Plan</b> (about 5 minutes) and pick up to three must-dos.{" "}
                    <b>Every evening, do the Shutdown</b> (about 3 minutes).
                  </>,
                  <>
                    <b>On the cycle&rsquo;s last day, do the Cycle Review</b>, then plan the next one. That&rsquo;s the
                    whole loop.
                  </>,
                ]}
              />
              <Tip>
                Don&rsquo;t set everything up on day one. Start with one goal and the daily rhythm; add habits, people,
                calendars and career pieces over the next weeks as you need them.
              </Tip>
            </Section>

            {/* 3 */}
            <Section id="rhythm" title="The rhythm">
              <p>
                Orbit works best as a habit, not a database. These are the moments it&rsquo;s built around, with the
                default reminder times (change them in Settings → Accountability).
              </p>
              <Table
                head={["When", "What", "How long"]}
                rows={[
                  [
                    "Each morning, 07:30",
                    "Daily Plan: clear the inbox, look at the calendar, pick ≤3 must-dos",
                    "~5 min",
                  ],
                  ["During the day", "Start must-dos with focus mode; capture anything new", "—"],
                  [
                    "Each evening, 21:00",
                    "Shutdown: tick off, decide on what's left, mood and energy, one line",
                    "~3 min",
                  ],
                  ["Last day of the cycle, 18:00", "Cycle Review, then plan the next cycle", "~20 min"],
                  ["End of each quarter", "Quarterly Review, Wheel of Life, then Quarterly Plan", "~30–45 min"],
                  ["Once a year", "Revisit your vision, values and yearly theme", "~30 min"],
                ]}
              />
              <p>
                A ritual you miss isn&rsquo;t lost: it stays pinned at the top of Today until you do it, and a missed
                Shutdown is folded into the next morning&rsquo;s plan.
              </p>
              <Tip>
                If you only do one thing, do the Daily Plan. Choosing three must-dos each morning, with a tiny first
                step each, is where most of Orbit&rsquo;s effect comes from.
              </Tip>
            </Section>

            {/* 4 */}
            <Section id="capture" title="Capture everything">
              <p>
                Get things out of your head the moment you think of them. Everything lands in the <b>Inbox</b>, and you
                sort it during the Daily Plan.
              </p>
              <h3>Ways to capture</h3>
              <ul>
                <li>
                  <b>Quick add:</b> press <Kbd>C</Kbd> anywhere on a computer, or the <b>+</b> button on your phone.
                </li>
                <li>
                  <b>Brain dump</b> (Inbox): paste or type a messy list, or tap the mic and talk. The coach splits it
                  into tasks with dates; you review before anything is added.
                </li>
                <li>
                  <b>Talk to the coach:</b> &ldquo;add: call the bank, renew passport next month&rdquo;.
                </li>
                <li>
                  <b>Share to Orbit</b> from another app on Android or a desktop Chrome browser (a link or text becomes
                  an inbox task).
                </li>
                <li>
                  <b>iPhone: the &ldquo;Add to Orbit&rdquo; Shortcut</b>, which works with Siri, the share sheet, Back
                  Tap or the Action Button. Set it up from Settings → Connected → <b>Capture from anywhere</b> (it uses
                  a personal token you can revoke).
                </li>
              </ul>
              <h3>Quick add understands shorthand</h3>
              <Table
                head={["Type", "Means"]}
                rows={[
                  ["tomorrow, fri, next mon, 3 dec", "the due date"],
                  ["!1  !2  !3  !4", "priority: urgent, high, medium, low"],
                  ["#career", "the area"],
                  ["+senior", "the goal whose title starts with “senior”"],
                ]}
              />
              <p>
                For example, <code>Send CV to Acme fri !2 #career +senior</code> becomes a high-priority Career task,
                due Friday, under your &ldquo;Senior role&rdquo; goal. You&rsquo;ll see what was understood before you
                add it.
              </p>
              <h3>Sorting the inbox</h3>
              <p>
                Go through it top to bottom and give each item a home: add it to a goal or area, schedule it, make it a
                habit or a journal note, or delete it. The Daily Plan asks you to get to inbox zero, or to say
                you&rsquo;re leaving the rest for later.
              </p>
              <Tip>Capture is for speed; don&rsquo;t organise while you capture. Sorting once a day is enough.</Tip>
            </Section>

            {/* 5 */}
            <Section id="goals" title="Vision, areas and goals">
              <h3>Vision</h3>
              <p>
                On the <b>Vision</b> page, write your core values, where you want to be in 1, 5 and 10 years, and a
                theme for this year in a few words. Goals can link to your values, so each goal shows why it matters. It
                takes half an hour and makes every later choice easier.
              </p>
              <h3>Areas</h3>
              <p>
                Areas are the parts of your life. Each has a page with its goals, tasks, habits and people, and a{" "}
                <b>health</b> colour (green, amber, red) from how its goals are going, overdue or stale work, and recent
                activity. Add, rename, recolour or archive areas from the sidebar.
              </p>
              <h3>Goals</h3>
              <ul>
                <li>
                  <b>Key results</b> say how you&rsquo;ll know it&rsquo;s working: a number (&ldquo;applications sent: 0
                  → 20&rdquo;), a percentage, or done / not done. Check in on them as you go; progress follows them.
                </li>
                <li>
                  <b>Milestones</b> are dated checkpoints (&ldquo;CV rewritten&rdquo;). Attach tasks to them.
                </li>
                <li>
                  <b>Roadmap:</b> once a goal has a target date or dated milestones, its page draws the plan as a path
                  to the finish, with a stop for each milestone (done, up next, behind or later) and where you are
                  today. Tap a stop for its tasks; on a computer, drag it to change its date. All your goals together
                  are on the Year page&rsquo;s timeline (&ldquo;All goals on a timeline&rdquo; on the Goals page).
                </li>
                <li>
                  <b>Health</b> (on track, at risk, off track) is suggested from progress against time; you can set it
                  yourself.
                </li>
                <li>
                  <b>Updates:</b> each goal keeps a feed of check-ins, decisions and changes, so you can see its story.
                </li>
              </ul>
              <Rule>
                An active goal must always have at least one open task. If it doesn&rsquo;t, it shows up as &ldquo;Needs
                a next step&rdquo; every day until you add one, pause it, or drop it (dropping asks for a short reason).
              </Rule>
              <Tip>
                Fewer goals go further. Three to five active goals across all areas is plenty; park the rest as planned.
              </Tip>
            </Section>

            {/* 6 */}
            <Section id="tasks" title="Tasks">
              <p>Tasks are the actual work. The ones that matter most to use well:</p>
              <ul>
                <li>
                  <b>Effort</b> in points: 1 (under 30 minutes), 2 (about an hour), 3 (a couple of hours), 5 (half a
                  day), 8 (a day or more). Points are how Orbit knows if a day or cycle is overloaded.
                </li>
                <li>
                  <b>Next step:</b> the first action, small enough to do in two minutes (&ldquo;Open the doc and fix the
                  intro&rdquo;). Orbit asks for one when you put a bigger task on today. This single field is the best
                  cure for not starting.
                </li>
                <li>
                  <b>Due date vs scheduled date:</b> due is the deadline; scheduled is the day you plan to work on it.
                </li>
                <li>
                  <b>Subtasks</b> for checklists, and <b>recurring</b> tasks (daily, weekdays, certain days, monthly,
                  every N days, or N days after you finish).
                </li>
                <li>
                  <b>Blocked by:</b> link a task to the one it waits for. Blocked tasks are dimmed, and you&rsquo;re
                  told when they&rsquo;re free.
                </li>
              </ul>
              <h3>Seeing your tasks</h3>
              <p>
                The <b>Tasks</b> page has a list and a board (drag between columns to change status), filters, and{" "}
                <b>saved views</b> that appear in the sidebar. Select several tasks to change them all at once.{" "}
                <b>Upcoming</b> shows the next two weeks day by day.
              </p>
            </Section>

            {/* 7 */}
            <Section id="today" title="Today">
              <p>Today is where you spend most of your time. Top to bottom:</p>
              <Steps
                items={[
                  <>
                    <b>Must-dos (up to 3):</b> the things that make today a good day. A fourth means swapping one out.
                  </>,
                  <>
                    <b>Also today:</b> everything else scheduled, in the order you drag it to.
                  </>,
                  <>
                    <b>Habits due</b>, <b>your calendar</b> (events and time blocks), and anyone due a catch-up.
                  </>,
                  <>
                    <b>Overdue:</b> each one asks for a decision; nothing just sits there.
                  </>,
                ]}
              />
              <p>
                A soft limit warns you when the day&rsquo;s points pass your daily capacity (8 by default). Each task
                has a <b>Start</b> button that opens focus mode. On a phone, <b>swipe right to finish</b> a task and{" "}
                <b>swipe left to move it</b>.
              </p>
              <Tip>
                Pick must-dos that move a goal, not the easiest three. Do the hardest one first, with five minutes on
                the clock.
              </Tip>
            </Section>

            {/* 8 */}
            <Section id="focus" title="Focus mode">
              <p>
                One task, one timer, nothing else on screen: the title, its next step, subtasks and a notes pad. Start
                it from any task (or press <Kbd>F</Kbd>).
              </p>
              <ul>
                <li>
                  The first session is <b>just 5 minutes</b>. When it ends, Orbit asks if you want to keep going. Most
                  of the time you will; that&rsquo;s the point.
                </li>
                <li>Then choose a Pomodoro (25 minutes on, 5 off by default), a set length, or an open stopwatch.</li>
                <li>
                  When you stop, say how it went: <b>Done</b>, <b>Made progress</b> (and write the new next step), or{" "}
                  <b>Stuck</b> (break it down, with the coach if you like).
                </li>
                <li>The timer survives a reload, works offline, and shows in the browser tab.</li>
              </ul>
            </Section>

            {/* 9 */}
            <Section id="accountability" title="Accountability and skipping">
              <p>
                This is Orbit&rsquo;s core. It&rsquo;s firm but never shaming: the aim is to understand why things slip
                and fix that.
              </p>
              <h3>Putting something off asks why</h3>
              <p>
                Moving a planned task off today or out of a cycle needs a reason, which takes one tap. Each reason comes
                with a way forward:
              </p>
              <Table
                head={["Reason", "What Orbit offers"]}
                rows={[
                  ["Too big", "Break it into smaller steps (the coach can do it)"],
                  ["Unclear what to do", "Write the very next step"],
                  ["No time", "Pick a day that has room, with a time block"],
                  ["Low energy", "Do the 5-minute version, or move it to a better slot"],
                  ["Waiting on something", "Mark it blocked and pick a day to follow up"],
                  ["Avoiding it", "Start 5 minutes now, or talk it through with the coach"],
                  ["Not important anymore", "Cancel it (and check on its goal)"],
                ]}
              />
              <h3>Stale tasks</h3>
              <p>
                A task put off 3 times, or planned but untouched for 14 days, is marked <b>stale</b> and pinned to the
                top of Today until you choose: break it down, do 5 minutes now, reschedule with a commitment, ask for
                help, or drop it. Finishing a stale task earns double XP.
              </p>
              <h3>How strict</h3>
              <Table
                head={["Setting", "What it does"]}
                rows={[
                  ["Gentle", "Reasons are optional; nothing is pinned or blocked"],
                  [
                    "Firm (default)",
                    "Reasons required; stale and overdue work pinned; missed rituals carried forward; coach check-ins on",
                  ],
                  [
                    "Strict",
                    "Firm, plus XP lost for stale tasks left alone, and no planning the next cycle until the review is done",
                  ],
                ]}
              />
              <Tip>
                Be honest with the reasons, especially &ldquo;Avoiding it&rdquo;. Your Insights page turns them into
                patterns, and that&rsquo;s where the real fixes come from.
              </Tip>
            </Section>

            {/* 10 */}
            <Section id="cycles" title="Cycles">
              <p>
                A cycle is a two-week sprint for your life (length and start day are in Settings). It&rsquo;s the bridge
                between goals and days.
              </p>
              <h3>Planning a cycle</h3>
              <Steps
                items={[
                  <>Your quarter&rsquo;s goals come first, with their open tasks suggested.</>,
                  <>Pull tasks in until the capacity bar is about full (30 points by default; it learns from you).</>,
                  <>Going over capacity shows a warning and asks you to confirm.</>,
                  <>
                    Pick an optional theme and 1–3 focus goals, then <b>commit</b>: &ldquo;I commit to these 9
                    tasks.&rdquo;
                  </>,
                ]}
              />
              <p>
                During the cycle, the Cycle page shows points done against committed, with anything added mid-cycle
                shown separately.
              </p>
              <h3>The Cycle Review</h3>
              <p>
                On the last day: see the numbers, decide on every unfinished task (carry over, back to the backlog, or
                cancel), check in on goals and key results, clear stale tasks, log wins, reflect, and plan the next
                cycle. It&rsquo;s the most valuable 20 minutes in the app.
              </p>
              <Tip>
                Commit to less than you think. Finishing 80% of a smaller plan beats 40% of a heroic one, and your
                capacity number gets more accurate each cycle.
              </Tip>
            </Section>

            {/* 11 */}
            <Section id="quarters" title="Quarters and the year">
              <p>
                Quarters follow the calendar (January–March is Q1). The Quarter page shows its theme, its goals with
                progress, and whether you&rsquo;re on pace for the time gone.
              </p>
              <ul>
                <li>
                  <b>Quarterly Plan:</b> look at your vision and theme, decide on goals carried over, choose 3–5 goals
                  for the quarter (each with a date in the quarter and a key result), split them into monthly
                  milestones, and check it fits.
                </li>
                <li>
                  <b>Quarterly Review:</b> results per goal, a decision on each unfinished one (done, carry on, or drop
                  with a reason), wins, reflection, then the next Quarterly Plan.
                </li>
                <li>
                  <b>Wheel of Life:</b> rate each area from 1 to 10 in the review (or any time). The chart shows your
                  balance over time and which areas you say matter most.
                </li>
                <li>
                  <b>Year:</b> the year&rsquo;s theme and four quarters at a glance.
                </li>
              </ul>
              <p>
                A quarterly goal falling more than 20 points behind the time elapsed is marked <b>behind</b>, and comes
                up in your Cycle Review.
              </p>
            </Section>

            {/* 12 */}
            <Section id="habits" title="Habits and routines">
              <ul>
                <li>
                  <b>Habits</b> run daily, on certain days, or a number of times a week, as done / not done or a count
                  (&ldquo;read 20 pages&rdquo;), with an optional reminder. Tick them off on Today or the Habits page.
                </li>
                <li>
                  <b>Never miss twice:</b> one miss puts a streak at risk; two in a row breaks it. Missing once is
                  normal, so just don&rsquo;t miss the next one.
                </li>
                <li>
                  <b>Routines</b> are ordered checklists (a morning or evening routine) that you run step by step. A
                  step can tick off a habit, and finishing the routine earns XP.
                </li>
                <li>
                  Link a habit to a goal (&ldquo;apply to 2 jobs a week&rdquo; → &ldquo;Land a senior role&rdquo;).
                </li>
              </ul>
              <Tip>Start with two or three habits. Add more only when those are boring.</Tip>
            </Section>

            {/* 13 */}
            <Section id="coach" title="The coach">
              <p>
                The coach knows your goals, tasks, habits, people and history, and can act in Orbit for you. Open it
                from the Coach page, or press <Kbd>⌘</Kbd>
                <Kbd>J</Kbd> on a computer for a side panel. Type, or tap the mic and talk. On a phone, Return starts a
                new line and the arrow sends; on a computer, Enter sends and Shift-Enter starts a new line.
              </p>
              <h3>Things to ask</h3>
              <ul className="quotes">
                <li>&ldquo;I want to become a senior designer within a year. Make me a plan.&rdquo;</li>
                <li>&ldquo;Plan my day with me.&rdquo; (it runs the Daily Plan, Shutdown or Cycle Review as a chat)</li>
                <li>&ldquo;Break down &lsquo;Update my CV&rsquo;.&rdquo;</li>
                <li>&ldquo;Block two hours tomorrow morning for the portfolio.&rdquo;</li>
                <li>&ldquo;Remind me to call mum on Saturday at 5.&rdquo;</li>
                <li>&ldquo;Why do I keep skipping finance tasks?&rdquo;</li>
                <li>&ldquo;Plan my next cycle.&rdquo;</li>
                <li>&ldquo;Fit this SQL course in by the end of December.&rdquo;</li>
                <li>&ldquo;Who haven&rsquo;t I spoken to in a while?&rdquo;</li>
              </ul>
              <h3>A conversation about one thing</h3>
              <p>
                Goals, tasks, job leads and courses each have their own conversation with the coach. Press <b>Coach</b>{" "}
                on a goal, job or course page, or the speech-bubble button in a task&rsquo;s panel. That conversation
                stays about that one thing: the coach sees its latest details every time (milestones and tasks, steps
                and how often you&rsquo;ve put it off, the role and your application, sections and pace), and what it
                creates is attached to it.
              </p>
              <ul>
                <li>Come back to it any time; it carries on where you left off, on every device.</li>
                <li>
                  On the Coach page these conversations are marked with what they&rsquo;re about, and the title takes
                  you back to the item.
                </li>
                <li>
                  Long conversations are summarised behind the scenes, so the coach keeps the gist without slowing down.
                  You still see every message.
                </li>
              </ul>
              <h3>Staying in control</h3>
              <ul>
                <li>
                  Every change appears as a <b>card</b> with View and <b>Undo</b>, and is kept in AI activity (Settings)
                  for 30 days so you can undo it later.
                </li>
                <li>
                  Choose how much it does on its own (Settings → Coach): <b>Suggest only</b> (you accept each change),{" "}
                  <b>Act and tell me</b> (the default), or <b>Act quietly</b> for small things.
                </li>
                <li>Deleting things, dropping goals and big bulk changes always ask first.</li>
                <li>
                  <b>Memory:</b> tell it things worth remembering (&ldquo;I work best before noon&rdquo;). You can see,
                  edit and delete what it remembers in Settings.
                </li>
                <li>
                  <b>Check-ins:</b> it messages you when something slips, like two missed rituals or a goal going off
                  track, and sends a weekly summary. You can turn these off.
                </li>
              </ul>
              <Tip>
                Use it for the hard parts: turning a vague ambition into a plan, and getting unstuck. It&rsquo;s a
                coach, so tell it the truth.
              </Tip>
            </Section>

            {/* 14 */}
            <Section id="calendar" title="Calendar">
              <ul>
                <li>
                  <b>Connect Google or iCloud</b> in Settings → Calendars. For iCloud you&rsquo;ll need an app-specific
                  password from appleid.apple.com; Orbit shows you how.
                </li>
                <li>Your events appear on Today and in the Calendar page (day, week and month), next to your tasks.</li>
                <li>
                  <b>Time blocks:</b> drag a task onto the calendar, or choose Block time. The block goes into an
                  &ldquo;Orbit&rdquo; calendar in your Google or iCloud account; move it there and Orbit follows.
                </li>
                <li>
                  No Google or Apple? Subscribe to Orbit&rsquo;s private calendar feed (Settings → Calendars) in any
                  calendar app to see time blocks and dated tasks.
                </li>
              </ul>
              <Tip>Block time for each must-do in the Daily Plan. A task with a time is far more likely to happen.</Tip>
            </Section>

            {/* 15 */}
            <Section id="people" title="People">
              <p>A light personal CRM for the people who matter, so nobody slips away because life got busy.</p>
              <ul>
                <li>
                  Add people by hand or <b>import from Google Contacts</b>, with birthdays and other dates, how you met,
                  interests and notes.
                </li>
                <li>
                  Set <b>how often to stay in touch</b> (weekly, monthly, quarterly…). Anyone overdue shows up on Today,
                  one or two a day.
                </li>
                <li>
                  <b>Log a call, message or meet-up</b>, with a follow-up that becomes a task.
                </li>
                <li>Reminders a week and a day before birthdays and other dates.</li>
                <li>
                  Keep <b>gift ideas</b> and <b>things to remember</b> about each person.
                </li>
              </ul>
            </Section>

            <Section id="money" title="Money">
              <p>
                One place for what comes in and goes out, in naira (or another currency picked in Settings). Everything
                is logged by you: there is no bank connection, so it works offline and nothing about your accounts
                leaves your devices except through Orbit&rsquo;s own sync.
              </p>
              <ul>
                <li>
                  <b>Log it fast.</b> Press <b>Log</b> on the Money page: an amount, a category, a note, the day. Or
                  type it anywhere Quick Add works: &ldquo;spent 12.50 lunch&rdquo;, &ldquo;paid 3000 rent
                  #housing&rdquo;, &ldquo;+250000 salary&rdquo;, &ldquo;got 40 from Ada yesterday&rdquo;. The same words
                  work in the iOS Shortcut.
                </li>
                <li>
                  <b>Overview:</b> this month&rsquo;s money in, out and what&rsquo;s left, where it went by category,
                  and the latest entries. Step back a month with the arrows.
                </li>
                <li>
                  <b>Accounts</b> are optional: add your bank, cash and cards with today&rsquo;s balance, and each one
                  tracks what went through it. Transfers move money between them.
                </li>
                <li>
                  <b>Budgets:</b> a monthly limit per category, or for everything. The bar shows how much is used
                  against how far through the month you are: under pace, on pace, ahead of pace, or over budget. A
                  budget applies every month unless you set it for one month only.
                </li>
                <li>
                  <b>Repeats:</b> rent, salary, subscriptions. Log one with &ldquo;Repeats: every month&rdquo; and each
                  time it comes round it appears under <b>Due</b> on the Overview for you to confirm or skip; nothing is
                  logged on its own. &ldquo;Coming up&rdquo; shows the next two weeks.
                </li>
                <li>
                  <b>Elsewhere:</b> the week&rsquo;s spending is on the Report page and in the weekly email; Insights
                  has where the money went and six months of in and out; and at Shutdown time Orbit can nudge you to log
                  the day (Settings → Notifications).
                </li>
                <li>
                  <b>Savings pots:</b> money set aside for one thing, with a target and a date. &ldquo;Put money
                  in&rdquo; moves it from an account into the pot; the card says when you&rsquo;ll get there at your
                  recent rate and what a month needs to make the date. <b>Make this a goal</b> (or pick a goal when you
                  create the pot) adds a key result &ldquo;Save ₦X for …&rdquo; that follows the balance, so the
                  goal&rsquo;s progress, health and roadmap move as you save.
                </li>
                <li>
                  <b>Import a statement:</b> on the Transactions tab, a CSV from your bank (date, amount or
                  debit/credit, description) becomes entries with a guessed category. Rows already imported are skipped,
                  so re-uploading is safe.
                </li>
                <li>
                  <b>Debts:</b> loans, cards, buy-now-pay-later, and money between you and people (pick the person, and
                  settling up is noted on their page). Each shows what&rsquo;s left, what&rsquo;s been paid, the
                  interest so far and the next due day; a reminder comes on the due day. <b>Record a payment</b> takes
                  it from an account. The <b>payoff plan</b> puts the minimums on everything and the rest on one debt at
                  a time, highest interest first or smallest first, and says when each clears and what paying a bit more
                  a month would save. <b>Make clearing it a goal</b> adds a key result that follows the payments.
                </li>
                <li>
                  <b>Invest:</b> what you hold: stocks, funds, crypto, a fixed deposit, property. Add each with what it
                  cost. Stocks, funds and crypto with a symbol (AAPL, VOO, bitcoin) are priced once a day in your
                  currency; the rest you value by hand with <b>Update value</b>. The tab shows what each is worth, the
                  gain or loss, how your holdings are spread by type, and your <b>net worth</b>: accounts, pots and
                  holdings, plus what&rsquo;s owed to you, minus what you owe, with a line for the last twelve months.
                  Orbit explains and shows; it never tells you what to buy or sell.
                </li>
              </ul>
            </Section>

            {/* 16 */}
            <Section id="career" title="Career: skills, learning, jobs">
              <h3>Skills</h3>
              <p>
                List the skills you&rsquo;re building with a level from 1 to 5 and a target level and date. Add evidence
                as you go, and link what you&rsquo;re learning from.
              </p>
              <h3>Learning, books and courses</h3>
              <ul>
                <li>Keep a queue of books, courses, articles and videos; start and finish with one tap.</li>
                <li>
                  Open one to <b>split it into sections</b>: add them yourself or paste a syllabus or table of contents
                  (&ldquo;Week 2: Joins (90 min)&rdquo; picks up the length).
                </li>
                <li>
                  <b>Plan it:</b> pick a finish date, your study days and time a day. Sections become tasks on those
                  days, and the page shows if you&rsquo;re on pace.
                </li>
              </ul>
              <h3>Job search</h3>
              <ul>
                <li>
                  <b>Pipeline:</b> track each role from researching to applied, interviewing, offer and closed, always
                  with a next step and date.
                </li>
                <li>
                  <b>Job assistant:</b> fill in your career profile once (paste your CV and Orbit drafts it). Each
                  morning it finds new roles from public job boards and companies you name, and ranks them by fit with
                  the reasons.
                </li>
                <li>
                  For a role you like, it prepares a <b>tailored CV and cover letter</b> using only facts from your
                  profile (anything it can&rsquo;t back up is flagged), plus answers to common questions.{" "}
                  <b>You review and send it yourself.</b>
                </li>
                <li>Pause it, change its hours, sources and how picky it is, and see what it did, in its settings.</li>
              </ul>
              <h3>Wins</h3>
              <p>
                Log wins as they happen, or from a finished task. It becomes your brag document for reviews and
                interviews, and you can export it.
              </p>
            </Section>

            {/* 17 */}
            <Section id="reflect" title="Journal and wins">
              <ul>
                <li>
                  The Shutdown asks for <b>mood and energy</b> (1–5) and one line; open the Journal to write more, with
                  prompts if you&rsquo;re stuck.
                </li>
                <li>Search past entries, or browse them on a month calendar coloured by mood.</li>
                <li>The coach only reads your journal when it&rsquo;s relevant to what you ask.</li>
              </ul>
            </Section>

            {/* 18 */}
            <Section id="progress" title="Insights, reports and levels">
              <ul>
                <li>
                  <b>Weekly report:</b> what you committed to and did, skips and their reasons, rituals kept, focus and
                  XP. It&rsquo;s also emailed on your week&rsquo;s last evening, if you want.
                </li>
                <li>
                  <b>Insights:</b> trends across cycles, focus hours, why you put things off and on which days, how long
                  things wait before they&rsquo;re done, time spent against what you value, and mood against output. It
                  gets useful after a few cycles.
                </li>
                <li>
                  <b>Levels and XP:</b> you earn XP for meaningful progress, not busywork: tasks (10 per point, more for
                  must-dos and stale tasks), focus, rituals, habits, milestones, goals, keeping in touch and wins. Each
                  area has its own level too, so you can see which parts of life are getting attention.
                </li>
              </ul>
            </Section>

            {/* 19 */}
            <Section id="notifications" title="Notifications and email">
              <ul>
                <li>
                  Turn on notifications in Settings → Notifications, on each device you use. Choose which kinds you get
                  (rituals, habits, focus, people, jobs, routines).
                </li>
                <li>
                  <b>Quiet hours</b> (22:00–07:00 by default) keep the night free.
                </li>
                <li>
                  Many notifications have buttons, like <b>Done</b> or <b>Snooze</b>, so you can act without opening the
                  app.
                </li>
                <li>The bell keeps a history of everything Orbit has sent you.</li>
                <li>
                  If notifications are off on all your devices, important reminders (reviews, dates, job steps) come by
                  email instead, at most twice a day.
                </li>
                <li>The app icon can show a badge: unread notifications, tasks due today, or nothing.</li>
              </ul>
            </Section>

            {/* 20 */}
            <Section id="phone" title="Your phone and offline">
              <ul>
                <li>
                  <b>iPhone:</b> open Orbit in Safari, tap Share, then <b>Add to Home Screen</b>. Open it from the home
                  screen and turn on notifications (iOS needs it installed for notifications).
                </li>
                <li>
                  <b>Android and computers:</b> use the browser&rsquo;s Install option (in Chrome&rsquo;s menu, or the
                  install icon in the address bar).
                </li>
                <li>
                  <b>Offline:</b> everything works without a connection, and syncs when you&rsquo;re back. The coach,
                  calendar sync and job search need a connection.
                </li>
                <li>
                  <b>Gestures:</b> swipe a task right to finish it, left to move it.
                </li>
              </ul>
            </Section>

            {/* 21 */}
            <Section id="keyboard" title="Keyboard shortcuts">
              <p>
                Press <Kbd>?</Kbd> in the app for this list, and <Kbd>⌘</Kbd>
                <Kbd>K</Kbd> to search or run anything.
              </p>
              <Table
                head={["Keys", "Does"]}
                rows={[
                  ["⌘ K", "Search and commands"],
                  ["C", "New task"],
                  ["⌘ J", "Open the coach"],
                  ["G then T / I / U / K / C", "Today / Inbox / Upcoming / Tasks / Cycle"],
                  ["G then G / A / Q / Y / V", "Goals / Areas / Quarter / Year / Vision"],
                  ["G then H / P / J / W", "Habits / People / Journal / Wins"],
                  ["G then N / R / L / B / S", "Insights / Weekly report / Levels / Job search / Settings"],
                  ["J / K", "Next / previous task"],
                  ["Enter", "Open the task"],
                  ["⌘ Enter", "Complete it"],
                  ["F", "Start focus on it"],
                  ["S", "Move it (asks why)"],
                  ["⌫", "Delete it"],
                  ["Esc", "Close"],
                ]}
              />
            </Section>

            {/* 22 */}
            <Section id="settings" title="Settings and your data">
              <ul>
                <li>
                  <b>Planning:</b> time zone, week start, cycle length, daily and cycle capacity, focus and break
                  length, working hours, areas.
                </li>
                <li>
                  <b>Accountability:</b> strictness, and the times for the Daily Plan, Shutdown and Cycle Review.
                </li>
                <li>
                  <b>Coach:</b> what it may do on its own, check-ins, what it remembers, and its activity with undo.
                </li>
                <li>
                  <b>Connected:</b> Google sign-in, calendars, and capture from anywhere (the iPhone Shortcut and its
                  tokens).
                </li>
                <li>
                  <b>Your data:</b> export everything you&rsquo;ve put in Orbit (or just your vision, goals, journal and
                  wins as readable text), or delete your account.
                </li>
              </ul>
            </Section>

            {/* 23 */}
            <Section id="faq" title="Questions">
              <Faq q="I fell off for a week. Now what?">
                Nothing is lost. Do a Shutdown for the backlog of decisions Orbit has pinned, then a short Daily Plan.
                If a cycle ended while you were away, do its review: it&rsquo;s the fastest way back.
              </Faq>
              <Faq q="My plan is always too big.">
                Lower your daily and cycle capacity in Settings, give tasks honest points, and commit to less. The
                capacity bar and your cycle history show what you really finish.
              </Faq>
              <Faq q="Does it work without the coach?">
                Yes. Everything except the chat, brain dump sorting and the job assistant works without AI.
              </Faq>
              <Faq q="Is my data private?">
                Your data is yours: it&rsquo;s stored for you only, sent to the AI only for what you ask, and you can
                download or delete it any time. See the <Link href="/privacy">privacy policy</Link>.
              </Faq>
            </Section>

            <div className="mt-16 rounded-[24px] bg-[linear-gradient(135deg,var(--band-from),var(--band-to))] px-6 py-10 text-center text-white">
              <p className="text-[24px] font-bold tracking-[-0.02em]">
                Ready? Start with one goal and tomorrow&rsquo;s plan.
              </p>
              <div className="mt-6 flex justify-center">
                <PrimaryCta tone="inverse" />
              </div>
            </div>
          </main>
        </div>
      </div>

      <footer className="border-t border-separator">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-[14px] text-label-secondary sm:flex-row sm:px-6">
          <Link href="/" className="flex items-center gap-2 hover:text-label">
            <OrbitMark size={18} /> Orbit
          </Link>
          <span className="flex items-center gap-4">
            <Link href="/privacy" className="hover:text-label">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-label">
              Terms
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  const n = SECTIONS.findIndex((s) => s.id === id) + 1;
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-20 border-t border-separator pt-10 pb-6 first:border-t-0 first:pt-0"
    >
      <p className="text-[13px] font-semibold text-accent-text tabular-nums">{String(n).padStart(2, "0")}</p>
      <h2 id={`${id}-title`} className="mt-1 text-[clamp(1.6rem,3vw,2rem)] leading-tight font-bold tracking-[-0.02em]">
        {title}
      </h2>
      <div className="guide-body mt-4">{children}</div>
    </section>
  );
}

function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="steps">
      {items.map((item, i) => (
        <li key={i}>
          <span aria-hidden className="steps-n">
            {i + 1}
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ol>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <aside className="tip" aria-label="Get the most out of it">
      <p className="tip-title">Get the most out of it</p>
      <p>{children}</p>
    </aside>
  );
}

function Rule({ children }: { children: React.ReactNode }) {
  return (
    <aside className="rule" aria-label="The rule">
      <p className="tip-title">The rule</p>
      <p>{children}</p>
    </aside>
  );
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[0]}>
              {r.map((c, i) =>
                i === 0 ? (
                  <th key={i} scope="row">
                    {c}
                  </th>
                ) : (
                  <td key={i}>{c}</td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Ladder({ rungs }: { rungs: [string, string][] }) {
  return (
    <ol className="ladder">
      {rungs.map(([name, body], i) => (
        <li key={name} style={{ marginLeft: `${Math.min(i, 5) * 14}px` }}>
          <b>{name}</b>
          <span>{body}</span>
        </li>
      ))}
    </ol>
  );
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="faq">
      <summary>{q}</summary>
      <p>{children}</p>
    </details>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}
