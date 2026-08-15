/**
 * The English landing-page catalogue — the AUTHORITATIVE shape.
 *
 * uz and ru are declared `: typeof en`, so a missing key or a changed argument
 * list is a COMPILE error rather than a blank space a visitor discovers. Copy
 * that appears in a repeated card is a tuple `[title, body]` so a translator
 * cannot silently drop half of one.
 *
 * NOT `as const`: that would pin every string to its literal type, and Uzbek
 * would then only compile if it equalled English word for word.
 */
export const en = {
  nav: {
    why: 'Why E-SIGNSOFT',
    how: 'How it works',
    security: 'Security',
    compare: 'Compare',
  },

  header: {
    signIn: 'Sign in',
    getStarted: 'Get started free',
    goToApp: 'Go to E-SIGNSOFT',
    /** Labels the switcher for screen readers; never shown on screen. */
    languageLabel: 'Change language',
  },

  hero: {
    eyebrow: 'Documents that move themselves',
    title: 'Send, sign, and prove every document — without the paperwork',
    subtitle:
      'Every document you send comes back sealed. Anyone holding it can check that it has not changed by a single byte — including the person you sent it to, without an account.',
    goToDashboard: 'Go to your dashboard',
    checkDocument: 'Check a real document',
    signIn: 'Sign in',
    getStarted: 'Get started free',
    noCreditCard: 'No credit card. Signers never need an account.',
    tryIt: 'Try it — change one number',
  },

  problem: {
    heading: 'Paperwork is slow and risky',
    chase: [
      'Print, sign, scan, chase',
      'Every signature is a round-trip of emails, printers and reminders. Deals wait on paper.',
    ] as [string, string],
    noProof: [
      'No proof it wasn’t changed',
      'A scanned PDF can be altered and nobody can tell. Disputes come down to “trust me”.',
    ] as [string, string],
    scattered: [
      'Nothing is organised',
      'Signed files scatter across inboxes and drives. Finding one — or knowing its status — is a hunt.',
    ] as [string, string],
  },

  how: {
    heading: 'Every document, managed end to end',
    upload: ['1 · Upload', 'Drop in any PDF and it becomes a reusable template.'] as [string, string],
    tag: [
      '2 · Tag',
      'Place signature, date, name and 14 more field types by drag-and-drop — per recipient.',
    ] as [string, string],
    send: [
      '3 · Send',
      'Email a secure, single-use signing link. No account needed to sign.',
    ] as [string, string],
    prove: [
      '4 · Prove',
      'Get the signed file plus a Certificate of Completion with a cryptographic seal.',
    ] as [string, string],
  },

  security: {
    heading: 'Security is the product',
    subheading: 'Signing is only worth something if it holds up. E-SIGNSOFT is built so it does.',
    tamper: [
      'Tamper-evident by design',
      'Every signed document is fingerprinted (SHA-256) and sealed with an Ed25519 signature bound to that document. Change one byte and verification fails — and you can run that check yourself, any time.',
    ] as [string, string],
    isolated: [
      'Isolated by the database itself',
      'Your workspace’s data is walled off at the database layer, not just in application code — so a bug in our code can never leak it to another customer.',
    ] as [string, string],
    surface: [
      'A hardened signing surface',
      'Signing links are single-use, expiring, and stored only as hashes. The public signing app holds no keys and no database; it can forward a fixed set of requests and nothing else.',
    ] as [string, string],
    legal: [
      'Legally aligned',
      'Consent is recorded before any field can be filled, and the full audit trail — opened, agreed, signed, from where — follows the ESIGN/UETA model for remote electronic signatures.',
    ] as [string, string],
  },

  compare: {
    heading: 'E-SIGNSOFT vs. paperwork',
    columnPaper: 'Paper / scans',
    /** Row tuples: [what is compared, the paper answer, ours]. */
    turnaround: ['Turnaround', 'Days', 'Minutes'] as [string, string, string],
    integrity: ['Proof of integrity', 'None', 'Cryptographic seal'] as [string, string, string],
    audit: ['Audit trail', 'Manual', 'Automatic'] as [string, string, string],
    find: ['Find a signed doc', 'Search inboxes', 'One dashboard'] as [string, string, string],
    multiParty: [
      'Multi-party signing',
      'Chase each person',
      'Routed automatically',
    ] as [string, string, string],
    cost: ['Cost per signature', 'Print + postage', 'Free to start'] as [string, string, string],
  },

  finalCta: {
    heading: 'Start in a minute',
    body: 'Choose a personal account or set up a company workspace — you pick at sign-up, and it decides who else can see your agreements.',
    getStarted: 'Get started free',
  },

  footer: {
    tagline: (year: number) => `© ${year} E-SIGNSOFT — secure e-signature and document workflow`,
  },

  /**
   * The live hashing demo in the hero.
   *
   * `contract` is the sample document the visitor edits. It MUST contain the
   * fee figure verbatim — the "change one number" button derives its tampered
   * copy by replacing that exact string, so a translation that reformats or
   * localises the number would leave the button doing nothing at all. There is
   * a guard for this in hero-proof.tsx; see TAMPER_FROM.
   */
  proof: {
    contract: `SERVICE AGREEMENT

Between:  Orbis Logistics LLC
And:      Karimov Consulting

1. Term. Twelve months from 1 September 2026.
2. Fee.  18,400,000 so'm per month, payable in arrears.
3. Notice. Either party may terminate on 60 days' notice.

Signed electronically by both parties.`,
    verdictIntact: 'Signature verified — document unaltered',
    verdictChanged: 'Verification failed — document has changed',
    signedDocument: 'Signed document',
    docAria: 'Signed document — edit any character to see the fingerprint change',
    fingerprint: 'SHA-256 fingerprint',
    computing: 'computing…',
    recordedAtSigning: 'recorded at signing:',
    changeOneNumber: 'Change one number',
    putItBack: 'Put it back',
    oneEdit: (changed: number) =>
      `One edit — and ${changed} of the 64 characters below it changed.`,
    orEditYourself: 'Or edit the text yourself.',
    checkWithRealFile: 'Check with a real file →',
  },
};
