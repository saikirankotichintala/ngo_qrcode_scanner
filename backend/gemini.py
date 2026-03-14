import json
import urllib.error
import urllib.request

from flask import Blueprint, jsonify

from config import GROQ_API_KEY, GROQ_MODEL
from helpers import clean_text, error_response, parse_request_data

gemini_bp = Blueprint("gemini", __name__)


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


def generate_story_with_groq(name, story, mode):
    if not GROQ_API_KEY:
        raise RuntimeError(
            "GROQ_API_KEY is not configured on the server "
            "(set GROQ_API_KEY in backend/.env)"
        )

    safe_mode = mode if mode in {"generate", "improve"} else "improve"
    system_prompt = (
        "You write short employee profile stories for an NGO website. "
        "Always return one polished paragraph in plain English with correct spelling and grammar. "
        "Keep the tone warm and respectful. "
        "Use 45 to 90 words. "
        "Do not use markdown. "
        "Do not invent concrete facts when they are missing; stay generic if needed."
    )
    user_prompt = (
        f"Mode: {safe_mode}\n"
        f"Employee name: {name or 'Not provided'}\n"
        f"Draft story: {story or 'Not provided'}\n\n"
        "If mode is generate, create a fresh story from available details. "
        "If mode is improve, rewrite the draft to fix spelling/grammar and make it flow naturally."
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
            "Authorization": f"Bearer {GROQ_API_KEY}",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            groq_payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        raw = error.read().decode("utf-8", errors="ignore")
        message = clean_text(raw)
        if message:
            try:
                error_payload = json.loads(raw)
                message = (
                    clean_text(error_payload.get("error", {}).get("message")) or message
                )
            except ValueError:
                pass
        message = message or str(error)
        raise RuntimeError(f"Groq request failed: {message}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"Could not reach Groq service: {error.reason}") from error

    rewritten_story = extract_groq_text(groq_payload)
    if not rewritten_story:
        raise RuntimeError("Groq service returned an empty story")

    return rewritten_story


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
