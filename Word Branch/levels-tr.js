// Meaning-linked Turkish branches; open compounds store their dictionary space as open: true.
// Pending TDK checks are documented per level; the resumable verifier lives outside this project.
export const LEVELS = [
  {
    // TDK pending: SUYOLU, SU AYGIRI, SU KABAĞI, SU BÖREĞİ, SU KEMERİ, SU SAMURU, SU YOSUNU, SU DEPOSU, SU SAYACI
    id: 1, root: 'SU', words: [
      { word: 'SUYOLU', parts: ['YO', 'LU'] },
      { word: 'SUAYGIRI', parts: ['AY', 'GI', 'RI'], open: true },
      { word: 'SUKABAĞI', parts: ['KA', 'BA', 'ĞI'], open: true },
      { word: 'SUBÖREĞİ', parts: ['BÖ', 'RE', 'Ğİ'], open: true },
      { word: 'SUKEMERİ', parts: ['KE', 'ME', 'Rİ'], open: true },
      { word: 'SUSAMURU', parts: ['SA', 'MU', 'RU'], open: true },
      { word: 'SUYOSUNU', parts: ['YO', 'SU', 'NU'], open: true },
      { word: 'SUDEPOSU', parts: ['DE', 'PO', 'SU'], open: true },
      { word: 'SUSAYACI', parts: ['SA', 'YA', 'CI'], open: true },
    ],
  },
  {
    // TDK pending: KARDELEN, KAR ÇİÇEĞİ, KAR DİKENİ, KAR HELVASI, KAR BAYKUŞU, KAR KUYUSU, KAR SAPANI, KAR ZİNCİRİ
    id: 2, root: 'KAR', words: [
      { word: 'KARTOPU', parts: ['TO', 'PU'] },
      { word: 'KARDELEN', parts: ['DE', 'LEN'] },
      { word: 'KARÇİÇEĞİ', parts: ['Çİ', 'ÇE', 'Ğİ'], open: true },
      { word: 'KARDİKENİ', parts: ['Dİ', 'KE', 'Nİ'], open: true },
      { word: 'KARHELVASI', parts: ['HEL', 'VA', 'SI'], open: true },
      { word: 'KARBAYKUŞU', parts: ['BAY', 'KU', 'ŞU'], open: true },
      { word: 'KARKUYUSU', parts: ['KU', 'YU', 'SU'], open: true },
      { word: 'KARSAPANI', parts: ['SA', 'PA', 'NI'], open: true },
      { word: 'KARZİNCİRİ', parts: ['ZİN', 'Cİ', 'Rİ'], open: true },
    ],
  },
  {
    // TDK pending: GÖZ BEBEĞİ, GÖZ KAPAĞI, GÖZ KÜRESİ, GÖZ RENGİ, GÖZ NURU, GÖZ KALEMİ, GÖZ BANYOSU, GÖZ ÇUKURU
    id: 3, root: 'GÖZ', words: [
      { word: 'GÖZYAŞI', parts: ['YA', 'ŞI'] },
      { word: 'GÖZBEBEĞİ', parts: ['BE', 'BE', 'Ğİ'], open: true },
      { word: 'GÖZKAPAĞI', parts: ['KA', 'PA', 'ĞI'], open: true },
      { word: 'GÖZKÜRESİ', parts: ['KÜ', 'RE', 'Sİ'], open: true },
      { word: 'GÖZRENGİ', parts: ['REN', 'Gİ'], open: true },
      { word: 'GÖZNURU', parts: ['NU', 'RU'], open: true },
      { word: 'GÖZKALEMİ', parts: ['KA', 'LE', 'Mİ'], open: true },
      { word: 'GÖZBANYOSU', parts: ['BAN', 'YO', 'SU'], open: true },
      { word: 'GÖZÇUKURU', parts: ['ÇU', 'KU', 'RU'], open: true },
    ],
  },
  {
    // TDK pending: EL ARABASI, EL AYNASI, EL ÇANTASI, EL HAVLUSU, EL YAZISI, EL KİTABI, EL SABUNU, EL FENERİ, EL BİLEĞİ
    id: 4, root: 'EL', words: [
      { word: 'ELDİVEN', parts: ['Dİ', 'VEN'] },
      { word: 'ELARABASI', parts: ['ARA', 'BA', 'SI'], open: true },
      { word: 'ELAYNASI', parts: ['AY', 'NA', 'SI'], open: true },
      { word: 'ELÇANTASI', parts: ['ÇAN', 'TA', 'SI'], open: true },
      { word: 'ELHAVLUSU', parts: ['HAV', 'LU', 'SU'], open: true },
      { word: 'ELYAZISI', parts: ['YA', 'ZI', 'SI'], open: true },
      { word: 'ELKİTABI', parts: ['Kİ', 'TA', 'BI'], open: true },
      { word: 'ELSABUNU', parts: ['SA', 'BU', 'NU'], open: true },
      { word: 'ELFENERİ', parts: ['FE', 'NE', 'Rİ'], open: true },
      { word: 'ELBİLEĞİ', parts: ['Bİ', 'LE', 'Ğİ'], open: true },
    ],
  },
  {
    // TDK pending: DENİZALTI, DENİZ YILDIZI, DENİZ ANASI, DENİZ AYGIRI, DENİZ KIZI, DENİZ FENERİ, DENİZ ASLANI, DENİZ İNEĞİ, DENİZ KÖPÜĞÜ
    id: 5, root: 'DENİZ', words: [
      { word: 'DENİZALTI', parts: ['AL', 'TI'] },
      { word: 'DENİZYILDIZI', parts: ['YIL', 'DI', 'ZI'], open: true },
      { word: 'DENİZANASI', parts: ['ANA', 'SI'], open: true },
      { word: 'DENİZAYGIRI', parts: ['AY', 'GI', 'RI'], open: true },
      { word: 'DENİZKIZI', parts: ['KI', 'ZI'], open: true },
      { word: 'DENİZFENERİ', parts: ['FE', 'NE', 'Rİ'], open: true },
      { word: 'DENİZASLANI', parts: ['AS', 'LA', 'NI'], open: true },
      { word: 'DENİZİNEĞİ', parts: ['İNE', 'Ğİ'], open: true },
      { word: 'DENİZKÖPÜĞÜ', parts: ['KÖ', 'PÜ', 'ĞÜ'], open: true },
    ],
  },
  {
    // TDK pending: GÖK TAŞI, GÖK BİLİMİ, GÖK CİSMİ
    id: 6, root: 'GÖK', words: [
      { word: 'GÖKYÜZÜ', parts: ['YÜ', 'ZÜ'] },
      { word: 'GÖKKUŞAĞI', parts: ['KU', 'ŞA', 'ĞI'] },
      { word: 'GÖKDELEN', parts: ['DE', 'LEN'] },
      { word: 'GÖKDOĞAN', parts: ['DO', 'ĞAN'] },
      { word: 'GÖKKUZGUN', parts: ['KUZ', 'GUN'] },
      { word: 'GÖKTAŞI', parts: ['TA', 'ŞI'], open: true },
      { word: 'GÖKBİLİMİ', parts: ['Bİ', 'Lİ', 'Mİ'], open: true },
      { word: 'GÖKCİSMİ', parts: ['CİS', 'Mİ'], open: true },
    ],
  },
  {
    // TDK pending: YER ÇEKİMİ, YER KABUĞU, YER BİLİMİ, YER FISTIĞI
    id: 7, root: 'YER', words: [
      { word: 'YERYÜZÜ', parts: ['YÜ', 'ZÜ'] },
      { word: 'YERKÜRE', parts: ['KÜ', 'RE'] },
      { word: 'YERÇEKİMİ', parts: ['ÇE', 'Kİ', 'Mİ'], open: true },
      { word: 'YERKABUĞU', parts: ['KA', 'BU', 'ĞU'], open: true },
      { word: 'YERBİLİMİ', parts: ['Bİ', 'Lİ', 'Mİ'], open: true },
      { word: 'YERFISTIĞI', parts: ['FIS', 'TI', 'ĞI'], open: true },
      { word: 'YERLEŞKE', parts: ['LEŞ', 'KE'] },
      { word: 'YERLEŞİM', parts: ['LE', 'ŞİM'] },
      { word: 'YERLEŞİK', parts: ['LE', 'ŞİK'] },
    ],
  },
  {
    // TDK pending: none; all targets have positive prior headword lookups.
    id: 8, root: 'KARA', words: [
      { word: 'KARABİBER', parts: ['Bİ', 'BER'] },
      { word: 'KARALAHANA', parts: ['LA', 'HA', 'NA'] },
      { word: 'KARASİNEK', parts: ['Sİ', 'NEK'] },
      { word: 'KARABUĞDAY', parts: ['BUĞ', 'DAY'] },
      { word: 'KARAKARGA', parts: ['KAR', 'GA'] },
      { word: 'KARABATAK', parts: ['BA', 'TAK'] },
      { word: 'KARATAVUK', parts: ['TA', 'VUK'] },
      { word: 'KARAYEMİŞ', parts: ['YE', 'MİŞ'] },
      { word: 'KARABALIK', parts: ['BA', 'LIK'] },
      { word: 'KARAKULAK', parts: ['KU', 'LAK'] },
    ],
  },
  {
    // TDK pending: none; all targets have positive prior headword lookups.
    id: 9, root: 'BAŞ', words: [
      { word: 'BAŞPARMAK', parts: ['PAR', 'MAK'] },
      { word: 'BAŞHEKİM', parts: ['HE', 'KİM'] },
      { word: 'BAŞYAPIT', parts: ['YA', 'PIT'] },
      { word: 'BAŞVURU', parts: ['VU', 'RU'] },
      { word: 'BAŞBAKAN', parts: ['BA', 'KAN'] },
      { word: 'BAŞÇAVUŞ', parts: ['ÇA', 'VUŞ'] },
      { word: 'BAŞKAHRAMAN', parts: ['KAH', 'RA', 'MAN'] },
      { word: 'BAŞLANGIÇ', parts: ['LAN', 'GIÇ'] },
      { word: 'BAŞÖĞRETMEN', parts: ['ÖĞ', 'RET', 'MEN'] },
      { word: 'BAŞMÜHENDİS', parts: ['MÜ', 'HEN', 'DİS'] },
    ],
  },
  {
    // TDK pending: KUŞBURNU, KUŞYEMİ, KUŞÜZÜMÜ, KUŞBAŞI, KUŞKONMAZ, KUŞDİLİ, KUŞ BAKIŞI, KUŞ CENNETİ, KUŞ KAFESİ
    id: 10, root: 'KUŞ', words: [
      { word: 'KUŞBURNU', parts: ['BUR', 'NU'] },
      { word: 'KUŞYEMİ', parts: ['YE', 'Mİ'] },
      { word: 'KUŞÜZÜMÜ', parts: ['ÜZÜ', 'MÜ'] },
      { word: 'KUŞBAŞI', parts: ['BA', 'ŞI'] },
      { word: 'KUŞKONMAZ', parts: ['KON', 'MAZ'] },
      { word: 'KUŞDİLİ', parts: ['Dİ', 'Lİ'] },
      { word: 'KUŞBAKIŞI', parts: ['BA', 'KI', 'ŞI'], open: true },
      { word: 'KUŞCENNETİ', parts: ['CEN', 'NE', 'Tİ'], open: true },
      { word: 'KUŞKAFESİ', parts: ['KA', 'FE', 'Sİ'], open: true },
    ],
  },
  {
    // TDK pending: AĞAÇKAKAN, AĞAÇ KAVUNU, AĞAÇ ÇİLEĞİ, AĞAÇ SAKIZI, AĞAÇ MANTARI, AĞAÇ SERÇESİ, AĞAÇ SANSARI, AĞAÇ KURDU
    id: 11, root: 'AĞAÇ', words: [
      { word: 'AĞAÇKAKAN', parts: ['KA', 'KAN'] },
      { word: 'AĞAÇKAVUNU', parts: ['KA', 'VU', 'NU'], open: true },
      { word: 'AĞAÇÇİLEĞİ', parts: ['Çİ', 'LE', 'Ğİ'], open: true },
      { word: 'AĞAÇSAKIZI', parts: ['SA', 'KI', 'ZI'], open: true },
      { word: 'AĞAÇMANTARI', parts: ['MAN', 'TA', 'RI'], open: true },
      { word: 'AĞAÇSERÇESİ', parts: ['SER', 'ÇE', 'Sİ'], open: true },
      { word: 'AĞAÇSANSARI', parts: ['SAN', 'SA', 'RI'], open: true },
      { word: 'AĞAÇKURDU', parts: ['KUR', 'DU'], open: true },
    ],
  },
  {
    // TDK pending: TAŞ OCAĞI, TAŞ KÖMÜRÜ, TAŞ DEVRİ, TAŞ DUVAR, TAŞ BALIĞI, TAŞ MANTARI, TAŞ BASKI, TAŞ BEBEK
    id: 12, root: 'TAŞ', words: [
      { word: 'TAŞOCAĞI', parts: ['OCA', 'ĞI'], open: true },
      { word: 'TAŞKÖMÜRÜ', parts: ['KÖ', 'MÜ', 'RÜ'], open: true },
      { word: 'TAŞDEVRİ', parts: ['DEV', 'Rİ'], open: true },
      { word: 'TAŞDUVAR', parts: ['DU', 'VAR'], open: true },
      { word: 'TAŞBALIĞI', parts: ['BA', 'LI', 'ĞI'], open: true },
      { word: 'TAŞMANTARI', parts: ['MAN', 'TA', 'RI'], open: true },
      { word: 'TAŞBASKI', parts: ['BAS', 'KI'], open: true },
      { word: 'TAŞBEBEK', parts: ['BE', 'BEK'], open: true },
    ],
  },
  {
    // TDK: all targets listed in the root entry; individual/prefix lookups pending in the external verifier.
    id: 13, root: 'DEMİR', words: [
      { word: 'DEMİRYOLU', parts: ['YO', 'LU'], open: true },
      { word: 'DEMİRPARA', parts: ['PA', 'RA'], open: true },
      { word: 'DEMİRKAPI', parts: ['KA', 'PI'], open: true },
      { word: 'DEMİRBORU', parts: ['BO', 'RU'], open: true },
      { word: 'DEMİRBİLEK', parts: ['Bİ', 'LEK'], open: true },
      { word: 'DEMİRAĞACI', parts: ['AĞA', 'CI'], open: true },
      { word: 'DEMİRDİKENİ', parts: ['Dİ', 'KE', 'Nİ'], open: true },
      { word: 'DEMİRLEBLEBİ', parts: ['LEB', 'LE', 'Bİ'], open: true },
      { word: 'DEMİRPASI', parts: ['PA', 'SI'], open: true },
      { word: 'DEMİRRENGİ', parts: ['REN', 'Gİ'], open: true },
    ],
  },
  {
    // TDK: all targets listed in the root entry; individual/prefix lookups pending in the external verifier.
    id: 14, root: 'YOL', words: [
      { word: 'YOLAĞZI', parts: ['AĞ', 'ZI'], open: true },
      { word: 'YOLAYRIMI', parts: ['AY', 'RI', 'MI'], open: true },
      { word: 'YOLAZIĞI', parts: ['AZI', 'ĞI'], open: true },
      { word: 'YOLBOYU', parts: ['BO', 'YU'], open: true },
      { word: 'YOLHALISI', parts: ['HA', 'LI', 'SI'], open: true },
      { word: 'YOLKİLİMİ', parts: ['Kİ', 'Lİ', 'Mİ'], open: true },
      { word: 'YOLPARASI', parts: ['PA', 'RA', 'SI'], open: true },
      { word: 'YOLYORDAM', parts: ['YOR', 'DAM'], open: true },
      { word: 'YOLYORGUNU', parts: ['YOR', 'GU', 'NU'], open: true },
      { word: 'YOLİŞARETİ', parts: ['İŞA', 'RE', 'Tİ'], open: true },
    ],
  },
  {
    // TDK: all targets listed in the root entry; individual/prefix lookups pending in the external verifier.
    id: 15, root: 'SES', words: [
      { word: 'SESALETİ', parts: ['ALE', 'Tİ'], open: true },
      { word: 'SESAYGITI', parts: ['AY', 'GI', 'TI'], open: true },
      { word: 'SESBİLGİSİ', parts: ['BİL', 'Gİ', 'Sİ'], open: true },
      { word: 'SESBİLİMİ', parts: ['Bİ', 'Lİ', 'Mİ'], open: true },
      { word: 'SESBİRİMİ', parts: ['Bİ', 'Rİ', 'Mİ'], open: true },
      { word: 'SESDUVARI', parts: ['DU', 'VA', 'RI'], open: true },
      { word: 'SESKUŞAĞI', parts: ['KU', 'ŞA', 'ĞI'], open: true },
      { word: 'SESPERDESİ', parts: ['PER', 'DE', 'Sİ'], open: true },
      { word: 'SESUYUMU', parts: ['UYU', 'MU'], open: true },
      { word: 'SESYOLU', parts: ['YO', 'LU'], open: true },
      { word: 'SESYAZAR', parts: ['YA', 'ZAR'] },
      { word: 'SESYAYAR', parts: ['YA', 'YAR'] },
    ],
  },
  {
    // TDK: all targets listed in the root entry; individual/prefix lookups pending in the external verifier.
    id: 16, root: 'DİL', words: [
      { word: 'DİLBALIĞI', parts: ['BA', 'LI', 'ĞI'], open: true },
      { word: 'DİLBİLGİSİ', parts: ['BİL', 'Gİ', 'Sİ'], open: true },
      { word: 'DİLBİLİMİ', parts: ['Bİ', 'Lİ', 'Mİ'], open: true },
      { word: 'DİLBİRLİĞİ', parts: ['BİR', 'Lİ', 'Ğİ'], open: true },
      { word: 'DİLCAMBAZI', parts: ['CAM', 'BA', 'ZI'], open: true },
      { word: 'DİLADASI', parts: ['ADA', 'SI'], open: true },
      { word: 'DİLATLASI', parts: ['AT', 'LA', 'SI'], open: true },
      { word: 'DİLAVCISI', parts: ['AV', 'CI', 'SI'], open: true },
      { word: 'DİLŞAKASI', parts: ['ŞA', 'KA', 'SI'], open: true },
      { word: 'DİLSEVER', parts: ['SE', 'VER'] },
    ],
  },
  {
    // TDK: all targets listed in the root entry; individual/prefix lookups pending in the external verifier.
    id: 17, root: 'ATEŞ', words: [
      { word: 'ATEŞBÖCEĞİ', parts: ['BÖ', 'CE', 'Ğİ'], open: true },
      { word: 'ATEŞBALIĞI', parts: ['BA', 'LI', 'ĞI'], open: true },
      { word: 'ATEŞÇİÇEĞİ', parts: ['Çİ', 'ÇE', 'Ğİ'], open: true },
      { word: 'ATEŞTUĞLASI', parts: ['TUĞ', 'LA', 'SI'], open: true },
      { word: 'ATEŞKÜRE', parts: ['KÜ', 'RE'], open: true },
      { word: 'ATEŞÖLÇER', parts: ['ÖL', 'ÇER'] },
      { word: 'ATEŞPARÇASI', parts: ['PAR', 'ÇA', 'SI'], open: true },
      { word: 'ATEŞÇEMBERİ', parts: ['ÇEM', 'BE', 'Rİ'], open: true },
    ],
  },
  {
    // TDK: all targets listed in the root entry; individual/prefix lookups pending in the external verifier.
    id: 18, root: 'AY', words: [
      { word: 'AYDEDE', parts: ['DE', 'DE'] },
      { word: 'AYÇİÇEĞİ', parts: ['Çİ', 'ÇE', 'Ğİ'] },
      { word: 'AYBALIĞI', parts: ['BA', 'LI', 'ĞI'], open: true },
      { word: 'AYÇÖREĞİ', parts: ['ÇÖ', 'RE', 'Ğİ'], open: true },
      { word: 'AYDÖNÜMÜ', parts: ['DÖ', 'NÜ', 'MÜ'], open: true },
      { word: 'AYIŞIĞI', parts: ['IŞ', 'IĞI'], open: true },
      { word: 'AYPARÇASI', parts: ['PAR', 'ÇA', 'SI'], open: true },
      { word: 'AYTAKVİMİ', parts: ['TAK', 'Vİ', 'Mİ'], open: true },
      { word: 'AYYILI', parts: ['YI', 'LI'], open: true },
      { word: 'AYMODÜLÜ', parts: ['MO', 'DÜ', 'LÜ'], open: true },
    ],
  },
  {
    // TDK: all targets listed in the root entry; individual/prefix lookups pending in the external verifier.
    id: 19, root: 'GÜN', words: [
      { word: 'GÜNAYDIN', parts: ['AY', 'DIN'] },
      { word: 'GÜNBEGÜN', parts: ['BE', 'GÜN'] },
      { word: 'GÜNDÖNDÜ', parts: ['DÖN', 'DÜ'] },
      { word: 'GÜNBATIMI', parts: ['BA', 'TI', 'MI'], open: true },
      { word: 'GÜNDÖNÜMÜ', parts: ['DÖ', 'NÜ', 'MÜ'], open: true },
      { word: 'GÜNIŞIĞI', parts: ['IŞ', 'IĞI'], open: true },
      { word: 'GÜNORTASI', parts: ['OR', 'TA', 'SI'], open: true },
      { word: 'GÜNBOYU', parts: ['BO', 'YU'], open: true },
      { word: 'GÜNBALIĞI', parts: ['BA', 'LI', 'ĞI'], open: true },
      { word: 'GÜNGÜLÜ', parts: ['GÜ', 'LÜ'], open: true },
    ],
  },
];
