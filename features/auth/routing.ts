/**
 * Which parts of the app are open, from three facts: is the person signed in,
 * does this phone hold the account key (PIN created or entered), and have they
 * finished onboarding. The root layout's guards and the launch redirect both
 * read this, so the rule lives in one place.
 *
 * - Intro (welcome, how it works): until signed in and onboarded.
 * - Sign-in (number, code): only while signed out.
 * - PIN (create, or enter on a new phone): signed in, key not on this phone.
 * - Onboarding (privacy, name, senders): signed in with the key, not yet onboarded.
 * - The app itself: signed in, key on this phone, onboarded.
 */
export interface Access {
  intro: boolean;
  signIn: boolean;
  pin: boolean;
  onboarding: boolean;
  app: boolean;
}

export function accessFor(signedIn: boolean, keyReady: boolean, onboarded: boolean): Access {
  return {
    intro: !(signedIn && onboarded),
    signIn: !signedIn,
    pin: signedIn && !keyReady,
    onboarding: signedIn && keyReady && !onboarded,
    app: signedIn && keyReady && onboarded,
  };
}

/** Where the account key stands on this phone. */
export type KeyState = 'ready' | 'create' | 'unlock';

/** Where a launch lands. Someone who has seen the intro goes straight to sign-in. */
export function landingFor(
  signedIn: boolean,
  key: KeyState,
  onboarded: boolean,
): '/dashboard' | '/privacy' | '/phone' | '/welcome' | '/create-pin' | '/unlock' {
  if (!signedIn) return onboarded ? '/phone' : '/welcome';
  if (key === 'create') return '/create-pin';
  if (key === 'unlock') return '/unlock';
  return onboarded ? '/dashboard' : '/privacy';
}

/** After "How it works": sign in first; someone already signed in goes where the launch rule says. */
export const afterIntro = (signedIn: boolean): '/' | '/phone' => (signedIn ? '/' : '/phone');
