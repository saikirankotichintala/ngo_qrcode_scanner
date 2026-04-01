import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { API_BASE_URL } from "../lib/api";
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

export default function BagPage() {
  const location = useLocation();
  const [bag, setBag] = useState(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [statusType, setStatusType] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isProductImageBroken, setIsProductImageBroken] = useState(false);

  const bagId = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return (params.get("id") || "").trim();
  }, [location.search]);

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

  return (
    <main className="page bag-layout">
      <section className={`card bag-card${isLoading ? " is-loading" : ""}${isLoaded ? " is-loaded" : ""}`}>
        <div className="bag-hero">
          <img className="bag-hero-logo" src="/ngo-logo.png" alt="NGO logo" loading="eager" />
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
                bag?.product_image_url && !isProductImageBroken ? "" : " hidden"
              }`}
              src={bag?.product_image_url || undefined}
              alt="Product"
              onError={() => {
                setIsProductImageBroken(true);
              }}
            />
            {(!bag?.product_image_url || isProductImageBroken) && (
              <p className="muted">No product image available.</p>
            )}
          </article>

          <article className="bag-detail bag-story">
            <div className="bag-story-header">
              <img className="bag-story-logo" src="/ngo-logo.png" alt="NGO logo" loading="lazy" />
              <p className="bag-label">Employee Story</p>
            </div>
            <p className="bag-story-text">{getEmployeeStoryText(bag)}</p>
          </article>
        </div>
      </section>
    </main>
  );
}
