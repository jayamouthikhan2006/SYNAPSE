"""E10 - LLM Firewall.

Complaint text is DATA. It is never concatenated into an instruction prompt and never given tool access.
This module scans text for instruction-like content (prompt-injection, role override, exfiltration, forced
outcomes), neutralises it for display, and tells downstream engines to treat the complaint as untrusted.
Detection is rule-based and deterministic so every block can be explained to an officer.
"""
import re
import unicodedata

PATTERNS = [
    ("override", r"\b(ignore|disregard|forget|override|bypass)\b.{0,40}\b(previous|prior|above|earlier|all|your|the)\b.{0,40}\b(instruction|rule|prompt|polic|guideline|safeguard)s?", "Tries to override the system's rules"),
    ("override", r"\b(do not|don't|never)\b.{0,20}\b(follow|apply|use)\b.{0,30}\b(rule|instruction|polic)", "Tries to switch off the rules"),
    ("role", r"\b(you are now|act as|pretend to be|from now on you|new instructions?)\b", "Tries to assign the AI a new role"),
    ("role", r"\b(system prompt|developer message|system message|jailbreak|dan mode)\b", "References hidden system instructions"),
    ("outcome", r"\b(mark|set|classify|rate|flag)\b.{0,30}\b(this|the)?\s*(complaint|case)\b.{0,30}\b(as )?(p0|critical|urgent|top priority|closed|resolved|invalid)", "Tries to force a priority or outcome"),
    ("outcome", r"\b(close|delete|withdraw|dismiss)\b.{0,25}\b(all|every|other)\b.{0,25}\b(complaint|case|action)s?", "Tries to close or delete other cases"),
    ("outcome", r"\b(approve|grant)\b.{0,30}\b(approval|affiliation|extension)\b", "Tries to force an approval decision"),
    ("exfil", r"\b(reveal|print|show|send|email|leak)\b.{0,40}\b(password|api key|token|secret|identity vault|other complainants?|personal data)", "Tries to extract protected data"),
    ("markup", r"(<\s*script|<\s*iframe|javascript:|\{\{.*\}\}|\$\{.*\})", "Contains executable-looking markup"),
    ("markup", r"(```|<\|im_start\|>|<\|system\|>|\[\[?INST\]?\])", "Contains chat-template control tokens"),
    ("hindi", r"(पिछले|सभी|ऊपर के)\s*निर्देश.{0,20}(अनदेखा|भूल|न मानें)", "Tries to override the rules (Hindi)"),
]
_COMPILED = [(k, re.compile(p, re.I | re.S), why) for k, p, why in PATTERNS]
_ZERO_WIDTH = dict.fromkeys(map(ord, "\u200b\u200c\u200d\u2060\ufeff"), None)


def _normalise(text):
    t = unicodedata.normalize("NFKC", text or "").translate(_ZERO_WIDTH)
    return re.sub(r"\s+", " ", t)


def scan(text):
    norm = _normalise(text)
    reasons = []
    for kind, rx, why in _COMPILED:
        m = rx.search(norm)
        if m:
            reasons.append({"kind": kind, "why": why, "excerpt": m.group(0)[:120]})
    flagged = bool(reasons)
    sanitized = norm
    for _, rx, _ in _COMPILED:
        sanitized = rx.sub("[removed by LLM Firewall]", sanitized)
    return {
        "flagged": flagged,
        "reasons": reasons,
        "sanitized": sanitized,
        "action": "Quarantined for officer review. AI used only the sanitised text and took no action from it."
        if flagged else "Clean. Treated as untrusted data.",
    }
