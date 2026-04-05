import json
import re
import urllib.error
import urllib.request

from flask import Blueprint, jsonify

from config import GROQ_API_KEY, GROQ_MODEL
from helpers import clean_text, error_response, parse_request_data

gemini_bp = Blueprint("gemini", __name__)
GROQ_USER_AGENT = "ngo-qrcode-scanner/1.0"


def extract_groq_text(payload):
    collected = []
    for choice in payload.get("choices", []):
        if not isinstance(choice, dict):
            continue

        message = choice.get("message")
        if not isinstance(message, dict):
            continue

        text = clean_text(message.get("content"))
        if text:
            collected.append(text)

    return "\n".join(collected).strip()


def parse_groq_http_error(error):
    raw = error.read().decode("utf-8", errors="ignore")
    message = clean_text(raw)
    if message:
        try:
            error_payload = json.loads(raw)
            message = clean_text(error_payload.get("error", {}).get("message")) or message
        except ValueError:
            pass

    raw_lower = raw.lower()

    if "invalid api key" in raw_lower or "invalid_api_key" in raw_lower:
        return (
            "Groq API key is invalid or revoked. Replace GROQ_API_KEY in "
            "backend/.env with a new key from Groq, then restart the backend."
        )

    if "error code: 1010" in raw_lower:
        return (
            "Groq request was blocked by edge security (HTTP 403 / code 1010). "
            "Retry from a trusted network and avoid proxy/VPN. "
            "If it persists, contact Groq support with your source IP."
        )

    return message or str(error)


def normalize_leading_double_name(name, story_text):
    safe_name = clean_text(name)
    safe_story = clean_text(story_text)
    if not safe_name or not safe_story:
        return safe_story

    escaped_name = re.escape(safe_name)
    safe_story = re.sub(
        rf"^\s*{escaped_name}\s*:\s*{escaped_name}\b[\s,;-]*",
        f"{safe_name} ",
        safe_story,
        count=1,
        flags=re.IGNORECASE,
    )
    safe_story = re.sub(
        rf"^\s*{escaped_name}\s+{escaped_name}\b[\s,;-]*",
        f"{safe_name} ",
        safe_story,
        count=1,
        flags=re.IGNORECASE,
    )
    return safe_story.strip()


def generate_story_with_groq(name, story, mode):
    if not GROQ_API_KEY:
        raise RuntimeError(
            "GROQ_API_KEY is not configured on the server "
            "(set GROQ_API_KEY in backend/.env)"
        )

    safe_mode = mode if mode in {"generate", "improve"} else "improve"
    system_prompt = (
        "You are a storytelling assistant for an NGO website. "
        "Write one short employee profile paragraph in clear, warm, respectful English. "
        "Keep the language very easy to read for a general audience. "
        "The paragraph should sound genuine, human, and grounded, not polished sales copy. "
        "Avoid dramatic, exaggerated, or fake-sounding claims. "
        "Use 45 to 90 words. "
        "Do not use markdown, bullets, or quotation marks. "
        "Do not invent facts, numbers, places, or achievements that are not provided."
    )

    if safe_mode == "generate":
        mode_instruction = (
            "Create a fresh profile story from the available details. "
            "If details are limited, keep the story simple and truthful."
        )
    else:
        mode_instruction = (
            "Improve the draft story by fixing grammar and flow while preserving meaning. "
            "Keep all factual details consistent with the draft."
        )

    normalized_story = normalize_leading_double_name(name, story)

    user_prompt = (
        "Task:\n"
        f"{mode_instruction}\n\n"
        "Inputs:\n"
        f"- Employee name: {name or 'Not provided'}\n"
        f"- Draft story: {normalized_story or 'Not provided'}\n\n"
        "Output rules:\n"
        "- Return exactly one paragraph.\n"
        "- Keep it between 45 and 90 words.\n"
        "- Keep language simple, easy to read, and natural.\n"
        "- Make it feel genuine and realistic.\n"
        "- Avoid hype, dramatic phrasing, and over-promising language.\n"
        "- Use the employee name at most once.\n"
        "- Do not mention missing information.\n"
        "- Do not add made-up details."
    )

    request_payload = {
        "model": GROQ_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.3,
    }

    body = json.dumps(request_payload).encode("utf-8")
    groq_url = "https://api.groq.com/openai/v1/chat/completions"
    req = urllib.request.Request(
        groq_url,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": GROQ_USER_AGENT,
            "Authorization": f"Bearer {GROQ_API_KEY}",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            groq_payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        message = parse_groq_http_error(error)
        raise RuntimeError(f"Groq request failed: {message}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"Could not reach Groq service: {error.reason}") from error

    rewritten_story = extract_groq_text(groq_payload)
    if not rewritten_story:
        raise RuntimeError("Groq service returned an empty story")

    return normalize_leading_double_name(name, rewritten_story)


@gemini_bp.route("/ai/story", methods=["POST"])
def ai_story():
    data = parse_request_data()
    name = clean_text(data.get("name"))
    story = clean_text(data.get("story"))
    mode = clean_text(data.get("mode")).lower()

    if not GROQ_API_KEY:
        return error_response(
            "AI story assistant is not configured. Set GROQ_API_KEY "
            "in backend/.env, then restart backend.",
            503,
        )

    if mode not in {"generate", "improve"}:
        mode = "improve" if story else "generate"

    if mode == "improve" and not story:
        return error_response("story is required for improve mode")
    if mode == "generate" and not (name or story):
        return error_response("Provide at least name or story to generate content")

    try:
        improved_story = generate_story_with_groq(name, story, mode)
    except RuntimeError as error:
        return error_response(str(error), 503)

    return jsonify({"story": improved_story, "model": GROQ_MODEL})
