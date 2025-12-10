import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";
import { ThreeMFLoader } from "three/examples/jsm/loaders/3MFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

/* ============================================================
   Config general
   ============================================================ */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";
const API_PROJECTS_URL = `${API_BASE_URL}/api/projects`;
//const API_BASE_URL = "http://visor3dmci.netlify.app";


function slugify(str) {
  return (
    (str || "proyecto")
      .toString()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .substring(0, 40) || "proyecto"
  );
}

// Llamada real al backend para crear proyecto
async function guardarProyectoEnServidor({
  file,
  projectName,
  author,
  password,
  date,
  position,
  rotation,
  partsMeta,
}) {
  if (!file || !projectName || !password) {
    alert("Faltan datos (archivo, nombre o contraseña).");
    return;
  }

  const formData = new FormData();
  formData.append("model", file); // debe llamarse "model"
  formData.append("projectName", projectName);
  formData.append("author", author || "");
  formData.append("password", password);
  formData.append("date", date || "");
  formData.append("position", JSON.stringify(position || { x: 0, y: 0, z: 0 }));
  formData.append("rotation", JSON.stringify(rotation || { x: 0, y: 0, z: 0 }));
  formData.append("partsMeta", JSON.stringify(partsMeta || {}));

  const resp = await fetch(API_PROJECTS_URL, {
    method: "POST",
    body: formData,
  });

  const text = await resp.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    console.error("Respuesta no JSON en POST /api/projects:", text);
    throw new Error("El backend no devolvió JSON al crear proyecto.");
  }

  if (!resp.ok || !data.ok) {
    console.error(data);
    throw new Error(data.error || "Error al crear el proyecto en el servidor.");
  }

  return data; // data.projectId, etc.
}

/* ============================================================
   Colores y materiales
   ============================================================ */

const PART_COLORS = [
  "#f97316", // naranja
  "#22c55e", // verde
  "#3b82f6", // azul
  "#eab308", // amarillo
  "#ec4899", // rosa
  "#8b5cf6", // morado
  "#06b6d4", // cian
  "#f59e0b", // ámbar
];

function getPartColor(index) {
  return PART_COLORS[index % PART_COLORS.length];
}

// Presets de material por capa (Phong, para que no se vea negro)
const MATERIAL_PRESETS = {
  plastic: {
    label: "Plástico / Pintura",
    shininess: 30,
    specular: 0x444444,
    transparent: false,
    opacity: 1,
  },
  metal: {
    label: "Metal pulido",
    shininess: 80,
    specular: 0xcccccc,
    transparent: false,
    opacity: 1,
  },
  roughMetal: {
    label: "Metal rugoso",
    shininess: 25,
    specular: 0x888888,
    transparent: false,
    opacity: 1,
  },
  rubber: {
    label: "Goma / Caucho",
    shininess: 5,
    specular: 0x111111,
    transparent: false,
    opacity: 1,
  },
  glass: {
    label: "Vidrio",
    shininess: 90,
    specular: 0xffffff,
    transparent: true,
    opacity: 0.25,
  },
};

function createMaterialForPart(colorHex, presetKey = "plastic") {
  const preset = MATERIAL_PRESETS[presetKey] || MATERIAL_PRESETS.plastic;
  return new THREE.MeshPhongMaterial({
    color: new THREE.Color(colorHex || "#ffffff"),
    shininess: preset.shininess,
    specular: new THREE.Color(preset.specular),
    transparent: preset.transparent,
    opacity: preset.opacity,
    side: THREE.DoubleSide,
  });
}

/* ============================================================
   Modal para gestionar proyectos / escenas
   ============================================================ */

function ProjectManagerModal({
  isMobile = false,
  isOpen,
  onClose,
  projects,
  onCreateProject,
  onLoadProject,
  onDeleteProject,
  onReplaceModel,
  onUpdateTransform,
  onRenameProject,
}) {
  const [name, setName] = useState("");
  const [author, setAuthor] = useState("");
  const [date, setDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [password, setPassword] = useState("");
  const [file, setFile] = useState(null);
  const [useCurrentTransform, setUseCurrentTransform] = useState(true);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name || !password || !file) {
      alert("Nombre, contraseña y archivo de modelo son obligatorios.");
      return;
    }
    onCreateProject({
      name,
      author,
      date,
      password,
      file,
      useCurrentTransform,
    });
    setName("");
    setAuthor("");
    setPassword("");
    setFile(null);
    setUseCurrentTransform(true);
    setDate(new Date().toISOString().slice(0, 10));
  };

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      onClick={handleOverlayClick}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.85)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
      }}
    >
      <div
        style={{
          width: "min(900px, 100% - 32px)",
          maxHeight: "90vh",
          background: "#020617",
          borderRadius: 24,
          border: "1px solid #1f2937",
          padding: 24,
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 4,
          }}
        >
          <div>
            <h2
              style={{
                fontSize: 18,
                marginBottom: 4,
                color: "#e5e7eb",
              }}
            >
              Escenas / Proyectos 3D
            </h2>
            <p
              style={{
                fontSize: 12,
                color: "#9ca3af",
              }}
            >
              Guarda modelos con autor, fecha, contraseña y transformaciones
              para recargarlos desde este panel.
            </p>
          </div>
          <button
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

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile
              ? "minmax(0, 1fr)"
              : "minmax(0, 1.1fr) minmax(0, 1.3fr)",
            gap: 16,
          }}
        >
          {/* Columna izquierda: crear proyecto */}
          <form
            onSubmit={handleSubmit}
            style={{
              padding: 12,
              borderRadius: 20,
              border: "1px solid #1f2937",
              background: "rgba(15,23,42,0.95)",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <h3
              style={{
                fontSize: 14,
                marginBottom: 4,
                color: "#e5e7eb",
              }}
            >
              Nuevo proyecto / escena
            </h3>

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 12, color: "#9ca3af" }}>
                Nombre del proyecto *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{
                  fontSize: 13,
                  padding: "6px 8px",
                  borderRadius: 999,
                  border: "1px solid #374151",
                  background: "#020617",
                  color: "#e5e7eb",
                  outline: "none",
                }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 12, color: "#9ca3af" }}>Autor</label>
              <input
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                style={{
                  fontSize: 13,
                  padding: "6px 8px",
                  borderRadius: 999,
                  border: "1px solid #374151",
                  background: "#020617",
                  color: "#e5e7eb",
                  outline: "none",
                }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 12, color: "#9ca3af" }}>
                Fecha del proyecto
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                style={{
                  fontSize: 13,
                  padding: "6px 8px",
                  borderRadius: 999,
                  border: "1px solid #374151",
                  background: "#020617",
                  color: "#e5e7eb",
                  outline: "none",
                }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 12, color: "#9ca3af" }}>
                Contraseña para eliminar / editar este proyecto *
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  fontSize: 13,
                  padding: "6px 8px",
                  borderRadius: 999,
                  border: "1px solid #374151",
                  background: "#020617",
                  color: "#e5e7eb",
                  outline: "none",
                }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 12, color: "#9ca3af" }}>
                Modelo 3D (STL, OBJ, glTF/GLB, PLY, 3MF) *
              </label>
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: "1px dashed #4b5563",
                  cursor: "pointer",
                  fontSize: 12,
                  color: "#e5e7eb",
                  background:
                    "linear-gradient(135deg, rgba(15,23,42,1), rgba(17,24,39,0.8))",
                }}
              >
                <span role="img" aria-label="upload">
                  📁
                </span>
                <span>
                  {file ? `Archivo seleccionado: ${file.name}` : "Elegir archivo"}
                </span>
                <input
                  type="file"
                  accept=".stl,.obj,.gltf,.glb,.ply,.3mf"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    setFile(f);
                  }}
                />
              </label>
            </div>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12,
                color: "#9ca3af",
                marginTop: 4,
              }}
            >
              <input
                type="checkbox"
                checked={useCurrentTransform}
                onChange={(e) => setUseCurrentTransform(e.target.checked)}
              />
              <span>
                Usar posición y rotación actuales del visor como escena.
              </span>
            </label>

            <button
              type="submit"
              style={{
                marginTop: 8,
                alignSelf: "flex-start",
                padding: "6px 14px",
                borderRadius: 999,
                border: "1px solid #4b5563",
                background:
                  "linear-gradient(135deg, rgba(34,197,94,0.15), rgba(22,163,74,0.4))",
                color: "#bbf7d0",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Guardar proyecto / escena
            </button>

            <p
              style={{
                fontSize: 11,
                color: "#6b7280",
                marginTop: 4,
              }}
            >
              Se crea la carpeta en <code>public/&lt;nombre-proyecto&gt;</code>{" "}
              con <code>modelo.ext</code> y <code>scene.json</code>.
            </p>
          </form>

          {/* Columna derecha: lista de proyectos */}
          <div
            style={{
              padding: 12,
              borderRadius: 20,
              border: "1px solid #1f2937",
              background: "rgba(15,23,42,0.95)",
              display: "flex",
              flexDirection: "column",
              gap: 8,
              minHeight: 0,
            }}
          >
            <h3
              style={{
                fontSize: 14,
                marginBottom: 4,
                color: "#e5e7eb",
              }}
            >
              Proyectos guardados
            </h3>

            {projects.length === 0 ? (
              <p
                style={{
                  fontSize: 12,
                  color: "#6b7280",
                }}
              >
                Aún no hay proyectos guardados. Crea uno en el panel de la
                izquierda.
              </p>
            ) : (
              <div
                style={{
                  maxHeight: "44vh",
                  overflowY: "auto",
                  paddingRight: 4,
                }}
              >
                {projects.map((p) => (
                  <div
                    key={p.id}
                    style={{
                      borderBottom: "1px solid #111827",
                      padding: "8px 0",
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: 13,
                            color: "#e5e7eb",
                            fontWeight: 500,
                          }}
                        >
                          {p.name}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: "#6b7280",
                          }}
                        >
                          {p.author && <>Autor: {p.author} · </>}
                          Fecha: {p.date}
                        </div>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 4,
                          alignItems: "flex-end",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => onLoadProject(p.id)}
                          style={{
                            padding: "4px 8px",
                            borderRadius: 999,
                            border: "1px solid #4b5563",
                            background:
                              "linear-gradient(135deg, #0f172a, rgba(55,65,81,0.7))",
                            color: "#e5e7eb",
                            fontSize: 11,
                            cursor: "pointer",
                          }}
                        >
                          Cargar en visor
                        </button>
                        <button
                          type="button"
                          onClick={() => onRenameProject(p.id)}
                          style={{
                            padding: "3px 8px",
                            borderRadius: 999,
                            border: "1px solid #4b5563",
                            background: "transparent",
                            color: "#9ca3af",
                            fontSize: 11,
                            cursor: "pointer",
                          }}
                        >
                          Renombrar
                        </button>
                      </div>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 8,
                        alignItems: "center",
                      }}
                    >
                      <label
                        style={{
                          fontSize: 11,
                          borderRadius: 999,
                          border: "1px solid #374151",
                          padding: "4px 8px",
                          cursor: "pointer",
                          color: "#e5e7eb",
                        }}
                      >
                        Reemplazar modelo
                        <input
                          type="file"
                          accept=".stl,.obj,.gltf,.glb,.ply,.3mf"
                          style={{ display: "none" }}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) {
                              onReplaceModel(p.id, f);
                              e.target.value = "";
                            }
                          }}
                        />
                      </label>

                      <button
                        type="button"
                        onClick={() => onUpdateTransform(p.id)}
                        style={{
                          fontSize: 11,
                          borderRadius: 999,
                          border: "1px solid #374151",
                          padding: "4px 8px",
                          background: "transparent",
                          color: "#9ca3af",
                          cursor: "pointer",
                        }}
                      >
                        Guardar pos/rot actuales
                      </button>

                      <button
                        type="button"
                        onClick={async () => {
                          const pwd = window.prompt(
                            "Ingresa la contraseña para eliminar este proyecto:"
                          );
                          if (pwd == null) return;
                          onDeleteProject(p.id, pwd);
                        }}
                        style={{
                          fontSize: 11,
                          borderRadius: 999,
                          border: "1px solid #7f1d1d",
                          padding: "4px 8px",
                          background: "rgba(127,29,29,0.15)",
                          color: "#fecaca",
                          cursor: "pointer",
                          marginLeft: "auto",
                        }}
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Visor 3D principal
   ============================================================ */

function App() {
  const containerRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const modelRef = useRef(null);
  const animationIdRef = useRef(null);
  const objectUrlRef = useRef(null);
  const modelTypeRef = useRef("generic"); // stl, obj, gltf, etc.

  const raycasterRef = useRef(new THREE.Raycaster());
  const pointerRef = useRef(new THREE.Vector2());
  const partsRef = useRef([]);

  const [hasModel, setHasModel] = useState(false);
  const [modelName, setModelName] = useState("");
  const [visible, setVisible] = useState(true);
  const [position, setPosition] = useState({ x: 0, y: 0, z: 0 });
  const [rotation, setRotation] = useState({ x: 0, y: 0, z: 0 });

  // Color global base para nuevas cargas
  const [modelBaseColor, setModelBaseColor] = useState("#22c55e");

  // Capas
  const [parts, setParts] = useState([]);
  const [editingPartId, setEditingPartId] = useState(null);
  const [selectedPartInfo, setSelectedPartInfo] = useState(null);

  // Proyectos
  const [projects, setProjects] = useState([]);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState(null);
  const [pendingNotes, setPendingNotes] = useState("");

  const [isMobile, setIsMobile] = useState(false);

  // sync ref de partes
  useEffect(() => {
    partsRef.current = parts;
  }, [parts]);

  // auto-ocultar texto de pieza seleccionada
  useEffect(() => {
    if (!selectedPartInfo) return;
    const id = setTimeout(() => setSelectedPartInfo(null), 4000);
    return () => clearTimeout(id);
  }, [selectedPartInfo]);

  /* =========================
     Responsivo
  ========================== */
  useEffect(() => {
    const check = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  /* =========================
     Inicializar Three.js
  ========================== */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight || window.innerHeight * 0.5;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
    });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height);
    renderer.setClearColor(0x020617, 1);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020617);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 2000);
    camera.position.set(0, 80, 160);
    cameraRef.current = camera;

    // Luces (más fuertes para que no se vea negro)
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x111827, 1.3);
    hemiLight.position.set(0, 1, 0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.8);
    dirLight.position.set(80, 120, 90);
    dirLight.castShadow = false;
    scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.6);
    fillLight.position.set(-60, 40, -80);
    scene.add(fillLight);

    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambient);

    // Grid
    const grid = new THREE.GridHelper(400, 40, 0x4b5563, 0x1f2937);
    scene.add(grid);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.7;
    controls.zoomSpeed = 0.8;
    controlsRef.current = controls;

    // click sobre el canvas para seleccionar pieza
    const handleClickOnCanvas = (event) => {
      if (!cameraRef.current || !sceneRef.current) return;

      const rect = renderer.domElement.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      pointerRef.current.set(x, y);
      raycasterRef.current.setFromCamera(pointerRef.current, cameraRef.current);

      const intersects = raycasterRef.current.intersectObjects(
        sceneRef.current.children,
        true
      );
      if (!intersects.length) return;

      let hitMesh = null;
      for (const inter of intersects) {
        let obj = inter.object;
        while (obj && !obj.userData?.partId && obj.parent) {
          obj = obj.parent;
        }
        if (obj && typeof obj.userData?.partId === "number") {
          hitMesh = obj;
          break;
        }
      }
      if (!hitMesh) return;

      const partId = hitMesh.userData.partId;
      const part = partsRef.current.find((p) => p.id === partId);
      if (!part) return;

      setEditingPartId(partId);
      setSelectedPartInfo({
        id: partId,
        name: part.name,
        notes: part.notes || "",
      });
    };

    renderer.domElement.addEventListener("click", handleClickOnCanvas);

    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current)
        return;
      const w = containerRef.current.clientWidth;
      const h =
        containerRef.current.clientHeight ||
        (isMobile ? window.innerHeight * 0.5 : window.innerHeight);
      rendererRef.current.setSize(w, h);
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
    };

    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(animationIdRef.current);
      window.removeEventListener("resize", onResize);

      renderer.domElement.removeEventListener("click", handleClickOnCanvas);

      if (rendererRef.current) {
        rendererRef.current.dispose();
      }

      if (sceneRef.current) {
        sceneRef.current.traverse((obj) => {
          if (obj.isMesh) {
            obj.geometry?.dispose();
            if (Array.isArray(obj.material)) {
              obj.material.forEach((m) => m.dispose());
            } else {
              obj.material?.dispose();
            }
          }
        });
      }

      if (container && renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }

      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile]);

  /* =========================
     Helper: aplicar color + material a una pieza
  ========================== */
  const updatePartMeshAppearance = (partId, colorHex, presetKey) => {
    if (!modelRef.current) return;
    const presetName = presetKey || "plastic";
    const preset = MATERIAL_PRESETS[presetName] || MATERIAL_PRESETS.plastic;
    const color = colorHex || "#ffffff";

    modelRef.current.traverse((child) => {
      if (child.isMesh && child.userData.partId === partId) {
        if (!child.material || !child.material.isMeshPhongMaterial) {
          child.material = createMaterialForPart(color, presetName);
        } else {
          child.material.color = new THREE.Color(color);
          child.material.shininess = preset.shininess;
          child.material.specular = new THREE.Color(preset.specular);
          child.material.opacity = preset.opacity;
          child.material.transparent = preset.transparent;
          child.material.needsUpdate = true;
        }
        child.userData.baseColor = color;
        child.userData.materialPreset = presetName;
      }
    });
  };

  /* =========================
     Cargar proyectos desde el servidor
  ========================== */
  const loadProjectsFromServer = async () => {
    try {
      const resp = await fetch(API_PROJECTS_URL);
      const text = await resp.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        console.error("Respuesta no JSON en GET /api/projects:", text);
        return;
      }

      if (!resp.ok || !data.ok) {
        console.error("Error obteniendo proyectos", data);
        return;
      }
      setProjects(data.projects || []);
    } catch (err) {
      console.error("Error llamando GET /api/projects", err);
    }
  };

  useEffect(() => {
    loadProjectsFromServer();
  }, []);

  /* =========================
     Utilidades de modelo
  ========================== */
  const clearCurrentModel = () => {
    if (!sceneRef.current || !modelRef.current) return;

    sceneRef.current.remove(modelRef.current);

    modelRef.current.traverse((obj) => {
      if (obj.isMesh) {
        obj.geometry?.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material?.dispose();
        }
      }
    });

    modelRef.current = null;
    setParts([]);
    setEditingPartId(null);
  };

  const centerObjectAtOrigin = (object) => {
    const box = new THREE.Box3().setFromObject(object);
    const center = new THREE.Vector3();
    box.getCenter(center);
    object.position.sub(center);
  };

  const snapModelToGround = (object) => {
    if (!object) return;
    const box = new THREE.Box3().setFromObject(object);
    if (!isFinite(box.min.y)) return;
    const minY = box.min.y;
    object.position.y -= minY;
  };

  const updatePartsFromRoot = (root) => {
    const newParts = [];
    let index = 0;

    root.traverse((child) => {
      if (child.isMesh) {
        child.userData.partId = index;

        const partColor = getPartColor(index);
        child.userData.baseColor = partColor;

        // Usar material Phong coherente con createMaterialForPart
        if (!child.material || !child.material.isMeshPhongMaterial) {
          child.material = createMaterialForPart(partColor, "plastic");
        } else {
          const preset = MATERIAL_PRESETS.plastic;
          child.material.color = new THREE.Color(partColor);
          child.material.shininess = preset.shininess;
          child.material.specular = new THREE.Color(preset.specular);
          child.material.transparent = preset.transparent;
          child.material.opacity = preset.opacity;
          child.material.side = THREE.DoubleSide;
          child.material.needsUpdate = true;
        }

        newParts.push({
          id: index,
          name: child.name || `Parte ${index + 1}`,
          visible: child.visible !== false,
          color: partColor,
          materialPreset: "plastic",
          notes: "",
        });

        index++;
      }
    });

    setParts(newParts);
  };

  const applyProjectPartsMeta = (project) => {
    if (!project || !project.partsMeta) return;

    const meta = project.partsMeta;
    setParts((prev) =>
      prev.map((p) => {
        const m =
          meta[p.id] !== undefined
            ? meta[p.id]
            : meta[String(p.id)] !== undefined
            ? meta[String(p.id)]
            : null;
        if (!m) return p;

        return {
          ...p,
          name: m.name || p.name,
          notes: m.notes !== undefined ? m.notes : p.notes || "",
          color: m.color || p.color || "#22c55e",
          materialPreset: m.materialPreset || p.materialPreset || "plastic",
        };
      })
    );
  };

  const fitCameraToObject = (object) => {
    if (!cameraRef.current || !controlsRef.current) return;

    const camera = cameraRef.current;
    const controls = controlsRef.current;

    const box = new THREE.Box3().setFromObject(object);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = (camera.fov * Math.PI) / 180;
    let distance = maxDim / (2 * Math.tan(fov / 2));
    distance *= 1.6;

    const direction = new THREE.Vector3(0, 0.4, 1).normalize();
    const newPos = center.clone().add(direction.multiplyScalar(distance));

    camera.position.copy(newPos);
    camera.near = distance / 100;
    camera.far = distance * 100;
    camera.updateProjectionMatrix();

    controls.target.copy(center);
    controls.update();
  };

  const addRootToScene = (root) => {
    clearCurrentModel();

    centerObjectAtOrigin(root);
    snapModelToGround(root);

    sceneRef.current.add(root);
    modelRef.current = root;

    setHasModel(true);
    setVisible(true);
    setPosition({ x: 0, y: 0, z: 0 });
    setRotation({ x: 0, y: 0, z: 0 });

    updatePartsFromRoot(root);
    fitCameraToObject(root);
  };

  /* =========================
     Cargar archivos 3D directos
  ========================== */
  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const name = file.name;
    const ext = name.split(".").pop().toLowerCase();

    setModelName(name);
    modelTypeRef.current = ext;
    setCurrentProjectId(null);
    setPendingNotes("");
    setEditingPartId(null);

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
    }
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;

    switch (ext) {
      case "stl":
        loadSTL(url);
        break;
      case "obj":
        loadOBJ(url);
        break;
      case "gltf":
      case "glb":
        loadGLTF(url);
        break;
      case "ply":
        loadPLY(url);
        break;
      case "3mf":
        load3MF(url);
        break;
      default:
        alert("Formato no soportado. Usa STL, OBJ, glTF/GLB, PLY o 3MF.");
        break;
    }
  };

  const loadSTL = (url, onLoaded) => {
    const loader = new STLLoader();
    loader.load(
      url,
      (geometry) => {
        geometry.computeVertexNormals();
        geometry.computeBoundingBox();
        const mesh = new THREE.Mesh(geometry, createMaterialForPart("#ffffff"));
        const root = mesh;
        addRootToScene(root);
        if (typeof onLoaded === "function") onLoaded(root);
      },
      undefined,
      (err) => {
        console.error(err);
        alert("Error al cargar STL");
      }
    );
  };

  const loadOBJ = (url, onLoaded) => {
    const loader = new OBJLoader();
    loader.load(
      url,
      (obj) => {
        addRootToScene(obj);
        if (typeof onLoaded === "function") onLoaded(obj);
      },
      undefined,
      (err) => {
        console.error(err);
        alert("Error al cargar OBJ");
      }
    );
  };

  const loadGLTF = (url, onLoaded) => {
    const loader = new GLTFLoader();
    loader.load(
      url,
      (gltf) => {
        const root = gltf.scene || gltf.scenes[0];
        addRootToScene(root);
        if (typeof onLoaded === "function") onLoaded(root);
      },
      undefined,
      (err) => {
        console.error(err);
        alert("Error al cargar glTF");
      }
    );
  };

  const loadPLY = (url, onLoaded) => {
    const loader = new PLYLoader();
    loader.load(
      url,
      (geometry) => {
        geometry.computeVertexNormals();
        geometry.computeBoundingBox();
        const mesh = new THREE.Mesh(geometry, createMaterialForPart("#ffffff"));
        const root = mesh;
        addRootToScene(root);
        if (typeof onLoaded === "function") onLoaded(root);
      },
      undefined,
      (err) => {
        console.error(err);
        alert("Error al cargar PLY");
      }
    );
  };

  const load3MF = (url, onLoaded) => {
    const loader = new ThreeMFLoader();
    loader.load(
      url,
      (object) => {
        addRootToScene(object);
        if (typeof onLoaded === "function") onLoaded(object);
      },
      undefined,
      (err) => {
        console.error(err);
        alert("Error al cargar 3MF");
      }
    );
  };

  /* =========================
     Sincronizar UI ↔ Modelo
  ========================== */
  useEffect(() => {
    if (!modelRef.current) return;
    modelRef.current.visible = visible;
  }, [visible]);

  useEffect(() => {
    if (!modelRef.current) return;
    modelRef.current.position.set(position.x, position.y, position.z);
    if (modelTypeRef.current === "stl") {
      snapModelToGround(modelRef.current);
    }
  }, [position]);

  useEffect(() => {
    if (!modelRef.current) return;
    modelRef.current.rotation.set(
      THREE.MathUtils.degToRad(rotation.x),
      THREE.MathUtils.degToRad(rotation.y),
      THREE.MathUtils.degToRad(rotation.z)
    );
    if (modelTypeRef.current === "stl") {
      snapModelToGround(modelRef.current);
    }
  }, [rotation]);

  /* =========================
     Helpers de capas
  ========================== */

  const setAllPartsVisible = (value) => {
    setParts((prev) => prev.map((p) => ({ ...p, visible: value })));
    if (!modelRef.current) return;
    modelRef.current.traverse((child) => {
      if (child.isMesh && typeof child.userData.partId === "number") {
        child.visible = value;
      }
    });
  };

  const handlePositionChange = (axis, value) => {
    setPosition((prev) => ({
      ...prev,
      [axis]: Number(value),
    }));
  };

  const handleRotationChange = (axis, value) => {
    setRotation((prev) => ({
      ...prev,
      [axis]: Number(value),
    }));
  };

  const handleResetTransform = () => {
    if (!modelRef.current) return;
    modelRef.current.position.set(0, 0, 0);
    modelRef.current.rotation.set(0, 0, 0);
    setPosition({ x: 0, y: 0, z: 0 });
    setRotation({ x: 0, y: 0, z: 0 });
    fitCameraToObject(modelRef.current);
  };

  const handleTogglePartVisible = (id, checked) => {
    setParts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, visible: checked } : p))
    );
    if (!modelRef.current) return;
    modelRef.current.traverse((child) => {
      if (child.isMesh && child.userData.partId === id) {
        child.visible = checked;
      }
    });
  };

  const handleChangePartName = (id, newName) => {
    setParts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, name: newName } : p))
    );
  };

  const handleChangePartNotes = (id, newNotes) => {
    setParts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, notes: newNotes } : p))
    );
  };

  const handleChangePartColor = (id, newColor) => {
    setParts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, color: newColor } : p))
    );
    const preset =
      partsRef.current.find((p) => p.id === id)?.materialPreset || "plastic";
    updatePartMeshAppearance(id, newColor, preset);
  };

  const handleChangePartMaterial = (id, newPreset) => {
    setParts((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, materialPreset: newPreset } : p
      )
    );
    const colorHex =
      partsRef.current.find((p) => p.id === id)?.color || "#ffffff";
    updatePartMeshAppearance(id, colorHex, newPreset);
  };

  const handleSavePartMeta = async (partId) => {
    if (!currentProjectId) {
      alert("Primero guarda este modelo como proyecto para poder guardar notas.");
      return;
    }
    const part = parts.find((p) => p.id === partId);
    if (!part) return;

    const pwd = window.prompt(
      "Contraseña para guardar notas, color y material de esta pieza:"
    );
    if (pwd == null || pwd === "") return;

    try {
      const resp = await fetch(
        `${API_PROJECTS_URL}/${currentProjectId}/parts-meta`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            partId,
            name: part.name,
            notes: part.notes || "",
            color: part.color || "#22c55e",
            materialPreset: part.materialPreset || "plastic",
            password: pwd,
          }),
        }
      );

      const contentType = resp.headers.get("content-type") || "";
      if (!contentType.toLowerCase().includes("application/json")) {
        const text = await resp.text();
        console.error("Respuesta NO JSON de /parts-meta:", {
          status: resp.status,
          text,
        });
        alert(
          "La ruta /parts-meta respondió algo que no es JSON. Revisa la consola del navegador y del servidor."
        );
        return;
      }

      const data = await resp.json();

      if (!resp.ok || !data.ok) {
        console.error("Error lógico /parts-meta:", data);
        alert(data.error || "No se pudo guardar la información de la pieza.");
        return;
      }

      alert("Notas, color y material de la capa guardados.");
    } catch (err) {
      console.error("Error de red al llamar a /parts-meta:", err);
      alert("Error de red al llamar a /parts-meta: " + err.message);
    }
  };

  const handleSavePendingNotes = async () => {
    if (!currentProjectId) {
      alert("Primero carga o guarda un proyecto para asociar las notas.");
      return;
    }
    const pwd = window.prompt(
      "Contraseña para guardar las notas pendientes del proyecto:"
    );
    if (!pwd) return;

    try {
      const resp = await fetch(
        `${API_PROJECTS_URL}/${currentProjectId}/notes`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            notes: pendingNotes || "",
            password: pwd,
          }),
        }
      );
      const text = await resp.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        console.error(
          "Respuesta no JSON en PUT /api/projects/:id/notes:",
          text
        );
        throw new Error("La ruta /notes no devolvió JSON.");
      }

      if (!resp.ok || !data.ok) {
        throw new Error(
          data.error || "No se pudieron guardar las notas pendientes."
        );
      }

      // 👇 recargar proyectos para tener notas al día
      await loadProjectsFromServer();

      alert("Notas pendientes guardadas.");
    } catch (err) {
      console.error(err);
      alert(err.message || "Error al guardar notas pendientes.");
    }
  };


  /* =========================
     Lógica de proyectos / escenas (API real)
  ========================== */

  const handleCreateProject = async (formData) => {
    const { name, author, date, password, file, useCurrentTransform } =
      formData;

    if (!name || !password || !file) {
      alert("Nombre, contraseña y archivo de modelo son obligatorios.");
      return;
    }

    const positionToSave = useCurrentTransform
      ? position
      : { x: 0, y: 0, z: 0 };
    const rotationToSave = useCurrentTransform
      ? rotation
      : { x: 0, y: 0, z: 0 };

    // partsMeta con color y material
    const partsMetaToSave = {};
    parts.forEach((p) => {
      partsMetaToSave[p.id] = {
        name: p.name,
        notes: p.notes || "",
        color: p.color,
        materialPreset: p.materialPreset,
      };
    });

    try {
      const data = await guardarProyectoEnServidor({
        file,
        projectName: name,
        author,
        password,
        date,
        position: positionToSave,
        rotation: rotationToSave,
        partsMeta: partsMetaToSave,
      });

      await loadProjectsFromServer();
      setCurrentProjectId(data.projectId || null);
      alert("Proyecto creado y carpeta generada en /public.");
    } catch (err) {
      console.error(err);
      alert(err.message || "Error al crear proyecto.");
    }
  };

  const handleReplaceModel = async (projectId, file) => {
    if (!file) return;

    const formData = new FormData();
    formData.append("model", file);

    const resp = await fetch(
      `${API_PROJECTS_URL}/${projectId}/model`,
      {
        method: "PUT",
        body: formData,
      }
    );

    const text = await resp.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      console.error(
        "Respuesta no JSON en PUT /api/projects/:id/model:",
        text
      );
      alert("El backend no devolvió JSON al reemplazar el modelo.");
      return;
    }

    if (!resp.ok || !data.ok) {
      console.error("Error reemplazando modelo", data);
      alert("No se pudo reemplazar el modelo en el servidor.");
      return;
    }

    await loadProjectsFromServer();
    alert("Modelo reemplazado correctamente.");
  };

  const handleDeleteProject = async (projectId, passwordPlain) => {
    if (!passwordPlain) return;

    const resp = await fetch(`${API_PROJECTS_URL}/${projectId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: passwordPlain }),
    });

    const text = await resp.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      console.error(
        "Respuesta no JSON en DELETE /api/projects/:id:",
        text
      );
      alert("El backend no devolvió JSON al eliminar el proyecto.");
      return;
    }

    if (!resp.ok || !data.ok) {
      alert(data.error || "No se pudo eliminar el proyecto.");
      return;
    }

    if (currentProjectId === projectId) {
      setCurrentProjectId(null);
      setPendingNotes("");
    }

    await loadProjectsFromServer();
    alert("Proyecto eliminado.");
  };

  const handleUpdateProjectTransform = async (projectId) => {
    const pwd = window.prompt(
      "Contraseña para guardar posición y rotación de este proyecto:"
    );
    if (!pwd) return;

    try {
      const resp = await fetch(
        `${API_PROJECTS_URL}/${projectId}/transform`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ position, rotation, password: pwd }),
        }
      );

      const text = await resp.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        console.error(
          "Respuesta no JSON en PUT /api/projects/:id/transform:",
          text
        );
        throw new Error("La ruta /transform no devolvió JSON.");
      }

      if (!resp.ok || !data.ok) {
        console.error("Error actualizando transform", data);
        throw new Error(
          data.error ||
            "No se pudo guardar la posición/rotación en el servidor."
        );
      }

      await loadProjectsFromServer();
      alert("Posición/rotación guardadas en el proyecto.");
    } catch (err) {
      console.error(err);
      alert(err.message || "Error al guardar posición/rotación.");
    }
  };

  const handleRenameProject = async (projectId) => {
    const current = projects.find((p) => p.id === projectId);
    const newName = window.prompt(
      "Nuevo nombre para el proyecto:",
      current?.name || ""
    );
    if (!newName) return;

    const pwd = window.prompt("Contraseña para renombrar el proyecto:");
    if (!pwd) return;

    try {
      const resp = await fetch(
        `${API_PROJECTS_URL}/${projectId}/rename`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newName, password: pwd }),
        }
      );
      const text = await resp.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        console.error(
          "Respuesta no JSON en PUT /api/projects/:id/rename:",
          text
        );
        throw new Error("La ruta /rename no devolvió JSON.");
      }

      if (!resp.ok || !data.ok) {
        throw new Error(
          data.error || "No se pudo renombrar el proyecto en el servidor."
        );
      }
      await loadProjectsFromServer();
      alert("Proyecto renombrado.");
    } catch (err) {
      console.error(err);
      alert(err.message || "Error al renombrar el proyecto.");
    }
  };

  const handleLoadProject = (projectId) => {
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;

    if (!project.modelFile || !project.modelUrl) {
      alert("Este proyecto no tiene modelo asociado.");
      return;
    }

    const url = project.modelUrl; // viene como /public/carpeta/modelo.ext
    const ext = project.modelFile.split(".").pop().toLowerCase();

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    setModelName(project.modelFile);
    modelTypeRef.current = ext;
    setCurrentProjectId(project.id);
    setPendingNotes(project.pendingNotes || "");
    setEditingPartId(null);

    const applyTransformAndMeta = () => {
      setPosition(project.position || { x: 0, y: 0, z: 0 });
      setRotation(project.rotation || { x: 0, y: 0, z: 0 });
      applyProjectPartsMeta(project);
    };

    switch (ext) {
      case "stl":
        loadSTL(url, applyTransformAndMeta);
        break;
      case "obj":
        loadOBJ(url, applyTransformAndMeta);
        break;
      case "gltf":
      case "glb":
        loadGLTF(url, applyTransformAndMeta);
        break;
      case "ply":
        loadPLY(url, applyTransformAndMeta);
        break;
      case "3mf":
        load3MF(url, applyTransformAndMeta);
        break;
      default:
        alert("Formato no soportado en este proyecto.");
        break;
    }
  };

  /* =========================
     UI
  ========================== */

  return (
    <>
      <div
        style={{
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          height: "100vh",
          width: "100vw",
          background: "radial-gradient(circle at top, #0f172a, #020617)",
        }}
      >
        {/* Lado izquierdo: visor 3D */}
        <div
          ref={containerRef}
          style={{
            flex: isMobile ? "0 0 50vh" : 1,
            height: isMobile ? "50vh" : "100vh",
            minHeight: isMobile ? "50vh" : "100%",
            position: "relative",
            overflow: "hidden",
            borderRight: isMobile ? "none" : "1px solid #1f2937",
            borderBottom: isMobile ? "1px solid #1f2937" : "none",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: 16,
              transform: "translateX(-50%)",
              padding: "6px 12px",
              background: "rgba(15,23,42,0.85)",
              borderRadius: 999,
              fontSize: 12,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#a5b4fc",
              border: "1px solid rgba(129,140,248,0.3)",
              backdropFilter: "blur(8px)",
              zIndex: 5,
            }}
          >
            VISOR 3D · PROTOTIPOS
          </div>

          {/* Texto de pieza seleccionada */}
          {selectedPartInfo && (
            <div
              style={{
                position: "absolute",
                bottom: 16,
                left: "50%",
                transform: "translateX(-50%)",
                maxWidth: "70%",
                padding: 12,
                borderRadius: 16,
                background: "rgba(15,23,42,0.9)",
                border: "1px solid #1f2937",
                color: "#e5e7eb",
                fontSize: 12,
                zIndex: 6,
                boxShadow: "0 12px 30px rgba(0,0,0,0.6)",
              }}
            >
              <div
                style={{
                  fontWeight: 600,
                  marginBottom: 4,
                  fontSize: 13,
                }}
              >
                Capa seleccionada: {selectedPartInfo.name}
              </div>
              {selectedPartInfo.notes ? (
                <div
                  style={{
                    fontSize: 12,
                    color: "#cbd5f5",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {selectedPartInfo.notes}
                </div>
              ) : (
                <div
                  style={{
                    fontSize: 11,
                    color: "#9ca3af",
                  }}
                >
                  (Sin notas registradas para esta pieza)
                </div>
              )}
            </div>
          )}

          {!hasModel && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: "none",
                zIndex: 4,
              }}
            >
              <div
                style={{
                  textAlign: "center",
                  maxWidth: 320,
                  padding: 24,
                  borderRadius: 24,
                  background: "rgba(15,23,42,0.9)",
                  border: "1px solid #1f2937",
                  boxShadow: "0 18px 45px rgba(0,0,0,0.6)",
                }}
              >
                <div
                  style={{
                    fontSize: 32,
                    marginBottom: 12,
                  }}
                >
                  🧱
                </div>
                <h2
                  style={{
                    fontSize: 18,
                    marginBottom: 8,
                    color: "#e5e7eb",
                  }}
                >
                  Esperando un modelo 3D
                </h2>
                <p
                  style={{
                    fontSize: 13,
                    color: "#9ca3af",
                  }}
                >
                  Importa un archivo{" "}
                  <strong>.stl, .obj, .gltf, .glb, .ply</strong> o{" "}
                  <strong>.3mf</strong> para visualizar tu prototipo aquí.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Lado derecho: panel de control */}
        <div
          style={{
            width: isMobile ? "100%" : 380,
            flex: isMobile ? 1 : "0 0 auto",
            padding: 16,
            background: "rgba(15,23,42,0.98)",
            display: "flex",
            flexDirection: "column",
            gap: 16,
            overflowY: "auto",
          }}
        >
          {/* Encabezado + logo + botón escenas */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 4,
              gap: 12,
            }}
          >
            <div style={{ flex: 1 }}>
              <h1
                style={{
                  fontSize: 18,
                  marginBottom: 4,
                }}
              >
                Visor de prototipos 3D
              </h1>
              <p
                style={{
                  fontSize: 12,
                  color: "#9ca3af",
                }}
              >
                Carga modelos para revisión rápida de diseño y ensamblajes.
              </p>
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                gap: 8,
              }}
            >
              <div
                style={{
                  width: 80,
                  height: 40,
                  borderRadius: 999,
                  border: "1px dashed #4b5563",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 10,
                  color: "#6b7280",
                }}
              >
                <img
                  src="/src/logo-maestria_0006_Capa-0.png"
                  alt=""
                  style={{
                    width: 70,
                    height: 30,
                  }}
                />
              </div>
              <button
                onClick={() => setIsProjectModalOpen(true)}
                style={{
                  padding: "4px 10px",
                  borderRadius: 999,
                  border: "1px solid #4b5563",
                  background:
                    "linear-gradient(135deg, rgba(56,189,248,0.15), rgba(37,99,235,0.35))",
                  color: "#bfdbfe",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                Escenas / proyectos
              </button>
            </div>
          </div>

          {/* Input de archivo */}
          <div
            style={{
              padding: 12,
              borderRadius: 16,
              border: "1px solid #1f2937",
              background:
                "linear-gradient(135deg, rgba(15,23,42,1), rgba(15,23,42,0.8))",
            }}
          >
            <label
              htmlFor="model-input"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 12px",
                borderRadius: 999,
                border: "1px solid #4b5563",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              <span role="img" aria-label="upload">
                📁
              </span>
              <span>Elegir modelo 3D</span>
            </label>
            <input
              id="model-input"
              type="file"
              accept=".stl,.obj,.gltf,.glb,.ply,.3mf"
              onChange={handleFileChange}
              style={{ display: "none" }}
            />

            <div
              style={{
                marginTop: 8,
                fontSize: 11,
                color: "#9ca3af",
              }}
            >
              {modelName ? (
                <>
                  Archivo cargado:{" "}
                  <span style={{ color: "#e5e7eb" }}>{modelName}</span>
                </>
              ) : (
                "Ningún archivo seleccionado"
              )}
            </div>
          </div>

          {/* Color base del modelo (para nuevas cargas) */}
          <div
            style={{
              padding: 12,
              borderRadius: 16,
              border: "1px solid #1f2937",
              background: "rgba(15,23,42,0.9)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div
              style={{
                fontSize: 13,
              }}
            >
              Color base para nuevas capas
              <div
                style={{
                  fontSize: 11,
                  color: "#6b7280",
                  marginTop: 2,
                }}
              >
                Se usa como tinte inicial al cargar un modelo. Luego puedes
                cambiar el color por capa.
              </div>
            </div>
            <input
              type="color"
              value={modelBaseColor}
              onChange={(e) => setModelBaseColor(e.target.value)}
              style={{
                width: 40,
                height: 24,
                borderRadius: 999,
                border: "1px solid #4b5563",
                padding: 0,
                background: "transparent",
                cursor: "pointer",
              }}
            />
          </div>

          {/* Capas / partes */}
          {parts.length > 0 && (
            <div
              style={{
                padding: 16,
                borderRadius: 16,
                border: "1px solid #1f2937",
                background: "rgba(15,23,42,0.9)",
                maxHeight: 400,
                minHeight: 200,
                overflowY: "auto",
              }}
            >
              <div
                style={{
                  fontSize: 14,
                  marginBottom: 8,
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <span>Capas / partes del modelo</span>
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    alignItems: "center",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setAllPartsVisible(true)}
                    style={{
                      fontSize: 10,
                      padding: "3px 8px",
                      borderRadius: 999,
                      border: "1px solid #4b5563",
                      background: "rgba(22,163,74,0.15)",
                      color: "#bbf7d0",
                      cursor: "pointer",
                    }}
                  >
                    Todos
                  </button>
                  <button
                    type="button"
                    onClick={() => setAllPartsVisible(false)}
                    style={{
                      fontSize: 10,
                      padding: "3px 8px",
                      borderRadius: 999,
                      border: "1px solid #4b5563",
                      background: "rgba(248,113,113,0.12)",
                      color: "#fecaca",
                      cursor: "pointer",
                    }}
                  >
                    Ninguno
                  </button>
                </div>
              </div>

              <div
                style={{
                  fontSize: 11,
                  color: "#6b7280",
                  marginBottom: 4,
                }}
              >
                {parts.length} partes detectadas en el modelo.
              </div>

              {parts.map((part) => (
                <div
                  key={part.id}
                  style={{
                    borderBottom: "1px solid #111827",
                    padding: "4px 0 6px 0",
                  }}
                >
                  {/* fila principal */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      fontSize: 12,
                      gap: 10,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        flex: 1,
                        minWidth: 0,
                      }}
                    >
                      <span
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: 999,
                          backgroundColor: part.color,
                          flexShrink: 0,
                        }}
                      />
                      <span
                        style={{
                          color: "#e5e7eb",
                          fontSize: 14,
                          fontWeight: 500,
                          flex: 1,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {part.name}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <label
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          fontSize: 11,
                          color: "#9ca3af",
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={part.visible}
                          onChange={(e) =>
                            handleTogglePartVisible(part.id, e.target.checked)
                          }
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setEditingPartId(
                            editingPartId === part.id ? null : part.id
                          )
                        }
                        style={{
                          fontSize: 10,
                          padding: "3px 6px",
                          borderRadius: 999,
                          border: "1px solid #4b5563",
                          background: "rgba(37,99,235,0.12)",
                          color: "#bfdbfe",
                          cursor: "pointer",
                        }}
                      >
                        Detalles capa
                      </button>
                    </div>
                  </div>

                  {/* editor de detalles para esta pieza */}
                  {editingPartId === part.id && (
                    <div
                      style={{
                        marginTop: 6,
                        padding: 8,
                        borderRadius: 12,
                        background: "#020617",
                        border: "1px solid #111827",
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          color: "#9ca3af",
                        }}
                      >
                        Editar capa #{part.id}
                      </div>

                      {/* Nombre */}
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 4,
                        }}
                      >
                        <label
                          style={{
                            fontSize: 11,
                            color: "#9ca3af",
                          }}
                        >
                          Nombre de la capa
                        </label>
                        <input
                          type="text"
                          value={part.name}
                          onChange={(e) =>
                            handleChangePartName(part.id, e.target.value)
                          }
                          style={{
                            fontSize: 12,
                            padding: "4px 8px",
                            borderRadius: 999,
                            border: "1px solid #374151",
                            background: "#020617",
                            color: "#e5e7eb",
                            outline: "none",
                          }}
                        />
                      </div>

                      {/* Color de la capa */}
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 4,
                        }}
                      >
                        <label
                          style={{
                            fontSize: 11,
                            color: "#9ca3af",
                          }}
                        >
                          Color de esta capa
                        </label>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          <input
                            type="color"
                            value={part.color}
                            onChange={(e) =>
                              handleChangePartColor(part.id, e.target.value)
                            }
                            style={{
                              width: 36,
                              height: 20,
                              borderRadius: 999,
                              border: "1px solid #4b5563",
                              padding: 0,
                              background: "transparent",
                              cursor: "pointer",
                            }}
                          />
                          <span
                            style={{
                              fontSize: 11,
                              color: "#9ca3af",
                            }}
                          >
                            {part.color}
                          </span>
                        </div>
                      </div>

                      {/* Material de la capa */}
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 4,
                        }}
                      >
                        <label
                          style={{
                            fontSize: 11,
                            color: "#9ca3af",
                          }}
                        >
                          Acabado del material
                        </label>
                        <select
                          value={part.materialPreset}
                          onChange={(e) =>
                            handleChangePartMaterial(part.id, e.target.value)
                          }
                          style={{
                            padding: "6px 8px",
                            borderRadius: 999,
                            border: "1px solid #374151",
                            background: "#020617",
                            color: "#e5e7eb",
                            outline: "none",
                            fontSize: 12,
                          }}
                        >
                          <option value="plastic">
                            {MATERIAL_PRESETS.plastic.label}
                          </option>
                          <option value="metal">
                            {MATERIAL_PRESETS.metal.label}
                          </option>
                          <option value="roughMetal">
                            {MATERIAL_PRESETS.roughMetal.label}
                          </option>
                          <option value="rubber">
                            {MATERIAL_PRESETS.rubber.label}
                          </option>
                          <option value="glass">
                            {MATERIAL_PRESETS.glass.label}
                          </option>
                        </select>
                      </div>

                      {/* Notas */}
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 4,
                        }}
                      >
                        <label
                          style={{
                            fontSize: 11,
                            color: "#9ca3af",
                          }}
                        >
                          Notas de esta pieza
                        </label>
                        <textarea
                          value={part.notes || ""}
                          onChange={(e) =>
                            handleChangePartNotes(part.id, e.target.value)
                          }
                          style={{
                            width: "100%",
                            minHeight: 60,
                            resize: "vertical",
                            fontSize: 12,
                            borderRadius: 12,
                            border: "1px solid #374151",
                            background: "#020617",
                            color: "#e5e7eb",
                            padding: 6,
                            outline: "none",
                          }}
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => handleSavePartMeta(part.id)}
                        style={{
                          alignSelf: "flex-end",
                          padding: "4px 10px",
                          borderRadius: 999,
                          border: "1px solid #4b5563",
                          background:
                            "linear-gradient(135deg, rgba(34,197,94,0.15), rgba(22,163,74,0.4))",
                          color: "#bbf7d0",
                          fontSize: 11,
                          cursor: "pointer",
                        }}
                      >
                        Guardar datos de esta capa
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Posición */}
          <div
            style={{
              padding: 12,
              borderRadius: 16,
              border: "1px solid #1f2937",
              background: "rgba(15,23,42,0.9)",
            }}
          >
            <div
              style={{
                fontSize: 13,
                marginBottom: 6,
              }}
            >
              Posición (unidades escena)
            </div>
            {["x", "y", "z"].map((axis) => (
              <div
                key={axis}
                style={{
                  display: "flex",
                  alignItems: "center",
                  marginBottom: 6,
                  gap: 8,
                }}
              >
                <span
                  style={{
                    width: 16,
                    textTransform: "uppercase",
                    fontSize: 12,
                    color: "#9ca3af",
                  }}
                >
                  {axis}
                </span>
                <input
                  type="range"
                  min={-500}
                  max={500}
                  value={position[axis]}
                  onChange={(e) => handlePositionChange(axis, e.target.value)}
                  style={{ flex: 1 }}
                />
                <span
                  style={{
                    width: 50,
                    fontSize: 12,
                    textAlign: "right",
                    color: "#e5e7eb",
                  }}
                >
                  {position[axis]}
                </span>
              </div>
            ))}
          </div>

          {/* Rotación */}
          <div
            style={{
              padding: 12,
              borderRadius: 16,
              border: "1px solid #1f2937",
              background: "rgba(15,23,42,0.9)",
            }}
          >
            <div
              style={{
                fontSize: 13,
                marginBottom: 6,
              }}
            >
              Rotación (grados)
            </div>
            {["x", "y", "z"].map((axis) => (
              <div
                key={axis}
                style={{
                  display: "flex",
                  alignItems: "center",
                  marginBottom: 6,
                  gap: 8,
                }}
              >
                <span
                  style={{
                    width: 16,
                    textTransform: "uppercase",
                    fontSize: 12,
                    color: "#9ca3af",
                  }}
                >
                  {axis}
                </span>
                <input
                  type="range"
                  min={-180}
                  max={180}
                  value={rotation[axis]}
                  onChange={(e) => handleRotationChange(axis, e.target.value)}
                  style={{ flex: 1 }}
                />
                <span
                  style={{
                    width: 50,
                    fontSize: 12,
                    textAlign: "right",
                    color: "#e5e7eb",
                  }}
                >
                  {rotation[axis]}°
                </span>
              </div>
            ))}
          </div>

          {/* Botón reset */}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
            }}
          >
            <button
              onClick={handleResetTransform}
              style={{
                padding: "6px 12px",
                fontSize: 12,
                borderRadius: 999,
                border: "1px solid #4b5563",
                background:
                  "linear-gradient(135deg, #0f172a, rgba(55,65,81,0.6))",
                color: "#e5e7eb",
                cursor: "pointer",
              }}
            >
              Recentrar y resetear
            </button>
          </div>

          {/* Notas pendientes (abajo derecha) */}
          <div
            style={{
              padding: 12,
              borderRadius: 16,
              border: "1px solid #1f2937",
              background: "rgba(15,23,42,0.9)",
              marginTop: 4,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <div
              style={{
                fontSize: 13,
                marginBottom: 2,
              }}
            >
              Notas pendientes del proyecto
            </div>
            <textarea
              value={pendingNotes}
              onChange={(e) => setPendingNotes(e.target.value)}
              placeholder="Tareas, pendientes, ideas de cambios..."
              style={{
                width: "100%",
                minHeight: 80,
                resize: "vertical",
                fontSize: 12,
                borderRadius: 12,
                border: "1px solid #374151",
                background: "#020617",
                color: "#e5e7eb",
                padding: 8,
                outline: "none",
              }}
            />
            <button
              type="button"
              onClick={handleSavePendingNotes}
              style={{
                alignSelf: "flex-end",
                padding: "4px 10px",
                borderRadius: 999,
                border: "1px solid #4b5563",
                background:
                  "linear-gradient(135deg, rgba(56,189,248,0.2), rgba(37,99,235,0.5))",
                color: "#bfdbfe",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              Guardar notas pendientes
            </button>
          </div>

          <div
            style={{
              marginTop: 4,
              fontSize: 11,
              color: "#6b7280",
            }}
          >
            Tip: exporta desde CAD o SolidWorks a STL, OBJ, glTF/GLB, PLY o
            3MF. Los STL se ajustan automáticamente al piso (plano y=0) para
            evitar que queden flotando, incluso cuando los mueves o rotas.
          </div>
        </div>
      </div>

      <ProjectManagerModal
        isMobile={isMobile}
        isOpen={isProjectModalOpen}
        onClose={() => setIsProjectModalOpen(false)}
        projects={projects}
        onCreateProject={handleCreateProject}
        onLoadProject={handleLoadProject}
        onDeleteProject={handleDeleteProject}
        onReplaceModel={handleReplaceModel}
        onUpdateTransform={handleUpdateProjectTransform}
        onRenameProject={handleRenameProject}
      />
    </>
  );
}

export default App;
