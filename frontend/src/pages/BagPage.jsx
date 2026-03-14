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

  return (
    <main className="page bag-layout">
      <section className={`card bag-card${isLoading ? " is-loading" : ""}${isLoaded ? " is-loaded" : ""}`}>
        <div className="bag-hero">
          <p className="bag-kicker">NGO Impact Trace</p>
          <h1>Bag Story Card</h1>
          <p className="subtitle bag-subtitle">
            <em>Every handmade bag carries a story of dignity, effort, and hope.</em>
          </p>
        </div>

        <p className={`status${statusType ? ` status-${statusType}` : ""}`}>{statusMessage}</p>

        <div className="bag-detail-grid">
          <article className="bag-detail bag-meta-id">
            <p className="bag-label">Bag ID</p>
            <p className="bag-value">{bag?.id || "-"}</p>
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
              className={`bag-product-image-preview${bag?.product_image_url ? "" : " hidden"}`}
              src={bag?.product_image_url || undefined}
              alt="Product"
            />
            {!bag?.product_image_url && <p className="muted">No product image uploaded.</p>}
          </article>

          <article className="bag-detail bag-story">
            <p className="bag-label">Employee Story</p>
            <p className="bag-story-text">{getEmployeeStoryText(bag)}</p>
          </article>
        </div>
      </section>
    </main>
  );
}
