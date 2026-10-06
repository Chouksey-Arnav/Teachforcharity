/**
 * Safety lexicon. Each rule matches against normalized text (see normalize.ts)
 * and carries a weight from 0–10. A category's message score is its strongest
 * rule plus a little for every additional distinct rule, capped at 10.
 *
 * Written for a music-lesson platform: words that are normal in lessons are
 * only matched in their person-directed form, e.g.
 *   "kill" only as "kill you/him/her/…", never "you killed that solo"
 *   "beat" only as "beat you up", never "keep the beat"
 *   "high" only as "get/got high", never "high notes"
 *   "shoot" only as "shoot you / shoot up", never "shoot for 15 minutes"
 *   "slur" never (it's a technique); slurs are listed explicitly
 *   "hot"/"sexy" only aimed at a person
 */

import type { Side } from "./analyze";

export type Category =
  | "self_harm"
  | "sexual"
  | "grooming_secrecy"
  | "personal_probe"
  | "affection"
  | "meeting"
  | "contact_migration"
  | "gifts_money"
  | "scam_link"
  | "harassment"
  | "threat"
  | "hate"
  | "drugs_alcohol"
  | "profanity"
  | "isolation"
  | "disclosure";

export interface Rule {
  id: string;
  category: Category;
  weight: number;
  /** Tested against one clause's `canon` form (letters/digits/apostrophes, shorthand expanded). */
  pattern?: RegExp;
  /** Tested against the whole message's `base` form (keeps punctuation: links, emails, handles). */
  basePattern?: RegExp;
  /** A negation word just before the match ("never", "don't"…) reduces the weight. */
  negatable?: boolean;
  /**
   * High-precision evidence. Only precise evidence can trigger an automatic
   * action (hiding a message, pausing a tutor). Everything else goes to a
   * person for review: a fuzzy signal must never punish someone on its own.
   */
  precise?: boolean;
  /** Context in the same clause that means this isn't what it looks like ("meet me in the lesson link"). */
  unless?: RegExp;
  /** Self-harm phrasing that is often hyperbole ("I'm gonna die if I don't make first chair lol"). */
  dampen?: boolean;
  /** Plain English for admins: what this rule looks for. */
  why: string;
  /** Only for messages from this side (a tutor isolating a student; a student disclosing). */
  from?: Side;
}

const YOU = "(?:you|u|ya|yu)";
const YOUR = "(?:your|ur|yur|youre|you're|u r)";
/** "you're" as kids type it — including "your" and "ur", which they use for both. */
const YOU_ARE = "(?:you'?re|you are|you r|your|youre|ur)";
const PERSON = `(?:${YOU}|him|her|them)`;
const PARENT = "(?:mom|mum|mother|dad|father|parents?|folks|family|guardians?|mama|papa)";
/** Things a lesson is about. A request that names one of these is teaching, not a red flag. */
export const MUSIC_ACTIVITY = "(?:play(?:ing|ed)?|practic(?:e|ing)|perform(?:ing|ance)?|the (?:piece|song|scale|etude|solo|excerpt|passage|part|first page|exercise|warm ?up)|your (?:instrument|hand position|posture|embouchure|bow|fingers|music|setup|reed)|scales?|etudes?|measures?|bars?|the beat|long tones|recording|recital|concert|audition)";
const ONLINE = /\b(?:lesson|link|google meet|the meet|meet link|call|class|online|on here|the site|zoom|video lesson|waiting room|in the app|lesson card|on the site)\b/;
const w = (s: string) => new RegExp(`\\b(?:${s})\\b`);

export const RULES: Rule[] = [
  // ---- Self-harm (welfare) -------------------------------------------------
  { id: "sh_kill_myself", category: "self_harm", weight: 10, precise: true, why: "says they want to kill themselves", pattern: w("kill(?:ing)? my ?self|kms|end(?:ing)? my (?:life|self)|take my (?:own )?life") },
  { id: "sh_want_die", category: "self_harm", weight: 10, dampen: true, why: "says they want to die", pattern: w("(?:want|ready|going) (?:to )?die|wish i (?:was|were) dead|better off (?:dead|without me)|don'?t want to (?:be alive|live|exist|wake up)") },
  { id: "sh_suicide", category: "self_harm", weight: 9, precise: true, why: "mentions suicide or self-harm", pattern: w("suicid(?:e|al)|unalive my ?self|self ?harm(?:ing)?") },
  { id: "sh_cut", category: "self_harm", weight: 9, precise: true, why: "describes hurting themselves", pattern: w("(?:cut|cutting|burn|burning|starve|starving) my ?self|(?:cut|cutting) my (?:arms?|wrists?|legs?|thighs?)") },
  // "I hurt myself at soccer" is common, so this alone is only a review item.
  { id: "sh_hurt", category: "self_harm", weight: 5, why: "talks about hurting themselves", pattern: w("(?:want to|going to|i) hurt(?:ing)? my ?self") },
  { id: "sh_no_point", category: "self_harm", weight: 6, dampen: true, why: "says life has no point", pattern: w("no (?:reason|point) (?:to|in) (?:live|living|being alive|keep going)|hate my life|i hate my ?self|i'?m a burden|(?:don'?t|do not|can'?t) see (?:the|a) point (?:of|in) (?:anything|living|life|any of (?:this|it))") },
  { id: "sh_plan", category: "self_harm", weight: 9, precise: true, why: "describes a plan to hurt themselves", pattern: w("(?:have|got|made|making) a plan to (?:hurt|kill|end)|plan(?:ning)? (?:to|on) (?:hurting|killing|ending) my ?self|plan(?:ning)? to (?:hurt|kill) my ?self") },
  { id: "sh_not_around", category: "self_harm", weight: 8, why: "hints they won't be around much longer", pattern: w("(?:might|may|won'?t|will not) (?:not )?be (?:around|here) (?:much |for )?(?:longer|long|anymore|any more|tomorrow)|this is (?:my )?goodbye|(?:saying|say) goodbye to (?:everyone|you all)") },
  { id: "sh_not_here", category: "self_harm", weight: 9, why: "says they don't want to be here", pattern: w("(?:don'?t|do not) want to (?:be here|be around) (?:anymore|any more)|(?:don'?t|do not) want to be here") },
  { id: "sh_disappear", category: "self_harm", weight: 7, dampen: true, why: "says they want to disappear", pattern: w("(?:want to|wish i could|going to|i'?m going to|i'?ll) (?:just )?disappear|disappear forever") },
  { id: "sh_end_it", category: "self_harm", weight: 9, why: "says they will end it", pattern: /\b(?:i'?m|i am|i'?ll|i will|i want to|going to|i might|i should|i could) (?:just |finally )?end (?:it|it all|everything|things)(?! (?:on|with|after|at|there|here|by|early|soon|when))/ },
  { id: "sh_gone", category: "self_harm", weight: 9, why: "says nobody would miss them", pattern: w("(?:nobody|no one|no ?1) would (?:even )?(?:notice|care|miss me)|everyone would be (?:better|happier)(?: off)?(?: without me| if i (?:wasn'?t|weren'?t|was not|were not) (?:here|around|alive))?|if i (?:was|were) (?:gone|dead|not around)|be (?:better|happier) if i (?:wasn'?t|weren'?t) (?:here|around)") },
  { id: "sh_cant_go_on", category: "self_harm", weight: 7, dampen: true, why: "says they can't go on", pattern: w("can'?t (?:do this|go on|take (?:it|this)|keep going)(?: any ?more)?(?= |$)(?=.*\\b(?:any ?more|honestly|tbh|to be honest|life|everything)\\b)|can'?t go on|tired of (?:living|being alive|life|everything)|give up on (?:life|everything)") },
  { id: "sh_pills", category: "self_harm", weight: 9, precise: true, why: "describes an overdose", pattern: w("(?:took|take|taking|swallowed) (?:a (?:bunch|lot|ton) of|all (?:my|the)|too many|some of (?:my|the)) (?:pills|meds|medication|tablets)|overdos(?:e|ed|ing)|od'?d") },

  // ---- Sexual content -------------------------------------------------------
  { id: "sx_explicit", category: "sexual", weight: 9, precise: true, why: "explicit sexual words", pattern: w("porn\\w*|nudes?|noodz|nudez|naked(?! eye)|sex(?:ting|ual|ually|y)?|horny|boobs?|tits|dick|penis|vagina|pussy|blowjob|handjob|masturbat\\w*|orgasm|condom|onlyfans|nsfw|xxx"), unless: /\bsex(?:ual)? (?:ed|education|harassment training)\b/ },
  { id: "sx_pics", category: "sexual", weight: 9, precise: true, why: "asks for photos of the person's body or clothing", pattern: w(`(?:send|show|take|snap|get) (?:me |us )?(?:a |some |another |more )?(?:pictures?|photos?|selfies?|videos?) (?:of ${YOU} |of ${YOUR}self )?(?:in (?:bed|the shower|the bath|your underwear|your pajamas|your bra|a bikini|a swimsuit|your room)|(?:of )?what ${YOU}(?:'re| are)? wearing|of ${YOUR} (?:body|legs|chest|outfit|feet))|(?:picture|photo) of ${YOUR} body|send (?:me )?what ${YOU}(?:'re| are)? wearing`) },
  { id: "sx_selfie", category: "sexual", weight: 6, why: "asks for a photo of the person (not their playing)", pattern: w(`(?:send|sending|sent|show|showing|take|taking) (?:me |us )?(?:a |some |another |more )?(?:pictures?|photos?|selfies?)(?: of ${YOU}| of ${YOUR}self)?|not of ${YOUR} (?:playing|instrument|music|hands?|fingers|setup)(?: haha| lol| lmao)? of ${YOU}$|(?:want|wanna|like) to see ${YOU}(?= |$)(?! (?:play|perform|at|in (?:the|class|lesson|band)|on (?:stage|the)))`), unless: new RegExp(`\\b${MUSIC_ACTIVITY}\\b|sheet music|the music|your (?:part|music|notes|stand|score)|assignment|practice (?:chart|log)|the page|homework`) },
  { id: "sx_full_body", category: "sexual", weight: 7, why: "asks for a full-body photo", pattern: w("full body (?:pictures?|photos?|shots?|videos?|selfies?)") },
  { id: "sx_wearing", category: "sexual", weight: 8, why: "asks what the person is wearing", pattern: w(`what (?:are|r) ${YOU} wearing|take (?:your|ur) (?:clothes|shirt|pants) off|in ${YOUR} (?:bed|underwear|pajamas|pjs)|are ${YOU} (?:wearing|in) (?:pajamas|pjs|your underwear)`), unless: /\b(?:concert|recital|performance|perform|marching|audition|uniform|gig|competition|for the|tomorrow|school picture)\b/ },
  { id: "sx_hot", category: "sexual", weight: 7, why: "calls the person hot or sexy", pattern: w(`${YOU} (?:are|r|look|looked|looking)? ?(?:so |really |very )?(?:hot|sexy)|${YOU}'?re (?:so |really |very )?(?:hot|sexy)`) },
  { id: "sx_kiss", category: "sexual", weight: 7, precise: true, why: "romantic advances", pattern: w(`kiss ${YOU}|date me|be my (?:girlfriend|boyfriend|gf|bf)|go out with me`) },

  // ---- Grooming: secrecy ----------------------------------------------------
  { id: "gs_dont_tell", category: "grooming_secrecy", weight: 9, precise: true, why: "asks the student to hide something from their parents", pattern: w(`don'?t (?:tell|show|let) ${YOUR} ${PARENT}|(?:don'?t|do not|never) tell (?:anyone|anybody|no ?one|ur ${PARENT}|your ${PARENT})|without ${YOUR} ${PARENT} knowing`) },
  { id: "gs_secret", category: "grooming_secrecy", weight: 8, precise: true, why: "asks to keep something secret", pattern: w("our (?:little )?secret|keep (?:this|it|that|our (?:talks?|chats?|conversations?|messages)|things) (?:a )?(?:secret|private|to yourself|on the (?:down low|dl)|between us|between the two of us|between you and me)|keep (?:our (?:talks?|chats?|conversations?|messages)|this (?:chat|conversation)|what we (?:talk about|say)) quiet|(?:this|it|that) (?:stays|is staying|will stay) between (?:us|you and me|the two of us)|just between us|between (?:just )?the two of us|no ?one (?:needs|has) to know") },
  // "Between you and me, scales are boring" is an idiom: recorded (low), never reviewed on its own.
  { id: "gs_between", category: "grooming_secrecy", weight: 2.5, why: "says 'between you and me'", pattern: w("between (?:you and me|u and me|us two)") },
  { id: "gs_delete", category: "grooming_secrecy", weight: 8, precise: true, why: "asks to delete the conversation", pattern: w("(?:delete|erase|wipe|clear|remove|get rid of) (?:all )?(?:this|these|the|our|that|those|my|your)? ?(?:message|messages|msg|msgs|chat|chats|convo|conversation|conversations|texts?|history|thread|dms?)|clear (?:the|our) chat") },
  { id: "gs_parent_away", category: "grooming_secrecy", weight: 6, why: "asks whether parents are around", pattern: w(`(?:are|is) ${YOUR} ${PARENT} (?:home|around|there|watching|nearby|asleep|out|away|gone|at work|awake)(?: yet| right now| tonight)?|when ${YOUR} ${PARENT} (?:is|are) (?:gone|away|asleep|not home)|when (?:does|do) ${YOUR} ${PARENT} (?:usually |normally )?(?:go to (?:bed|sleep|work)|leave|get home|fall asleep)|what time (?:does|do) ${YOUR} ${PARENT} (?:go to (?:bed|sleep)|leave|get home)`), unless: /\b(?:lesson|join|sign|consent|form|meet the|say hi)\b/ },
  { id: "gs_isolate", category: "isolation", weight: 6, from: "tutor", why: "sets the tutor up as the only one who understands the student", pattern: w(`(?:i'?m|i am) the only (?:one|person) (?:who|that) (?:really |truly )?(?:understands|gets|cares about|listens to) ${YOU}|only i (?:understand|get) ${YOU}|not like ${YOUR} (?:${PARENT}|other teachers?|friends)|(?:doesn'?t|don'?t|do not|does not|won'?t|wouldn'?t|never|can'?t) (?:really )?(?:get|understand) ${YOU} like i do|${YOU} can tell me anything|i'?m not like (?:them|other adults|${YOUR} ${PARENT})`) },

  // ---- Grooming: personal probing & affection ------------------------------
  { id: "pp_alone", category: "personal_probe", weight: 7, why: "asks whether the student is alone", pattern: w(`(?:are|r) ${YOU} (?:home )?alone|home alone|by ${YOUR}self right now|(?:is|are) (?:there )?(?:anyone|anybody) (?:else )?(?:home|there|around|with ${YOU}|in the house|awake)|is it just ${YOU} (?:at home|home|tonight|in the house|there)|just ${YOU} (?:at home|home) (?:tonight|right now)`) },
  { id: "pp_door", category: "personal_probe", weight: 6, why: "asks about the student's bedroom door", pattern: w(`(?:is |are )?${YOUR} (?:bedroom |room )?door (?:locked|closed|shut)|lock ${YOUR} door`) },
  { id: "pp_where_live", category: "personal_probe", weight: 6, why: "asks where the student lives", pattern: w(`where (?:do|d) ${YOU} live|what'?s ${YOUR} (?:address|street|neighborhood)|what street|which house`) },
  { id: "pp_age", category: "personal_probe", weight: 4, why: "asks the student's age", pattern: w(`how old (?:are|r) ${YOU}|what'?s ${YOUR} age`) },
  { id: "pp_school", category: "personal_probe", weight: 4, why: "asks which school the student goes to", pattern: w(`what school (?:do|d) ${YOU} (?:go|attend)|where (?:do|d) ${YOU} go to school`) },
  { id: "pp_dating", category: "personal_probe", weight: 6, why: "asks about the student's love life", pattern: w(`(?:do|d) ${YOU} have a (?:boyfriend|girlfriend|bf|gf|crush)|are ${YOU} (?:single|dating)|(?:do|d) ${YOU} like (?:anyone|anybody|someone)|any (?:boyfriends?|girlfriends?|crushes)|who do ${YOU} like`) },
  { id: "pp_body", category: "personal_probe", weight: 6, why: "asks about the student's body", pattern: w(`(?:how much|what) do ${YOU} weigh|${YOUR} (?:weight|measurements|bra size|body type)|how tall are ${YOU} (?:now|exactly)|what size (?:bra|underwear)`) },
  { id: "pp_late", category: "personal_probe", weight: 4, why: "checks whether the student is awake late", pattern: /\b(?:are )?you (?:still )?(?:up|awake)$|\bcan'?t sleep either\b/ },
  { id: "pp_camera", category: "personal_probe", weight: 6, why: "asks to see the student's room or body on camera", pattern: w(`show me ${YOUR} (?:room|bedroom|bed|body|outfit)|let me see ${YOUR} (?:room|bedroom|bed|body|outfit)|turn (?:on )?${YOUR} camera on (?:and|so i can) (?:show|see) (?:me )?${YOUR}(?:self| room| bedroom| bed)`) },
  { id: "pp_private_video", category: "personal_probe", weight: 7, why: "suggests a private video call", pattern: w(`(?:facetime|video ?chat|video call|call|skype)\\b.{0,40}\\b(?:just us|just the two of us|alone|privately|in private|without ${YOUR} ${PARENT})`) },
  { id: "af_mature", category: "affection", weight: 6, why: "tells the student they're mature for their age", pattern: w(`(?:so )?mature for ${YOUR} age|${YOU_ARE} (?:honestly |really |so |very |super )*(?:mature|grown up)(?! (?:sound|tone|playing|player))|(?:older|more grown up|more mature) than (?:${YOUR} age|other (?:kids|people|students)(?: ${YOUR} age)?)|(?:special|real|deep|strong) (?:friend|connection|bond|relationship)|${YOU} (?:really )?(?:understand|get) me(?= |$)(?! (?:the|a|my|some|to))|better than (?:people|anyone|girls|guys) my (?:age|own age)`) },
  { id: "af_love", category: "affection", weight: 6, why: "romantic or longing language", pattern: w(`i (?:love|luv|like like) ${YOU}|i miss ${YOU}(?= |$)(?! (?:guys|all|in (?:band|class)))|(?:think|thinking|thought) (?:about|of) ${YOU} (?:a lot|all the time|every day|constantly|so much)|can'?t stop thinking (?:about|of) ${YOU}|(?:keep |been )?thinking about ${YOU}(?= |$)`) },
  { id: "af_looks", category: "affection", weight: 6, why: "comments on how the student looks", pattern: w(`${YOU}(?:'?re| are| look| looked| looking| r)? (?:so |really |very |super |honestly |the |like |kinda |kind of |lowkey |actually |literally )*(?:pretty|cute|beautiful|gorgeous|attractive|handsome|adorable)|(?:pretty|cute|beautiful|hot|mature) for (?:a \\d+(?:st|nd|rd|th)? grader|your age|a (?:middle schooler|kid|seventh grader|sixth grader|eighth grader))|${YOU} have the (?:prettiest|cutest|nicest|most beautiful) (?:smile|eyes|face|hair|laugh)|${YOUR} (?:smile|eyes|lips|legs|body|hair|face) (?:is|are|looks?) (?:so |really )?(?:pretty|cute|beautiful|perfect|gorgeous)`) },
  { id: "af_special", category: "affection", weight: 5, why: "tells the student they're special or the favorite", pattern: w(`${YOU_ARE} (?:so |really )?special(?: to me)?|special to me|${YOU_ARE} my favou?rite(?! (?:piece|song|part|etude|composer|movement|band|group))|my favou?rite (?:student|person|one)`) },

  // ---- Meeting in person ----------------------------------------------------
  { id: "mt_meet", category: "meeting", weight: 7, negatable: true, why: "suggests meeting in person", pattern: w(`meet (?:up|me|${YOU} (?:at|somewhere|after|outside))`), unless: ONLINE },
  { id: "mt_visit", category: "meeting", weight: 7, negatable: true, why: "suggests coming over or a ride", pattern: w(`come over|pick ${YOU} up|sleep ?over|give ${YOU} a ride|drive ${YOU}|(?:come|stop) by my|come to my (?:place|house|apartment|room|car)|(?:i'?ll|i will|i can|i could|let me) (?:come|drive|walk) (?:over )?(?:to )?${YOUR} (?:town|neighborhood|house|school|area|place)|visit ${YOU}`) },
  // Weaker on their own ("practice at your house"); they add up in the conversation-level check.
  { id: "mt_irl", category: "meeting", weight: 4, negatable: true, why: "mentions meeting in real life", pattern: w(`in real life|irl|in person|face to face|hang out|my (?:house|place|apartment)|get (?:ice cream|food|coffee|lunch|dinner|boba|pizza) (?:after|together|sometime|with me)`), unless: /\blesson(?:s)? (?:are|is) online\b/ },

  // ---- Moving contact off the platform ---------------------------------------
  { id: "cm_text_me", category: "contact_migration", weight: 6, negatable: true, precise: true, why: "asks to move contact off the site", pattern: w("text me|call me (?:at|on|tonight|later|when|after)|dm me|message me on|add me(?: on)?|hit me up|my (?:cell|phone number|number is)|(?:your|ur) (?:cell|phone number|number)|what'?s (?:your|ur) (?:number|snap|snapchat|instagram|insta|discord|user ?name|handle|@)"), unless: /\bhit me up (?:here|on here|in the (?:messages|app|chat))\b/ },
  { id: "cm_platform", category: "contact_migration", weight: 5, negatable: true, precise: true, why: "names an outside messaging app", pattern: w("snap ?chat|snapchat|instagram|discord|whats ?app|telegram|kik|tik ?tok|facetime|imessage|signal app|wechat|fb messenger|google chat|gchat|hangouts|google voice|groupme|(?:my|your|ur) (?:snap|sc)|snap me|on (?:snap|sc)"), unless: /\bbartok snap|snap pizz/ },
  { id: "cm_spelled_number", category: "contact_migration", weight: 7, precise: true, why: "a phone number spelled out in words", pattern: /\b(?:(?:zero|oh|one|two|three|four|five|six|seven|eight|nine)\b[ ]?){7,}/ },
  { id: "cm_handle", category: "contact_migration", weight: 6, precise: true, why: "a social media handle", basePattern: /(^|\s)@[a-z0-9_.]{3,}/ },
  { id: "cm_email", category: "contact_migration", weight: 7, precise: true, why: "an email address", basePattern: /[a-z0-9._%+-]+\s*(?:@|\(at\)|\[at\]| at )\s*[a-z0-9-]+\s*(?:\.|\(dot\)|\[dot\]| dot )\s*(?:com|net|org|edu|us|io)\b/ },
  { id: "cm_phone", category: "contact_migration", weight: 7, precise: true, why: "a phone number", basePattern: /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/ },

  // ---- Gifts & money ---------------------------------------------------------
  { id: "gm_gift", category: "gifts_money", weight: 6, negatable: true, why: "offers gifts or money", pattern: w(`gift ?cards?|buy ${YOU}|get ${YOU} (?:a|something)|i'?ll pay ${YOU}|(?:i'?ll|i will|i can) send ${YOU} (?:\\d+|some|money|cash|a (?:gift|present)|robux|v ?bucks|bucks|dollars)|send (?:me )?money|pay (?:me|${YOU})`), unless: /\bget you (?:a (?:practice|lesson|schedule|copy|chart|list|recording|metronome|tuner)|something to practice)\b/ },
  { id: "gm_apps", category: "gifts_money", weight: 5, negatable: true, why: "names a payment app", pattern: w("venmo|cash ?app|zelle|paypal|apple pay|robux|v ?bucks|crypto|bitcoin") },

  // ---- Scam / malicious links ------------------------------------------------
  { id: "sc_click", category: "scam_link", weight: 7, precise: true, why: "pushes a download or freebie", pattern: w("click (?:this|the|my|on this) link|download (?:this|my|the) (?:app|file|program)|install (?:this|my)|free (?:robux|vbucks|v bucks|gift ?cards?|iphone|nitro)") },
  { id: "sc_creds", category: "scam_link", weight: 8, precise: true, why: "asks for a password or login code", pattern: w(`${YOUR} password|verify ${YOUR} (?:account|identity)|log ?in (?:here|with ${YOUR})|send (?:me )?(?:the |your |ur )?code`) },
  { id: "sc_url", category: "scam_link", weight: 7, precise: true, why: "a link", basePattern: /(https?:\/\/|www\.|bit\.ly|tinyurl|t\.co\/|discord\.gg|\.exe\b|\.apk\b|\.zip\b|grabify|iplogger)/ },

  // ---- Harassment & bullying -------------------------------------------------
  { id: "hr_insult", category: "harassment", weight: 6, why: "insults the person", pattern: w(`(?:${YOU_ARE}|${YOU}) (?:so |such an? |an? |honestly |really |just )*(?:stupid|dumb|idiot|moron|loser|ugly|fat|worthless|useless|trash|garbage|pathetic|joke|hopeless|disappointment|failure|waste of (?:time|space))`), unless: /\b(?:this|that|the|it|he|she|they|drummer|piece|song|part|reed|valve|teacher|section) (?:is|was|are|were) (?:so |such an? |really )*(?:stupid|dumb|trash|garbage|useless|hopeless)\b/ },
  { id: "hr_hate_you", category: "harassment", weight: 6, why: "tells the person nobody likes them", pattern: w(`i hate ${YOU}|(?:nobody|no one)(?: [a-z']+){0,3} (?:even )?(?:likes|cares about|wants) ${YOU}|just stop (?:showing up|coming)|shut (?:ur|your) mouth|why (?:do )?i (?:even )?bother(?: with ${YOU})?|${YOU} should (?:just )?quit|just quit already|${YOU}'?ll never (?:be|make it|get)`) },
  { id: "hr_die", category: "harassment", weight: 9, precise: true, why: "tells the person to kill themselves", pattern: w(`kys|kill ${YOU}r?self|go die|${YOU} should die|drink bleach`) },

  // ---- Threats ---------------------------------------------------------------
  { id: "th_kill", category: "threat", weight: 10, precise: true, why: "threatens violence", pattern: w(`(?:i'?ll|i will|i'?m (?:going to)|going to) (?:kill|hurt|stab|shoot|jump|strangle|choke) ${PERSON}|beat ${PERSON} up|${YOU}'?re dead meat|watch ${YOUR} back`) },
  { id: "th_weapon", category: "threat", weight: 10, precise: true, why: "mentions bringing a weapon or attacking a school", pattern: w("shoot up (?:the|a|my|our) school|bomb (?:the|a|my) school|bring (?:a|my|his|her|their|my (?:dad|mom|brother|father|uncle)'?s?) (?:gun|knife|weapon|rifle|pistol)") },
  { id: "th_revenge", category: "threat", weight: 8, why: "talks about getting revenge on people", pattern: w("make (?:them|him|her|everyone|all of them) pay|(?:they'?ll|they will|everyone will) (?:all )?(?:pay|regret it)|get (?:them|him|her|everyone) back(?= |$)(?! (?:the|to|my|your|on))|kill (?:them|everyone|all of them)|(?:they'?re|they are|theyre|everyone'?s|everyone is) (?:all )?(?:going to|gonna) regret (?:it|this)|bring(?:ing)? (?:something|stuff|it) to school(?! (?:for|to show|tomorrow for))") },

  // ---- Hate speech -----------------------------------------------------------
  { id: "ht_slur", category: "hate", weight: 8, precise: true, why: "a slur", pattern: w("nigg\\w*|fag\\w*|retard(?:ed|s)?|tranny|spic|chink|kike|wetback|towel ?head|beaner") },

  // ---- Drugs & alcohol ---------------------------------------------------------
  { id: "da_drugs", category: "drugs_alcohol", weight: 4, negatable: true, why: "mentions drugs", pattern: w("weed|marijuana|edibles?|vapes?|vaping|juul|nicotine|cocaine|meth|molly|ecstasy|lsd|shrooms|xanax|percs?|(?:get|got|getting|stay) high|smoke (?:weed|pot|a joint)") },
  { id: "da_alcohol", category: "drugs_alcohol", weight: 4, negatable: true, why: "mentions alcohol", pattern: w("drunk|beers?|alcohol|vodka|liquor|tequila|whiskey") },

  // ---- A student telling someone it felt wrong (never hidden; an adult must see it) ----
  { id: "ds_uncomfortable", category: "disclosure", from: "family", weight: 8, why: "the student says someone made them uncomfortable", pattern: w("(?:you|he|she|they|this|that|it|him|her) (?:make|makes|made|making|is making|keeps making) me (?:feel )?(?:so |really |kind of )?(?:uncomfortable|scared|weird|nervous|unsafe|gross)|(?:i'?m|i am|i feel) (?:really |so |kind of )?(?:uncomfortable|unsafe)|(?:i'?m|i am) (?:really |so |kind of )?scared of (?:you|him|her|them|my tutor|the tutor)") },
  { id: "ds_stop", category: "disclosure", from: "family", weight: 7, why: "the student asks the other person to stop", pattern: w("stop (?:messaging|texting|asking|talking to|calling) me|leave me alone|please stop|don'?t (?:message|text|talk to) me") },
  { id: "ds_creepy", category: "disclosure", from: "family", weight: 7, why: "the student calls it creepy or inappropriate", pattern: w("(?:that'?s|you'?re|youre|this is|he'?s|she'?s|it'?s) (?:so |really |kind of )?(?:creepy|inappropriate)") },
  { id: "ds_reported", category: "disclosure", from: "family", weight: 8, why: "the student reports someone asking for pictures, secrets or meetups", pattern: w("(?:he|she|they|my tutor|the tutor|someone|this (?:guy|person|girl)) (?:keeps |kept |has been |was |is |always )?(?:ask|asks|asked|asking|tell|tells|told|telling|want|wants|wanted|make|makes|made|making|try|tries|tried|trying) (?:me )?(?:to |for )?(?:send|show|take|keep|not tell|meet|come over|delete|video ?chat|facetime|pictures|pics|photos|selfies|nudes|secrets?)") },

  // ---- Profanity -------------------------------------------------------------
  { id: "pf_strong", category: "profanity", weight: 3, why: "strong profanity", pattern: w("f+u+c+k\\w*|fck\\w*|fk|wtf|shit\\w*|bitch\\w*|asshole\\w*|bastard|cunt\\w*|motherf\\w*|dumbass|jackass") },
];

export const NEGATIONS = new Set(["not", "no", "never", "don't", "dont", "doesn't", "doesnt", "won't", "wont", "can't", "cant", "cannot", "shouldn't", "shouldnt", "isn't", "isnt", "aren't", "arent", "without", "stop", "nobody", "nothing"]);

export const CATEGORY_LABEL: Record<Category | "grooming_pattern" | "bullying_pattern" | "contact_pressure" | "late_night_contact", string> = {
  self_harm: "Self-harm / welfare",
  sexual: "Sexual content",
  grooming_secrecy: "Secrecy from parents",
  personal_probe: "Personal questions",
  affection: "Inappropriate affection",
  meeting: "Meeting in person",
  contact_migration: "Moving off the platform",
  gifts_money: "Gifts or money",
  scam_link: "Scam or malicious link",
  harassment: "Harassment / bullying",
  threat: "Threat of violence",
  hate: "Hate speech",
  drugs_alcohol: "Drugs or alcohol",
  profanity: "Profanity",
  isolation: "Isolating the student from family",
  disclosure: "Student says something felt wrong",
  grooming_pattern: "Grooming pattern (conversation)",
  bullying_pattern: "Repeated bullying (conversation)",
  contact_pressure: "Repeated contact requests (conversation)",
  late_night_contact: "Late-night messages to a student",
};
