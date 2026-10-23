"""Domain knowledge grounded in public AICTE / UGC / DARPG material.

Sources used for categories and rules (all public):
 - AICTE Approval Process Handbook 2021-22 (cl. 8.1, 8.17 committee route) - cited in Delhi HC judgments
 - AICTE Fee Refund Policy / handbook directive: full refund less a processing charge of at most Rs 1000
   when a student withdraws before commencement; institutions may not retain original certificates
 - UGC (Prohibition, Prevention and Redressal of Ragging) Regulations 2009; National Anti-Ragging Helpline 1800-180-5522
 - AICTE Grievance Redressal Cell, CPGRAMS categories, institutional grievance-cell category lists
"""

BUREAUS = {
    "RB": {"name": "Regulation Bureau", "short": "Regulation", "color": "#2563eb"},
    "PGRC": {"name": "Public Grievance Redressal Cell", "short": "PGRC", "color": "#7c3aed"},
    "VC": {"name": "Vigilance Cell", "short": "Vigilance", "color": "#dc2626"},
    "AB": {"name": "Academic Bureau", "short": "Academic", "color": "#d97706"},
    "FB": {"name": "Finance Bureau", "short": "Finance", "color": "#0d9488"},
    "EB": {"name": "Establishment Bureau", "short": "Establishment", "color": "#64748b"},
}

CHANNELS = {
    "email": "Email to AICTE",
    "portal": "Central grievance portal",
    "css": "Centralised Support System",
    "cpgrams": "CPGRAMS",
    "antiragging": "Anti-ragging helpline",
    "inst_report": "Institution grievance report",
    "ombud": "Ombudsperson / SGRC order",
    "court_rti": "Court / RTI / Parliament",
    "voice": "Voice / WhatsApp (Bhashini)",
}
# weights approximating how a regulator's intake mix skews to portal + CPGRAMS
CHANNEL_WEIGHTS = {"email": 14, "portal": 30, "css": 9, "cpgrams": 22, "antiragging": 5, "inst_report": 4,
                   "ombud": 3, "court_rti": 3, "voice": 10}

# key: (label, default_priority, home bureau, other bureaus that typically also open it, subject)
CATEGORIES = {
    "fee_excess": ("Excess fee collection", "P2", "PGRC", ["RB", "FB", "VC"], "fee"),
    "fee_refund": ("Fee refund denied or delayed", "P2", "PGRC", ["RB", "FB"], "fee"),
    "cert_withheld": ("Original certificates withheld", "P1", "PGRC", ["RB"], "documents"),
    "unapproved": ("Course or intake without approval", "P1", "RB", ["AB", "VC"], "approval"),
    "faculty": ("Faculty shortage or fake faculty", "P2", "AB", ["RB"], "faculty"),
    "ragging": ("Ragging", "P0", "PGRC", ["VC", "RB"], "ragging"),
    "scholarship": ("Scholarship not disbursed", "P2", "FB", ["PGRC"], "scholarship"),
    "infra": ("Lab or infrastructure deficiency", "P3", "RB", ["AB"], "infrastructure"),
    "placement": ("Misleading placement claims", "P3", "RB", ["PGRC"], "advertising"),
    "admission": ("Irregular admission or quota misuse", "P1", "RB", ["VC", "PGRC"], "admission"),
    "financial": ("Financial irregularity or fund diversion", "P1", "VC", ["FB", "RB"], "finance"),
    "harassment": ("Harassment of students or staff", "P1", "PGRC", ["VC"], "conduct"),
}

# Overall category mix, from published grievance-cell category lists: fee issues dominate.
CATEGORY_WEIGHTS = {"fee_excess": 17, "fee_refund": 15, "cert_withheld": 10, "unapproved": 6, "faculty": 9,
                    "ragging": 5, "scholarship": 9, "infra": 7, "placement": 5, "admission": 6,
                    "financial": 5, "harassment": 6}

SLA_DAYS = {"P0": 1, "P1": 7, "P2": 15, "P3": 30}  # 15 days mirrors published grievance-cell norm

STATUSES = ["New", "Under Review", "Awaiting Institution", "Escalated", "Resolved - Pending Confirmation",
            "Closed", "Reopened"]

ACTION_TYPES = {
    "show_cause": "Show Cause Notice",
    "warning": "Warning Letter",
    "expert_visit": "Expert Committee Visit",
    "hearing": "Hearing Committee Reference",
    "penalty": "Financial Penalty",
    "refund_order": "Direct Fee Refund",
    "cap_intake": "Reduce / Cap Intake",
    "withdraw_approval": "Withdrawal of Approval",
    "close_case": "Close Matter (No Violation)",
    "extend_approval": "Extension of Approval",
    "new_course": "Grant Approval for New Course",
    "audit": "Financial Audit",
}

# Words an AI summariser may highlight - purely lexical, used for text comparison highlights.
KEYWORDS = [
    "fee", "fees", "excess", "refund", "refunded", "certificate", "certificates", "original", "withheld",
    "scholarship", "faculty", "approval", "approved", "unapproved", "intake", "ragging", "hostel", "lab",
    "placement", "admission", "quota", "donation", "capitation", "penalty", "audit", "funds", "diverted",
    "harassment", "tuition", "transport", "development", "caution", "deposit", "tc", "transfer",
]

# --- Complaint text templates. {y}=academic year, {amt}=amount, {course}=programme -----------------
EN = {
    "fee_excess": [
        "The college has collected excess fees for the academic year {y} and has not refunded the amount despite multiple requests.",
        "I paid Rs {amt} over the fee approved by the state fee regulatory committee for {course}. The management says it is a development fee and refuses to issue a receipt.",
        "Students are being forced to pay higher fees than prescribed for {y}. Receipts show a lower amount than what was actually collected in cash.",
        "The institution demanded an additional Rs {amt} as donation for {course} admission, over and above the approved tuition fee, and refuses to give a written receipt.",
        "Fee collected in {y} is more than the amount notified. The college adds transport and lab charges which were never disclosed at admission.",
    ],
    "fee_refund": [
        "I withdrew my admission before the course began but the college refuses to return my fee. AICTE refund policy allows only a processing charge, yet they are keeping Rs {amt}.",
        "Refund of the fee for {y} is pending for more than six months. The college asks me to come again and again and says the refund is not processed.",
        "My fee refund after cancelling admission in {course} is not being paid. The college deducted far more than the permitted processing charge.",
        "Students who left after counselling are not getting their fees back. The excess amount is not being refunded and the college says the seat was not refilled.",
    ],
    "cert_withheld": [
        "The institution is holding my original certificates and transfer certificate and refuses to return them until I pay the remaining fee for {y}.",
        "Original documents of students were retained at admission in {y}. When I asked to withdraw they refused to return the documents unless I pay Rs {amt}.",
        "My original mark sheets and leaving certificate are withheld by the college. They say the dues are pending but the dues are disputed.",
    ],
    "unapproved": [
        "The college is running {course} with an intake higher than the AICTE approved intake for {y}. Students were admitted without the course being approved.",
        "A new programme {course} was advertised and admissions were taken although AICTE approval for this course has not been granted.",
        "The institute admitted students in a course that is not on the AICTE approved list. Students are worried that their degree will not be valid.",
    ],
    "faculty": [
        "The college shows faculty on paper but there are not enough teachers in {course}. Many faculty names in the AICTE disclosure do not teach here.",
        "There is severe faculty shortage in {course} and classes are taken by guest teachers. The student faculty ratio is far above the norm.",
        "Faculty shown in the mandatory disclosure are fake. Several of them are also listed in other colleges at the same time.",
    ],
    "ragging": [
        "Senior students are ragging first-year students in the hostel at night. The warden has not taken any action even after a written complaint.",
        "My son was physically and mentally harassed by seniors in the hostel. The college is trying to hide the matter and has not informed the anti-ragging committee.",
        "Ragging incident reported in the {course} batch. Victims are afraid to come forward and the institution has not filed any report.",
    ],
    "scholarship": [
        "The scholarship amount for {y} has been received by the college but is not passed on to students. The college says it is under process.",
        "Students of the reserved category are not getting their scholarship. The management has taken the money and shows it as adjusted against fees.",
    ],
    "infra": [
        "The laboratories for {course} do not have the equipment shown at the time of inspection. Students cannot complete practical sessions.",
        "The campus does not have the library, laboratory and classroom space promised at admission. The inspection was arranged by the college.",
    ],
    "placement": [
        "The college advertised 100 percent placement but most students of {y} did not get any offer. The placement figures shown are false.",
        "Placement claims in the brochure are misleading. Package numbers shown are of a few students and the rest were not placed.",
    ],
    "admission": [
        "Management quota seats for {y} were sold for lakhs of rupees while meritorious students were denied admission.",
        "The college admitted students without following the counselling process and took capitation fees for {course}.",
    ],
    "financial": [
        "Funds collected from students are being diverted to other institutions of the same trust. Accounts are not shown even when asked.",
        "The trust is moving fee money to its other colleges and the infrastructure grant is not used for the purpose stated. An audit is needed.",
    ],
    "harassment": [
        "The management is threatening students who complained about fees with detention in internal marks and removal from hostel.",
        "Students and staff who spoke up are being harassed by the administration. Several faculty were terminated without notice.",
    ],
}

HI = {
    "fee_excess": ["कॉलेज ने शैक्षणिक वर्ष {y} के लिए तय फीस से अधिक फीस ली है और बार-बार कहने पर भी अतिरिक्त राशि वापस नहीं की जा रही है।",
                   "प्रबंधन ने {course} में प्रवेश के समय अतिरिक्त Rs {amt} मांगे और रसीद देने से मना कर दिया।"],
    "fee_refund": ["प्रवेश रद्द करने के बाद भी कॉलेज मेरी फीस वापस नहीं कर रहा है। रिफंड की राशि Rs {amt} अभी तक रोकी गई है।"],
    "cert_withheld": ["संस्थान ने मेरे मूल प्रमाणपत्र रोक रखे हैं और बकाया फीस जमा किए बिना लौटाने से मना कर रहा है।"],
    "ragging": ["छात्रावास में वरिष्ठ छात्र नए छात्रों की रैगिंग कर रहे हैं और वार्डन कोई कार्रवाई नहीं कर रहा है।"],
}
TA = {
    "fee_excess": ["கல்லூரி {y} கல்வியாண்டுக்கு நிர்ணயிக்கப்பட்ட கட்டணத்தை விட அதிக கட்டணம் வசூலித்துள்ளது, கேட்டும் திருப்பித் தரவில்லை."],
    "fee_refund": ["சேர்க்கையை ரத்து செய்த பிறகும் கல்லூரி என் கட்டணத்தைத் திருப்பித் தர மறுக்கிறது. Rs {amt} இன்னும் நிறுத்தி வைக்கப்பட்டுள்ளது."],
    "cert_withheld": ["கல்லூரி என் அசல் சான்றிதழ்களை வைத்துக்கொண்டு கட்டண பாக்கி செலுத்தாமல் திருப்பித் தர மறுக்கிறது."],
}
TE = {
    "fee_excess": ["కళాశాల {y} విద్యా సంవత్సరానికి నిర్ణయించిన ఫీజు కంటే ఎక్కువ వసూలు చేసింది, అదనపు మొత్తాన్ని తిరిగి ఇవ్వడం లేదు."],
    "fee_refund": ["అడ్మిషన్ రద్దు చేసిన తర్వాత కూడా కళాశాల నా ఫీజు తిరిగి ఇవ్వడం లేదు. Rs {amt} ఆపివేశారు."],
}
LANG_TEMPLATES = {"hi": HI, "ta": TA, "te": TE}

# --- Offline glossary translator (stand-in for the Bhashini translation adapter) -----------------------
GLOSSARY = {
    "फीस": "fee", "शुल्क": "fee", "अधिक": "excess", "अतिरिक्त": "excess", "वापस": "refund", "रिफंड": "refund",
    "प्रमाणपत्र": "certificate", "मूल": "original", "रोक": "withheld", "रैगिंग": "ragging", "छात्रावास": "hostel",
    "छात्रवृत्ति": "scholarship", "प्रवेश": "admission", "कॉलेज": "college", "संस्थान": "institution",
    "கட்டணம்": "fee", "கட்டணத்தை": "fee", "அதிக": "excess", "திருப்பித்": "refund", "அசல்": "original",
    "சான்றிதழ்": "certificate", "சான்றிதழ்களை": "certificate", "கல்லூரி": "college", "சேர்க்கை": "admission",
    "உதவித்தொகை": "scholarship", "ராகிங்": "ragging",
    "ఫీజు": "fee", "ఎక్కువ": "excess", "తిరిగి": "refund", "సర్టిఫికేట్": "certificate", "కళాశాల": "college",
    "అడ్మిషన్": "admission", "స్కాలర్‌షిప్": "scholarship", "ర్యాగింగ్": "ragging",
}

# Phrase-level hints so a regional-language complaint still gets a readable English summary.
EN_GIST = {
    "fee_excess": "The college has collected excess fee above the approved amount and is not refunding it.",
    "fee_refund": "The college refuses to refund the fee after the student cancelled admission.",
    "cert_withheld": "The institution is withholding original certificates until dues are paid.",
    "ragging": "Senior students are ragging juniors in the hostel and no action is taken.",
}

CONTRADICTION_MATRIX_YAML = """
# Action Consistency Engine - contradiction matrix. Deterministic and auditable: every collision cites a rule id.
# severity: hard  -> the two actions cannot both stand (Tier 5, mandatory joint resolution)
#           soft  -> overlapping or duplicative (Tier 4, joint review before proceeding)
rules:
  - id: R01
    pair: [close_case, show_cause]
    severity: hard
    why: One bureau is closing the matter as no-violation while another is issuing a show cause notice on the same subject.
    ref: AICTE Approval Process Handbook 2021-22, cl. 8.17 (committee route must be followed in sequence)
  - id: R02
    pair: [close_case, penalty]
    severity: hard
    why: A closure cannot stand alongside a financial penalty for the same subject.
    ref: AICTE Approval Process Handbook 2021-22, cl. 8.17
  - id: R03
    pair: [close_case, withdraw_approval]
    severity: hard
    why: Closing a matter while another bureau moves to withdraw approval is contradictory enforcement.
    ref: AICTE Approval Process Handbook 2021-22, cl. 8.1 and 8.17
  - id: R04
    pair: [close_case, hearing]
    severity: hard
    why: A matter referred to the hearing committee cannot be closed by another bureau.
    ref: AICTE Approval Process Handbook 2021-22, cl. 8.17
  - id: R05
    pair: [extend_approval, withdraw_approval]
    severity: hard
    why: Extension of approval and withdrawal of approval for the same institution are mutually exclusive.
    ref: AICTE Approval Process Handbook 2021-22, cl. 8.1
  - id: R06
    pair: [extend_approval, show_cause]
    severity: soft
    why: Approval is being extended while a show cause notice on the same subject is pending.
    ref: AICTE Approval Process Handbook 2021-22, cl. 8.17
  - id: R07
    pair: [new_course, cap_intake]
    severity: hard
    why: A new course is being approved while intake is being capped or reduced for the same institution.
    ref: AICTE Approval Process Handbook 2021-22, cl. 8.1
  - id: R08
    pair: [new_course, withdraw_approval]
    severity: hard
    why: A new course cannot be approved for an institution whose approval is proposed to be withdrawn.
    ref: AICTE Approval Process Handbook 2021-22, cl. 8.1
  - id: R09
    pair: [show_cause, show_cause]
    severity: soft
    why: Two bureaus are issuing separate show cause notices on the same subject. Consolidate into one notice.
    ref: SYNAPSE single-window notice principle
  - id: R10
    pair: [penalty, penalty]
    severity: hard
    why: Two financial penalties are proposed for the same subject (double penalty).
    ref: AICTE Approval Process Handbook 2021-22, cl. 8.17
  - id: R11
    pair: [warning, withdraw_approval]
    severity: soft
    why: A warning and a withdrawal of approval are proposed together; the escalation ladder is being skipped.
    ref: AICTE Approval Process Handbook 2021-22, cl. 8.17 (scrutiny, warning/show cause, hearing, Executive Committee)
  - id: R12
    pair: [expert_visit, expert_visit]
    severity: soft
    why: Two expert visits are planned for the same institution. Consolidate into one joint inspection.
    ref: SYNAPSE single-window notice principle
  - id: R13
    pair: [refund_order, penalty]
    severity: soft
    why: A refund order and a penalty on the same fee issue should be sequenced in one decision.
    ref: AICTE fee refund directive
  - id: R14
    pair: [audit, close_case]
    severity: hard
    why: A financial audit is open while another bureau is closing the related matter.
    ref: AICTE Approval Process Handbook 2021-22, cl. 8.17
  - id: R16
    pair: [show_cause, penalty]
    severity: soft
    why: Both actions relate to the same irregularity and may lead to overlapping or contradictory enforcement.
    ref: AICTE Approval Process Handbook 2021-22, cl. 8.17
  - id: R15
    pair: [warning, show_cause]
    severity: soft
    why: Two bureaus are taking different levels of enforcement on the same subject.
    ref: AICTE Approval Process Handbook 2021-22, cl. 8.17
"""
