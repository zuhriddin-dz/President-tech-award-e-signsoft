import type { en } from './en';

/**
 * Uzbek (Latin script). Declared against `typeof en`, so the build fails if a
 * key goes missing or an argument list drifts.
 *
 * Orthography: oʻ and gʻ use U+02BB MODIFIER LETTER TURNED COMMA, not an ASCII
 * apostrophe. The shortcut reads as wrong to a native speaker, and there is a
 * test asserting it.
 *
 * Vocabulary: a user account is `account`, the English loanword people actually
 * say — NOT `hisob`, which reads as an accounting ledger or a calculation. So
 * "without an account" is `hech qanday accountsiz`, not `hisobsiz`. The verb
 * `hisoblanmoqda` ("computing") is unrelated and stays: that is hisoblamoq, to
 * calculate, which is the right word for what the demo is doing.
 */
export const uz: typeof en = {
  nav: {
    why: 'Nega E-SIGNSOFT',
    how: 'Qanday ishlaydi',
    security: 'Xavfsizlik',
    compare: 'Taqqoslash',
  },

  header: {
    signIn: 'Kirish',
    getStarted: 'Bepul boshlash',
    goToApp: 'E-SIGNSOFT’ga oʻtish',
    languageLabel: 'Tilni oʻzgartirish',
  },

  hero: {
    eyebrow: 'Oʻzi harakatlanadigan hujjatlar',
    title: 'Hujjatlarni yuboring, imzolang va isbotlang — qogʻozbozliksiz',
    subtitle:
      'Siz yuborgan har bir hujjat muhrlangan holda qaytadi. Uni qoʻlida tutgan har kim hujjat bitta baytga ham oʻzgarmaganini tekshira oladi — siz yuborgan odam ham, hech qanday accountsiz.',
    goToDashboard: 'Boshqaruv paneliga oʻtish',
    checkDocument: 'Haqiqiy hujjatni tekshiring',
    signIn: 'Kirish',
    getStarted: 'Bepul boshlash',
    noCreditCard: 'Karta kerak emas. Imzolovchilarga account hech qachon kerak boʻlmaydi.',
    tryIt: 'Sinab koʻring — bitta raqamni oʻzgartiring',
  },

  problem: {
    heading: 'Qogʻozbozlik sekin va xavfli',
    chase: [
      'Chop et, imzola, skanerla, qidir',
      'Har bir imzo — bu xatlar, printerlar va eslatmalar aylanmasi. Bitimlar qogʻozni kutadi.',
    ],
    noProof: [
      'Oʻzgartirilmaganiga dalil yoʻq',
      'Skanerlangan PDF oʻzgartirilishi mumkin va buni hech kim bilmaydi. Nizolar “menga ishoning”ga borib taqaladi.',
    ],
    scattered: [
      'Hech narsa tartibda emas',
      'Imzolangan fayllar pochta va disklarga sochilib ketadi. Birontasini — yoki uning holatini — topish tergovga aylanadi.',
    ],
  },

  how: {
    heading: 'Har bir hujjat, boshidan oxirigacha boshqariladi',
    upload: ['1 · Yuklash', 'Istalgan PDF’ni tashlang va u qayta ishlatiladigan shablonga aylanadi.'],
    tag: [
      '2 · Belgilash',
      'Imzo, sana, ism va yana 14 xil maydonni sudrab qoʻying — har bir qabul qiluvchi uchun alohida.',
    ],
    send: [
      '3 · Yuborish',
      'Xavfsiz, bir martalik imzolash havolasini yuboring. Imzolash uchun account kerak emas.',
    ],
    prove: [
      '4 · Isbotlash',
      'Imzolangan faylni va kriptografik muhrli Yakunlash sertifikatini oling.',
    ],
  },

  security: {
    heading: 'Xavfsizlik — mahsulotning oʻzi',
    subheading:
      'Imzo faqat u sinovga dosh bersagina qadrli. E-SIGNSOFT aynan shunday qurilgan.',
    tamper: [
      'Buzilishni koʻrsatadigan tuzilma',
      'Har bir imzolangan hujjatning barmoq izi olinadi (SHA-256) va aynan oʻsha hujjatga bogʻlangan Ed25519 imzosi bilan muhrlanadi. Bitta baytni oʻzgartirsangiz, tekshiruv muvaffaqiyatsiz tugaydi — va bu tekshiruvni istalgan vaqtda oʻzingiz oʻtkaza olasiz.',
    ],
    isolated: [
      'Maʼlumotlar bazasining oʻzi ajratadi',
      'Ish maydoningizdagi maʼlumotlar dastur kodida emas, maʼlumotlar bazasi qatlamida toʻsilgan — shuning uchun bizning kodimizdagi xato ularni boshqa mijozga hech qachon oshkor qila olmaydi.',
    ],
    surface: [
      'Mustahkamlangan imzolash yuzasi',
      'Imzolash havolalari bir martalik, muddati cheklangan va faqat xesh koʻrinishida saqlanadi. Ommaviy imzolash ilovasida kalitlar ham, maʼlumotlar bazasi ham yoʻq; u faqat belgilangan soʻrovlarni uzatadi, boshqa hech narsani emas.',
    ],
    legal: [
      'Huquqiy jihatdan muvofiq',
      'Rozilik biror maydon toʻldirilishidan oldin qayd etiladi va toʻliq audit izi — ochilgan, rozilik bildirilgan, imzolangan, qayerdan — masofaviy elektron imzolar uchun ESIGN/UETA modeliga amal qiladi.',
    ],
  },

  compare: {
    heading: 'E-SIGNSOFT va qogʻozbozlik',
    columnPaper: 'Qogʻoz / skaner',
    turnaround: ['Bajarilish muddati', 'Kunlar', 'Daqiqalar'],
    integrity: ['Yaxlitlik dalili', 'Yoʻq', 'Kriptografik muhr'],
    audit: ['Audit izi', 'Qoʻlda', 'Avtomatik'],
    find: ['Imzolangan hujjatni topish', 'Pochtani qidirish', 'Bitta panel'],
    multiParty: ['Koʻp tomonlama imzolash', 'Har birini qidirish', 'Avtomatik yoʻnaltiriladi'],
    cost: ['Bitta imzo narxi', 'Chop etish + pochta', 'Boshlash bepul'],
  },

  finalCta: {
    heading: 'Bir daqiqada boshlang',
    body: 'Shaxsiy account yoki kompaniya ish maydonini tanlang — buni roʻyxatdan oʻtishda tanlaysiz va u kelishuvlaringizni yana kim koʻrishini belgilaydi.',
    getStarted: 'Bepul boshlash',
  },

  footer: {
    tagline: (year: number) =>
      `© ${year} E-SIGNSOFT — xavfsiz elektron imzo va hujjat aylanmasi`,
  },

  proof: {
    // The fee figure stays verbatim: the "change one number" button replaces
    // this exact string. See the note in en.ts.
    contract: `XIZMAT KOʻRSATISH SHARTNOMASI

Kimlar oʻrtasida:  Orbis Logistics MChJ
Va:                Karimov Consulting

1. Muddat. 2026-yil 1-sentabrdan boshlab oʻn ikki oy.
2. Toʻlov. Oyiga 18,400,000 soʻm, oy oxirida toʻlanadi.
3. Ogohlantirish. Har bir tomon 60 kun oldin xabar berib bekor qilishi mumkin.

Har ikki tomon elektron tarzda imzoladi.`,
    verdictIntact: 'Imzo tasdiqlandi — hujjat oʻzgartirilmagan',
    verdictChanged: 'Tekshiruv muvaffaqiyatsiz — hujjat oʻzgartirilgan',
    signedDocument: 'Imzolangan hujjat',
    docAria:
      'Imzolangan hujjat — barmoq izi oʻzgarishini koʻrish uchun istalgan belgini tahrirlang',
    fingerprint: 'SHA-256 barmoq izi',
    computing: 'hisoblanmoqda…',
    recordedAtSigning: 'imzolashda qayd etilgan:',
    changeOneNumber: 'Bitta raqamni oʻzgartiring',
    putItBack: 'Qaytaring',
    oneEdit: (changed: number) =>
      `Bitta tahrir — va quyidagi 64 ta belgidan ${changed} tasi oʻzgardi.`,
    orEditYourself: 'Yoki matnni oʻzingiz tahrirlang.',
    checkWithRealFile: 'Haqiqiy fayl bilan tekshiring →',
  },
};
