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
  | "profanity";

export interface Rule {
  id: string;
  category: Category;
  weight: number;
  /** Tested against the `words` form (letters/digits/apostrophes, single spaces). */
  pattern?: RegExp;
  /** Tested against the `base` form (keeps punctuation: links, emails, handles). */
  basePattern?: RegExp;
  /** A negation word just before the match ("never", "don't"…) reduces the weight. */
  negatable?: boolean;
}

const YOU = "(?:you|u|ya|yu)";
const YOUR = "(?:your|ur|yur|youre|you're|u r)";
const PERSON = `(?:${YOU}|him|her|them)`;
const PARENT = "(?:mom|mum|mother|dad|father|parents?|folks|family|guardians?|mama|papa)";
const w = (s: string) => new RegExp(`\\b(?:${s})\\b`);

export const RULES: Rule[] = [
  // ---- Self-harm (welfare) -------------------------------------------------
  { id: "sh_kill_myself", category: "self_harm", weight: 10, pattern: w("kill(?:ing)? my ?self|kms|end(?:ing)? my (?:life|self)|take my (?:own )?life") },
  { id: "sh_want_die", category: "self_harm", weight: 10, pattern: w("(?:want|wanna|going|gonna|ready) (?:to )?die|wish i (?:was|were) dead|better off (?:dead|without me)|don'?t want to (?:be alive|live|exist)") },
  { id: "sh_suicide", category: "self_harm", weight: 9, pattern: w("suicid(?:e|al)|unalive my ?self|self ?harm(?:ing)?") },
  { id: "sh_cut", category: "self_harm", weight: 9, pattern: w("(?:cut|cutting|burn|burning|starve|starving) my ?self|(?:cut|cutting) my (?:arms?|wrists?|legs?|thighs?)") },
  // "I hurt myself at soccer" is common, so this alone is only a review item.
  { id: "sh_hurt", category: "self_harm", weight: 5, pattern: w("(?:want to|wanna|going to|gonna|i) hurt(?:ing)? my ?self") },
  { id: "sh_no_point", category: "self_harm", weight: 6, pattern: w("no (?:reason|point) (?:to|in) (?:live|living|being alive)|nobody would (?:care|miss me)|hate my life") },

  // ---- Sexual content -------------------------------------------------------
  { id: "sx_explicit", category: "sexual", weight: 9, pattern: w("porn\\w*|nudes?|noodz|nudez|naked|sex(?:ting|ual|ually|y)?|horny|boobs?|tits|dick|penis|vagina|pussy|blowjob|handjob|masturbat\\w*|orgasm|condom|onlyfans|nsfw|xxx") },
  { id: "sx_pics", category: "sexual", weight: 9, pattern: w(`send (?:me )?(?:a |some )?(?:pics?|pictures?|photos?|selfies?|vids?|videos?) (?:of ${YOU}|of ${YOUR}self|in (?:bed|the shower|your underwear))|(?:pic|picture|photo) of ${YOUR} body`) },
  { id: "sx_wearing", category: "sexual", weight: 8, pattern: w(`what (?:are|r) ${YOU} wearing|take (?:your|ur) (?:clothes|shirt|pants) off|in ${YOUR} (?:bed|underwear|pajamas)`) },
  { id: "sx_hot", category: "sexual", weight: 7, pattern: w(`${YOU} (?:are|r|look|looked|looking)? ?(?:so |really |very )?(?:hot|sexy)|${YOU}'?re (?:so |really |very )?(?:hot|sexy)`) },
  { id: "sx_kiss", category: "sexual", weight: 7, pattern: w(`kiss ${YOU}|date me|be my (?:girlfriend|boyfriend|gf|bf)|go out with me`) },

  // ---- Grooming: secrecy ----------------------------------------------------
  { id: "gs_dont_tell", category: "grooming_secrecy", weight: 9, pattern: w(`don'?t (?:tell|show|let) ${YOUR} ${PARENT}|(?:don'?t|do not|never) tell (?:anyone|anybody|no ?one|ur ${PARENT}|your ${PARENT})|without ${YOUR} ${PARENT} knowing`) },
  { id: "gs_secret", category: "grooming_secrecy", weight: 8, pattern: w("our (?:little )?secret|keep (?:this|it|that) (?:a )?secret|keep (?:this|it) between us|between (?:you and me|u and me|us two)|no ?one (?:needs|has) to know|just between us") },
  { id: "gs_delete", category: "grooming_secrecy", weight: 8, pattern: w("delete (?:this|these|the|our|that) (?:message|messages|msg|msgs|chat|convo|conversation|texts?)|clear (?:the|our) chat") },
  { id: "gs_parent_away", category: "grooming_secrecy", weight: 6, pattern: w(`(?:are|is) ${YOUR} ${PARENT} (?:home|around|there|watching|nearby|asleep)|when ${YOUR} ${PARENT} (?:is|are) (?:gone|away|asleep|not home)`) },

  // ---- Grooming: personal probing & affection ------------------------------
  { id: "pp_alone", category: "personal_probe", weight: 7, pattern: w(`(?:are|r) ${YOU} (?:home )?alone|home alone|by ${YOUR}self right now`) },
  { id: "pp_where_live", category: "personal_probe", weight: 6, pattern: w(`where (?:do|d) ${YOU} live|what'?s ${YOUR} (?:address|street|neighborhood)|what street|which house`) },
  { id: "pp_age", category: "personal_probe", weight: 4, pattern: w(`how old (?:are|r) ${YOU}|what'?s ${YOUR} age`) },
  { id: "pp_school", category: "personal_probe", weight: 4, pattern: w(`what school (?:do|d) ${YOU} (?:go|attend)|where (?:do|d) ${YOU} go to school`) },
  { id: "pp_dating", category: "personal_probe", weight: 6, pattern: w(`(?:do|d) ${YOU} have a (?:boyfriend|girlfriend|bf|gf|crush)|are ${YOU} single`) },
  { id: "af_mature", category: "affection", weight: 6, pattern: w(`(?:so )?mature for ${YOUR} age|${YOU}'?re (?:so )?mature|special (?:friend|connection|bond)|${YOU} understand me`) },
  { id: "af_love", category: "affection", weight: 6, pattern: w(`i (?:love|luv|like like) ${YOU}|i miss ${YOU}|thinking about ${YOU}|${YOU}'?re (?:so |really )?(?:beautiful|gorgeous|cute|pretty)`) },

  // ---- Meeting in person ----------------------------------------------------
  { id: "mt_meet", category: "meeting", weight: 7, negatable: true, pattern: w(`meet (?:up|me|${YOU} (?:at|somewhere|after|outside))|come over|pick ${YOU} up|sleep ?over|give ${YOU} a ride|(?:come|stop) by my`) },
  // Weaker on their own ("practice at your house"); they add up in the conversation-level check.
  { id: "mt_irl", category: "meeting", weight: 4, negatable: true, pattern: w(`in real life|irl|in person|face to face|hang out|my (?:house|place|apartment)`) },

  // ---- Moving contact off the platform ---------------------------------------
  { id: "cm_text_me", category: "contact_migration", weight: 6, negatable: true, pattern: w("text me|call me (?:at|on|tonight|later|when|after)|dm me|message me on|add me(?: on)?|hit me up|my (?:cell|phone number|number is)|(?:your|ur) (?:cell|phone number|number)|what'?s (?:your|ur) (?:number|snap|insta|discord|user ?name|handle|@)") },
  { id: "cm_platform", category: "contact_migration", weight: 5, negatable: true, pattern: w("snap ?chat|snapchat|instagram|insta|discord|whats ?app|telegram|kik|tik ?tok|facetime|imessage|signal app|wechat|fb messenger|(?:my|your|ur) (?:snap|sc|ig)|snap me|on (?:snap|sc|ig)") },
  { id: "cm_spelled_number", category: "contact_migration", weight: 7, pattern: /\b(?:(?:zero|oh|one|two|three|four|five|six|seven|eight|nine)\b[ ]?){7,}/ },
  { id: "cm_handle", category: "contact_migration", weight: 6, basePattern: /(^|\s)@[a-z0-9_.]{3,}/ },
  { id: "cm_email", category: "contact_migration", weight: 7, basePattern: /[a-z0-9._%+-]+\s*(?:@|\(at\)|\[at\]| at )\s*[a-z0-9-]+\s*(?:\.|\(dot\)|\[dot\]| dot )\s*(?:com|net|org|edu|us|io)\b/ },
  { id: "cm_phone", category: "contact_migration", weight: 7, basePattern: /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/ },

  // ---- Gifts & money ---------------------------------------------------------
  { id: "gm_gift", category: "gifts_money", weight: 6, negatable: true, pattern: w(`gift ?cards?|buy ${YOU}|get ${YOU} (?:a|something)|i'?ll (?:pay|send) ${YOU}|send (?:me )?money|pay (?:me|${YOU})`) },
  { id: "gm_apps", category: "gifts_money", weight: 5, negatable: true, pattern: w("venmo|cash ?app|zelle|paypal|apple pay|robux|v ?bucks|crypto|bitcoin") },

  // ---- Scam / malicious links ------------------------------------------------
  { id: "sc_click", category: "scam_link", weight: 7, pattern: w("click (?:this|the|my|on this) link|download (?:this|my|the) (?:app|file|program)|install (?:this|my)|free (?:robux|vbucks|v bucks|gift ?cards?|iphone|nitro)") },
  { id: "sc_creds", category: "scam_link", weight: 8, pattern: w(`${YOUR} password|verify ${YOUR} (?:account|identity)|log ?in (?:here|with ${YOUR})|send (?:me )?(?:the |your |ur )?code`) },
  { id: "sc_url", category: "scam_link", weight: 7, basePattern: /(https?:\/\/|www\.|bit\.ly|tinyurl|t\.co\/|discord\.gg|\.exe\b|\.apk\b|\.zip\b|grabify|iplogger)/ },

  // ---- Harassment & bullying -------------------------------------------------
  { id: "hr_insult", category: "harassment", weight: 6, pattern: w(`${YOU}(?:'?re| are| r)? (?:so |such an? |an? )?(?:stupid|dumb|idiot|moron|loser|ugly|fat|worthless|useless|trash|garbage|pathetic|a joke)`) },
  { id: "hr_hate_you", category: "harassment", weight: 6, pattern: w(`i hate ${YOU}|nobody (?:likes|cares about) ${YOU}|no one (?:likes|cares about) ${YOU}|shut (?:ur|your) mouth`) },
  { id: "hr_die", category: "harassment", weight: 9, pattern: w(`kys|kill ${YOU}r?self|go die|${YOU} should die|drink bleach`) },

  // ---- Threats ---------------------------------------------------------------
  { id: "th_kill", category: "threat", weight: 10, pattern: w(`(?:i'?ll|i will|i'?m (?:going to|gonna)|gonna|going to) (?:kill|hurt|stab|shoot|jump|strangle|choke) ${PERSON}|beat ${PERSON} up|${YOU}'?re dead meat|watch ${YOUR} back`) },
  { id: "th_weapon", category: "threat", weight: 10, pattern: w("shoot up (?:the|a|my|our) school|bring a (?:gun|knife|weapon)|bomb (?:the|a|my) school") },

  // ---- Hate speech -----------------------------------------------------------
  { id: "ht_slur", category: "hate", weight: 8, pattern: w("nigg\\w*|fag\\w*|retard(?:ed|s)?|tranny|spic|chink|kike|wetback|towel ?head|beaner") },

  // ---- Drugs & alcohol ---------------------------------------------------------
  { id: "da_drugs", category: "drugs_alcohol", weight: 4, negatable: true, pattern: w("weed|marijuana|edibles?|vapes?|vaping|juul|nicotine|cocaine|meth|molly|ecstasy|lsd|shrooms|xanax|percs?|(?:get|got|getting|stay) high|smoke (?:weed|pot|a joint)") },
  { id: "da_alcohol", category: "drugs_alcohol", weight: 4, negatable: true, pattern: w("drunk|beers?|alcohol|vodka|liquor|tequila|whiskey") },

  // ---- Profanity -------------------------------------------------------------
  { id: "pf_strong", category: "profanity", weight: 3, pattern: w("f+u+c+k\\w*|fck\\w*|fk|wtf|shit\\w*|bitch\\w*|asshole\\w*|bastard|cunt\\w*|motherf\\w*|dumbass|jackass") },
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
  grooming_pattern: "Grooming pattern (conversation)",
  bullying_pattern: "Repeated bullying (conversation)",
  contact_pressure: "Repeated contact requests (conversation)",
  late_night_contact: "Late-night messages to a student",
};
