import os
import time
import json
import urllib.request
import urllib.error
from flask import Flask, request, jsonify, send_from_directory
import PyPDF2
from werkzeug.utils import secure_filename

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

app = Flask(__name__, static_folder='.', static_url_path='')

# Load Groq API Key and default model from environment variables (.env)
DEFAULT_GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
DEFAULT_MODEL = os.environ.get("GROQ_MODEL", "gpt-oss-120b")

# Supabase configuration
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

supabase = None
if SUPABASE_URL and SUPABASE_KEY:
    try:
        from supabase import create_client, Client
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        print("Supabase client initialized.")
    except ImportError:
        print("Supabase package not installed. Run `pip install supabase`")


def get_system_prompt_for_language(language):
    lang_lower = (language or 'English').strip().lower()
    
    if lang_lower in ['telugu', 'te']:
        return """You are LoanMani, a concise and smart Loan Prediction Assistant referencing the 2026 Indian Bank Underwriting Framework (SBI, HDFC, ICICI, Axis, BoB, PNB, Cosmos, Saraswat).

### STRICT LANGUAGE & CONCISENESS DIRECTIVE (MANDATORY):
- YOU MUST ANSWER 100% IN PURE TELUGU (తెలుగు) SCRIPT ONLY.
- GIVE SHORT, CRISP RESPONSES. Provide ONLY what is needed without extra filler.
- DO NOT use English words or bilingual slashes (write ONLY "రుణ నిర్ణయం", NEVER "Loan Decision / రుణ నిర్ణయం").
- All numbers and currency must be in Indian Rupees (₹) (e.g. ₹50,000, ₹15 లక్షలు, ₹12,500/నెల).
- **కాలపరిమితి నిబంధన**: కాలపరిమితి వరుసలో ఎల్లప్పుడూ ఆ లోన్ రకానికి సంబంధించిన **కనీసం నుండి గరిష్ట కాలపరిమితి పరిధిని** తప్పనిసరిగా పేర్కొనండి (e.g. కనీసం 1 నుండి గరిష్టంగా 30 సంవత్సరాలు (12 నుండి 360 నెలలు) [కోరినది: 20 సం.]).

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
- కేవలం 1–2 సూటి వాక్యాలలో లేదా సంక్షిప్త బుల్లెట్ పాయింట్లలో 2026 భారత బ్యాంకుల నిబంధనల ఆధారంగా సమాధానం ఇవ్వండి.

### GREETING:
"నమస్కారం! నేను మీ LoanManiని. భారతీయ బ్యాంకుల నిబంధనల ప్రకారం (SBI, HDFC, ICICI, Axis, సహకార బ్యాంకులు) మీ లోన్ అర్హత, కనీస–గరిష్ట కాలపరిమితి మరియు క్రెడిట్ స్కోరును సూటిగా వివరిస్తాను!"
"""
    elif lang_lower in ['hindi', 'hi']:
        return """You are LoanMani, a concise and smart Loan Prediction Assistant referencing the 2026 Indian Bank Underwriting Framework (SBI, HDFC, ICICI, Axis, BoB, PNB, Cosmos, Saraswat).

### STRICT LANGUAGE & CONCISENESS DIRECTIVE (MANDATORY):
- YOU MUST ANSWER 100% IN PURE HINDI (हिन्दी) SCRIPT ONLY.
- GIVE SHORT, CRISP RESPONSES. Provide ONLY what is needed without extra filler.
- DO NOT use English words or bilingual slashes (write ONLY "ऋण निर्णय", NEVER "Loan Decision / ऋण निर्णय").
- All numbers and currency must be in Indian Rupees (₹) (e.g. ₹50,000, ₹15 लाख, ₹12,500/महीना).
- **अवधि निर्देश**: ऋण अवधि पंक्ति में हमेशा उस उत्पाद की **न्यूनतम से अधिकतम अवधि सीमा** अवश्य लिखें (e.g. न्यूनतम 1 वर्ष से अधिकतम 30 वर्ष (12 से 360 माह) [अनुरोधित: 20 वर्ष]).

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
- केवल 1–2 सीधे वाक्यों या छोटे बिंदुओं में 2026 भारतीय बैंक नियमों के अनुसार उत्तर दें।

### GREETING:
"नमस्ते! मैं आपका LoanMani सहायक हूँ। प्रमुख भारतीय बैंकों (SBI, HDFC, ICICI, Axis, सहकारी बैंक) के 2026 नियमों के आधार पर लोन निर्णय, न्यूनतम से अधिकतम अवधि और सिबिल स्कोर का विवरण प्राप्त करें!"
"""
    else:
        return """You are LoanMani, a concise and smart Loan Prediction Assistant referencing the 2026 Indian Bank Underwriting & Credit Criteria (SBI, HDFC, ICICI, Axis, BoB, PNB, Cosmos, Saraswat).

### STRICT CONCISENESS & PARAMETERS DIRECTIVE (MANDATORY):
- Keep all responses SHORT, CRISP, and TO THE POINT.
- Give ONLY what is needed. Avoid unnecessary fluff or long explanations.
- All numbers and currency must be in Indian Rupees (₹) (e.g. ₹50,000, ₹15 Lakhs, ₹12,500/month). Never use dollar ($).
- **TENURE REQUIREMENT**: In the Tenure line, ALWAYS state the **Minimum to Maximum tenure range** for that product (e.g. `Min 1 to Max 30 Years (12 to 360 Months) [Requested: 20 Years]`).

### 2026 INDIAN BANK UNDERWRITING BENCHMARKS & TENURE RANGES (REFERENCE):
- **Home Loan**: Tenure Min 1–5 Years to Max 30 Years (12–360 Months), Age 18–70, Min Salary ₹25k–₹30k/mo (ICICI/HDFC), FOIR/EMI burden <= 45–50%, CIBIL 750+ prime cutoff.
- **Vehicle Loan**: Tenure Min 1 Year to Max 7–8 Years (12–96 Months), Age 21–60/65, Min Annual Income ₹2.4L–₹3.0L (Axis/HDFC), Cosmos up to 90% on-road.
- **Gold Loan**: Tenure Min 6 Months to Max 36 Months (3 Years), RBI mandatory max 75% LTV, 18K–22K gold, SBI ₹20k–₹50L, Cosmos 70% LTV.
- **Education Loan**: Tenure Min 1 Year to Max 15 Years (12–180 Months) + Moratorium course+6/12 mo, Co-applicant mandatory.
- **Consumer Durable Loan**: Tenure Min 3 Months to Max 24–36 Months, low/0% down payment.
- **Cooperative Banks (Cosmos, Saraswat, UCBs)**: UCB board-approved credit policies, Cosmos Home Loan up to ₹3 Cr, Saraswat microfinance up to ₹3L household income.
- **Other Products**: Personal Loan (Tenure Min 1 Year to Max 5 Years / 12–60 Months, unsecured, FOIR <= 40–50%), LAP (Tenure Min 1 Year to Max 15 Years / 12–180 Months, 50–65% LTV), MSME/Business (Tenure Min 1 to Max 10 Years).

### FORMAT FOR LOAN APPLICATION:
Once the user provides their details, you MUST evaluate them and respond EXACTLY in this step-by-step format:
1. **Eligible Banks**: [List of 2-3 eligible banks based on the criteria, e.g., SBI, HDFC]
2. **Interest Rate**: [Estimated interest rates for the eligible banks, e.g., SBI (8.5%), HDFC (8.75%)]
3. **EMI**: [Calculated Estimated EMI in ₹]
4. **Tenure**: [Eligible Tenure range, e.g., 15 to 20 Years]
5. **Required documents to be submitted to the bank**: (ONLY include this section if the user is eligible for at least one bank. Do NOT include if Eligible Banks is None)
- [Document 1]
- [Document 2]
- [Document 3]

### GENERAL QUESTIONS & BANK INQUIRIES:
- Answer directly in 1–2 short sentences or concise bullet points with amounts in ₹ using 2026 Indian banking benchmarks. No filler.

### GREETING:
"Hi! I'm your LoanMani assistant referencing 2026 Indian Bank Underwriting Criteria (SBI, HDFC, ICICI, Axis, Cooperative Banks). Please select the type of Loan:
1. Home Loan
2. Vehicle Loan
3. Gold Loan
4. Education Loan
5. Consumer Durable Loan
6. Personal Loan
7. LAP (Loan Against Property)
8. MSME / Business Loan"

### AFTER LOAN SELECTION:
When the user selects a loan type, you MUST respond EXACTLY with:
"Please share borrowers details for quick evaluation:"
"""

# Default system prompt for backwards compatibility
SYSTEM_PROMPT = get_system_prompt_for_language("English")

@app.after_request
def add_header(response):
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

@app.route('/')
def serve_index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('.', path)

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({
        "status": "online",
        "backend": "Python / Flask",
        "groq_configured": bool(DEFAULT_GROQ_API_KEY),
        "default_api_key": DEFAULT_GROQ_API_KEY,
        "default_model": DEFAULT_MODEL
    })

@app.route('/api/test-groq', methods=['POST'])
def test_groq_connection():
    data = request.get_json() or {}
    api_key = data.get('apiKey', '').strip() or DEFAULT_GROQ_API_KEY
    model = data.get('model', '').strip() or DEFAULT_MODEL

    if not api_key:
        return jsonify({"success": False, "message": "No Groq API Key provided."}), 400

    start_time = time.time()
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": "Ping test"}],
        "max_tokens": 10
    }

    req = urllib.request.Request(
        'https://api.groq.com/openai/v1/chat/completions',
        headers={
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        data=json.dumps(payload).encode('utf-8')
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            res_data = json.loads(response.read().decode('utf-8'))
            latency = int((time.time() - start_time) * 1000)
            return jsonify({
                "success": True,
                "latencyMs": latency,
                "message": f"Groq API connection verified via backend ({model}, {latency}ms)"
            })
    except urllib.error.HTTPError as e:
        err_body = e.read().decode('utf-8', errors='ignore')
        try:
            err_json = json.loads(err_body)
            msg = err_json.get('error', {}).get('message', f"HTTP {e.code}")
        except Exception:
            msg = f"HTTP {e.code} {e.reason}"
        return jsonify({"success": False, "message": f"Groq API Error: {msg}"}), 400
    except Exception as e:
        return jsonify({"success": False, "message": f"Network Error: {str(e)}"}), 500

@app.route('/api/chat', methods=['POST'])
def chat_endpoint():
    data = request.get_json() or {}
    user_query = data.get('query', '').strip()
    api_key = data.get('apiKey', '').strip() or DEFAULT_GROQ_API_KEY
    model = data.get('model', '').strip() or DEFAULT_MODEL
    chat_history = data.get('chatHistory', [])
    language = data.get('language', 'English').strip()

    if not user_query:
        return jsonify({"error": "Query parameter cannot be empty."}), 400

    if not api_key:
        return jsonify({"error": "No Groq API key configured on backend or provided in request."}), 400

    # Build prompt messages payload with dedicated single-language system prompt
    system_content = get_system_prompt_for_language(language)

    messages = [{"role": "system", "content": system_content}]
    
    # Add conversation history
    for item in chat_history[-8:]:
        if isinstance(item, dict) and 'role' in item and 'content' in item:
            messages.append({"role": item['role'], "content": item['content']})

    messages.append({"role": "user", "content": user_query})

    payload = {
        "model": model,
        "messages": messages,
        "temperature": 0.2,
        "max_tokens": 500
    }

    req = urllib.request.Request(
        'https://api.groq.com/openai/v1/chat/completions',
        headers={
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        data=json.dumps(payload).encode('utf-8')
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            res_data = json.loads(response.read().decode('utf-8'))
            reply_text = res_data.get('choices', [{}])[0].get('message', {}).get('content', '')
            usage = res_data.get('usage', {})

            if supabase:
                session_id = data.get('sessionId')
                if session_id:
                    try:
                        updated_history = chat_history + [
                            {"role": "user", "content": user_query},
                            {"role": "assistant", "content": reply_text}
                        ]
                        supabase.table("chat_history").upsert({
                            "session_id": session_id,
                            "messages": updated_history
                        }).execute()
                    except Exception as e:
                        print("Supabase chat logging error:", e)

            return jsonify({
                "text": reply_text,
                "source": "groq",
                "backend": "Python / Flask",
                "model": model,
                "usage": usage
            })
    except urllib.error.HTTPError as e:
        err_body = e.read().decode('utf-8', errors='ignore')
        try:
            err_json = json.loads(err_body)
            msg = err_json.get('error', {}).get('message', f"HTTP {e.code}")
        except Exception:
            msg = f"HTTP {e.code} {e.reason}"
        return jsonify({"error": f"Groq API Error: {msg}"}), 400
    except Exception as e:
        return jsonify({"error": f"Server Error: {str(e)}"}), 500

@app.route('/api/parse-document', methods=['POST'])
def parse_document():
    if 'document' not in request.files:
        return jsonify({"error": "No document uploaded"}), 400
    
    file = request.files['document']
    api_key = request.form.get('apiKey', '').strip() or DEFAULT_GROQ_API_KEY
    
    if not api_key:
        return jsonify({"error": "No Groq API key configured"}), 400

    filename = secure_filename(file.filename or "")
    text_content = ""
    
    if supabase and filename:
        try:
            file.seek(0)
            file_bytes = file.read()
            supabase.storage.from_("documents").upload(filename, file_bytes)
            file.seek(0)
        except Exception as e:
            print("Supabase storage upload error:", e)

    try:
        if filename.lower().endswith('.pdf'):
            pdf_reader = PyPDF2.PdfReader(file.stream)
            for page in pdf_reader.pages:
                text_content += page.extract_text() + "\n"
        else:
            text_content = file.read().decode('utf-8', errors='ignore')
            
        # truncate if too long
        text_content = text_content[:8000]
        
        prompt = f"""
Extract the following information from this document. Return ONLY a valid JSON object. Do not include markdown code blocks, do not explain. Use these exact keys:
"ApplicantAge": (number or null),
"ApplicantIncome": (number or null, monthly income in INR),
"CoapplicantIncome": (number or null, monthly income in INR),
"LoanAmountRequested": (number or null, loan amount in lakhs, convert to plain number like 2 for 2 Lakhs)

Document text:
{text_content}
        """
        
        payload = {
            "model": "gpt-oss-120b",
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.1,
            "max_tokens": 500,
            "response_format": {"type": "json_object"}
        }

        req = urllib.request.Request(
            'https://api.groq.com/openai/v1/chat/completions',
            headers={
                'Authorization': f'Bearer {api_key}',
                'Content-Type': 'application/json'
            },
            data=json.dumps(payload).encode('utf-8')
        )
        
        with urllib.request.urlopen(req, timeout=30) as response:
            res_data = json.loads(response.read().decode('utf-8'))
            reply_text = res_data.get('choices', [{}])[0].get('message', {}).get('content', '')
            parsed_json = json.loads(reply_text)
            return jsonify({"success": True, "data": parsed_json})
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# -----------------------------
# SUPABASE ENDPOINTS
# -----------------------------

@app.route('/api/register', methods=['POST'])
def register():
    if not supabase:
        return jsonify({"error": "Supabase not configured"}), 500
    data = request.get_json()
    email = data.get("email")
    password = data.get("password")
    
    try:
        response = supabase.auth.sign_up({"email": email, "password": password})
        return jsonify({"success": True, "user": response.user.id if response.user else None})
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route('/api/login', methods=['POST'])
def login():
    if not supabase:
        return jsonify({"error": "Supabase not configured"}), 500
    data = request.get_json()
    email = data.get("email")
    password = data.get("password")
    
    try:
        response = supabase.auth.sign_in_with_password({"email": email, "password": password})
        return jsonify({"success": True, "session": response.session.access_token if response.session else None})
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route('/api/submit-loan', methods=['POST'])
def submit_loan():
    if not supabase:
        return jsonify({"error": "Supabase not configured"}), 500
    
    auth_header = request.headers.get("Authorization")
    if not auth_header:
        return jsonify({"error": "Missing Authorization header"}), 401
    
    token = auth_header.replace("Bearer ", "")
    data = request.get_json()
    try:
        user_response = supabase.auth.get_user(token)
        if not user_response or not user_response.user:
            return jsonify({"error": "Invalid token"}), 401
            
        user_id = user_response.user.id
        insert_data = {
            "user_id": user_id,
            "applicant_age": data.get("age"),
            "income": data.get("income"),
            "loan_amount_requested": data.get("loan_amount"),
            "tenure_months": data.get("tenure")
        }
        
        res = supabase.table("loan_applications").insert(insert_data).execute()
        return jsonify({"success": True, "data": res.data})
    except Exception as e:
        return jsonify({"error": str(e)}), 400

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f"Starting Python Risk Analytics Server on http://127.0.0.1:{port}")
    app.run(host='0.0.0.0', port=port, debug=True)
