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
  /** The black band above the header. One sentence and one link, nothing else. */
  strip: {
    text: '7-day free trial — no card needed.',
    cta: 'See plans',
  },

  nav: {
    solutions: 'Solutions',
    useCases: 'Use cases',
    verify: 'Verify',
    security: 'Security',
    pricing: 'Pricing',
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
    /** The three proof points under the hero copy. */
    proofs: ['Sealed copy', 'Certificate of completion', 'Tamper check'] as [string, string, string],
  },

  /**
   * The drawn contract in the hero — the sheet the seal is pressed into.
   * Short strings on purpose: they sit inside a picture, not a paragraph.
   */
  heroDoc: {
    title: 'Service agreement',
    signedBy: 'Signed by',
  },

  /**
   * What we solve. Each row is [the problem, our answer, how it works] — the
   * problem sits quiet on the left, the answer carries the weight.
   */
  solutions: {
    heading: 'Paperwork is slow, and it proves nothing',
    lede: 'Four things go wrong with signatures on paper and in email. Here is what replaces each one.',
    chase: [
      'Print, sign, scan, chase',
      'Signed in minutes, from a link',
      'Email a secure, single-use signing link. The signer opens it in a browser, on any device, with no account to create.',
    ] as [string, string, string],
    noProof: [
      'No proof it wasn’t changed',
      'A sealed copy anyone can check',
      'Every finished document is fingerprinted and sealed. Change one byte and the check fails — for us, for you, for the other side.',
    ] as [string, string, string],
    who: [
      'You can’t show who signed, or when',
      'A certificate of completion',
      'Opened, agreed, signed — each with a time and an address, recorded as it happened and attached to the document.',
    ] as [string, string, string],
    scattered: [
      'Nothing is organised',
      'One dashboard, one status',
      'Sent, viewed, signed, expiring — in folders you choose, instead of scattered across inboxes and drives.',
    ] as [string, string, string],
  },

  /** The tabs under Use cases: [tab label, example document, why it matters]. */
  useCases: {
    heading: 'Where it is used',
    lede: 'The same four steps every time. Only the document changes.',
    hr: [
      'HR',
      'Offer letter',
      'Send an offer the candidate can sign on their phone, before they change their mind.',
    ] as [string, string, string],
    rent: [
      'Real estate',
      'Lease agreement',
      'Sign the lease with a tenant who is still standing in the flat.',
    ] as [string, string, string],
    sales: [
      'Sales',
      'Sales contract',
      'Close the deal the day it is agreed, not the week the courier arrives.',
    ] as [string, string, string],
    legal: [
      'Legal',
      'Non-disclosure agreement',
      'Get the NDA back before the meeting starts, with proof of who signed it.',
    ] as [string, string, string],
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

  /** The black band around the live hashing demo. */
  verify: {
    heading: 'Anyone can check it. Nobody can fake it.',
    lede: 'A fingerprint is taken when the document is signed. Check any copy against it, any time — no account, and the file never leaves your computer.',
    fingerprint: [
      'The fingerprint is taken at signing',
      'SHA-256 of the finished file, stored with the record and printed on the certificate.',
    ] as [string, string],
    seal: [
      'The seal is ours, and only ours',
      'An Ed25519 signature binds that fingerprint to the request and the moment it was signed.',
    ] as [string, string],
    open: [
      'Checking is public',
      'The other side verifies without an account. Their browser computes the fingerprint and sends only that — never the document.',
    ] as [string, string],
    oneByte: [
      'One byte is enough',
      'A changed figure, a swapped page, a re-saved PDF — all of it fails the check, visibly.',
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
    cost: ['Cost per signature', 'Print + postage', 'Included'] as [string, string, string],
  },

  /** Plans. Tuples are [name, price, cadence, who it is for]. */
  pricing: {
    heading: 'Simple pricing',
    lede: 'Start with a 7-day free trial. Whatever you choose afterwards, documents you have already signed stay yours to download.',
    personal: [
      'Personal',
      '$10',
      'per month',
      'One person, everything that makes a signature hold up.',
    ] as [string, string, string, string],
    company: [
      'Company',
      '$10 + $30',
      'per month, per user',
      'A shared workspace with roles and a real audit trail.',
    ] as [string, string, string, string],
    scale: [
      'Scale',
      'Talk to us',
      'per agreement',
      'For teams that need it wired into something else.',
    ] as [string, string, string, string],
    cta: 'Start free trial',
    note: 'Billing is not open yet — the trial runs, and we will ask you here before anything is charged.',
  },

  finalCta: {
    heading: 'Start in a minute',
    body: 'Choose a personal account or set up a company workspace — you pick at sign-up, and it decides who else can see your agreements.',
    getStarted: 'Get started free',
  },

  footer: {
    tagline: (year: number) => `© ${year} E-SIGNSOFT — secure e-signature and document workflow`,
    terms: 'Terms',
    privacy: 'Privacy',
    verify: 'Verify a document',
    help: 'Help',
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
