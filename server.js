const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const fse = require("fs-extra");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 4000;

// Ruta base de API
const API_BASE = "/api/projects";

// Carpetas
const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "projects.json");
const PUBLIC_DIR = path.join(__dirname, "public");
const UPLOADS_DIR = path.join(__dirname, "uploads");

// Asegurar carpetas
fse.ensureDirSync(DATA_DIR);
fse.ensureDirSync(PUBLIC_DIR);
fse.ensureDirSync(UPLOADS_DIR);

// Multer para subir modelos
const upload = multer({
  dest: UPLOADS_DIR,
});

// Middlewares
app.use(
  cors({
    origin: [
      "http://localhost:5173",             // Vite en local
      "https://visor3dmci.netlify.app",    // tu dominio en Netlify
    ],
  })
);

app.use(express.json());
app.use("/public", express.static(PUBLIC_DIR));

/* ============================================================
   Utilidades de "BD" (archivo JSON) y escena
   ============================================================ */

function loadDb() {
  if (!fs.existsSync(DB_FILE)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(DB_FILE, "utf8");
    if (!raw.trim()) return [];
    return JSON.parse(raw);
  } catch (e) {
    console.error("Error leyendo DB:", e);
    return [];
  }
}

function saveDb(projects) {
  fs.writeFileSync(DB_FILE, JSON.stringify(projects, null, 2), "utf8");
}

function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function findProject(projects, id) {
  return projects.find((p) => String(p.id) === String(id));
}

function writeSceneJson(project) {
  const dir = path.join(PUBLIC_DIR, project.slug);
  fse.ensureDirSync(dir);

  const scene = {
    projectName: project.name,
    author: project.author || "",
    date: project.date || "",
    passwordHash: project.passwordHash,
    position: project.position || { x: 0, y: 0, z: 0 },
    rotation: project.rotation || { x: 0, y: 0, z: 0 },
    modelFile: project.modelFile || "",
    partsMeta: project.partsMeta || {},
  };

  const scenePath = path.join(dir, "scene.json");
  fs.writeFileSync(scenePath, JSON.stringify(scene, null, 2), "utf8");
}

/* ============================================================
   Rutas
   ============================================================ */

/**
 * GET /api/projects
 * Lista de proyectos (para el panel de React)
 */
app.get(API_BASE, (req, res) => {
  const projects = loadDb();
  const out = projects.map((p) => ({
    id: p.id,
    name: p.name,
    author: p.author || "",
    date: p.date || "",
    position: p.position || { x: 0, y: 0, z: 0 },
    rotation: p.rotation || { x: 0, y: 0, z: 0 },
    modelFile: p.modelFile || "",
    modelUrl: p.modelFile ? `/public/${p.slug}/${p.modelFile}` : null,
    partsMeta: p.partsMeta || {},
    pendingNotes: p.pendingNotes || "",
  }));

  res.json({ ok: true, projects: out });
});

/**
 * POST /api/projects
 * Crear proyecto nuevo con modelo + scene.json
 */
app.post(API_BASE, upload.single("model"), async (req, res) => {
  try {
    const file = req.file;
    const {
      projectName,
      author,
      password,
      date,
      position,
      rotation,
      partsMeta,
    } = req.body;

    if (!file || !projectName || !password) {
      if (file && file.path) fse.remove(file.path);
      return res
        .status(400)
        .json({ ok: false, error: "Faltan archivo, nombre o contraseña." });
    }

    const projects = loadDb();
    const newId = projects.length ? Math.max(...projects.map((p) => p.id)) + 1 : 1;

    // slug de la carpeta
    const slug = `${newId}-${projectName
      .toString()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .substring(0, 40) || "proyecto"}`;

    const projectDir = path.join(PUBLIC_DIR, slug);
    await fse.ensureDir(projectDir);

    // Renombrar archivo a modelo.ext
    const ext = path.extname(file.originalname) || ".bin";
    const modelFileName = "modelo" + ext.toLowerCase();
    const finalPath = path.join(projectDir, modelFileName);

    await fse.move(file.path, finalPath, { overwrite: true });

    let parsedPos = { x: 0, y: 0, z: 0 };
    let parsedRot = { x: 0, y: 0, z: 0 };
    let parsedPartsMeta = {};

    if (position) {
      try {
        parsedPos = JSON.parse(position);
      } catch {
        parsedPos = { x: 0, y: 0, z: 0 };
      }
    }
    if (rotation) {
      try {
        parsedRot = JSON.parse(rotation);
      } catch {
        parsedRot = { x: 0, y: 0, z: 0 };
      }
    }
    if (partsMeta) {
      try {
        parsedPartsMeta = JSON.parse(partsMeta);
      } catch {
        parsedPartsMeta = {};
      }
    }

    const passwordHash = hashPassword(password);

    const newProject = {
      id: newId,
      name: projectName,
      author: author || "",
      date: date || "",
      slug,
      passwordHash,
      modelFile: modelFileName,
      position: parsedPos,
      rotation: parsedRot,
      partsMeta: parsedPartsMeta,
      pendingNotes: "",
    };

    projects.push(newProject);
    saveDb(projects);
    writeSceneJson(newProject);

    res.json({ ok: true, projectId: newId });
  } catch (err) {
    console.error("Error en POST /api/projects:", err);
    res
      .status(500)
      .json({ ok: false, error: "Error interno al crear el proyecto." });
  }
});

/**
 * PUT /api/projects/:id/model
 * Reemplazar sólo el modelo 3D
 */
app.put(`${API_BASE}/:id/model`, upload.single("model"), async (req, res) => {
  const { id } = req.params;
  const file = req.file;

  if (!file) {
    return res
      .status(400)
      .json({ ok: false, error: "No se envió archivo de modelo." });
  }

  try {
    const projects = loadDb();
    const project = findProject(projects, id);
    if (!project) {
      await fse.remove(file.path);
      return res.status(404).json({ ok: false, error: "Proyecto no encontrado." });
    }

    const projectDir = path.join(PUBLIC_DIR, project.slug);
    await fse.ensureDir(projectDir);

    const ext = path.extname(file.originalname) || ".bin";
    const modelFileName = "modelo" + ext.toLowerCase();
    const finalPath = path.join(projectDir, modelFileName);

    // borrar modelo anterior si existe
    if (project.modelFile) {
      const oldPath = path.join(projectDir, project.modelFile);
      if (fs.existsSync(oldPath)) {
        await fse.remove(oldPath);
      }
    }

    await fse.move(file.path, finalPath, { overwrite: true });

    project.modelFile = modelFileName;
    saveDb(projects);
    writeSceneJson(project);

    res.json({ ok: true });
  } catch (err) {
    console.error("Error en PUT /api/projects/:id/model:", err);
    if (file && file.path) {
      await fse.remove(file.path);
    }
    res
      .status(500)
      .json({ ok: false, error: "Error interno al reemplazar el modelo." });
  }
});

/**
 * PUT /api/projects/:id/transform
 * Actualizar posición / rotación
 */
app.put(`${API_BASE}/:id/transform`, (req, res) => {
  const { id } = req.params;
  const { position, rotation, password } = req.body || {};

  if (!password) {
    return res
      .status(400)
      .json({ ok: false, error: "La contraseña es obligatoria." });
  }

  const projects = loadDb();
  const project = findProject(projects, id);
  if (!project) {
    return res.status(404).json({ ok: false, error: "Proyecto no encontrado." });
  }

  const hash = hashPassword(password);
  if (hash !== project.passwordHash) {
    return res.status(403).json({ ok: false, error: "Contraseña incorrecta." });
  }

  project.position = position || { x: 0, y: 0, z: 0 };
  project.rotation = rotation || { x: 0, y: 0, z: 0 };

  saveDb(projects);
  writeSceneJson(project);

  res.json({ ok: true });
});

/**
 * PUT /api/projects/:id/rename
 * Renombrar proyecto (y carpeta)
 */
app.put(`${API_BASE}/:id/rename`, async (req, res) => {
  const { id } = req.params;
  const { name, password } = req.body || {};

  if (!name || !password) {
    return res
      .status(400)
      .json({ ok: false, error: "Nombre y contraseña son obligatorios." });
  }

  const projects = loadDb();
  const project = findProject(projects, id);
  if (!project) {
    return res.status(404).json({ ok: false, error: "Proyecto no encontrado." });
  }

  const hash = hashPassword(password);
  if (hash !== project.passwordHash) {
    return res.status(403).json({ ok: false, error: "Contraseña incorrecta." });
  }

  const oldSlug = project.slug;
  const newSlug = `${project.id}-${name
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 40) || "proyecto"}`;

  const oldDir = path.join(PUBLIC_DIR, oldSlug);
  const newDir = path.join(PUBLIC_DIR, newSlug);

  try {
    if (fs.existsSync(oldDir)) {
      await fse.move(oldDir, newDir, { overwrite: true });
    } else {
      await fse.ensureDir(newDir);
    }

    project.name = name;
    project.slug = newSlug;

    saveDb(projects);
    writeSceneJson(project);

    res.json({ ok: true });
  } catch (err) {
    console.error("Error al renombrar proyecto/carpeta:", err);
    res
      .status(500)
      .json({ ok: false, error: "Error interno al renombrar el proyecto." });
  }
});

/**
 * PUT /api/projects/:id/notes
 * Guardar notas pendientes del proyecto
 */
app.put(`${API_BASE}/:id/notes`, (req, res) => {
  const { id } = req.params;
  const { notes, password } = req.body || {};

  if (!password) {
    return res
      .status(400)
      .json({ ok: false, error: "La contraseña es obligatoria." });
  }

  const projects = loadDb();
  const project = findProject(projects, id);
  if (!project) {
    return res.status(404).json({ ok: false, error: "Proyecto no encontrado." });
  }

  const hash = hashPassword(password);
  if (hash !== project.passwordHash) {
    return res.status(403).json({ ok: false, error: "Contraseña incorrecta." });
  }

  project.pendingNotes = notes || "";

  saveDb(projects);
  writeSceneJson(project);

  res.json({ ok: true });
});

/**
 * PUT /api/projects/:id/parts-meta
 * Guardar metadata de UNA capa/pieza: nombre, notas, color, materialPreset
 */
app.put(`${API_BASE}/:id/parts-meta`, (req, res) => {
  const { id } = req.params;
  const { partId, name, notes, color, materialPreset, password } = req.body || {};

  if (typeof partId === "undefined") {
    return res
      .status(400)
      .json({ ok: false, error: "partId es obligatorio." });
  }
  if (!password) {
    return res
      .status(400)
      .json({ ok: false, error: "La contraseña es obligatoria." });
  }

  const projects = loadDb();
  const project = findProject(projects, id);
  if (!project) {
    return res.status(404).json({ ok: false, error: "Proyecto no encontrado." });
  }

  const hash = hashPassword(password);
  if (hash !== project.passwordHash) {
    return res.status(403).json({ ok: false, error: "Contraseña incorrecta." });
  }

  if (!project.partsMeta) project.partsMeta = {};

  // usamos la clave como string para ser consistentes
  const key = String(partId);
  const prev = project.partsMeta[key] || {};

  project.partsMeta[key] = {
    name: name !== undefined ? name : prev.name || "",
    notes: notes !== undefined ? notes : prev.notes || "",
    color: color !== undefined ? color : prev.color || "#22c55e",
    materialPreset:
      materialPreset !== undefined ? materialPreset : prev.materialPreset || "plastic",
  };

  saveDb(projects);
  writeSceneJson(project);

  res.json({ ok: true });
});

/**
 * DELETE /api/projects/:id
 * Eliminar proyecto y carpeta
 */
app.delete(`${API_BASE}/:id`, async (req, res) => {
  const { id } = req.params;
  const { password } = req.body || {};

  if (!password) {
    return res
      .status(400)
      .json({ ok: false, error: "La contraseña es obligatoria." });
  }

  const projects = loadDb();
  const projectIndex = projects.findIndex((p) => String(p.id) === String(id));

  if (projectIndex === -1) {
    return res.status(404).json({ ok: false, error: "Proyecto no encontrado." });
  }

  const project = projects[projectIndex];
  const hash = hashPassword(password);
  if (hash !== project.passwordHash) {
    return res.status(403).json({ ok: false, error: "Contraseña incorrecta." });
  }

  const projectDir = path.join(PUBLIC_DIR, project.slug);

  try {
    if (fs.existsSync(projectDir)) {
      await fse.remove(projectDir);
    }
    projects.splice(projectIndex, 1);
    saveDb(projects);

    res.json({ ok: true });
  } catch (err) {
    console.error("Error al eliminar proyecto/carpeta:", err);
    res
      .status(500)
      .json({ ok: false, error: "Error interno al eliminar el proyecto." });
  }
});

/* ============================================================
   Arranque del servidor
   ============================================================ */

app.listen(PORT, () => {
  console.log(`Servidor de proyectos 3D escuchando en http://localhost:${PORT}`);
});
