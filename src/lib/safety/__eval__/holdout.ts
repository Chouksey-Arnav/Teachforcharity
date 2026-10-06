/**
 * HOLDOUT set for the safety analyzer. Written before the v2 engine and never
 * used to tune rules: its score is the honest estimate of how the analyzer does
 * on phrasings nobody wrote a rule for. Add new real-world misses to
 * corpus.ts (the dev set) and fix them there; only grow this file with cases
 * the current engine has never seen.
 *
 * `flag: true` means the message must reach at least a "medium" flag (a person
 * reviews it) or be blocked before sending. `flag: false` means no medium+ flag.
 */
import type { Side } from "../analyze";

export interface Case {
  side: Side;
  text: string;
  flag: boolean;
  /** For flag:false — must never trigger an automatic action either. */
  note?: string;
}

export const HOLDOUT: Case[] = [
  // ---- grooming / secrecy, phrased differently from the dev set ----
  { side: "tutor", flag: true, text: "probably best your dad doesn't hear about this" },
  { side: "tutor", flag: true, text: "lets not bring this up with your parents k?" },
  { side: "tutor", flag: true, text: "keep our talks to yourself, ok?" },
  { side: "tutor", flag: true, text: "wipe this chat when ur done reading" },
  { side: "tutor", flag: true, text: "nobody else has to find out about us" },
  { side: "tutor", flag: true, text: "your mom would just overreact, she doesn't get you like I do" },
  { side: "tutor", flag: true, text: "I'm the only one who really understands you" },
  { side: "tutor", flag: true, text: "are your parents asleep yet?" },
  { side: "tutor", flag: true, text: "is it just you at home tonight?" },
  { side: "tutor", flag: true, text: "you're honestly so mature, way older than your age" },
  { side: "tutor", flag: true, text: "you have the prettiest smile" },
  { side: "tutor", flag: true, text: "can you send a selfie? just want to see you" },
  { side: "tutor", flag: true, text: "what are you wearing rn" },
  { side: "tutor", flag: true, text: "how much do you weigh btw" },
  { side: "tutor", flag: true, text: "let's facetime tonight, just the two of us" },
  { side: "tutor", flag: true, text: "whats ur insta" },
  { side: "tutor", flag: true, text: "text me instead its easier, 9195550142" },
  { side: "tutor", flag: true, text: "I can come pick you up and drive you to my place" },
  { side: "tutor", flag: true, text: "we could get ice cream after, I'll come to your neighborhood" },
  { side: "tutor", flag: true, text: "I'll send you $50 on cash app if you keep this quiet" },
  { side: "tutor", flag: true, text: "you're my favorite, I think about you all the time" },
  { side: "tutor", flag: true, text: "do you like anyone at school? any boyfriends?" },
  // ---- student welfare / disclosure ----
  { side: "family", flag: true, text: "i cant do this anymore honestly" },
  { side: "family", flag: true, text: "sometimes i think everyone would be happier if i wasnt around" },
  { side: "family", flag: true, text: "i took a bunch of pills last night" },
  { side: "family", flag: true, text: "my tutor asked me to send him pictures and i dont want to" },
  { side: "family", flag: true, text: "he told me not to tell my mom about our chats" },
  { side: "family", flag: true, text: "i'm scared of him" },
  // ---- threats / harassment ----
  { side: "family", flag: true, text: "i'm gonna make them pay, all of them at school" },
  { side: "tutor", flag: true, text: "you're hopeless, I don't know why I bother" },
  { side: "family", flag: true, text: "ur so dumb lmao" },

  // ---- normal lesson talk that must stay clean ----
  { side: "tutor", flag: false, text: "Your dad mentioned you had a recital, how did it go?" },
  { side: "tutor", flag: false, text: "Let's not rush the ending, take your time" },
  { side: "tutor", flag: false, text: "Keep the bow on the string through the phrase" },
  { side: "tutor", flag: false, text: "Wipe your mouthpiece after practicing" },
  { side: "tutor", flag: false, text: "Delete the extra fingerings I wrote in pencil" },
  { side: "tutor", flag: false, text: "Nobody plays it perfectly the first time" },
  { side: "tutor", flag: false, text: "Is it just you in the trumpet section this year?" },
  { side: "tutor", flag: false, text: "Your parents are welcome to sit in on any lesson" },
  { side: "tutor", flag: false, text: "You played so maturely in that last phrase" },
  { side: "tutor", flag: false, text: "What a pretty melody this movement has" },
  { side: "tutor", flag: false, text: "Can you send a video of you playing the first page?" },
  { side: "tutor", flag: false, text: "Wear comfortable clothes for marching season" },
  { side: "tutor", flag: false, text: "How much do you practice each week?" },
  { side: "tutor", flag: false, text: "Join the lesson link a few minutes early" },
  { side: "tutor", flag: false, text: "Use the in-app messages if you get stuck" },
  { side: "tutor", flag: false, text: "Ask your band director about the audition dates" },
  { side: "tutor", flag: false, text: "The dynamics should fade out, like the music is disappearing" },
  { side: "tutor", flag: false, text: "End it with a clean cutoff on beat 4" },
  { side: "family", flag: false, text: "I can't do the high part yet, it's so hard" },
  { side: "family", flag: false, text: "my mom will be home at 5 so lessons after that work" },
  { side: "family", flag: false, text: "ugh my reed broke I want to cry lol" },
  { side: "family", flag: false, text: "I took a break from practicing last week, sorry" },
  { side: "family", flag: false, text: "I'm scared of the audition tbh" },
  { side: "family", flag: false, text: "the drummer in our band is so dumb lol he dropped his sticks" },
  { side: "tutor", flag: false, text: "I'll make you a practice chart so you can track it" },
  { side: "tutor", flag: false, text: "This piece is all about the drama, play it big" },
];
