/**
 * Which parts of the app are open, from two facts: is the person signed in,
 * and have they finished onboarding. The root layout's guards and the launch
 * redirect both read this, so the rule lives in one place.
 *
 * - Intro (welcome, how it works): until signed in and onboarded.
 * - Sign-in (number, code): only while signed out.
 * - Onboarding (privacy, senders): signed in, not yet onboarded.
 * - The app itself: signed in and onboarded.
 */
export interface Access {
  intro: boolean;
  signIn: boolean;
  onboarding: boolean;
  app: boolean;
}

export function accessFor(signedIn: boolean, onboarded: boolean): Access {
  return {
    intro: !(signedIn && onboarded),
    signIn: !signedIn,
    onboarding: signedIn && !onboarded,
    app: signedIn && onboarded,
  };
}

/** Where a launch lands. Someone who has seen the intro goes straight to sign-in. */
export function landingFor(
  signedIn: boolean,
  onboarded: boolean,
): '/dashboard' | '/privacy' | '/phone' | '/welcome' {
  if (signedIn) return onboarded ? '/dashboard' : '/privacy';
  return onboarded ? '/phone' : '/welcome';
}

/** After "How it works": sign in first, unless already signed in (a replayed intro). */
export const afterIntro = (signedIn: boolean): '/privacy' | '/phone' =>
  signedIn ? '/privacy' : '/phone';
