/** Choices for the public forms (/contact, /waitlist). The database checks the same values. */

export const CONTACT_TOPICS = [
  { key: "question", label: "A question", hint: "About lessons, tutoring, sign-up or anything else." },
  { key: "concern", label: "Report a concern", hint: "Something that made you or a child feel unsafe, or that broke the rules." },
  { key: "school", label: "School or band director", hint: "Sharing the program with your students or families." },
  { key: "partner", label: "Nonprofit or partnership", hint: "Working with us or verifying volunteer hours." },
  { key: "other", label: "Something else", hint: "" },
] as const;
export type ContactTopic = (typeof CONTACT_TOPICS)[number]["key"];

export const CONTACT_ROLES = [
  { key: "parent", label: "Parent or guardian" },
  { key: "student", label: "Middle school student" },
  { key: "tutor", label: "High school tutor" },
  { key: "educator", label: "Teacher or band director" },
  { key: "other", label: "Someone else" },
] as const;

/** "Not eligible yet" grades: younger than 6th, or already in high school. 0 is kindergarten. */
export const WAITLIST_GRADES = [
  { value: 5, label: "5th grade" },
  { value: 4, label: "4th grade" },
  { value: 3, label: "3rd grade or younger" },
] as const;

/** Every state but North Carolina (which is served now), plus DC and "outside the US" (ZZ). */
export const US_STATES = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"], ["CA", "California"], ["CO", "Colorado"],
  ["CT", "Connecticut"], ["DE", "Delaware"], ["DC", "District of Columbia"], ["FL", "Florida"], ["GA", "Georgia"],
  ["HI", "Hawaii"], ["ID", "Idaho"], ["IL", "Illinois"], ["IN", "Indiana"], ["IA", "Iowa"], ["KS", "Kansas"],
  ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"], ["MD", "Maryland"], ["MA", "Massachusetts"],
  ["MI", "Michigan"], ["MN", "Minnesota"], ["MS", "Mississippi"], ["MO", "Missouri"], ["MT", "Montana"],
  ["NE", "Nebraska"], ["NV", "Nevada"], ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"],
  ["NY", "New York"], ["ND", "North Dakota"], ["OH", "Ohio"], ["OK", "Oklahoma"], ["OR", "Oregon"],
  ["PA", "Pennsylvania"], ["RI", "Rhode Island"], ["SC", "South Carolina"], ["SD", "South Dakota"], ["TN", "Tennessee"],
  ["TX", "Texas"], ["UT", "Utah"], ["VT", "Vermont"], ["VA", "Virginia"], ["WA", "Washington"], ["WV", "West Virginia"],
  ["WI", "Wisconsin"], ["WY", "Wyoming"], ["ZZ", "Outside the United States"],
].map(([code, name]) => ({ code, name }));

/** One instrument as the public finder sees it: counts only. */
export interface InstrumentSupply {
  slug: string;
  name: string;
  family: string;
  /** Live tutors taking new students who teach this instrument. */
  open: number;
  /** Other live tutors who teach a closely related instrument. */
  related: number;
}

/** What to tell a family about one instrument, in one place so every screen says the same thing. */
export function supplyStatus(i: Pick<InstrumentSupply, "open" | "related">): "open" | "related" | "waitlist" {
  return i.open > 0 ? "open" : i.related > 0 ? "related" : "waitlist";
}
