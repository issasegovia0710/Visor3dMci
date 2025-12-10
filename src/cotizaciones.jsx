import React, { useEffect, useMemo, useState } from "react";

/* =========================
   Config API (igual que en App)
========================= */

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";
// Rutas de cotizaciones (backend: /api/quotes/:id ...)
const API_QUOTES_URL = `${API_BASE_URL}/api/quotes`;

/* =========================
   Componente Cotizacion
========================= */

function Cotizacion({
  isOpen,
  onClose,
  projectId,
  projectName,
  projectPassword,
}) {
  const [items, setItems] = useState([
    { concepto: "", cantidad: 1, precio: 0, link: "" },
  ]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // Total calculado
  const total = useMemo(() => {
    return items.reduce((acc, it) => {
      const cantidad = Number(it.cantidad) || 0;
      const precio = Number(it.precio) || 0;
      return acc + cantidad * precio;
    }, 0);
  }, [items]);

  /* =========================
     Cargar cotización al abrir modal
  ========================== */
  useEffect(() => {
    if (!isOpen || !projectId) return;

    const controller = new AbortController();

    async function loadQuote() {
      setLoading(true);
      setError("");
      setMessage("");

      try {
        const url = `${API_QUOTES_URL}/${projectId}`;
        console.log("GET quote URL:", url);

        const resp = await fetch(url, {
          method: "GET",
          signal: controller.signal,
        });

        if (resp.status === 404) {
          console.warn("No hay cotización aún (404).");
          setItems([{ concepto: "", cantidad: 1, precio: 0, link: "" }]);
          return;
        }

        let data;
        try {
          data = await resp.json();
        } catch (e) {
          console.error("Respuesta no JSON en GET /quotes/:id", e);
          setError("El servidor no devolvió datos válidos de la cotización.");
          return;
        }

        if (!resp.ok || !data.ok) {
          console.error("Error lógico GET /quotes/:id:", data);
          setError(data.error || "No se pudo cargar la cotización.");
          return;
        }

        if (data.quote && Array.isArray(data.quote.items)) {
          const loadedItems = data.quote.items.map((it) => ({
            concepto: it.concepto || "",
            cantidad:
              typeof it.cantidad === "number"
                ? it.cantidad
                : Number(it.cantidad) || 0,
            precio:
              typeof it.precio === "number"
                ? it.precio
                : Number(it.precio) || 0,
            link: it.link || "",
          }));
          if (loadedItems.length > 0) {
            setItems(loadedItems);
          } else {
            setItems([{ concepto: "", cantidad: 1, precio: 0, link: "" }]);
          }
        } else {
          setItems([{ concepto: "", cantidad: 1, precio: 0, link: "" }]);
        }
      } catch (err) {
        if (err.name === "AbortError") return;
        console.error("Error de red GET /quotes/:id:", err);
        setError(err.message || "Error de red al cargar la cotización.");
      } finally {
        setLoading(false);
      }
    }

    loadQuote();

    return () => {
      controller.abort();
    };
  }, [isOpen, projectId]);

  /* =========================
     Handlers
  ========================== */

  const handleChangeItem = (index, field, value) => {
    setItems((prev) => {
      const next = [...prev];
      if (field === "cantidad" || field === "precio") {
        next[index] = {
          ...next[index],
          [field]: value === "" ? "" : Number(value),
        };
      } else {
        next[index] = { ...next[index], [field]: value };
      }
      return next;
    });
  };

  const handleAddRow = () => {
    setItems((prev) => [
      ...prev,
      { concepto: "", cantidad: 1, precio: 0, link: "" },
    ]);
  };

  const handleRemoveRow = (index) => {
    setItems((prev) => {
      if (prev.length === 1) {
        return [{ concepto: "", cantidad: 1, precio: 0, link: "" }];
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleOpenLink = (link) => {
    const url = (link || "").trim();
    if (!url) return;
    const finalUrl =
      url.startsWith("http://") || url.startsWith("https://")
        ? url
        : `https://${url}`;
    window.open(finalUrl, "_blank", "noopener,noreferrer");
  };

  const handleSave = async () => {
    setError("");
    setMessage("");

    if (!projectId) {
      setError("No hay proyecto activo para asociar la cotización.");
      return;
    }

    let pwd = projectPassword;
    if (!pwd) {
      pwd = window.prompt(
        "Contraseña del proyecto para guardar la cotización:"
      );
    }
    if (!pwd) {
      setError("Se requiere la contraseña del proyecto para guardar.");
      return;
    }

    const cleanItems = items
      .map((it) => ({
        concepto: (it.concepto || "").trim(),
        cantidad: Number(it.cantidad) || 0,
        precio: Number(it.precio) || 0,
        link: (it.link || "").trim(),
      }))
      .filter(
        (it) =>
          it.concepto !== "" ||
          it.cantidad > 0 ||
          it.precio > 0 ||
          it.link !== ""
      );

    if (cleanItems.length === 0) {
      setError("Agrega al menos un concepto con cantidad, precio o link.");
      return;
    }

    setSaving(true);
    try {
      const url = `${API_QUOTES_URL}/${projectId}`;
      console.log("PUT quote URL:", url);

      const resp = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: pwd,
          items: cleanItems,
          total,
        }),
      });

      if (resp.status === 404) {
        const text = await resp.text();
        console.error("Ruta /api/quotes/:id no encontrada:", text);
        setError(
          "El servidor no tiene la ruta /api/quotes. Revisa el server.js."
        );
        return;
      }

      let data;
      try {
        data = await resp.json();
      } catch (e) {
        const text = await resp.text();
        console.error("Respuesta no JSON en PUT /quotes/:id:", text);
        setError(
          "El servidor no devolvió JSON al guardar la cotización. Revisa el backend."
        );
        return;
      }

      if (!resp.ok || !data.ok) {
        console.error("Error lógico PUT /quotes/:id:", data);
        setError(data.error || "No se pudo guardar la cotización.");
        return;
      }

      setMessage("Cotización guardada correctamente.");
    } catch (err) {
      console.error("Error de red PUT /quotes/:id:", err);
      setError(err.message || "Error de red al guardar la cotización.");
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadExcel = () => {
    if (!projectId) return;
    const url = `${API_QUOTES_URL}/${projectId}/excel`;
    console.log("Descargar Excel URL:", url);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  /* =========================
     Render
  ========================== */

  if (!isOpen || !projectId) {
    return null;
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.9)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 80,
      }}
    >
      <div
        style={{
          width: "min(900px, 100% - 32px)",
          maxHeight: "90vh",
          background: "#020617",
          borderRadius: 24,
          border: "1px solid #1f2937",
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 4,
          }}
        >
          <div>
            <h2
              style={{
                fontSize: 18,
                color: "#e5e7eb",
                marginBottom: 2,
              }}
            >
              Cotización del proyecto
            </h2>
            <p
              style={{
                fontSize: 12,
                color: "#9ca3af",
              }}
            >
              Proyecto:{" "}
              <span style={{ color: "#e5e7eb" }}>
                {projectName || projectId}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: "none",
              background: "transparent",
              color: "#9ca3af",
              fontSize: 20,
              cursor: "pointer",
              padding: 4,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Mensajes */}
        {loading && (
          <div
            style={{
              fontSize: 12,
              color: "#93c5fd",
              marginBottom: 4,
            }}
          >
            Cargando cotización…
          </div>
        )}
        {error && (
          <div
            style={{
              fontSize: 12,
              color: "#fecaca",
              background: "rgba(127,29,29,0.25)",
              borderRadius: 8,
              padding: 6,
              marginBottom: 4,
            }}
          >
            {error}
          </div>
        )}
        {message && (
          <div
            style={{
              fontSize: 12,
              color: "#bbf7d0",
              background: "rgba(22,163,74,0.25)",
              borderRadius: 8,
              padding: 6,
              marginBottom: 4,
            }}
          >
            {message}
          </div>
        )}

        {/* Tabla de conceptos */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            borderRadius: 16,
            border: "1px solid #111827",
            background: "rgba(15,23,42,0.95)",
            padding: 10,
            overflowY: "auto",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "3fr 1fr 1fr 2fr 40px",
              gap: 8,
              paddingBottom: 4,
              borderBottom: "1px solid #1f2937",
              marginBottom: 8,
              fontSize: 12,
              color: "#9ca3af",
            }}
          >
            <div>Concepto</div>
            <div>Cantidad</div>
            <div>Precio</div>
            <div>Link</div>
            <div></div>
          </div>

          {items.map((item, index) => (
            <div
              key={index}
              style={{
                display: "grid",
                gridTemplateColumns: "3fr 1fr 1fr 2fr 40px",
                gap: 8,
                alignItems: "center",
                marginBottom: 6,
              }}
            >
              {/* Concepto */}
              <input
                type="text"
                value={item.concepto}
                onChange={(e) =>
                  handleChangeItem(index, "concepto", e.target.value)
                }
                placeholder="Descripción del concepto"
                style={{
                  fontSize: 12,
                  padding: "6px 8px",
                  borderRadius: 10,
                  border: "1px solid #374151",
                  background: "#020617",
                  color: "#e5e7eb",
                  outline: "none",
                }}
              />

              {/* Cantidad */}
              <input
                type="number"
                value={item.cantidad}
                onChange={(e) =>
                  handleChangeItem(index, "cantidad", e.target.value)
                }
                min="0"
                style={{
                  fontSize: 12,
                  padding: "6px 8px",
                  borderRadius: 10,
                  border: "1px solid #374151",
                  background: "#020617",
                  color: "#e5e7eb",
                  outline: "none",
                }}
              />

              {/* Precio */}
              <input
                type="number"
                value={item.precio}
                onChange={(e) =>
                  handleChangeItem(index, "precio", e.target.value)
                }
                min="0"
                step="0.01"
                style={{
                  fontSize: 12,
                  padding: "6px 8px",
                  borderRadius: 10,
                  border: "1px solid #374151",
                  background: "#020617",
                  color: "#e5e7eb",
                  outline: "none",
                }}
              />

              {/* Link + botón abrir */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <input
                  type="text"
                  value={item.link}
                  onChange={(e) =>
                    handleChangeItem(index, "link", e.target.value)
                  }
                  placeholder="URL del proveedor / referencia"
                  style={{
                    flex: 1,
                    fontSize: 12,
                    padding: "6px 8px",
                    borderRadius: 10,
                    border: "1px solid #374151",
                    background: "#020617",
                    color: "#e5e7eb",
                    outline: "none",
                  }}
                />
                <button
                  type="button"
                  onClick={() => handleOpenLink(item.link)}
                  style={{
                    flexShrink: 0,
                    padding: "4px 8px",
                    borderRadius: 999,
                    border: "1px solid #4b5563",
                    background: "rgba(37,99,235,0.3)",
                    color: "#bfdbfe",
                    fontSize: 12,
                    cursor: item.link ? "pointer" : "not-allowed",
                    opacity: item.link ? 1 : 0.5,
                  }}
                  title={
                    item.link
                      ? "Abrir enlace en nueva pestaña"
                      : "Sin enlace definido"
                  }
                >
                  🔗
                </button>
              </div>

              {/* Eliminar fila */}
              <button
                type="button"
                onClick={() => handleRemoveRow(index)}
                style={{
                  borderRadius: 999,
                  border: "1px solid #4b5563",
                  background: "rgba(127,29,29,0.3)",
                  color: "#fecaca",
                  fontSize: 14,
                  cursor: "pointer",
                  padding: "4px 0",
                }}
              >
                −
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={handleAddRow}
            style={{
              marginTop: 4,
              padding: "4px 10px",
              borderRadius: 999,
              border: "1px solid #4b5563",
              background:
                "linear-gradient(135deg, rgba(56,189,248,0.15), rgba(37,99,235,0.45))",
              color: "#bfdbfe",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            + Agregar concepto
          </button>
        </div>

        {/* Total + botones guardar / descargar */}
        <div
          style={{
            marginTop: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div
            style={{
              fontSize: 14,
              color: "#e5e7eb",
            }}
          >
            Total:{" "}
            <span
              style={{
                fontWeight: 600,
                color: "#a5b4fc",
              }}
            >
              ${total.toFixed(2)}
            </span>
          </div>

          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
            }}
          >
            <button
              type="button"
              onClick={handleDownloadExcel}
              style={{
                padding: "6px 12px",
                borderRadius: 999,
                border: "1px solid #4b5563",
                background:
                  "linear-gradient(135deg, rgba(59,130,246,0.2), rgba(37,99,235,0.6))",
                color: "#bfdbfe",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Descargar Excel
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: "6px 14px",
                borderRadius: 999,
                border: "1px solid #4b5563",
                background:
                  "linear-gradient(135deg, rgba(34,197,94,0.2), rgba(22,163,74,0.6))",
                color: "#bbf7d0",
                fontSize: 12,
                cursor: saving ? "wait" : "pointer",
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? "Guardando..." : "Guardar cotización"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Cotizacion;
