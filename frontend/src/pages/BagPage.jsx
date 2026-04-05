import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { API_BASE_URL } from "../lib/api";
import { NGO_LOGO_URL } from "../lib/assets";
import { resolveProductImageUrl } from "../lib/media";
import { parseResponse } from "../lib/network";

function getMakerNamesText(bag) {
  if (Array.isArray(bag?.maker_names) && bag.maker_names.length) {
    return bag.maker_names.join(", ");
  }
  return bag?.maker_name || "-";
}

function getBagNameText(bag) {
  return bag?.product_name || bag?.bag_name || "Handmade Bag";
}

function getEmployeeStoryText(bag) {
  if (Array.isArray(bag?.employee_profiles) && bag.employee_profiles.length) {
    return bag.employee_profiles
      .map((profile) => {
        const name = profile?.name || "Unknown";
        const story = profile?.story || "No story added.";
        return `${name}: ${story}`;
      })
      .join("\n\n");
  }
  return bag?.employee_story || "-";
}

const HINDI_TRANSLATE_BASE_URL =
  "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=hi&dt=t&q=";

function extractTranslatedText(payload) {
  if (!Array.isArray(payload) || !Array.isArray(payload[0])) {
    return "";
  }

  return payload[0]
    .map((segment) => {
      if (!Array.isArray(segment)) {
        return "";
      }
      return String(segment[0] || "");
    })
    .join("")
    .trim();
}

export default function BagPage() {
  const location = useLocation();
  const [bag, setBag] = useState(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [statusType, setStatusType] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isProductImageBroken, setIsProductImageBroken] = useState(false);
  const [isHindiVisible, setIsHindiVisible] = useState(false);
  const [translatedStoryText, setTranslatedStoryText] = useState("");
  const [isTranslatingStory, setIsTranslatingStory] = useState(false);

  const bagId = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return (params.get("id") || "").trim();
  }, [location.search]);
  const productImageUrl = useMemo(
    () => resolveProductImageUrl(bag?.product_image_url),
    [bag?.product_image_url]
  );
  const originalStoryText = useMemo(() => getEmployeeStoryText(bag), [bag]);
  const canTranslateStory = useMemo(
    () => Boolean(originalStoryText && originalStoryText !== "-"),
    [originalStoryText]
  );
  const displayedStoryText = isHindiVisible && translatedStoryText ? translatedStoryText : originalStoryText;

  useEffect(() => {
    document.body.classList.add("bag-page");

    return () => {
      document.body.classList.remove("bag-page");
    };
  }, []);

  useEffect(() => {
    async function loadBag() {
      if (!bagId) {
        setStatusMessage("Bag ID missing in URL. Use /#/bag?id=<bag_id>");
        setStatusType("error");
        setIsLoading(false);
        setIsLoaded(false);
        return;
      }

      setIsLoading(true);
      setIsLoaded(false);
      setStatusMessage("Loading bag details...");
      setStatusType("info");

      try {
        const response = await fetch(`${API_BASE_URL}/bag/${encodeURIComponent(bagId)}`);
        const data = await parseResponse(response);
        setBag(data);
        setStatusMessage("");
        setStatusType("");
        setIsLoading(false);
        setIsLoaded(true);
      } catch (error) {
        setStatusMessage(error.message);
        setStatusType("error");
        setIsLoading(false);
        setIsLoaded(false);
      }
    }

    loadBag();
  }, [bagId]);

  useEffect(() => {
    setIsProductImageBroken(false);
  }, [bag?.id, bag?.product_image_url]);

  useEffect(() => {
    setIsHindiVisible(false);
    setTranslatedStoryText("");
    setIsTranslatingStory(false);
  }, [bag?.id, originalStoryText]);

  const handleAutoTranslateToHindi = useCallback(async () => {
    if (!canTranslateStory) {
      setStatusMessage("No story text available to translate.");
      setStatusType("warning");
      return;
    }

    if (translatedStoryText) {
      setIsHindiVisible((previousValue) => !previousValue);
      return;
    }

    if (!window.navigator.onLine) {
      setStatusMessage("Auto translate to Hindi works only with internet.");
      setStatusType("warning");
      return;
    }

    setIsTranslatingStory(true);
    setStatusMessage("Translating story to Hindi...");
    setStatusType("info");

    try {
      const response = await fetch(
        `${HINDI_TRANSLATE_BASE_URL}${encodeURIComponent(originalStoryText)}`,
        { cache: "no-store" }
      );

      if (!response.ok) {
        throw new Error(`Translation failed with status ${response.status}`);
      }

      const payload = await response.json();
      const translatedText = extractTranslatedText(payload);

      if (!translatedText) {
        throw new Error("Translation response is empty");
      }

      setTranslatedStoryText(translatedText);
      setIsHindiVisible(true);
      setStatusMessage("Story translated to Hindi.");
      setStatusType("success");
    } catch (error) {
      if (!window.navigator.onLine) {
        setStatusMessage("Auto translate to Hindi works only with internet.");
        setStatusType("warning");
      } else {
        setStatusMessage("Could not translate the story right now. Please try again.");
        setStatusType("error");
      }
    } finally {
      setIsTranslatingStory(false);
    }
  }, [canTranslateStory, originalStoryText, translatedStoryText]);

  return (
    <main className="page bag-layout">
      <section className={`card bag-card${isLoading ? " is-loading" : ""}${isLoaded ? " is-loaded" : ""}`}>
        <div className="bag-hero">
          <img className="bag-hero-logo" src={NGO_LOGO_URL} alt="NGO logo" loading="eager" />
          <p className="bag-kicker">NGO Impact Trace</p>
          <h1>Bag Story Card</h1>
          <p className="subtitle bag-subtitle">
            <em>Every handmade bag carries a story of dignity, effort, and hope.</em>
          </p>
          <button className="bag-donate-chip" type="button" aria-label="Support this mission through donation">
            <svg
              className="bag-donate-icon"
              viewBox="0 0 24 24"
              role="img"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5A4.5 4.5 0 0 1 6.5 4 5 5 0 0 1 12 7.09 5 5 0 0 1 17.5 4 4.5 4.5 0 0 1 22 8.5c0 3.78-3.4 6.86-8.55 11.54z" />
            </svg>
            <span>Support This Work</span>
          </button>
        </div>

        <p className={`status${statusType ? ` status-${statusType}` : ""}`}>{statusMessage}</p>

        <div className="bag-detail-grid">
          <article className="bag-detail bag-meta-name">
            <p className="bag-label">Bag Name</p>
            <p className="bag-value">{getBagNameText(bag)}</p>
          </article>

          <article className="bag-detail bag-meta-maker">
            <p className="bag-label">Crafted By</p>
            <p className="bag-value">{getMakerNamesText(bag)}</p>
          </article>

          <article className="bag-detail bag-meta-material">
            <p className="bag-label">Material</p>
            <p className="bag-value">{bag?.material_used || "-"}</p>
          </article>

          <article className="bag-detail bag-product-image">
            <p className="bag-label">Product Preview</p>
            <img
              className={`bag-product-image-preview${
                productImageUrl && !isProductImageBroken ? "" : " hidden"
              }`}
              src={productImageUrl || undefined}
              alt="Product"
              onError={() => {
                setIsProductImageBroken(true);
              }}
            />
            {(!productImageUrl || isProductImageBroken) && (
              <p className="muted">No product image available.</p>
            )}
          </article>

          <article className="bag-detail bag-story">
            <div className="bag-story-header">
              <img className="bag-story-logo" src={NGO_LOGO_URL} alt="NGO logo" loading="lazy" />
              <p className="bag-label">Employee Story</p>
            </div>
            <div className="bag-story-tools">
              <button
                type="button"
                className="bag-translate-btn secondary"
                onClick={handleAutoTranslateToHindi}
                disabled={!canTranslateStory || isTranslatingStory}
                aria-label="Auto translate employee story to Hindi"
              >
                <svg
                  className="bag-translate-icon"
                  viewBox="0 0 24 24"
                  role="img"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path d="M3 6h11v2h-1.7c-.3 1.8-1 3.5-1.9 4.8.9.7 2 1.3 3.3 1.8l-.8 1.8c-1.5-.6-2.8-1.3-3.9-2.2a12 12 0 0 1-3.9 2.2l-.8-1.8c1.3-.5 2.4-1.1 3.3-1.8-.9-1.3-1.6-3-1.9-4.8H3V6zm3.4 2c.2 1.3.7 2.6 1.5 3.7.8-1.1 1.3-2.4 1.5-3.7H6.4zM16 5h2l3 8h-2l-.6-1.8h-3L14.8 13h-2L16 5zm-.1 4.4h2L17 6.9l-1.1 2.5zM14 15h7v2h-7v-2zm0 3h7v2h-7v-2z" />
                </svg>
                <span>
                  {isTranslatingStory
                    ? "Translating..."
                    : isHindiVisible
                    ? "Show Original Story"
                    : translatedStoryText
                    ? "Show Hindi Translation"
                    : "Auto Translate Hindi"}
                </span>
              </button>
              <p className="bag-translate-hint">Auto translate to Hindi works only with internet.</p>
            </div>
            <p className="bag-story-text">{displayedStoryText}</p>
          </article>
        </div>
      </section>
    </main>
  );
}
