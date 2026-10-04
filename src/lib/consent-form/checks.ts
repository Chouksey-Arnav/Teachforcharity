/**
 * What an admin confirms on a photo of a signed consent form before verifying it.
 * The database refuses a signed-form verification unless all four are confirmed.
 */
export const FORM_CHECKS = ["code", "names", "ink_signature", "whole_form"] as const;
export type FormCheck = (typeof FORM_CHECKS)[number];
