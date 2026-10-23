/* ==================================================================
   CONFIG
   csvUrl : lien du Google Sheet publié en CSV
            (Fichier > Partager > Publier sur le web > CSV)
            Laisse vide pour utiliser les données de démo.
   dossierImages : dossier où sont rangées les images (nommées par code)
================================================================== */
const CONFIG = {
  csvUrl: "",
  dossierImages: "items/",
  extensions: ["png", "webp", "jpg"],   // testées dans cet ordre
  devise: "septims",
};

/* Colonnes attendues dans le Sheet (ligne 1) :
   code | nom | description | prix | vendu

   L'image est cherchée automatiquement dans items/<code>.png
   (puis .webp, puis .jpg).
   vendu = "oui" (ou x, true, 1, case cochée) → l'objet reste dans le
   Sheet comme registre mais n'apparaît plus dans le catalogue.   */
const DEMO = [
  { code: "A001", nom: "Tunique de Marchand Cyrodiilien Enchantée", description: "Enchantement de Port", prix: "1800" },
  { code: "A002", nom: "Armure Gothique Enchantée", description: "Enchantement de Conjuration ou Destruction", prix: "3500" },
  { code: "W001", nom: "Lame de Givre Ancienne", description: "Dégâts de froid", prix: "5200" },
];

/* ------------------------------------------------------------------
   1. Charger les données
------------------------------------------------------------------- */
async function chargerItems() {
  if (!CONFIG.csvUrl) return DEMO.filter(item => !estVendu(item));

  // le paramètre t= évite que le navigateur serve une vieille version en cache
  const sep = CONFIG.csvUrl.includes("?") ? "&" : "?";
  const rep = await fetch(CONFIG.csvUrl + sep + "t=" + Date.now());
  if (!rep.ok) throw new Error("Sheet inaccessible (" + rep.status + ")");

  const lignes = parseCSV(await rep.text());
  const entetes = lignes.shift().map(h => h.trim().toLowerCase());

  return lignes
    .map(cols => Object.fromEntries(entetes.map((h, i) => [h, (cols[i] ?? "").trim()])))
    .filter(item => item.nom)        // ignore les lignes vides
    .filter(item => !estVendu(item));
}

/* Accepte "oui", "x", "vrai", "true", "1" et les cases à cocher
   Google Sheets (exportées en TRUE/FALSE dans le CSV). */
function estVendu(item) {
  return /^(oui|o|x|vrai|true|1|yes|vendu)$/i.test((item.vendu || "").trim());
}

/* Parseur CSV minimal : gère les guillemets, les virgules
   et les retours à la ligne à l'intérieur d'une cellule. */
function parseCSV(texte) {
  const lignes = [];
  let ligne = [], cell = "", dansGuillemets = false;

  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (dansGuillemets) {
      if (c === '"' && texte[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') dansGuillemets = false;
      else cell += c;
    } else if (c === '"') dansGuillemets = true;
    else if (c === ",") { ligne.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && texte[i + 1] === "\n") i++;
      ligne.push(cell); lignes.push(ligne);
      ligne = []; cell = "";
    } else cell += c;
  }
  if (cell || ligne.length) { ligne.push(cell); lignes.push(ligne); }
  return lignes;
}

/* ------------------------------------------------------------------
   2. Construire une page à partir d'un objet
------------------------------------------------------------------- */
const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* Chemins possibles pour l'image : items/<code>.png, .webp, .jpg */
function sourcesImage(item) {
  if (!item.code) return [];
  return CONFIG.extensions.map(ext => `${CONFIG.dossierImages}${item.code}.${ext}`);
}

/* Essaie chaque chemin jusqu'à ce qu'une image charge */
function creerImage(item) {
  const sources = sourcesImage(item);
  if (!sources.length) return null;

  const img = document.createElement("img");
  img.alt = item.nom;
  let i = 0;
  img.onerror = () => {
    i++;
    if (i < sources.length) img.src = sources[i];
    else {
      console.warn(`Aucune image trouvée pour ${item.code || item.nom} :`, sources);
      img.remove();
    }
  };
  img.src = sources[0];
  return img;
}

function formatPrix(p) {
  const n = Number(String(p).replace(/\s/g, ""));
  return isNaN(n) ? esc(p) : n.toLocaleString("fr-FR") + " " + CONFIG.devise;
}

function creerPage(item, index) {
  const page = document.createElement("div");
  // StPageFlip (mode double) : index pair = page de gauche, impair = droite
  page.className = "page " + (index % 2 === 0 ? "gauche" : "droite");

  if (!item) { page.classList.add("vide"); return page; }

  page.innerHTML = `
    <h2 class="zone titre">${esc(item.nom)}</h2>
    <div class="zone cadre"></div>
    <p class="zone description">${esc(item.description || "")}</p>
    <div class="zone prix">${item.prix ? formatPrix(item.prix) : ""}</div>
    ${item.code ? `<div class="zone code">N° ${esc(item.code)}</div>` : ""}
  `;

  const img = creerImage(item);
  if (img) page.querySelector(".cadre").appendChild(img);
  return page;
}

/* ------------------------------------------------------------------
   3. Monter le livre
------------------------------------------------------------------- */
async function init() {
  const statut = document.getElementById("statut");
  const livre = document.getElementById("livre");

  let items;
  try {
    items = await chargerItems();
  } catch (e) {
    statut.textContent = "Impossible de charger le catalogue : " + e.message;
    return;
  }

  // nombre pair de pages pour que la dernière double page soit complète
  const liste = items.length % 2 ? [...items, null] : items;
  const pages = liste.map(creerPage);
  pages.forEach(p => livre.appendChild(p));

  const flip = new St.PageFlip(livre, {
    width: 971,          // taille d'UNE page en px (moitié de l'image)
    height: 1464,
    size: "stretch",     // s'adapte à la largeur du conteneur
    // bornes larges : c'est le CSS (.livre-wrap) qui décide de la taille
    minWidth: 100,
    maxWidth: 971,
    minHeight: 151,
    maxHeight: 1464,
    showCover: false,
    // toujours en double page, même sur écran étroit, pour que
    // l'image de fond reste calée sur le livre
    usePortrait: false,
    // les ombres de la lib sont des rectangles dessinés par-dessus
    // les pages : avec un PNG détouré elles débordent dans le vide
    drawShadow: false,
    mobileScrollSupport: false,
    flippingTime: 800,
  });
  flip.loadFromHTML(pages);

  // navigation + compteur
  const compteur = document.getElementById("compteur");
  const maj = () => {
    const i = flip.getCurrentPageIndex();
    compteur.textContent = `${i + 1} / ${flip.getPageCount()}`;
  };
  flip.on("flip", maj);
  maj();

  document.getElementById("prev").onclick = () => flip.flipPrev();
  document.getElementById("next").onclick = () => flip.flipNext();
  document.addEventListener("keydown", e => {
    if (e.key === "ArrowLeft") flip.flipPrev();
    if (e.key === "ArrowRight") flip.flipNext();
  });

  statut.textContent = "";
}

init();