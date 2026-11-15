// Plain-language farmer card strings in Hindi and Punjabi. Keys follow the
// contract's status and next-action codes so the card always reflects the
// server's recommendation or Meena's recorded action.
import type { ActionValue, Language, Status } from "../api/types";

interface FarmerStrings {
  languageName: string;
  cardTitle: string;
  claim: string;
  season: string;
  claimedMethod: string;
  methods: Record<string, string>;
  acres: (n: number) => string;
  statusHeading: string;
  officerOverride: string;
  officerNextHeading: string;
  status: Record<Status, { title: string; body: string }>;
  nextStepHeading: string;
  nextStep: Record<ActionValue, string>;
  officerRecorded: string;
  officerPending: string;
  fieldQuestionHeading: string;
  fieldQuestion: string;
  rightsHeading: string;
  rights: string;
  formHeading: string;
  formIntro: string;
  reasonLabel: string;
  reasonPlaceholder: string;
  presets: string[];
  submit: string;
  submitting: string;
  required: string;
  receiptHeading: string;
  receiptId: string;
  receiptTime: string;
  receiptLanguage: string;
  receiptSimulated: string;
  previous: string;
  simulatedNote: string;
}

export const FARMER_TEXT: Record<Language, FarmerStrings> = {
  hi: {
    languageName: "हिन्दी",
    cardTitle: "आपके धान दावे की स्थिति",
    claim: "दावा संख्या",
    season: "मौसम",
    claimedMethod: "बताया गया बुवाई तरीका",
    methods: { DSR: "धान की सीधी बुवाई (DSR)", PTR: "पौध रोपाई (PTR)" },
    acres: (n) => `${n} एकड़`,
    statusHeading: "उपग्रह जाँच का परिणाम",
    officerOverride: "अधिकारी ने सिस्टम की सलाह से अलग अगला कदम चुना है। नीचे लिखा अधिकारी का फ़ैसला लागू है।",
    officerNextHeading: "अधिकारी का फ़ैसला · अगला कदम",
    status: {
      ready_for_desk_review: {
        title: "कार्यालय में जाँच के लिए तैयार",
        body: "उपग्रह के आँकड़े आपके बताए तरीके से मेल खाते हैं। अधिकारी आपके दस्तावेज़ कार्यालय में देखेंगे।",
      },
      field_check_recommended: {
        title: "खेत पर जाँच की सिफ़ारिश",
        body: "उपग्रह के आँकड़ों से बुवाई का तरीका साफ़ नहीं है। एक टीम आपके खेत पर आकर पुष्टि कर सकती है।",
      },
      insufficient_evidence: {
        title: "पर्याप्त प्रमाण नहीं",
        body: "उपग्रह से आपके खेत के पर्याप्त साफ़ आँकड़े नहीं मिले। इससे आपका दावा ग़लत साबित नहीं होता।",
      },
    },
    nextStepHeading: "अगला कदम",
    nextStep: {
      desk_review: "अधिकारी आपके दस्तावेज़ कार्यालय में देखेंगे। अभी आपको कुछ करने की ज़रूरत नहीं है।",
      request_field_visit: "एक टीम आपके खेत पर आ सकती है। बुवाई की तारीख़ और बीज या रोपाई के रिकॉर्ड तैयार रखें।",
      request_boundary_correction: "आपके खेत की सीमा ठीक नहीं दिख रही है। कृपया खेत की सही सीमा भेजें।",
      request_records: "कृपया बुवाई की तारीख़ वाले रिकॉर्ड जमा करें, जैसे बीज की रसीद या मशीन का बिल।",
    },
    officerRecorded: "अधिकारी द्वारा दर्ज कार्रवाई",
    officerPending: "अधिकारी ने अभी कोई कार्रवाई दर्ज नहीं की है। यह सिस्टम की सिफ़ारिश है।",
    fieldQuestionHeading: "टीम क्या पूछेगी",
    fieldQuestion: "क्या इस खेत में धान की सीधी बुवाई हुई थी, या पौध की रोपाई की गई थी? बुवाई या रोपाई की तारीख़ भी बताएँ।",
    rightsHeading: "आपका अधिकार",
    rights: "अंतिम फ़ैसला अधिकारी करते हैं, कंप्यूटर नहीं। अगर कोई जानकारी ग़लत है तो आप सुधार का अनुरोध कर सकते हैं।",
    formHeading: "सुधार का अनुरोध करें",
    formIntro: "बताएँ कि क्या ग़लत है या आपके पास कौन-से रिकॉर्ड हैं।",
    reasonLabel: "आपका कारण",
    reasonPlaceholder: "उदाहरण: मेरे पास बीज की रसीद है।",
    presets: [
      "मेरे पास बुवाई के रिकॉर्ड हैं।",
      "मेरे खेत की सीमा ग़लत दिखाई गई है।",
      "मैंने सीधी बुवाई की थी, कृपया दोबारा जाँचें।",
    ],
    submit: "अनुरोध भेजें",
    submitting: "भेजा जा रहा है…",
    required: "कृपया कारण लिखें।",
    receiptHeading: "आपका अनुरोध दर्ज हो गया",
    receiptId: "रसीद संख्या",
    receiptTime: "समय",
    receiptLanguage: "भाषा",
    receiptSimulated: "यह डेमो के लिए नकली (सिम्युलेटेड) अनुरोध है।",
    previous: "पिछले अनुरोध",
    simulatedNote: "डेमो: किसान और दावा काल्पनिक हैं।",
  },
  pa: {
    languageName: "ਪੰਜਾਬੀ",
    cardTitle: "ਤੁਹਾਡੇ ਝੋਨੇ ਦੇ ਦਾਅਵੇ ਦੀ ਸਥਿਤੀ",
    claim: "ਦਾਅਵਾ ਨੰਬਰ",
    season: "ਸੀਜ਼ਨ",
    claimedMethod: "ਦੱਸਿਆ ਬਿਜਾਈ ਦਾ ਤਰੀਕਾ",
    methods: { DSR: "ਝੋਨੇ ਦੀ ਸਿੱਧੀ ਬਿਜਾਈ (DSR)", PTR: "ਪਨੀਰੀ ਦੀ ਲੁਆਈ (PTR)" },
    acres: (n) => `${n} ਏਕੜ`,
    statusHeading: "ਸੈਟੇਲਾਈਟ ਜਾਂਚ ਦਾ ਨਤੀਜਾ",
    officerOverride: "ਅਧਿਕਾਰੀ ਨੇ ਸਿਸਟਮ ਦੀ ਸਲਾਹ ਤੋਂ ਵੱਖਰਾ ਅਗਲਾ ਕਦਮ ਚੁਣਿਆ ਹੈ। ਹੇਠਾਂ ਲਿਖਿਆ ਅਧਿਕਾਰੀ ਦਾ ਫ਼ੈਸਲਾ ਲਾਗੂ ਹੈ।",
    officerNextHeading: "ਅਧਿਕਾਰੀ ਦਾ ਫ਼ੈਸਲਾ · ਅਗਲਾ ਕਦਮ",
    status: {
      ready_for_desk_review: {
        title: "ਦਫ਼ਤਰੀ ਜਾਂਚ ਲਈ ਤਿਆਰ",
        body: "ਸੈਟੇਲਾਈਟ ਅੰਕੜੇ ਤੁਹਾਡੇ ਦੱਸੇ ਤਰੀਕੇ ਨਾਲ ਮੇਲ ਖਾਂਦੇ ਹਨ। ਅਧਿਕਾਰੀ ਤੁਹਾਡੇ ਦਸਤਾਵੇਜ਼ ਦਫ਼ਤਰ ਵਿੱਚ ਦੇਖਣਗੇ।",
      },
      field_check_recommended: {
        title: "ਖੇਤ ਵਿੱਚ ਜਾਂਚ ਦੀ ਸਿਫ਼ਾਰਸ਼",
        body: "ਸੈਟੇਲਾਈਟ ਅੰਕੜਿਆਂ ਤੋਂ ਬਿਜਾਈ ਦਾ ਤਰੀਕਾ ਸਪਸ਼ਟ ਨਹੀਂ ਹੈ। ਇੱਕ ਟੀਮ ਤੁਹਾਡੇ ਖੇਤ ਵਿੱਚ ਆ ਕੇ ਪੁਸ਼ਟੀ ਕਰ ਸਕਦੀ ਹੈ।",
      },
      insufficient_evidence: {
        title: "ਲੋੜੀਂਦਾ ਸਬੂਤ ਨਹੀਂ",
        body: "ਸੈਟੇਲਾਈਟ ਤੋਂ ਤੁਹਾਡੇ ਖੇਤ ਦੇ ਲੋੜੀਂਦੇ ਸਾਫ਼ ਅੰਕੜੇ ਨਹੀਂ ਮਿਲੇ। ਇਸ ਨਾਲ ਤੁਹਾਡਾ ਦਾਅਵਾ ਗ਼ਲਤ ਸਾਬਤ ਨਹੀਂ ਹੁੰਦਾ।",
      },
    },
    nextStepHeading: "ਅਗਲਾ ਕਦਮ",
    nextStep: {
      desk_review: "ਅਧਿਕਾਰੀ ਤੁਹਾਡੇ ਦਸਤਾਵੇਜ਼ ਦਫ਼ਤਰ ਵਿੱਚ ਦੇਖਣਗੇ। ਹੁਣ ਤੁਹਾਨੂੰ ਕੁਝ ਕਰਨ ਦੀ ਲੋੜ ਨਹੀਂ।",
      request_field_visit: "ਇੱਕ ਟੀਮ ਤੁਹਾਡੇ ਖੇਤ ਵਿੱਚ ਆ ਸਕਦੀ ਹੈ। ਬਿਜਾਈ ਦੀ ਤਾਰੀਖ਼ ਅਤੇ ਬੀਜ ਜਾਂ ਲੁਆਈ ਦੇ ਰਿਕਾਰਡ ਤਿਆਰ ਰੱਖੋ।",
      request_boundary_correction: "ਤੁਹਾਡੇ ਖੇਤ ਦੀ ਹੱਦ ਠੀਕ ਨਹੀਂ ਲੱਗ ਰਹੀ। ਕਿਰਪਾ ਕਰਕੇ ਖੇਤ ਦੀ ਸਹੀ ਹੱਦ ਭੇਜੋ।",
      request_records: "ਕਿਰਪਾ ਕਰਕੇ ਬਿਜਾਈ ਦੀ ਤਾਰੀਖ਼ ਵਾਲੇ ਰਿਕਾਰਡ ਜਮ੍ਹਾਂ ਕਰੋ, ਜਿਵੇਂ ਬੀਜ ਦੀ ਰਸੀਦ ਜਾਂ ਮਸ਼ੀਨ ਦਾ ਬਿੱਲ।",
    },
    officerRecorded: "ਅਧਿਕਾਰੀ ਵੱਲੋਂ ਦਰਜ ਕਾਰਵਾਈ",
    officerPending: "ਅਧਿਕਾਰੀ ਨੇ ਅਜੇ ਕੋਈ ਕਾਰਵਾਈ ਦਰਜ ਨਹੀਂ ਕੀਤੀ। ਇਹ ਸਿਸਟਮ ਦੀ ਸਿਫ਼ਾਰਸ਼ ਹੈ।",
    fieldQuestionHeading: "ਟੀਮ ਕੀ ਪੁੱਛੇਗੀ",
    fieldQuestion: "ਕੀ ਇਸ ਖੇਤ ਵਿੱਚ ਝੋਨੇ ਦੀ ਸਿੱਧੀ ਬਿਜਾਈ ਹੋਈ ਸੀ, ਜਾਂ ਪਨੀਰੀ ਲਾਈ ਗਈ ਸੀ? ਬਿਜਾਈ ਜਾਂ ਲੁਆਈ ਦੀ ਤਾਰੀਖ਼ ਵੀ ਦੱਸੋ।",
    rightsHeading: "ਤੁਹਾਡਾ ਹੱਕ",
    rights: "ਅੰਤਿਮ ਫ਼ੈਸਲਾ ਅਧਿਕਾਰੀ ਕਰਦੇ ਹਨ, ਕੰਪਿਊਟਰ ਨਹੀਂ। ਜੇ ਕੋਈ ਜਾਣਕਾਰੀ ਗ਼ਲਤ ਹੈ ਤਾਂ ਤੁਸੀਂ ਸੁਧਾਰ ਦੀ ਬੇਨਤੀ ਕਰ ਸਕਦੇ ਹੋ।",
    formHeading: "ਸੁਧਾਰ ਦੀ ਬੇਨਤੀ ਕਰੋ",
    formIntro: "ਦੱਸੋ ਕਿ ਕੀ ਗ਼ਲਤ ਹੈ ਜਾਂ ਤੁਹਾਡੇ ਕੋਲ ਕਿਹੜੇ ਰਿਕਾਰਡ ਹਨ।",
    reasonLabel: "ਤੁਹਾਡਾ ਕਾਰਨ",
    reasonPlaceholder: "ਉਦਾਹਰਨ: ਮੇਰੇ ਕੋਲ ਬੀਜ ਦੀ ਰਸੀਦ ਹੈ।",
    presets: [
      "ਮੇਰੇ ਕੋਲ ਬਿਜਾਈ ਦੇ ਰਿਕਾਰਡ ਹਨ।",
      "ਮੇਰੇ ਖੇਤ ਦੀ ਹੱਦ ਗ਼ਲਤ ਦਿਖਾਈ ਗਈ ਹੈ।",
      "ਮੈਂ ਸਿੱਧੀ ਬਿਜਾਈ ਕੀਤੀ ਸੀ, ਕਿਰਪਾ ਕਰਕੇ ਦੁਬਾਰਾ ਜਾਂਚ ਕਰੋ।",
    ],
    submit: "ਬੇਨਤੀ ਭੇਜੋ",
    submitting: "ਭੇਜੀ ਜਾ ਰਹੀ ਹੈ…",
    required: "ਕਿਰਪਾ ਕਰਕੇ ਕਾਰਨ ਲਿਖੋ।",
    receiptHeading: "ਤੁਹਾਡੀ ਬੇਨਤੀ ਦਰਜ ਹੋ ਗਈ",
    receiptId: "ਰਸੀਦ ਨੰਬਰ",
    receiptTime: "ਸਮਾਂ",
    receiptLanguage: "ਭਾਸ਼ਾ",
    receiptSimulated: "ਇਹ ਡੈਮੋ ਲਈ ਨਕਲੀ (ਸਿਮੂਲੇਟਡ) ਬੇਨਤੀ ਹੈ।",
    previous: "ਪਿਛਲੀਆਂ ਬੇਨਤੀਆਂ",
    simulatedNote: "ਡੈਮੋ: ਕਿਸਾਨ ਅਤੇ ਦਾਅਵਾ ਕਾਲਪਨਿਕ ਹਨ।",
  },
};

export const LANGUAGE_NAME: Record<Language, string> = { hi: "हिन्दी", pa: "ਪੰਜਾਬੀ" };
