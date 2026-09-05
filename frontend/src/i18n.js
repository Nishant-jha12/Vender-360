import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  en: {
    translation: {
      dashboard: {
        title: "Store Dashboard",
        sales_today: "Today's Sales",
        health_score: "Health Score",
        profit_margin: "Profit Margin",
        alerts: "Alerts",
        quick_actions: "Quick Actions",
        ai_suggestions: "AI Suggestions",
        voice_log: "Voice Log",
        scan: "Scan",
        deliveries: "Deliveries",
        forecast: "Forecast",
        heatmap: "Heatmap",
        khata: "Khata"
      },
      inventory: {
        title: "Inventory",
        subtitle: "Real-time stock levels",
        export_pdf: "Export PDF",
        export_csv: "Export CSV",
        item: "Item",
        qty: "Qty",
        price: "Price",
        margin: "Margin",
        status: "Status"
      },
      khata: {
        title: "Digital Khata",
        subtitle: "Customer credit & udhaar ledger",
        total_credit: "Total Pending Credit",
        active_borrowers: "Customers with Pending Balance",
        add_customer: "Add Customer",
        record_payment: "Record Payment",
        give_credit: "Give Credit",
        balance: "Balance",
        phone: "Phone",
        name: "Customer Name",
        search: "Search customer by name or phone...",
        history: "History",
        settled: "Settled (No Due)",
        no_customers: "No customers yet."
      },
      account: {
        title: "My Account",
        language: "Language",
        logout: "Log Out"
      },
      nav: {
        home: "Home",
        billing: "Billing",
        log: "Log",
        stock: "Stock",
        khata: "Khata",
        forecast: "Forecast",
        score: "Score"
      }
    }
  },
  hi: {
    translation: {
      dashboard: {
        title: "स्टोर डैशबोर्ड",
        sales_today: "आज की बिक्री",
        health_score: "हेल्थ स्कोर",
        profit_margin: "लाभ मार्जिन",
        alerts: "अलर्ट",
        quick_actions: "त्वरित कार्रवाई",
        ai_suggestions: "AI सुझाव",
        voice_log: "वॉयस लॉग",
        scan: "स्कैन",
        deliveries: "डिलीवरी",
        forecast: "अनुमान",
        heatmap: "हीटमैप",
        khata: "खाता"
      },
      inventory: {
        title: "इन्वेंटरी",
        subtitle: "रीयल-टाइम स्टॉक",
        export_pdf: "PDF डाउनलोड",
        export_csv: "CSV डाउनलोड",
        item: "सामान",
        qty: "मात्रा",
        price: "कीमत",
        margin: "मार्जिन",
        status: "स्थिति"
      },
      khata: {
        title: "डिजिटल खाता",
        subtitle: "ग्राहक उधारी बहीखाता",
        total_credit: "कुल बकाया उधारी",
        active_borrowers: "बकाया वाले ग्राहक",
        add_customer: "ग्राहक जोड़ें",
        record_payment: "जमा दर्ज करें",
        give_credit: "उधार दें",
        balance: "बकाया",
        phone: "फोन नंबर",
        name: "ग्राहक का नाम",
        search: "नाम या फोन से खोजें...",
        history: "इतिहास",
        settled: "चुक्ता (शून्य बकाया)",
        no_customers: "कोई ग्राहक नहीं मिला।"
      },
      account: {
        title: "मेरा खाता",
        language: "भाषा",
        logout: "लॉग आउट करें"
      },
      nav: {
        home: "होम",
        billing: "बिलिंग",
        log: "लॉग",
        stock: "स्टॉक",
        khata: "खाता",
        forecast: "अनुमान",
        score: "स्कोर"
      }
    }
  },
  mr: {
    translation: {
      dashboard: {
        title: "स्टोअर डॅशबोर्ड",
        sales_today: "आजची विक्री",
        health_score: "हेल्थ स्कोर",
        profit_margin: "नफा मार्जिन",
        alerts: "अलर्ट",
        quick_actions: "त्वरित कृती",
        ai_suggestions: "AI सूचना",
        voice_log: "व्हॉइस लॉग",
        scan: "स्कॅन",
        deliveries: "डिलिव्हरी",
        forecast: "अंदाज",
        heatmap: "हीटमॅप",
        khata: "खाते"
      },
      inventory: {
        title: "इन्व्हेंटरी",
        subtitle: "रिअल-टाइम स्टॉक",
        export_pdf: "PDF डाउनलोड",
        export_csv: "CSV डाउनलोड",
        item: "वस्तू",
        qty: "प्रमाण",
        price: "किंमत",
        margin: "मार्जिन",
        status: "स्थिती"
      },
      khata: {
        title: "डिजिटल खाते",
        subtitle: "ग्राहक उधारी खातेवही",
        total_credit: "एकूण बाकी उधारी",
        active_borrowers: "उधारी बाकी असणारे ग्राहक",
        add_customer: "ग्राहक जोडा",
        record_payment: "जमा नोंदवा",
        give_credit: "उधार द्या",
        balance: "बाकी",
        phone: "फोन नंबर",
        name: "ग्राहकाचे नाव",
        search: "नाव किंवा फोनने शोधा...",
        history: "इतिहास",
        settled: "पूर्ण (बाकी नाही)",
        no_customers: "ग्राहक सापडले नाहीत."
      },
      account: {
        title: "माझे खाते",
        language: "भाषा",
        logout: "लॉग आउट करा"
      },
      nav: {
        home: "होम",
        log: "लॉग",
        stock: "स्टॉक",
        khata: "खाते",
        forecast: "अंदाज",
        score: "स्कोर"
      }
    }
  }
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: localStorage.getItem('vendor_lang') || 'en',
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
