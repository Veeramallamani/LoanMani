/**
 * LoanChatbot - Intelligent Loan Default Analytics & Prediction AI Engine
 * Supports OpenRouter LLM integration (via Flask backend or direct API)
 * with an offline Data-Grounded Local Analytics & Machine Learning Engine.
 * Enforces Strict Domain Scope & Guardrails to prevent off-topic general chat.
 */

class LoanChatbot {
  constructor() {
    this.useLLM = localStorage.getItem('openrouter_use_llm') !== 'false';
    this.apiKey = localStorage.getItem('openrouter_api_key') || '';
    this.model = localStorage.getItem('openrouter_model') || 'z-ai/glm-5.2:free';
    this.language = localStorage.getItem('loan_chat_language') || 'English';
    this.chatHistory = [];

    // Attempt to auto-fetch backend default API key if missing locally
    this.initBackendSettings();
  }

  setLanguage(lang) {
    this.language = lang || 'English';
    localStorage.setItem('loan_chat_language', this.language);
  }

  async initBackendSettings() {
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        const data = await res.json();
        if (!this.apiKey && data.default_api_key) {
          this.apiKey = data.default_api_key;
        }
        if (data.default_model && !localStorage.getItem('openrouter_model')) {
          this.model = data.default_model;
        }
      }
    } catch (e) {
      console.log('Backend health check offline or running standalone client mode.', e);
    }
  }

  updateSettings(apiKey, model, useLLM, language) {
    this.apiKey = apiKey.trim();
    this.model = model.trim() || 'z-ai/glm-5.2:free';
    this.useLLM = Boolean(useLLM);
    if (language) {
      this.language = language;
      localStorage.setItem('loan_chat_language', this.language);
    }

    localStorage.setItem('openrouter_api_key', this.apiKey);
    localStorage.setItem('openrouter_model', this.model);
    localStorage.setItem('openrouter_use_llm', this.useLLM);
  }

  async testConnection(apiKey, model) {
    const targetKey = apiKey || this.apiKey;
    const targetModel = model || this.model;

    if (!targetKey) {
      console.log('No local OpenRouter API Key provided, relying on backend default.');
    }

    try {
      // Try backend endpoint first
      const res = await fetch('/api/test-openrouter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: targetKey, model: targetModel })
      });

      if (res.ok) {
        return await res.json();
      }

      const errData = await res.json().catch(() => ({}));
      const msg = errData.message || `HTTP ${res.status}`;

      // Fallback to direct client ping if backend API route is not available
      return await this.testOpenRouterDirect(targetKey, targetModel);
    } catch (e) {
      return await this.testOpenRouterDirect(targetKey, targetModel);
    }
  }

  async testOpenRouterDirect(apiKey, model) {
    const startTime = Date.now();
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: 'user', content: 'Ping test' }],
          max_tokens: 5
        })
      });

      const elapsed = Date.now() - startTime;
      if (res.ok) {
        return {
          success: true,
          latencyMs: elapsed,
          message: `Direct OpenRouter API connection verified (${model}, ${elapsed}ms)`
        };
      }
      const data = await res.json();
      return {
        success: false,
        message: data.error?.message || `API Error (${res.status})`
      };
    } catch (err) {
      return {
        success: false,
        message: `Network Error: ${err.message}`
      };
    }
  }

  async processQueryAsync(userQuery) {
    const query = (userQuery || '').trim();
    if (!query) {
      return { text: 'Please enter a valid query.', source: 'local' };
    }

    // Check for obvious off-topic queries locally if offline
    const qLower = query.toLowerCase();
    if (!this.isLoanDomainQuery(qLower, query)) {
      if (!this.useLLM) {
        return this.handleOutOfDomainQuery();
      }
    }

    // Try LLM if enabled (Flask backend has configured server key)
    if (this.useLLM) {
      try {
        const llmResult = await this.queryLLMBackend(query);
        if (llmResult && llmResult.text) {
          this.chatHistory.push({ role: 'user', content: query });
          this.chatHistory.push({ role: 'assistant', content: llmResult.text });
          return llmResult;
        }
      } catch (err) {
        console.warn('OpenRouter LLM call failed, falling back to Local Rule Engine:', err);
        const fallback = this.processLocalQuery(query);
        fallback.warning = `OpenRouter LLM Notice: ${err.message}. Showing verified results from 2026 Local Underwriting Engine.`;
        return fallback;
      }
    }

    // Default to Local Analytics Engine
    return this.processLocalQuery(query);
  }

  async queryLLMBackend(userQuery) {
    // 1. Try Flask Backend API endpoint
    try {
      const backendRes = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: userQuery,
          apiKey: this.apiKey || undefined,
          model: this.model,
          language: this.language,
          chatHistory: this.chatHistory.slice(-8)
        })
      });

      if (backendRes.ok) {
        const data = await backendRes.json();
        return {
          text: data.text,
          source: 'openrouter',
          model: data.model || this.model,
          language: this.language,
          quickActions: this.generateContextualQuickActions(userQuery)
        };
      } else {
        const errData = await backendRes.json().catch(() => ({}));
        const errMsg = errData.error || errData.message || `Server HTTP ${backendRes.status}`;
        if (!this.apiKey) {
          throw new Error(errMsg);
        }
      }
    } catch (e) {
      if (!this.apiKey) {
        throw e;
      }
      console.log('Backend API route unavailable, trying direct OpenRouter endpoint...', e);
    }

    // 2. Direct OpenRouter API call as fallback
    let systemPrompt = "";
    const langLower = (this.language || 'English').toLowerCase();
    
    if (langLower === 'telugu' || langLower === 'te') {
      systemPrompt = `You are LoanMani, a concise and smart Loan Prediction Assistant referencing the 2026 Indian Bank Underwriting Framework (SBI, HDFC, ICICI, Axis, BoB, PNB, Cosmos, Saraswat).

### STRICT LANGUAGE & CONCISENESS DIRECTIVE (MANDATORY):
- YOU MUST ANSWER 100% IN PURE TELUGU (తెలుగు) SCRIPT ONLY.
- GIVE SHORT, CRISP RESPONSES. Provide ONLY what is needed without extra filler.
- DO NOT use English words or bilingual slashes (write ONLY "రుణ నిర్ణయం", NEVER "Loan Decision / రుణ నిర్ణయం").
- All numbers and currency must be in Indian Rupees (₹) (e.g. ₹50,000, ₹15 లక్షలు, ₹12,500/నెల).

### 2026 భారత బ్యాంకుల నిబంధనల ప్రామాణికం & కాలపరిమితి పరిమితులు (REFERENCE):
- **హోమ్ లోన్**: కాలపరిమితి కనీసం 1–5 సం. నుండి గరిష్టంగా 30 సంవత్సరాలు (12 నుండి 360 నెలలు), వయస్సు 18–70, ICICI/HDFC/SBI కనీస జీతం ₹25,000–₹30,000/నెల, FOIR/EMI భారం <= 50%, CIBIL 750+ ప్రాధాన్యత.
- **వాహన లోన్**: కాలపరిమితి కనీసం 1 సం. నుండి గరిష్టంగా 7–8 సంవత్సరాలు (12 నుండి 96 నెలలు), వయస్సు 21–60/65, కనీస వార్షిక జీతం ₹2.4L–₹3.0L (HDFC/Axis), Cosmos 90% ఆన్-రోడ్.
- **గోల్డ్ లోన్**: కాలపరిమితి కనీసం 6 నెలల నుండి గరిష్టంగా 36 నెలలు (3 సం.), RBI గరిష్ట LTV 75%, SBI కనీసం ₹20,000 నుండి ₹50 లక్షల వరకు.
- **ఎడ్యుకేషన్ లోన్**: కాలపరిమితి కనీసం 1 సం. నుండి గరిష్టంగా 15 సంవత్సరాలు (180 నెలలు) + మోరటోరియం (కోర్సు + 6/12 నెలలు), కో-అప్లికెంట్ తప్పనిసరి.
- **సహకార బ్యాంకులు (Cosmos/Saraswat)**: UCB నిబంధనలు, స్థానిక సంబంధాలు.

### FORMAT FOR LOAN APPLICATION (SHORT & DIRECT):
**రుణ నిర్ణయం**: [✅ ఆమోదించబడింది (బ్యాంక్ పేరు) / ⚠️ షరతులతో ఆమోదం / ❌ బ్యాంక్ నిబంధనల ప్రకారం తిరస్కరించబడింది]
**డిఫాల్ట్ అవకాశం**: **X%** (రిస్క్: తక్కువ / మధ్యస్థం / ఎక్కువ)
**రుణ వివరాలు**:
- కాలపరిమితి: కనీసం [Min] నుండి గరిష్టంగా [Max] సంవత్సరాలు ([Min_Mo] నుండి [Max_Mo] నెలలు) [అభ్యర్థించినది: X సం.] | క్రెడిట్ స్కోరు (CIBIL): [e.g. 750+ (క్లియర్) / 1.0 ఉత్తీర్ణత]
**బ్యాంక్ నిబంధనల తనిఖీ**:
- 🟢/🔴 వయస్సు: [వయస్సు vs బ్యాంక్ పరిమితి]
- 🟢/🔴 కనీస జీతం: ₹XX,XXX/నెల [vs కనీస పరిమితి]
- 🟢/🔴 EMI భారం (FOIR): X% [గరిష్ట 50% లోపు]
- 🟢/🔴 క్రెడిట్ స్కోరు & గేట్: [CIBIL 750+ / 1.0 క్లియర్]
**నెలవారీ లెక్క**:
- నెల జీతం: ₹XX,XXX | EMI: ₹X,XXX/నెల | మిగులు: ₹XX,XXX/నెల
**తదుపరి దశ**: [1 చిన్న వాక్యం - e.g., తాజా 3 నెలల జీతం స్లిప్పులు సమర్పించండి.]

### GENERAL QUESTIONS:
- కేవలం 1–2 సూటి వాక్యాలలో లేదా సంక్షిప్త బుల్లెట్ పాయింట్లలో 2026 భారత బ్యాంకుల నిబంధనల ఆధారంగా సమాధానం ఇవ్వండి.`;
    } else if (langLower === 'hindi' || langLower === 'hi') {
      systemPrompt = `You are LoanMani, a concise and smart Loan Prediction Assistant referencing the 2026 Indian Bank Underwriting Framework (SBI, HDFC, ICICI, Axis, BoB, PNB, Cosmos, Saraswat).

### STRICT LANGUAGE & CONCISENESS DIRECTIVE (MANDATORY):
- YOU MUST ANSWER 100% IN PURE HINDI (हिन्दी) SCRIPT ONLY.
- GIVE SHORT, CRISP RESPONSES. Provide ONLY what is needed without extra filler.
- DO NOT use English words or bilingual slashes (write ONLY "ऋण निर्णय", NEVER "Loan Decision / ऋण निर्णय").
- All numbers and currency must be in Indian Rupees (₹) (e.g. ₹50,000, ₹15 लाख, ₹12,500/महीना).

### 2026 भारतीय बैंक ऋण मानदंड & अवधि सीमाएँ (REFERENCE):
- **होम लोन**: अवधि न्यूनतम 1–5 वर्ष से अधिकतम 30 वर्ष (12 से 360 माह), आयु 18–70 वर्ष, न्यूनतम वेतन ₹25,000–₹30,000/माह, FOIR <= 50%, CIBIL 750+ प्राथमिकता.
- **वाहन लोन**: अवधि न्यूनतम 1 वर्ष से अधिकतम 7–8 वर्ष (12 से 96 माह), आयु 21–60/65 वर्ष, न्यूनतम वार्षिक आय ₹2.4L–₹3.0L (HDFC/Axis), Cosmos 90% ऑन-रोड.
- **गोल्ड लोन**: अवधि न्यूनतम 6 माह से अधिकतम 36 माह (3 वर्ष), RBI LTV अधिकतम 75%, SBI ₹20,000 से ₹50 लाख तक.
- **एजुकेशन लोन**: अवधि न्यूनतम 1 वर्ष से अधिकतम 15 वर्ष (180 माह) + मोरेटोरियम (कोर्स + 6/12 माह), सह-आवेदक अनिवार्य.
- **सहकारी बैंक (Cosmos/Saraswat)**: UCB नियम, स्थानीय बैंकिंग संबंध.

### FORMAT FOR LOAN APPLICATION (SHORT & DIRECT):
**ऋण निर्णय**: [✅ स्वीकृत (बैंक नाम) / ⚠️ शर्तों के साथ स्वीकृत / ❌ बैंक नीति अस्वीकृत]
**डिफ़ॉल्ट संभावना**: **X%** (जोखिम: कम / मध्यम / अधिक)
**ऋण विवरण**:
- ऋण अवधि (Tenure): न्यूनतम [Min] वर्ष से अधिकतम [Max] वर्ष ([Min_Mo] से [Max_Mo] माह) [अनुरोधित: X वर्ष] | क्रेडिट स्कोर (CIBIL): [e.g. 750+ (स्पष्ट) / 1.0 पास]
**बैंक नीति सत्यापन**:
- 🟢/🔴 आयु पात्रता: [आयु vs बैंक सीमा]
- 🟢/🔴 न्यूनतम वेतन: ₹XX,XXX/माह [vs न्यूनतम सीमा]
- 🟢/🔴 EMI भार (FOIR): X% [अधिकतम 50% के भीतर]
- 🟢/🔴 क्रेडिट स्कोर & इतिहास: [CIBIL 750+ / 1.0 स्पष्ट]
**मासिक विवरण**:
- मासिक वेतन: ₹XX,XXX | EMI: ₹X,XXX/महीना | बचत: ₹XX,XXX/महीना
**अगला कदम**: [1 संक्षिप्त वाक्य - e.g., पिछले 3 महीने की सैलरी स्लिप और बैंक स्टेटमेंट जमा करें।]

### GENERAL QUESTIONS:
- केवल 1–2 सीधे वाक्यों या छोटे बिंदुओं में 2026 भारतीय बैंक नियमों के अनुसार उत्तर दें।`;
    } else {
      systemPrompt = `You are LoanMani, a concise and smart Loan Prediction Assistant referencing the 2026 Indian Bank Underwriting & Credit Criteria (SBI, HDFC, ICICI, Axis, BoB, PNB, Cosmos, Saraswat).

### STRICT CONCISENESS DIRECTIVE (MANDATORY):
- Keep all responses SHORT, CRISP, and TO THE POINT.
- Give ONLY what is needed. Avoid unnecessary filler.
- All numbers and currency must be in Indian Rupees (₹) (e.g. ₹50,000, ₹15 Lakhs, ₹12,500/month). Never use dollar ($).

### 2026 INDIAN BANK UNDERWRITING BENCHMARKS & TENURE RANGES (REFERENCE):
- **Home Loan**: Tenure Min 1–5 Years to Max 30 Years (12–360 Months), Age 18–70, Min Salary ₹25k–₹30k/mo (ICICI/HDFC), FOIR/EMI burden <= 45–50%, CIBIL 750+ prime cutoff.
- **Vehicle Loan**: Tenure Min 1 Year to Max 7–8 Years (12–96 Months), Age 21–60/65, Min Annual Income ₹2.4L–₹3.0L (Axis/HDFC), Cosmos up to 90% on-road.
- **Gold Loan**: Tenure Min 6 Months to Max 36 Months (3 Years), RBI mandatory max 75% LTV, 18K–22K gold, SBI ₹20k–₹50L, Cosmos 70% LTV.
- **Education Loan**: Tenure Min 1 Year to Max 15 Years (12–180 Months) + Moratorium course+6/12 mo, Co-applicant mandatory.
- **Consumer Durable Loan**: Tenure Min 3 Months to Max 24–36 Months, low/0% down payment.
- **Cooperative Banks (Cosmos, Saraswat, UCBs)**: UCB board-approved credit policies, Cosmos Home Loan up to ₹3 Cr, Saraswat microfinance up to ₹3L household income.
- **Other Products**: Personal Loan (Tenure Min 1 Year to Max 5 Years / 12–60 Months, unsecured, FOIR <= 40–50%), LAP (Tenure Min 1 Year to Max 15 Years / 12–180 Months, 50–65% LTV), MSME/Business (Tenure Min 1 to Max 10 Years).

### FORMAT FOR LOAN APPLICATION (SHORT & DIRECT):
**Loan Decision**: [✅ ELIGIBLE (Bank Name) / ⚠️ APPROVED WITH CONDITIONS / ❌ BANK POLICY DECLINE]
**Default Chance**: **X%** (Risk: Low / Medium / High)
**Loan Parameters**:
- Tenure: Min [X] to Max [Y] Years ([Min_Mo] to [Max_Mo] Months) [Requested: Z Years] | Credit Score / CIBIL: [e.g. 750+ (Clear / Pass) / CIBIL 720]
**Bank Policy Checklist**:
- 🟢/🔴 Age: [Applicant Age vs Bank Limit]
- 🟢/🔴 Income: ₹XX,XXX/mo [vs Bank Min Gate]
- 🟢/🔴 FOIR / EMI: X% [vs Max 50% Cap]
- 🟢/🔴 Credit Score / Gate: [e.g. CIBIL 750+ / 1.0 Clear]
**Monthly Breakdown**:
- Salary: ₹XX,XXX | EMI: ₹X,XXX/month | Surplus: ₹XX,XXX/month
**Next Step**: [1 short sentence - e.g. Submit latest 3 months salary slips and KYC statement.]

### GENERAL QUESTIONS & BANK INQUIRIES:
- Answer directly in 1–2 short sentences or concise bullet points with amounts in ₹ using 2026 Indian banking benchmarks. No filler.`;
    }

    const messages = [{ role: 'system', content: systemPrompt }];
    for (const h of this.chatHistory.slice(-6)) {
      messages.push(h);
    }
    messages.push({ role: 'user', content: userQuery });

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.model,
        messages: messages,
        temperature: 0.2,
        max_tokens: 500
      })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error?.message || `OpenRouter HTTP ${res.status}`);
    }

    const data = await res.json();
    const replyText = data.choices?.[0]?.message?.content || 'No response generated.';
    return {
      text: replyText,
      source: 'openrouter',
      model: this.model,
      quickActions: this.generateContextualQuickActions(userQuery)
    };
  }

  isLoanDomainQuery(q, userQuery) {
    const domainKeywords = [
      'loan', 'default', 'applicant', 'risk', 'credit', 'cibil', 'income', 'emi',
      'property', 'area', 'urban', 'rural', 'semiurban', 'graduate', 'education',
      'underwrite', 'underwriting', 'model', 'roc', 'random forest', 'logistic',
      'accuracy', 'precision', 'recall', 'f1', 'portfolio', 'kpi', 'rate',
      'recommendation', 'policy', 'strategy', 'mitigat', 'guideline', 'evaluate',
      'predict', 'calculate', 'what if', 'lp100', 'interest', 'bank', 'finance',
      'financial', 'borrower', 'lender', 'collateral', 'ltv', 'salary', 'amount',
      'term', 'month', 'year', 'married', 'dependent', 'gender', 'self_employed',
      'employed', 'check', 'summary', 'analytics', 'benchmark', 'driver', 'tier',
      'approve', 'decline', 'reject', 'review', 'hi', 'hello', 'hey', 'help', 'start',
      'menu', 'options', 'clear', 'what can you do', 'who are you', 'what is your name',
      'sbi', 'hdfc', 'icici', 'axis', 'bob', 'pnb', 'canara', 'union', 'cosmos', 'saraswat',
      'gold', 'vehicle', 'car', 'bike', 'two-wheeler', 'student', 'durable', 'consumer',
      'cooperative', 'ucb', 'lap', 'msme', 'kcc', 'agri', 'rbi', 'criteria', 'eligibility',
      'compare', 'comparison'
    ];
    if (userQuery.match(/LP\d{6}/i)) return true;
    return domainKeywords.some(kw => q.includes(kw));
  }

  handleOutOfDomainQuery() {
    return {
      text: `⚠️ **Domain Scope**: I specialize strictly in **Loan Default Prediction & 2026 Indian Bank Criteria**.

**Suggested topics:**
- 🏛️ Bank criteria (e.g. *"SBI home loan"*, *"HDFC car loan"*, *"Cosmos bank"*)
- 🪙 Product benchmarks (e.g. *"Gold loan 75% LTV"*, *"Education loan rules"*)
- 🔍 Applicant check (e.g. *"Check LP100002"*)
- 💰 Loan what-if (e.g. *"Salary ₹60k, Loan ₹15 Lakhs, Credit 1"*)`,
      source: 'local',
      quickActions: [
        'SBI Loan Criteria',
        'HDFC Loan Criteria',
        'Gold Loan 75% LTV',
        'Default Rate'
      ]
    };
  }

  processLocalQuery(userQuery) {
    const q = userQuery.toLowerCase();

    // Out-of-domain check
    if (!this.isLoanDomainQuery(q, userQuery)) {
      return this.handleOutOfDomainQuery();
    }

    // 1. Applicant Lookup (e.g., LP100002 or check LP100005)
    const idMatch = userQuery.match(/LP\d{6}/i);
    if (idMatch || q.includes('applicant') || q.includes('lookup') || q.includes('check lp')) {
      const loanId = idMatch ? idMatch[0].toUpperCase() : 'LP100002';
      return this.handleApplicantLookup(loanId);
    }

    // 2. Specific Indian Bank Criteria Queries (SBI, HDFC, ICICI, Axis, BoB, PNB, Cosmos, Saraswat)
    if (q.includes('sbi') || q.includes('hdfc') || q.includes('icici') || q.includes('axis') || q.includes('cosmos') || q.includes('saraswat') || q.includes('bank of baroda') || q.includes('pnb') || q.includes('cooperative bank') || q.includes('ucb')) {
      return this.handleBankCriteriaQuery(q);
    }

    // 3. RBI & Regulatory Guidance Queries (Gold 75% LTV, FOIR, PSL, UCB rules)
    if (q.includes('rbi') || q.includes('regulatory') || (q.includes('ltv') && q.includes('gold')) || q.includes('psl') || q.includes('priority sector')) {
      return this.handleRbiRegulatoryQuery(q);
    }

    // 4. Specific Product Criteria Queries (Gold, Vehicle/Car, Education, Home, Durable, LAP, MSME)
    if (q.includes('gold') || q.includes('vehicle') || q.includes('car loan') || q.includes('education loan') || q.includes('student loan') || q.includes('consumer durable') || q.includes('durable') || q.includes('lap') || q.includes('msme') || q.includes('kcc') || (q.includes('criteria') && q.includes('home'))) {
      return this.handleProductCriteriaQuery(q);
    }

    // 5. Bank Landscape / Comparison Queries
    if (q.includes('compare bank') || q.includes('bank comparison') || q.includes('public vs private') || q.includes('all banks')) {
      return this.handleBankComparisonQuery(q);
    }

    // 6. Default Rate / Portfolio Overview
    if (q.includes('default rate') || q.includes('overall') || q.includes('portfolio') || q.includes('summary') || q.includes('kpi')) {
      return this.handlePortfolioSummary();
    }

    // 7. Education Level Comparison
    if (q.includes('graduate') || q.includes('education') || q.includes('degree')) {
      return this.handleEducationAnalysis();
    }

    // 8. Property Area / Geographic Risk
    if (q.includes('property') || q.includes('area') || q.includes('urban') || q.includes('rural') || q.includes('semiurban') || q.includes('location')) {
      return this.handlePropertyAreaAnalysis();
    }

    // 9. Credit History Analysis
    if (q.includes('credit') || q.includes('cibil') || q.includes('history') || q.includes('adverse')) {
      return this.handleCreditHistoryAnalysis();
    }

    // 10. Income & Loan Amount Risk
    if (q.includes('income') || q.includes('loan amount') || q.includes('emi') || q.includes('salary') || q.includes('size')) {
      return this.handleIncomeAndLoanAnalysis();
    }

    // 11. Model Performance / ROC-AUC / Machine Learning
    if (q.includes('model') || q.includes('roc') || q.includes('accuracy') || q.includes('random forest') || q.includes('logistic') || q.includes('feature')) {
      return this.handleModelPerformance();
    }

    // 12. Business Recommendations
    if (q.includes('recommendation') || q.includes('strategy') || q.includes('policy') || q.includes('mitigat') || q.includes('guideline')) {
      return this.handleBusinessRecommendations();
    }

    // 13. Interactive What-If / Loan Assessment
    if (q.includes('evaluate') || q.includes('predict') || q.includes('calculate') || q.includes('what if') || (q.includes('income') && q.includes('loan'))) {
      return this.handleWhatIfQuery(userQuery);
    }

    // General Default Response
    return this.handleGeneralInfo();
  }

  handleBankCriteriaQuery(q) {
    if (q.includes('sbi')) {
      return {
        text: `### 🏛️ SBI Loan Criteria (2026 Reference)
- **Home Loan**: Age 18–70 | Max 30 yrs tenure | YONO digital journey | Salaried & Self-employed.
- **Car Loan**: Vehicle hypothecation | Up to 7 yrs | Asset-liability & income verification.
- **Gold Loan**: Age 18+ | ₹20,000 to ₹50 Lakh | Up to 36 mo (EMI, Bullet, OD) | 18K–22K gold & coins.
- **Education Loan**: Student/Scholar loan up to 15 yrs | Moratorium course+6/12 mo | Premier institute high limits.`,
        source: 'local',
        quickActions: ['HDFC Bank Criteria', 'ICICI Bank Criteria', 'Cosmos Bank Criteria', 'Gold Loan Rules']
      };
    }
    if (q.includes('hdfc')) {
      return {
        text: `### 🏛️ HDFC Bank Criteria (2026 Reference)
- **Home Loan**: Age 21–65 | Up to 30 yrs | Salaried & Self-employed | Net income & FOIR screening.
- **Xpress Car Loan**: Salaried: Age 21–60, Min annual salary ₹3 Lakh (incl. spouse), 2 yrs exp (1 yr current). Self-employed: Age 21–65.
- **Gold Loan**: Age 18–75 | 18K–22K purity | 6 to 42 months (Term, OD, Bullet).
- **Education Loan**: Age 16–35 | Recognized merit/entrance programmes | Mandatory co-applicant.`,
        source: 'local',
        quickActions: ['SBI Criteria', 'ICICI Bank Criteria', 'Axis Bank Criteria', 'Vehicle Loan Rules']
      };
    }
    if (q.includes('icici')) {
      return {
        text: `### 🏛️ ICICI Bank Criteria (2026 Reference)
- **Home Loan**: Age 21–70 | Salaried min income ₹25,000/mo | Self-employed min income ₹30,000/mo | Up to 30 yrs.
- **Education Loan**: Age 16–65 | Pre-admission sanction available | Co-applicant mandatory.
- **Auto & Gold Loans**: Standard asset valuation, LTV limits, and FOIR affordability checks.`,
        source: 'local',
        quickActions: ['SBI Criteria', 'HDFC Bank Criteria', 'Axis Bank Criteria', 'Home Loan Rules']
      };
    }
    if (q.includes('axis')) {
      return {
        text: `### 🏛️ Axis Bank Criteria (2026 Reference)
- **Car Loan**: Salaried: Age 21–60, Net salary >= ₹2.40 Lakh/yr, 1 yr exp. Self-employed: Age 18–65, Min income ₹1.80L–₹2.0L/yr, 3 yrs business.
- **Home Loan**: Age 21–65/70 | Up to 30 yrs | Legal/technical property verification.
- **Education & Gold Loans**: Scheme-specific co-applicant and LTV limits.`,
        source: 'local',
        quickActions: ['SBI Criteria', 'HDFC Bank Criteria', 'Cosmos Bank Criteria', 'Car Loan Rules']
      };
    }
    if (q.includes('cosmos') || q.includes('saraswat') || q.includes('cooperative') || q.includes('ucb')) {
      return {
        text: `### 🏛️ Cooperative Bank Criteria (Cosmos / Saraswat 2026)
- **Cosmos Bank**: Home loan up to ₹3 Crore | Car loan up to 90% on-road value | Two-wheeler up to ₹10 Lakh | Gold loan up to 70% value.
- **Saraswat Bank**: Microfinance/consumer credit up to ₹3L household income | Society flat owner processing concessions.
- **UCB Features**: Board-approved credit policies, local relationship underwriting, guarantor requirements.`,
        source: 'local',
        quickActions: ['Cosmos Bank Criteria', 'Saraswat Bank Criteria', 'Gold Loan Rules', 'SBI Criteria']
      };
    }
    return {
      text: `### 🏛️ Major Indian Banks Criteria (2026 Benchmark)
- **Public Sector (SBI, BoB, PNB, Canara)**: Standardized schemes, 18–70 age, 30 yr home loans, 15 yr education loans.
- **Private Sector (HDFC, ICICI, Axis)**: Faster digital turnaround, min salary ₹25k–₹30k/mo, car loan salary >= ₹2.4L–₹3L/yr.
- **Cooperative Banks (Cosmos, Saraswat)**: Flexible limits, UCB relationship underwriting, gold loans up to 70–75% LTV.`,
      source: 'local',
      quickActions: ['SBI Criteria', 'HDFC Bank Criteria', 'Cosmos Bank Criteria', 'Gold Loan Rules']
    };
  }

  handleProductCriteriaQuery(q) {
    if (q.includes('gold')) {
      return {
        text: `### 🪙 Gold Loan Criteria (2026 India Benchmark)
- **RBI Regulatory Cap**: Maximum **75% LTV** on pledged gold jewellery (18K–22K purity).
- **SBI**: ₹20,000 to ₹50 Lakh | Up to 36 months (EMI, Bullet, OD) | Income proof optional for retail gold loan.
- **HDFC**: Age 18–75 | 6 to 42 months tenure | Term, OD, and bullet repayment.
- **Cosmos Bank**: Maximum 70% finance against appraised gold value.`,
        source: 'local',
        quickActions: ['SBI Gold Loan', 'HDFC Gold Loan', 'Home Loan Criteria', 'Education Loan Criteria']
      };
    }
    if (q.includes('vehicle') || q.includes('car') || q.includes('auto') || q.includes('bike') || q.includes('two-wheeler')) {
      return {
        text: `### 🚗 Vehicle & Car Loan Criteria (2026 India Benchmark)
- **HDFC**: Salaried min annual income ₹3 Lakh, 2 yrs exp (1 yr current).
- **Axis Bank**: Salaried min net salary ₹2.40 Lakh/yr | Self-employed min ₹1.80L–₹2.0L/yr with 3 yrs vintage.
- **Cosmos Bank**: Up to 90% of on-road car value | Two-wheeler loans up to ₹10 Lakh.
- **Security**: Primary hypothecation of vehicle, comprehensive insurance mandatory.`,
        source: 'local',
        quickActions: ['Car Loan Eligibility', 'HDFC Car Loan', 'Home Loan Criteria', 'Gold Loan Rules']
      };
    }
    if (q.includes('education') || q.includes('student')) {
      return {
        text: `### 🎓 Education Loan Criteria (2026 India Benchmark)
- **Eligibility**: Confirmed admission in recognized Indian or overseas institutions.
- **Co-Applicant**: Parent/guardian mandatory as co-borrower for regular full-time courses.
- **Tenure**: Up to 15 years repayment + moratorium (course period + 6–12 months).
- **Expenses**: Tuition, hostel, books, equipment, travel. Premier institutes get zero-collateral limits.`,
        source: 'local',
        quickActions: ['SBI Education Loan', 'HDFC Education Loan', 'Home Loan Criteria', 'Gold Loan Rules']
      };
    }
    if (q.includes('home') || q.includes('house') || q.includes('housing')) {
      return {
        text: `### 🏠 Home Loan Criteria (2026 India Benchmark)
- **Age & Tenure**: Age 18–70 | Repayment tenure up to 30 years.
- **Income Thresholds**: Salaried min ₹25,000/mo; Self-employed min ₹30,000/mo (ICICI/HDFC).
- **FOIR / EMI Cap**: Total monthly EMI obligations capped at 40%–50% of net income.
- **Due Diligence**: Legal title clearance, technical valuation, approved building plans.`,
        source: 'local',
        quickActions: ['SBI Home Loan', 'HDFC Home Loan', 'ICICI Home Loan', 'Default Rate']
      };
    }
    if (q.includes('durable') || q.includes('consumer')) {
      return {
        text: `### 📱 Consumer Durable Loan Criteria (2026 Benchmark)
- **Products**: Refrigerators, TVs, laptops, ACs, smartphones via merchant EMI / cards.
- **Terms**: 3–24 months tenure | Low or 0% down payment | Minimal documentation for pre-approved customers.`,
        source: 'local',
        quickActions: ['Personal Loan Rules', 'Home Loan Criteria', 'Car Loan Criteria']
      };
    }
    return {
      text: `### 📋 Extended Loan Categories (2026 Benchmark)
- **Personal Loan**: Unsecured, FOIR <= 40–50%, CIBIL >= 700, 1–5 yrs tenure.
- **Loan Against Property (LAP)**: 50%–65% LTV, up to 15 yrs tenure, for business/personal use.
- **MSME / Business Loan**: Requires GST, ITR, DSCR >= 1.25, Udyam registration.
- **Agriculture / KCC**: Kisan Credit Card based on landholding and scale of finance.`,
      source: 'local',
      quickActions: ['Home Loan Criteria', 'Gold Loan Criteria', 'Car Loan Criteria', 'Education Loan Criteria']
    };
  }

  handleRbiRegulatoryQuery(q) {
    return {
      text: `### 🏛️ RBI & Regulatory Lending Guidelines (2026)
- **Gold Loan LTV**: Strict 75% regulatory LTV limit against pledged gold jewellery; bullet repayment norms.
- **FOIR Benchmark**: Recommended max 40%–50% total monthly EMI obligation against net income.
- **Priority Sector Lending (PSL)**: Targets for Agriculture, MSME, Housing, and Education loans.
- **Asset Classification (NPA)**: 90-day overdue (DPD > 90) marks Non-Performing Asset.
- **Cooperative Banks (UCB Tiers 1–4)**: Mandated board-approved credit policies and prudential limits.`,
      source: 'local',
      quickActions: ['Gold Loan Rules', 'Bank Comparison', 'SBI Criteria', 'Default Rate']
    };
  }

  handleBankComparisonQuery(q) {
    return {
      text: `### ⚖️ Indian Banking Landscape Comparison (2026)
- **Public Sector (SBI, BoB, PNB, Canara)**: Lowest sovereign risk, high branch reach, standardized scheme limits (Home up to 30 yrs, Education up to 15 yrs).
- **Private Sector (HDFC, ICICI, Axis)**: Fast digital turnaround, specialized auto/personal credit, salary criteria ₹25k–₹30k/mo.
- **Cooperative Banks (Cosmos, Saraswat, UCBs)**: Deep regional networks, Cosmos Home Loan up to ₹3 Cr, Saraswat microfinance up to ₹3L.
- **NBFCs (Bajaj, Shriram, Tata)**: Higher risk appetite for consumer durables and used vehicles.`,
      source: 'local',
      quickActions: ['SBI Criteria', 'HDFC Bank Criteria', 'Cosmos Bank Criteria', 'Gold Loan Rules']
    };
  }

  handleApplicantLookup(loanId) {
    const record = LOAN_DATASET.find(item => item.Loan_ID.toUpperCase() === loanId);
    if (!record) {
      return {
        text: `🔍 **Applicant Not Found**: \`${loanId}\` (Try: \`LP100000\`, \`LP100002\`, \`LP100003\`)`,
        source: 'local',
        quickActions: ['Check LP100000', 'Check LP100002', 'Check LP100003']
      };
    }

    const evalRes = LoanEvaluator.evaluateLoanApplication(record);
    const badge = record.Default_Flag === 1 ? '🔴 DEFAULTED' : '🟢 APPROVED';

    const text = `### 📋 Applicant \`${record.Loan_ID}\` (${badge})
- **Decision**: **${evalRes.assessment.decision}** (Default Risk: \`${evalRes.assessment.defaultProbabilityPct}%\` - ${evalRes.assessment.riskTier})
- **Profile**: ${record.Education} | ${record.Property_Area} | Dependents: ${record.Dependents}
- **Financials**: Income $${record.TotalIncome.toLocaleString()}/mo | Loan $${record.LoanAmount}k | EMI/Income: \`${(record.EMI_to_Income_Ratio * 100).toFixed(1)}%\`
- **Credit History**: ${record.Credit_History === 1 ? '🟢 Clear (1.0)' : '🔴 Adverse (0.0)'}
- **Verdict**: ${evalRes.assessment.recommendation}`;

    return {
      text,
      source: 'local',
      quickActions: ['Check LP100000', 'Check LP100002', 'Default Rate']
    };
  }

  handlePortfolioSummary() {
    const stats = PORTFOLIO_STATS;
    const text = `### 📊 Portfolio Overview (${stats.total_applications} Loans)
- **Default Rate**: **${stats.default_rate_pct}%** (${stats.total_defaults} defaults / ${stats.total_approved} approved)
- **Averages**: Loan $${stats.avg_loan_amount}k | Income $${stats.avg_total_income.toLocaleString()}/mo | EMI/Income ${(stats.avg_emi_income_ratio * 100).toFixed(1)}%

**Key Risk Drivers**:
1. **Credit History**: Adverse credit defaults at **57.3%** vs **8.5%** for clear credit (6.7x risk).
2. **Property Area**: Rural **19.7%** vs Semiurban **15.1%**.
3. **Education**: Non-Graduate **24.2%** vs Graduate **14.3%**.`;

    return {
      text,
      source: 'local',
      quickActions: ['Graduate vs Non-Graduate', 'Property Area Risk', 'Credit History Impact', 'Model Metrics']
    };
  }

  handleEducationAnalysis() {
    const text = `### 🎓 Education vs Default Risk
- **Graduate**: **14.31%** default rate (622 apps, 89 defaults)
- **Not Graduate**: **24.16%** default rate (178 apps, 43 defaults)
- **Takeaway**: Non-Graduates carry **1.69x higher default risk**.`;

    return {
      text,
      source: 'local',
      quickActions: ['Property Area Risk', 'Credit History Impact', 'Top Recommendations']
    };
  }

  handlePropertyAreaAnalysis() {
    const text = `### 🏡 Property Area Default Risk
- 🟢 **Semiurban**: **15.09%** default rate (Lowest risk / safest)
- 🟡 **Urban**: **16.12%** default rate (Moderate risk)
- 🔴 **Rural**: **19.66%** default rate (Highest risk)
- **Takeaway**: Semiurban properties perform best; Rural properties carry highest volatility.`;

    return {
      text,
      source: 'local',
      quickActions: ['Graduate vs Non-Graduate', 'Credit History Impact', 'Default Rate']
    };
  }

  handleCreditHistoryAnalysis() {
    const text = `### 💳 Credit History Risk Impact
- 🟢 **Clear History (1.0)**: **8.52%** default rate (669 apps)
- 🔴 **Adverse History (0.0)**: **57.25%** default rate (131 apps)
- **Takeaway**: Adverse credit increases default risk by **6.7x** and commands **42%** of model predictive weight.`;

    return {
      text,
      source: 'local',
      quickActions: ['Check LP100002', 'Model Metrics', 'Top Recommendations']
    };
  }

  handleIncomeAndLoanAnalysis() {
    const text = `### 💰 Income & EMI Risk Thresholds
- **Income Tiers**: Low (<$3k) = **20.0%** default | High (>$10k) = **12.3%** default
- **Loan Sizing**: Medium ($100k-$200k) is safest at **14.0%** default
- ⚠️ **EMI/Income Ratio**: Above 25% spikes default rate to **34.8%** (2.1x higher risk).`;

    return {
      text,
      source: 'local',
      quickActions: ['Credit History Impact', 'Default Rate', 'Top Recommendations']
    };
  }

  handleModelPerformance() {
    const text = `### 🤖 ML Model Performance
- 🏆 **Random Forest (Champion)**: Accuracy **81.9%** | ROC-AUC **0.812** | Recall **84.3%**
- 🥈 **Logistic Regression**: Accuracy **78.8%** | ROC-AUC **0.796**
- 🥉 **Decision Tree**: Accuracy **74.2%** | ROC-AUC **0.725**

**Top Features**: Credit History (42%), EMI/Income (18.5%), Household Income (14.8%).`;

    return {
      text,
      source: 'local',
      quickActions: ['Top Recommendations', 'Credit History Impact', 'Default Rate']
    };
  }

  handleBusinessRecommendations() {
    const text = `### 💡 Top 5 Underwriting Recommendations
1. 💳 **Credit Filter**: Strictly review/decline Credit_History = 0.0 (57.3% default rate).
2. ⚖️ **EMI Cap**: Cap EMI-to-Income at 25% (defaults spike to 34.8% above 25%).
3. 🏡 **Rural LTV**: Lower LTV to 70-75% for Rural properties (19.7% default).
4. 🎯 **Sweet Spot**: Prioritize Semiurban & $100k–$200k loans (14-15% default).
5. ⚡ **Auto-Tiering**: Auto-approve low risk (<18%), manual review high risk (>35%).`;

    return {
      text,
      source: 'local',
      quickActions: ['Model Metrics', 'Property Area Risk', 'Default Rate']
    };
  }

  handleWhatIfQuery(userQuery) {
    const q = userQuery.toLowerCase();

    // 1. Detect Target Bank
    let targetBank = 'general';
    if (q.includes('sbi')) targetBank = 'sbi';
    else if (q.includes('hdfc')) targetBank = 'hdfc';
    else if (q.includes('icici')) targetBank = 'icici';
    else if (q.includes('axis')) targetBank = 'axis';
    else if (q.includes('bob') || q.includes('pnb') || q.includes('baroda')) targetBank = 'bob_pnb';
    else if (q.includes('cosmos')) targetBank = 'cosmos';
    else if (q.includes('saraswat')) targetBank = 'saraswat';

    // 2. Detect Loan Product
    let loanProduct = 'Home';
    if (q.includes('car') || q.includes('vehicle') || q.includes('auto') || q.includes('bike')) loanProduct = 'Car';
    else if (q.includes('gold')) loanProduct = 'Gold';
    else if (q.includes('education') || q.includes('student')) loanProduct = 'Education';
    else if (q.includes('personal') || q.includes('consumer')) loanProduct = 'Personal';
    else if (q.includes('lap')) loanProduct = 'LAP';
    else if (q.includes('msme') || q.includes('business')) loanProduct = 'MSME';

    // 3. Detect Age
    const ageMatch = userQuery.match(/(?:age|years old)\s*(?:of|=|:)?\s*(\d{2})/i) || userQuery.match(/(\d{2})\s*(?:yrs|years|yr)/i);
    const applicantAge = ageMatch ? parseInt(ageMatch[1]) : 32;

    // 4. Detect Income
    let applicantIncome = 50000;
    const lakhIncomeMatch = userQuery.match(/(?:income|salary)\s*(?:of|=|:)?\s*(?:₹|rs\.?)?\s*(\d+(?:\.\d+)?)\s*(?:lakh|lac|l)/i);
    const numIncomeMatch = userQuery.match(/(?:income|salary)\s*(?:of|=|:)?\s*(?:₹|rs\.?)?\s*(\d{4,7})/i) || userQuery.match(/(?:₹|rs\.?)\s*(\d{4,7})/i);
    const kIncomeMatch = userQuery.match(/(?:income|salary)\s*(?:of|=|:)?\s*(?:₹|rs\.?)?\s*(\d{2,3})\s*k/i);

    if (lakhIncomeMatch) {
      applicantIncome = Math.round((parseFloat(lakhIncomeMatch[1]) * 100000) / 12);
    } else if (kIncomeMatch) {
      applicantIncome = parseFloat(kIncomeMatch[1]) * 1000;
    } else if (numIncomeMatch) {
      applicantIncome = parseFloat(numIncomeMatch[1]);
    }

    // 5. Detect Loan Amount Requested
    let loanAmount = 200; // 200k = ₹20 Lakhs
    const lakhLoanMatch = userQuery.match(/(?:loan|amount)\s*(?:of|=|:)?\s*(?:₹|rs\.?)?\s*(\d+(?:\.\d+)?)\s*(?:lakh|lac|l|cr|crore)/i) || userQuery.match(/(\d+(?:\.\d+)?)\s*(?:lakh|lac|l)\s*(?:loan)?/i);
    const numLoanMatch = userQuery.match(/(?:loan|amount)\s*(?:of|=|:)?\s*(?:₹|rs\.?)?\s*(\d{4,8})/i);

    if (lakhLoanMatch) {
      const val = parseFloat(lakhLoanMatch[1]);
      loanAmount = userQuery.toLowerCase().includes('cr') ? val * 10000 : val * 100;
    } else if (numLoanMatch) {
      loanAmount = parseFloat(numLoanMatch[1]) / 1000;
    }

    // 6. Detect Tenure & Term
    let termMonths = 360; // default 30 yrs (360 mo)
    const yrTermMatch = userQuery.match(/(?:tenure|term|period)\s*(?:of|=|:)?\s*(\d{1,2})\s*(?:years|yrs|yr)/i) || userQuery.match(/(\d{1,2})\s*(?:years|yrs|yr)\s*(?:tenure|term)?/i);
    const moTermMatch = userQuery.match(/(?:tenure|term|period)\s*(?:of|=|:)?\s*(\d{2,3})\s*(?:months|mo|m)/i) || userQuery.match(/(\d{2,3})\s*(?:months|mo|m)\s*(?:tenure|term)?/i);
    if (yrTermMatch) {
      termMonths = parseInt(yrTermMatch[1]) * 12;
    } else if (moTermMatch) {
      termMonths = parseInt(moTermMatch[1]);
    } else if (loanProduct === 'Car') {
      termMonths = 84; // 7 yrs
    } else if (loanProduct === 'Gold') {
      termMonths = 36; // 3 yrs
    }

    // 7. Detect Credit Score & History
    const cibilMatch = userQuery.match(/(?:cibil|credit\s*score|score)\s*(?:of|=|:)?\s*(\d{3})/i);
    let creditScore = 750;
    let creditHistory = 1;
    if (cibilMatch) {
      creditScore = parseInt(cibilMatch[1]);
      creditHistory = creditScore >= 650 ? 1 : 0;
    } else {
      const creditHistoryMatch = userQuery.match(/(?:credit|cibil)\s*(?:history|gate)?\s*(?:of|=|:)?\s*(0|1)/i);
      if (q.includes('bad credit') || q.includes('adverse credit') || (creditHistoryMatch && creditHistoryMatch[1] === '0')) {
        creditHistory = 0;
        creditScore = 580;
      }
    }

    const evalInput = {
      TargetBank: targetBank,
      LoanProduct: loanProduct,
      ApplicantAge: applicantAge,
      ApplicantIncome: applicantIncome,
      CoapplicantIncome: 10000,
      LoanAmount: loanAmount,
      Loan_Amount_Term: termMonths,
      Credit_History: creditHistory,
      Education: q.includes('not graduate') ? 'Not Graduate' : 'Graduate',
      Property_Area: q.includes('rural') ? 'Rural' : (q.includes('urban') ? 'Urban' : 'Semiurban'),
      Dependents: '0',
      Married: 'Yes',
      Self_Employed: q.includes('self-employed') || q.includes('business') ? 'Yes' : 'No'
    };

    const res = LoanEvaluator.evaluateLoanApplication(evalInput);
    const bankPolicy = res.bankUnderwriting.policy;

    const checkLines = res.bankUnderwriting.complianceChecks.map(c => {
      const icon = c.status === 'pass' ? '🟢' : '🔴';
      return `- ${icon} ${c.label}: ${c.applicantVal} (Rule: ${c.ruleVal})`;
    }).join('\n');

    let minTenureYrs = 1, maxTenureYrs = 30, minTenureMo = 12, maxTenureMo = 360;
    if (loanProduct === 'Car') {
      minTenureYrs = 1; maxTenureYrs = 7; minTenureMo = 12; maxTenureMo = 84;
    } else if (loanProduct === 'Gold') {
      minTenureYrs = 0.5; maxTenureYrs = 3; minTenureMo = 6; maxTenureMo = 36;
    } else if (loanProduct === 'Education') {
      minTenureYrs = 1; maxTenureYrs = 15; minTenureMo = 12; maxTenureMo = 180;
    } else if (loanProduct === 'Personal') {
      minTenureYrs = 1; maxTenureYrs = 5; minTenureMo = 12; maxTenureMo = 60;
    } else if (loanProduct === 'LAP') {
      minTenureYrs = 1; maxTenureYrs = 15; minTenureMo = 12; maxTenureMo = 180;
    } else if (loanProduct === 'MSME') {
      minTenureYrs = 1; maxTenureYrs = 10; minTenureMo = 12; maxTenureMo = 120;
    }

    const tenureYrs = Math.round(termMonths / 12);
    const tenureDisplay = loanProduct === 'Gold'
      ? `Min 6 Months to Max 36 Months (0.5 to 3 Years) [Requested: ${termMonths} Months]`
      : `Min ${minTenureYrs} to Max ${maxTenureYrs} Years (${minTenureMo} to ${maxTenureMo} Months) [Requested: ${tenureYrs} Years / ${termMonths} Months]`;

    const text = `**Loan Decision**: **${res.assessment.decision}** (${bankPolicy.name})
**Default Chance**: **${res.assessment.defaultProbabilityPct}%** (Risk: ${res.assessment.riskTier})
**Loan Parameters**:
- Tenure: **${tenureDisplay}** | Credit Score / CIBIL: **${creditScore} (${creditHistory === 1 ? 'Clear' : 'Adverse'})**
**Bank Policy Checklist**:
${checkLines}
**Monthly Breakdown**:
- Salary: ₹${applicantIncome.toLocaleString('en-IN')} | EMI: ₹${res.engineered.emi.toLocaleString('en-IN')}/month | Surplus: ₹${Math.max(0, applicantIncome - res.engineered.emi).toLocaleString('en-IN')}/month
**Next Step**: ${res.assessment.recommendation}`;

    return {
      text,
      source: 'local',
      quickActions: [
        'Compare with SBI',
        'Compare with HDFC',
        'Compare with ICICI',
        'Cosmos Bank Limits'
      ]
    };
  }

  handleGeneralInfo() {
    return {
      text: `### 🤖 LoanMani Underwriting Assistant (2026 Benchmark)
Ask a bank question or test borrower eligibility:
- *"Evaluate SBI Home Loan: Salary ₹50k, Loan ₹20 Lakhs, Age 32, Credit 1"*
- *"HDFC Car Loan eligibility criteria"*
- *"ICICI minimum salary requirements"*
- *"Cosmos Bank loan limits"*
- *"RBI Gold Loan 75% LTV rules"*`,
      source: 'local',
      quickActions: [
        'SBI Home Loan',
        'HDFC Car Loan',
        'ICICI Criteria',
        'Cosmos Bank Limits',
        'Gold Loan 75% LTV',
        'Default Rate'
      ]
    };
  }

  generateContextualQuickActions(userQuery) {
    const q = userQuery.toLowerCase();
    if (q.includes('sbi') || q.includes('hdfc') || q.includes('icici') || q.includes('cosmos')) {
      return ['Compare All Banks', 'Gold Loan 75% LTV', 'Car Loan Criteria', 'Default Rate'];
    }
    if (q.includes('lp100')) {
      return ['Check LP100000', 'Check LP100003', 'Check LP100010', 'Default Rate'];
    }
    if (q.includes('default') || q.includes('rate')) {
      return ['Property Area Risk', 'Credit History Impact', 'Graduate vs Non-Graduate', 'Top Recommendations'];
    }
    return [
      'SBI Home Loan',
      'HDFC Car Loan',
      'ICICI Criteria',
      'Cosmos Bank Limits',
      'Gold Loan 75% LTV',
      'Default Rate'
    ];
  }
}

// Global Export
window.LoanChatbot = LoanChatbot;

// Theme Toggle Logic
document.addEventListener('DOMContentLoaded', () => {
  const themeBtn = document.getElementById('theme-toggle-btn');
  const themeIcon = document.getElementById('theme-icon');
  if (themeBtn && themeIcon) {
    themeBtn.addEventListener('click', () => {
      document.body.classList.toggle('light-theme');
      if(document.body.classList.contains('light-theme')) {
        themeIcon.textContent = '☀️';
      } else {
        themeIcon.textContent = '🌙';
      }
    });
  }
});
