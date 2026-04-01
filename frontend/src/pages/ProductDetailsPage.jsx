import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE_URL, buildBagRouteUrl } from "../lib/api";
import { getAuthHeaders, getUserRole } from "../lib/auth";
import { formatDate, parseDateInputBoundary, parseResponse } from "../lib/network";

const PRODUCT_QUEUE_KEY = "ngo_product_registration_queue_v1";

function buildMakerNamesText(bag) {
  if (Array.isArray(bag.maker_names) && bag.maker_names.length) {
    return bag.maker_names.join(", ");
  }
  return bag.maker_name || "Unknown";
}

function getPendingQueueCount() {
  try {
    const raw = window.localStorage.getItem(PRODUCT_QUEUE_KEY);
    if (!raw) {
      return 0;
    }
    const queue = JSON.parse(raw);
    return Array.isArray(queue) ? queue.length : 0;
  } catch (error) {
    return 0;
  }
}

export default function ProductDetailsPage() {
  const navigate = useNavigate();
  const [allProducts, setAllProducts] = useState([]);
  const [statusMessage, setStatusMessage] = useState("");
  const [statusType, setStatusType] = useState("");
  const [productSearchText, setProductSearchText] = useState("");
  const [productFromDate, setProductFromDate] = useState("");
  const [productToDate, setProductToDate] = useState("");
  const [pendingCount, setPendingCount] = useState(getPendingQueueCount());
  const [selectedQrBag, setSelectedQrBag] = useState(null);
  const [brokenImageByBagId, setBrokenImageByBagId] = useState({});
  const [isQrPreviewBroken, setIsQrPreviewBroken] = useState(false);
  const [qrAnimationSeed, setQrAnimationSeed] = useState(0);
  const userRole = getUserRole();

  const isAdmin = userRole === "admin";

  const setStatus = useCallback((message, type = "") => {
    setStatusMessage(message);
    setStatusType(type);
  }, []);

  const handleSelectQrBag = useCallback(
    (bag) => {
      setSelectedQrBag(bag);
      setQrAnimationSeed((previousSeed) => previousSeed + 1);
      setIsQrPreviewBroken(false);
      setStatus("QR loaded for selected product.", "success");
    },
    [setStatus]
  );

  const filteredProducts = useMemo(() => {
    const searchQuery = productSearchText.trim().toLowerCase();
    const fromBoundary = parseDateInputBoundary(productFromDate, false);
    const toBoundary = parseDateInputBoundary(productToDate, true);

    return allProducts.filter((product) => {
      const createdAt = new Date(product.created_at || "");
      const hasValidCreatedAt = !Number.isNaN(createdAt.getTime());

      if (searchQuery) {
        const idText = String(product.id || "").toLowerCase();
        const makerText = buildMakerNamesText(product).toLowerCase();
        const materialText = String(product.material_used || "").toLowerCase();
        const matchesSearch =
          idText.includes(searchQuery) ||
          makerText.includes(searchQuery) ||
          materialText.includes(searchQuery);

        if (!matchesSearch) {
          return false;
        }
      }

      if (fromBoundary && (!hasValidCreatedAt || createdAt < fromBoundary)) {
        return false;
      }

      if (toBoundary && (!hasValidCreatedAt || createdAt > toBoundary)) {
        return false;
      }

      return true;
    });
  }, [allProducts, productFromDate, productSearchText, productToDate]);

  const loadProducts = useCallback(async () => {
    setStatus("Loading product details...", "info");

    try {
      const response = await fetch(`${API_BASE_URL}/all-bags`, {
        headers: getAuthHeaders()
      });
      const products = await parseResponse(response);
      setAllProducts(products);
      setBrokenImageByBagId({});
      setPendingCount(getPendingQueueCount());
      setStatus("Product details updated.", "success");
    } catch (error) {
      setAllProducts([]);
      setPendingCount(getPendingQueueCount());
      setStatus(error.message, "error");
    }
  }, [setStatus]);

  const updateProductRecord = useCallback(
    async (productId, formData, successMessage) => {
      setStatus("Updating product...", "info");

      const response = await fetch(`${API_BASE_URL}/bag/${encodeURIComponent(productId)}`, {
        method: "PUT",
        headers: getAuthHeaders(),
        body: formData
      });
      await parseResponse(response);
      setStatus(successMessage, "success");
      await loadProducts();
    },
    [loadProducts, setStatus]
  );

  const handleEditProductMaterial = useCallback(
    async (bag) => {
      if (!isAdmin) {
        setStatus("Only admin can edit products.", "error");
        return;
      }

      const editedMaterial = window.prompt(
        `Update material for product ${bag.id || ""}`,
        bag.material_used || ""
      );

      if (editedMaterial === null) {
        return;
      }

      const materialUsed = editedMaterial.trim();
      if (!materialUsed) {
        setStatus("Material cannot be empty.", "error");
        return;
      }

      try {
        const formData = new FormData();
        formData.append("material_used", materialUsed);
        await updateProductRecord(bag.id, formData, "Product material updated.");
      } catch (error) {
        setStatus(error.message, "error");
      }
    },
    [isAdmin, setStatus, updateProductRecord]
  );

  const handleEditProductPhoto = useCallback(
    (bag) => {
      if (!isAdmin) {
        setStatus("Only admin can edit products.", "error");
        return;
      }

      const imagePicker = document.createElement("input");
      imagePicker.type = "file";
      imagePicker.accept = "image/*";

      imagePicker.addEventListener("change", async () => {
        const selectedFile = imagePicker.files?.[0];
        if (!selectedFile) {
          return;
        }

        try {
          const formData = new FormData();
          formData.append("product_image", selectedFile);
          await updateProductRecord(bag.id, formData, "Product photo updated.");
        } catch (error) {
          setStatus(error.message, "error");
        }
      });

      imagePicker.click();
    },
    [isAdmin, setStatus, updateProductRecord]
  );

  const handleDeleteProduct = useCallback(
    async (bag) => {
      if (!isAdmin) {
        setStatus("Only admin can delete products.", "error");
        return;
      }

      const isConfirmed = window.confirm(`Delete product ${bag.id || "-"}?`);
      if (!isConfirmed) {
        return;
      }

      setStatus("Deleting product...", "info");

      try {
        const response = await fetch(`${API_BASE_URL}/bag/${encodeURIComponent(bag.id)}`, {
          method: "DELETE",
          headers: getAuthHeaders()
        });

        await parseResponse(response);
        setStatus("Product deleted.", "success");
        await loadProducts();
      } catch (error) {
        setStatus(error.message, "error");
      }
    },
    [isAdmin, loadProducts, setStatus]
  );

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    setIsQrPreviewBroken(false);
  }, [selectedQrBag?.id]);

  useEffect(() => {
    const handleOnline = () => {
      loadProducts();
    };

    const handleStorage = (event) => {
      if (event.key === PRODUCT_QUEUE_KEY) {
        setPendingCount(getPendingQueueCount());
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("storage", handleStorage);
    };
  }, [loadProducts]);

  return (
    <main className="page">
      <section className="card soft">
        <button type="button" className="secondary small" onClick={() => navigate("/admin")}>
          Back to Dashboard
        </button>

        <h2>Product Details</h2>

        <div className="team-summary">
          <p>
            <strong>Products:</strong> <span>{filteredProducts.length}</span>
          </p>
          <p>
            <strong>Pending Sync:</strong> <span>{pendingCount}</span>
          </p>
        </div>

        <div className="filter-grid">
          <input
            type="text"
            placeholder="Search by ID, maker or material"
            aria-label="Search products"
            value={productSearchText}
            onChange={(event) => {
              setProductSearchText(event.target.value);
            }}
          />
          <input
            type="date"
            aria-label="Product from date"
            value={productFromDate}
            onChange={(event) => {
              setProductFromDate(event.target.value);
            }}
          />
          <input
            type="date"
            aria-label="Product to date"
            value={productToDate}
            onChange={(event) => {
              setProductToDate(event.target.value);
            }}
          />
          <button
            type="button"
            className="secondary filter-reset-btn"
            onClick={() => {
              setProductSearchText("");
              setProductFromDate("");
              setProductToDate("");
            }}
          >
            Reset
          </button>
        </div>

        <p className="muted helper-text">
          Click a product photo or View QR to preview its QR code.
        </p>

        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Photo</th>
                <th>Product ID</th>
                <th>Maker</th>
                <th>Material</th>
                <th>Added</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {!filteredProducts.length && (
                <tr>
                  <td colSpan={6} className="muted table-empty">
                    No products matched this filter.
                  </td>
                </tr>
              )}
              {filteredProducts.map((bag) => (
                <tr key={bag.id}>
                  <td>
                    {bag.product_image_url && !brokenImageByBagId[bag.id] ? (
                      <button
                        type="button"
                        className="photo-thumb-btn"
                        onClick={() => handleSelectQrBag(bag)}
                      >
                        <img
                          className="table-product-photo"
                          src={bag.product_image_url}
                          alt={`Product image for ${bag.id || "product"}`}
                          onError={() => {
                            setBrokenImageByBagId((prevState) => ({
                              ...prevState,
                              [bag.id]: true
                            }));
                          }}
                        />
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="secondary action-btn"
                        onClick={() => handleSelectQrBag(bag)}
                      >
                        View QR
                      </button>
                    )}
                  </td>
                  <td className="mono-text">{bag.id || "-"}</td>
                  <td>{buildMakerNamesText(bag)}</td>
                  <td>{bag.material_used || "-"}</td>
                  <td>{formatDate(bag.created_at)}</td>
                  <td>
                    <div className="table-actions">
                      <button
                        type="button"
                        className="secondary action-btn"
                        disabled={!isAdmin}
                        onClick={() => handleEditProductMaterial(bag)}
                      >
                        Edit Material
                      </button>
                      <button
                        type="button"
                        className="secondary action-btn"
                        disabled={!isAdmin}
                        onClick={() => handleEditProductPhoto(bag)}
                      >
                        Edit Photo
                      </button>
                      <button
                        type="button"
                        className="danger action-btn"
                        disabled={!isAdmin}
                        onClick={() => handleDeleteProduct(bag)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {selectedQrBag?.id ? (
          <div key={`${selectedQrBag.id}-${qrAnimationSeed}`} className="qr-section is-visible">
            <p className="qr-title">Product QR Code</p>
            <p className="qr-tagline">Dynamic secure trace reveal</p>
            <div className="qr-stage">
              <div className="qr-logo-cut" aria-hidden="true">
                <span className="qr-logo-slice qr-logo-left">
                  <img src="/ngo-logo.png" alt="" />
                </span>
                <span className="qr-logo-slice qr-logo-right">
                  <img src="/ngo-logo.png" alt="" />
                </span>
              </div>
              <div className="qr-frame">
                <span className="qr-orbit qr-orbit-one" aria-hidden="true"></span>
                <span className="qr-orbit qr-orbit-two" aria-hidden="true"></span>
                {!isQrPreviewBroken && (
                  <img
                    alt="Product QR code"
                    src={`${API_BASE_URL}/qr/${encodeURIComponent(selectedQrBag.id)}.png`}
                    onError={() => {
                      setIsQrPreviewBroken(true);
                    }}
                  />
                )}
                {isQrPreviewBroken && (
                  <p className="muted">QR preview is unavailable for this product.</p>
                )}
              </div>
            </div>
            <div className="qr-detail-sheet">
              <p>
                <strong>ID:</strong> <span className="mono-text">{selectedQrBag.id}</span>
              </p>
              <p>
                <strong>Maker:</strong> <span>{buildMakerNamesText(selectedQrBag)}</span>
              </p>
              <p>
                <strong>Material:</strong> <span>{selectedQrBag.material_used || "-"}</span>
              </p>
            </div>
            <a
              href={buildBagRouteUrl(selectedQrBag.id)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open Bag Details Page
            </a>
          </div>
        ) : (
          null
        )}

        <p className={`status${statusType ? ` status-${statusType}` : ""}`}>{statusMessage}</p>
      </section>
    </main>
  );
}
