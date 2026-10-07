/**
 * Every frequently asked question, in one place, split by who's asking. /faq shows them; the sitemap, FAQ structured
 * data and llms-full.txt read them from here. Answers are plain strings so they work in all of those. Student answers
 * are written for a 12-year-old: short, no jargon.
 */
export type FaqAudience = "parents" | "students" | "tutors";

export interface FaqItem {
  q: string;
  a: string;
}

export const FAQ_GROUPS: { id: FaqAudience; label: string; title: string; items: FaqItem[] }[] = [
  {
    id: "parents",
    label: "Parents",
    title: "For parents & guardians",
    items: [
      {
        q: "Does it really cost nothing?",
        a: "Yes. Lessons are free, always. There’s no fee, no subscription, and no payment information anywhere on the site. Nobody in the program ever asks you for money, and tutors aren’t allowed to accept money or gifts.",
      },
      {
        q: "Who can sign up?",
        a: "Middle schoolers in grades 6–8 who live in North Carolina. They don’t need to be in a school band or orchestra, but they do need their own instrument. If your child is in 5th grade or younger, or you live outside North Carolina, join the waitlist and we’ll email you if that changes.",
      },
      {
        q: "Who are the tutors?",
        a: "High school students in grades 9–12 who play in their school band or orchestra. Each one fills out a skills questionnaire and signs a tutor agreement, their own parent or guardian approves them, and an automated check reviews their account before any family can see them, then again every day. Tutors are volunteers, not certified teachers, and skill levels are self-reported; every profile says so. Any safety report pauses a tutor immediately.",
      },
      {
        q: "Can I see a tutor before I sign up?",
        a: "You can see a sample profile and a sample Sunday summary on the home page, and how many tutors are taking students for each instrument. Real tutor profiles only appear after a parent signs the consent form. That’s deliberate: nobody can browse tutors, or be browsed, without a parent’s OK.",
      },
      {
        q: "What does a parent need to do?",
        a: "Create the account (we email you a code to confirm the address), add your child, answer a short questionnaire about their instrument and schedule, and sign the consent form. It takes about five minutes. During each lesson, be home or nearby and reachable; you don’t need to sit in. From your account you can read every message, see every lesson, and report a concern or withdraw consent at any time.",
      },
      {
        q: "How long are lessons, and how many can my child have?",
        a: "You choose 30, 45 or 60 minutes. Lessons can be booked for any quarter hour between 8 AM and 10 PM Eastern, at least two hours ahead. There’s no limit on how many lessons a student can have. A weekly booking covers up to 12 weeks at a time, and you can always book more.",
      },
      {
        q: "Can we try one lesson first?",
        a: "Yes. Every request can be a single lesson. Choosing “weekly” is optional, and you can cancel any upcoming lesson, or the rest of a weekly series, from your dashboard. No reason needed.",
      },
      {
        q: "What if the tutor doesn’t show up?",
        a: "Use “Report a concern” in your dashboard and choose “Missed lesson,” so the program team knows. If the tutor later logs that lesson as taught, the site asks your family to confirm it; answer “No” and it won’t count toward their hours, and the team reviews it. Then book again with the same tutor or a different one.",
      },
      {
        q: "Can we switch tutors?",
        a: "Yes, any time. Your best matches stay on your dashboard, so you can request a lesson with someone else and cancel any upcoming lessons with your current tutor. You don’t have to explain. If something about a tutor worried you, please report it so we can look into it.",
      },
      {
        q: "How are students and tutors matched?",
        a: "Instrument comes first. Then we compare your child’s level with the levels each tutor wants to teach, when you’re both free, what your child wants to work on, and how they like to learn. We deliberately don’t favor the most experienced tutor: a patient tutor who loves teaching beginners is usually the better fit for a beginner. We also spread students across tutors so nobody gets overloaded.",
      },
      {
        q: "What if there’s no tutor for my child’s instrument?",
        a: "You’ll see tutors who play a closely related instrument (a saxophone player for a clarinet student, for example), clearly labelled. You can also join the waitlist for your instrument, with or without an account, and we’ll email you once when a tutor who teaches it joins. Those lists show us which instruments to recruit for.",
      },
      {
        q: "Can we message the tutor?",
        a: "Yes, inside the site only. Phone numbers, emails, links, social media and inappropriate language are blocked automatically, and our own safety software (no outside AI services) checks messages for things like requests for secrecy, meeting in person or bullying. Something serious hides the message and pauses the tutor. Parents can read every message.",
      },
      {
        q: "Who runs this, and how do I reach a person?",
        a: "Teach for a Cause is a student-led volunteer program in North Carolina. The About page says who runs it. To reach the program team, use the Contact page; you don’t need an account. To report a concern, choose “Report a concern” there, or use the link on the Safety page. If someone is in immediate danger, call 911 first.",
      },
    ],
  },
  {
    id: "students",
    label: "Students",
    title: "For middle schoolers",
    items: [
      {
        q: "Is it really free?",
        a: "Yep. Free, every lesson. Nobody will ever ask you or your family for money.",
      },
      {
        q: "Who teaches me?",
        a: "A high schooler who plays your instrument in their school band or orchestra. They were in middle school band a few years ago, so they remember the hard parts.",
      },
      {
        q: "Can I sign up by myself?",
        a: "Not quite. A parent or guardian makes the account. On the sign-up page, tap “I’m a middle schooler” and we’ll email your parent, or give you a link to text them. Once they say yes, you pick a tutor together.",
      },
      {
        q: "What do I need for a lesson?",
        a: "Your instrument and its stuff (reeds, rosin, valve oil, sticks), the music you’re working on, a pencil, and a laptop or tablet with a camera. Set it up so your tutor can see your hands and how you’re sitting. A quiet room helps a lot.",
      },
      {
        q: "Do I need a Google account?",
        a: "No. Lessons are on Google Meet, but you can join without an account: open the link, type your first name, and tap “Ask to join.” Your tutor lets you in. On a phone or tablet you’ll need the free Google Meet app.",
      },
      {
        q: "What if I’m nervous or I’m a total beginner?",
        a: "That’s normal, and it’s fine. Lots of tutors pick “beginners” as the level they want to teach. It’s just you and your tutor, so nobody else hears your mistakes.",
      },
      {
        q: "Will anyone record me?",
        a: "No. Lessons are never recorded, and tutors aren’t allowed to take screenshots.",
      },
      {
        q: "What if something feels weird?",
        a: "Tell your parent, and tap “Report a concern” in your dashboard. You can also stop the lesson. You won’t get in trouble, and the program team looks at every report.",
      },
    ],
  },
  {
    id: "tutors",
    label: "Tutors",
    title: "For high school tutors",
    items: [
      {
        q: "Who can tutor?",
        a: "High school students in grades 9–12 who play a band or orchestra instrument, with a parent or guardian who approves. You need a Google Meet link (a personal Google account works) and an hour or two a week.",
      },
      {
        q: "What happens after I sign up?",
        a: "Four steps: your account is made, your parent approves from the email we send them, our automated account check reviews your profile (usually within minutes), and then families who match your instruments can see you. Your dashboard shows where you are and what’s next.",
      },
      {
        q: "Do the volunteer hours count for NHS, Tri-M or school?",
        a: "Every hour is logged by you, confirmed by the family and reviewed weekly by our nonprofit partner, and you can print your record or share a verification link. Whether those hours count toward a specific school or honor society requirement is up to that organization, so check with your advisor before you count on them.",
      },
      {
        q: "How many students do I have to take?",
        a: "As many as you want, from 1 to 8. You choose your instruments, the levels you want to teach and when you’re free, and you can pause taking new students any time.",
      },
      {
        q: "Do I need teaching experience?",
        a: "No. You need to play well enough to help someone a few years behind you, and to be patient. You pick the levels you’re comfortable teaching.",
      },
      {
        q: "What are the rules?",
        a: "Lessons only on your Google Meet link, never in person. Never record or screenshot a student. Keep every message on the site. Never accept money or gifts. Log lessons honestly. Report anything that feels off, right away.",
      },
    ],
  },
];

/** Every question, for structured data and llms-full.txt. */
export const ALL_FAQ: FaqItem[] = FAQ_GROUPS.flatMap((g) => g.items);
