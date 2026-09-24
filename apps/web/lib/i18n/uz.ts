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
  strip: {
    text: '7 kunlik bepul sinov — karta kerak emas.',
    cta: 'Tariflarni koʻrish',
  },

  nav: {
    solutions: 'Yechimlar',
    useCases: 'Foydalanish sohalari',
    verify: 'Tekshirish',
    security: 'Xavfsizlik',
    pricing: 'Narxlar',
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
    proofs: ['Muhrlangan nusxa', 'Yakunlash sertifikati', 'Buzilishni tekshirish'],
  },

  heroDoc: {
    title: 'Xizmat koʻrsatish shartnomasi',
    signedBy: 'Imzoladi',
  },

  solutions: {
    heading: 'Qogʻozbozlik sekin va u hech narsani isbotlamaydi',
    lede: 'Qogʻozdagi va pochtadagi imzo bilan toʻrtta narsa notoʻgʻri ketadi. Har birining oʻrniga nima kelishini koʻring.',
    chase: [
      'Chop et, imzola, skanerla, qidir',
      'Havola orqali bir necha daqiqada imzolanadi',
      'Xavfsiz, bir martalik imzolash havolasini yuboring. Imzolovchi uni istalgan qurilmada brauzerda ochadi — account yaratish shart emas.',
    ],
    noProof: [
      'Oʻzgartirilmaganiga dalil yoʻq',
      'Har kim tekshira oladigan muhrlangan nusxa',
      'Har bir yakunlangan hujjatning barmoq izi olinadi va u muhrlanadi. Bitta bayt oʻzgarsa, tekshiruv oʻtmaydi — biz uchun ham, siz uchun ham, ikkinchi tomon uchun ham.',
    ],
    who: [
      'Kim va qachon imzolaganini koʻrsatib boʻlmaydi',
      'Yakunlash sertifikati',
      'Ochilgan, rozilik berilgan, imzolangan — har biri vaqti va manzili bilan, sodir boʻlgan paytda qayd etiladi va hujjatga biriktiriladi.',
    ],
    scattered: [
      'Hech narsa tartibda emas',
      'Bitta panel, bitta holat',
      'Yuborilgan, koʻrilgan, imzolangan, muddati tugayotgan — pochta va disklarga sochilmasdan, oʻzingiz tanlagan papkalarda.',
    ],
  },

  useCases: {
    heading: 'Qayerda ishlatiladi',
    lede: 'Har safar oʻsha toʻrtta qadam. Faqat hujjat oʻzgaradi.',
    hr: [
      'HR',
      'Ish taklifi xati',
      'Nomzod fikridan qaytmasidan oldin taklifni telefonida imzolay oladigan qilib yuboring.',
    ],
    rent: [
      'Koʻchmas mulk',
      'Ijara shartnomasi',
      'Ijarachi hali kvartirada turganida shartnomani imzolang.',
    ],
    sales: [
      'Savdo',
      'Savdo shartnomasi',
      'Bitimni kelishilgan kuni yoping, kuryer kelgan haftada emas.',
    ],
    legal: [
      'Yuridik',
      'Oshkor qilmaslik shartnomasi',
      'NDA’ni uchrashuv boshlanishidan oldin, kim imzolagani dalili bilan qaytaring.',
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

  verify: {
    heading: 'Har kim tekshira oladi. Hech kim soxtalashtira olmaydi.',
    lede: 'Hujjat imzolanganda uning barmoq izi olinadi. Istalgan nusxani istalgan vaqtda oʻsha iz bilan solishtiring — account kerak emas va fayl kompyuteringizdan chiqmaydi.',
    fingerprint: [
      'Barmoq izi imzolash paytida olinadi',
      'Tayyor faylning SHA-256 qiymati yozuv bilan saqlanadi va sertifikatga chiqariladi.',
    ],
    seal: [
      'Muhr bizniki, faqat bizniki',
      'Ed25519 imzosi bu barmoq izini soʻrovga va imzolangan lahzaga bogʻlaydi.',
    ],
    open: [
      'Tekshiruv ommaviy',
      'Ikkinchi tomon accountsiz tekshiradi. Uning brauzeri barmoq izini hisoblaydi va faqat shuni yuboradi — hujjatni emas.',
    ],
    oneByte: [
      'Bitta bayt kifoya',
      'Oʻzgargan raqam, almashtirilgan sahifa, qayta saqlangan PDF — barchasi tekshiruvdan oʻtmaydi va buni koʻrib turasiz.',
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
    cost: ['Bitta imzo narxi', 'Chop etish + pochta', 'Tarifga kiradi'],
  },

  pricing: {
    heading: 'Oddiy narxlar',
    lede: '7 kunlik bepul sinovdan boshlang. Keyin nimani tanlasangiz ham, allaqachon imzolangan hujjatlaringiz sizniki boʻlib qoladi.',
    personal: [
      'Shaxsiy',
      '$10',
      'oyiga',
      'Bir kishi uchun — imzoni ishonchli qiladigan hamma narsa.',
    ],
    company: [
      'Kompaniya',
      '$10 + $30',
      'oyiga, har bir foydalanuvchi uchun',
      'Rollar va haqiqiy audit izi bilan umumiy ish maydoni.',
    ],
    scale: [
      'Scale',
      'Biz bilan bogʻlaning',
      'kelishuv boʻyicha',
      'Buni boshqa tizimga ulashi kerak boʻlgan jamoalar uchun.',
    ],
    cta: 'Bepul sinovni boshlash',
    note: 'Toʻlov tizimi hali ulanmagan — sinov ishlayapti va biror toʻlov olinishidan oldin sizdan shu yerda soʻraymiz.',
  },

  finalCta: {
    heading: 'Bir daqiqada boshlang',
    body: 'Shaxsiy account yoki kompaniya ish maydonini tanlang — buni roʻyxatdan oʻtishda tanlaysiz va u kelishuvlaringizni yana kim koʻrishini belgilaydi.',
    getStarted: 'Bepul boshlash',
  },

  footer: {
    tagline: (year: number) =>
      `© ${year} E-SIGNSOFT — xavfsiz elektron imzo va hujjat aylanmasi`,
    terms: 'Shartlar',
    privacy: 'Maxfiylik',
    verify: 'Hujjatni tekshirish',
    help: 'Yordam',
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
