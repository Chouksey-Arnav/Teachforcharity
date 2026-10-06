/**
 * STRESS set: written after the v2 engine was finished, without looking at the
 * rules, in a different style from the dev and holdout sets — longer,
 * multi-sentence, misspelled, obfuscated, and lots of busy normal lesson talk.
 * Its numbers are reported, not gated, so it stays an honest measurement:
 * fix misses in corpus.ts (with a new phrasing), never by tuning to this file.
 */
import type { Case } from "./holdout";

export const STRESS: Case[] = [
  // ---- harmful, harder ----
  { side: "tutor", flag: true, text: "great job today!! btw u dont have to tell ur parents everything we talk about, some stuff is just ours" },
  { side: "tutor", flag: true, text: "Honestly your mom seems kind of strict. She probably wouldnt get why we talk so much" },
  { side: "tutor", flag: true, text: "lol ok but fr delete our convo after, my gf gets jealous" },
  { side: "tutor", flag: true, text: "Would you be comfortable sending me a pic? Not of your playing haha, of you" },
  { side: "tutor", flag: true, text: "r u by urself rn?" },
  { side: "tutor", flag: true, text: "you're like really pretty for a 7th grader" },
  { side: "tutor", flag: true, text: "I could teach you at my apartment instead, my roommate is never home" },
  { side: "tutor", flag: true, text: "Download this app, it's way better for chatting than this site: tele gram" },
  { side: "tutor", flag: true, text: "my handle is @brass.boi on the gram, follow me" },
  { side: "tutor", flag: true, text: "u can call me at nine one nine, five five five, oh one four two" },
  { side: "tutor", flag: true, text: "If you want I can buy you a new mouthpiece, just don't mention it at home" },
  { side: "tutor", flag: true, text: "When does your mom usually go to bed?" },
  { side: "tutor", flag: true, text: "send me what you're wearing to bed lol" },
  { side: "tutor", flag: true, text: "I feel like we have a real connection, you get me better than people my age" },
  { side: "family", flag: true, text: "i honestly dont see the point of anything anymore. i might not be around much longer" },
  { side: "family", flag: true, text: "i have a plan to hurt myself this weekend" },
  { side: "family", flag: true, text: "my tutor keeps asking for pics of me and said not to tell my parents" },
  { side: "family", flag: true, text: "he makes me really uncomfortable when he talks about my body" },
  { side: "family", flag: true, text: "theyre all gonna regret it tomorrow, i'm bringing something to school" },
  { side: "tutor", flag: true, text: "nobody in your section even likes you, just stop showing up" },

  // ---- normal, busy lesson chatter that must stay clean ----
  { side: "tutor", flag: false, text: "Hey! Great lesson today. For this week: long tones 10 min, the C major scale two octaves, and measures 1-24 of the Rubank etude. Record yourself once on Friday and send it in the lesson card so I can hear how it's going." },
  { side: "tutor", flag: false, text: "Don't worry about the high notes yet. Nobody gets them right away, it takes a few months of building air support." },
  { side: "tutor", flag: false, text: "Tell your parents thanks for the snacks during the lesson lol, and remind them the consent form is in their email." },
  { side: "tutor", flag: false, text: "Can you show me how you're holding the bow? Turn the camera a bit to the right so I can see your wrist." },
  { side: "tutor", flag: false, text: "You're so close on this passage. Slow it down to 80 bpm and it'll click, I promise." },
  { side: "tutor", flag: false, text: "Between the two pieces, I'd pick the Mozart for your audition. It shows off your tone more." },
  { side: "tutor", flag: false, text: "Keep this rhythm in your head: long-short-short. Say it out loud before you play it." },
  { side: "tutor", flag: false, text: "I won't be able to make Thursday, can we move to Friday at 5? Let your mom know if that works." },
  { side: "tutor", flag: false, text: "Your mom asked if you could do two lessons a week before all-county. I'm happy to, just book the second one on the site." },
  { side: "tutor", flag: false, text: "Wear something comfy for the lesson, we're going to do some breathing exercises standing up." },
  { side: "tutor", flag: false, text: "Did you get a chance to look at the music I sent? Don't stress if you didn't, we'll go through it together." },
  { side: "tutor", flag: false, text: "Please don't practice right before bed, your neighbors will hate us both haha" },
  { side: "tutor", flag: false, text: "The secret is relaxing your shoulders. Seriously, tension kills your tone." },
  { side: "tutor", flag: false, text: "What are you wearing for the winter concert? Black and white? Just make sure you can move your arms." },
  { side: "tutor", flag: false, text: "I miss playing in a middle school band honestly, you guys get the fun pieces" },
  { side: "tutor", flag: false, text: "Good luck tomorrow! You've got this. Text your band director if the bus is late, not me, I can't help with that one lol" },
  { side: "tutor", flag: false, text: "Is anyone else in your section working on this excerpt? It'd be fun to have you play it as a duet." },
  { side: "tutor", flag: false, text: "Ok last thing: practice in a room with the door closed so you can hear yourself without the TV." },
  { side: "tutor", flag: false, text: "I'll send you a recording of me playing it so you can hear the phrasing." },
  { side: "tutor", flag: false, text: "Can you send me a photo of the page with the fingering chart? The scan in the lesson card is blurry." },
  { side: "family", flag: false, text: "omg I finally got the high F!!! I literally screamed and my dog ran away lol" },
  { side: "family", flag: false, text: "sorry I was late, my dad had to pick up my sister from soccer first" },
  { side: "family", flag: false, text: "Im so nervous for chair placements, I feel like I'm gonna throw up" },
  { side: "family", flag: false, text: "this etude is the worst, I want to throw my clarinet out the window 😭" },
  { side: "family", flag: false, text: "my mom said I can't practice past 9 because my brother has to sleep" },
  { side: "family", flag: false, text: "can we do the lesson at 6 instead? I have a doctor appointment" },
  { side: "family", flag: false, text: "I hate my reed, it squeaks every time. Can you show me how to fix it?" },
  { side: "family", flag: false, text: "nobody in my section practices so I'm basically carrying lol" },
  { side: "family", flag: false, text: "I'm so done with marching band, my feet are killing me" },
  { side: "family", flag: false, text: "I'll ask my mom if she can drive me to the recital" },
  { side: "tutor", flag: false, text: "You looked really confident at the concert! Your stage presence is great." },
  { side: "tutor", flag: false, text: "Honestly you're the most improved student I've had, keep it up" },
  { side: "tutor", flag: false, text: "Keep it quiet in the soft section, pianissimo means really soft." },
  { side: "tutor", flag: false, text: "My mom is a music teacher too, so I grew up around this stuff" },
  { side: "tutor", flag: false, text: "If your parents have questions about the program, they can email the program team from the site." },
];
