// Publication des logiciels TAMTUI sur la page de téléchargement publique (GitHub Pages).
// Pour chaque logiciel : lit la dernière version publiée dans son dépôt PRIVÉ, copie les installateurs
// dans le site (fichiers/<logiciel>/), écrit le fichier de mise à jour automatique
// (mises-a-jour/<logiciel>.json) et régénère la page index.html.
//
//   node outils/publier.mjs               publie les nouvelles versions, puis commit et push
//   Bouton GitHub : onglet Actions › Publier (workflow publier.yml), variable NOTES = « Quoi de neuf ».
//   node outils/publier.mjs --simulation  ne copie rien : régénère seulement la page (aperçu)
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PUBLIC = "Tamtui/TAMTUI-TELECHARGEMENTS";
const SITE = "https://tamtui.github.io/TAMTUI-TELECHARGEMENTS";
const RACINE = new URL("..", import.meta.url).pathname;
const SIMULATION = process.argv.includes("--simulation");
// Coordonnées affichées sur la page (laisser vide pour ne pas afficher la ligne).
const CONTACT = { telephone: "+227 96 96 18 49", whatsapp: "", email: "" };
// Prix validés par l'éditeur le 27 octobre 2026 (FCFA HT, licence perpétuelle payée une seule fois, par ordinateur).
// Les 4 logiciels métier ont les mêmes prix ; TAMTUI SAHEL 360 = logiciels séparés + 15 %, arrondi aux 5 000 FCFA,
// à partir de GESTION et de 2 activités.
const EDITIONS = ["START", "GESTION", "PRODUCTION", "INTELLIGENCE", "ENTERPRISE"];
const PRIX = { START: 65000, GESTION: 100000, PRODUCTION: 190000, INTELLIGENCE: 310000, ENTERPRISE: 460000 };
const prix360 = (ed, n) => Math.round(PRIX[ed] * n * 1.15 / 5000) * 5000;
const fcfa = n => n.toLocaleString("fr-FR").replace(/\u202f/g, " ");

const PRODUITS = [
  { id: "sahel360", nom: "TAMTUI SAHEL 360", activite: "Toutes vos activités dans un seul logiciel", depot: "Tamtui/TAMTUI-SAHEL-360", base: "TAMTUI-SAHEL-360", prefixe: "TMS-", couleur: "#6b3fa0", icone: "🌍", vedette: true,
    texte: "Composez votre logiciel : cultures, élevage, pisciculture et maraîchage, au choix, avec un socle commun (producteurs, stocks, ventes, finances), les liens entre activités (fumier, fanes, eau des bassins…) et le bilan de rentabilité de chaque activité. Reprend les données des 4 logiciels TAMTUI.",
    activites: ["🌾 Cultures", "🐄 Élevage", "🐟 Pisciculture", "🥬 Maraîchage"] },
  { id: "agriculture", nom: "TAMTUI Suite Pro", activite: "Agriculture", depot: "Tamtui/TAMTUI-AGRICULTURE-PRO-13", base: "TAMTUI-Suite-Pro", prefixe: "TMT-", couleur: "#2f7d32", icone: "🌾",
    texte: "Producteurs, exploitations, parcelles géolocalisées, cultures par campagne, récoltes, intrants, stocks, ventes et finances." },
  { id: "elevage", nom: "TAMTUI Élevage Pro", activite: "Élevage", depot: "Tamtui/TAMTUI-ELEVAGE-PRO", base: "TAMTUI-Elevage-Pro", prefixe: "TME-", couleur: "#8a5a14", icone: "🐄",
    texte: "Éleveurs, troupeaux et animaux, santé et vaccinations, reproduction, pesées, alimentation, pâturages et production." },
  { id: "pisciculture", nom: "TAMTUI Pisciculture Pro", activite: "Pisciculture", depot: "Tamtui/TAMTUI-PISCICULTURE-PRO", base: "TAMTUI-Pisciculture-Pro", prefixe: "TMP-", couleur: "#1f6fa8", icone: "🐟",
    texte: "Bassins et cages, lots de poissons, qualité de l'eau, santé, écloserie, croissance, alimentation et récoltes." },
  { id: "maraichage", nom: "TAMTUI Maraîchage Pro", activite: "Maraîchage", depot: "Tamtui/TAMTUI-MARAICHAGE-PRO", base: "TAMTUI-Maraichage-Pro", prefixe: "TMM-", couleur: "#c2561b", icone: "🥬",
    texte: "Parcelles et planches, semences et pépinière, cultures, protection, irrigation, fertilisation et récoltes successives." },
];

const gh = (...args) => execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const fichierEtat = join(RACINE, "produits.json");
const etat = existsSync(fichierEtat) ? JSON.parse(readFileSync(fichierEtat, "utf8")) : {};
const taille = o => o >= 1048576 ? `${(o / 1048576).toFixed(1).replace(".", ",")} Mo` : `${Math.round(o / 1024)} Ko`;
let change = false;

for (const p of PRODUITS) {
  // Un logiciel sans version publiée (ou un dépôt illisible) est ignoré : il ne bloque pas les autres.
  let rel;
  try { rel = JSON.parse(gh("api", `repos/${p.depot}/releases/latest`)); }
  catch { console.log(`⚠ ${p.nom} : aucune version publiée pour l'instant (ou dépôt non lisible), ignoré.`); continue; }
  const version = rel.tag_name.replace(/^v/, "");
  const actifs = Object.fromEntries(rel.assets.map(a => [a.name, a]));
  const nomExe = `${p.base}-${version}-Windows-installateur.exe`, nomDmg = `${p.base}-${version}-Mac-tous-modeles.dmg`, nomTar = `${p.base}-${version}-Mac.app.tar.gz`;
  if (!actifs[nomExe] || !actifs[nomDmg]) { console.log(`⚠ ${p.nom} ${version} : installateurs absents de la version privée, ignoré.`); continue; }
  const tag = `${p.id}-v${version}`;
  const url = n => `${SITE}/fichiers/${p.id}/${n}`;
  if (etat[p.id]?.version === version) { console.log(`= ${p.nom} ${version} déjà publié.`); continue; }
  const majAuto = Boolean(actifs[`${nomExe}.sig`] && actifs[nomTar] && actifs[`${nomTar}.sig`]);
  if (!SIMULATION) {
    const tmp = join("/tmp", `publication-${p.id}-${version}`); rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp);
    const motifs = [nomExe, nomDmg, ...(majAuto ? [`${nomExe}.sig`, nomTar, `${nomTar}.sig`] : [])];
    // Les installateurs sont déposés dans le site lui-même (fichiers/<logiciel>/), servi par GitHub Pages.
    const dossier = join(RACINE, "fichiers", p.id);
    rmSync(dossier, { recursive: true, force: true }); mkdirSync(dossier, { recursive: true });
    for (const m of motifs) {
      const contenu = execFileSync("gh", ["api", `repos/${p.depot}/releases/assets/${actifs[m].id}`, "-H", "Accept: application/octet-stream"], { maxBuffer: 1 << 30 });
      writeFileSync(join(m.endsWith(".sig") ? tmp : dossier, m), contenu);
    }
    if (majAuto) {
      const sig = n => readFileSync(join(tmp, n), "utf8").trim();
      const mac = { signature: sig(`${nomTar}.sig`), url: url(nomTar) };
      const manifeste = { version, notes: process.env.NOTES?.trim() || `${p.nom} ${version} : améliorations et corrections. Vos données et votre licence sont conservées.`, pub_date: new Date().toISOString(),
        platforms: { "darwin-x86_64": mac, "darwin-aarch64": mac, "windows-x86_64": { signature: sig(`${nomExe}.sig`), url: url(nomExe) } } };
      mkdirSync(join(RACINE, "mises-a-jour"), { recursive: true });
      writeFileSync(join(RACINE, "mises-a-jour", `${p.id}.json`), JSON.stringify(manifeste, null, 2) + "\n");
    }
    rmSync(tmp, { recursive: true, force: true });
  }
  etat[p.id] = { version, date: rel.published_at.slice(0, 10), majAuto,
    windows: { nom: nomExe, taille: taille(actifs[nomExe].size), url: url(nomExe) }, mac: { nom: nomDmg, taille: taille(actifs[nomDmg].size), url: url(nomDmg) } };
  change = true;
  console.log(`✓ ${p.nom} ${version}${majAuto ? " (mise à jour automatique activée)" : ""}${SIMULATION ? " — simulation" : ""}`);
}

// ---------- Page de téléchargement ----------
const e = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const dateFr = d => new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
const guides = existsSync(join(RACINE, "guides")) ? readdirSync(join(RACINE, "guides")) : [];
const logo = existsSync(join(RACINE, "logo.png"));
const cartes = PRODUITS.filter(p => etat[p.id]).map(p => {
  const s = etat[p.id], guide = guides.find(g => g.includes(p.base));
  return `<article class="carte${p.vedette ? " vedette" : ""}" style="--c:${p.couleur}">${p.vedette ? '<span class="nouveau">NOUVEAU</span>' : ""}
    <header><span class="icone">${p.icone}</span><div><h2>${e(p.nom)}</h2><span class="activite">${e(p.activite)}</span></div><span class="version">v${e(s.version)}</span></header>
    <p>${e(p.texte)}</p>${p.activites ? `<div class="puces">${p.activites.map(a => `<span>${e(a)}</span>`).join("")}</div>` : ""}
    <div class="boutons">
      <a class="bouton" href="${e(s.windows.url)}">⊞ Windows <small>${e(s.windows.taille)} · .exe</small></a>
      <a class="bouton" href="${e(s.mac.url)}">🍎 Mac <small>${e(s.mac.taille)} · Intel et Apple</small></a>
    </div>
    <p class="aPartir">${p.vedette ? `À partir de <b>${fcfa(prix360("GESTION", 2))} FCFA</b> (GESTION, 2 activités)` : `À partir de <b>${fcfa(PRIX.START)} FCFA</b> (START)`} · licence payée une seule fois · <a href="#tarifs">voir les tarifs</a></p>
    <footer>${guide ? `<a href="guides/${e(guide)}">📘 Guide de l'utilisateur (PDF)</a>` : ""}<span>Publié le ${dateFr(s.date)} · code ordinateur <code>${p.prefixe}</code></span></footer>
  </article>`;
}).join("\n");
// Composant Microsoft WebView2 hors connexion (publié par le workflow « Composant Windows hors connexion »).
let composant = null;
try {
  const a = JSON.parse(gh("api", `repos/${PUBLIC}/releases/tags/composant-webview2`)).assets.find(x => x.name.endsWith(".exe"));
  if (a) composant = { url: a.browser_download_url, taille: taille(a.size) };
} catch { /* pas encore publié */ }
const blocHorsConnexion = composant ? `<section class="horsConnexion">
    <div><h3>🔌 Ordinateur Windows sans Internet ?</h3>
    <p>Windows 11 et les Windows 10 à jour sont prêts. Sur un Windows 10 <b>jamais mis à jour</b> et <b>sans Internet</b>, l'installation a besoin d'un composant de Microsoft (WebView2) : apportez-le avec le logiciel sur une clé USB.</p>
    <ol><li>Là où il y a Internet, téléchargez l'installateur Windows du logiciel <b>et</b> le composant ci-contre, puis copiez les deux sur une clé USB.</li>
    <li>Sur l'ordinateur sans Internet, lancez d'abord le <b>composant Microsoft</b> (une seule fois par ordinateur, pour tous les logiciels TAMTUI).</li>
    <li>Lancez ensuite l'installateur TAMTUI : il s'installe sans Internet.</li></ol></div>
    <a class="bouton composant" href="${e(composant.url)}">⊞ Composant Microsoft WebView2<small>${e(composant.taille)} · officiel, signé par Microsoft · Windows 10/11 64 bits</small></a>
  </section>` : "";
const blocTarifs = `<section class="tarifs" id="tarifs">
    <h2>Tarifs</h2>
    <p class="sousTitre">Licence <b>perpétuelle</b>, payée <b>une seule fois</b>, par ordinateur. Prix hors taxes, en FCFA. Pas d'abonnement : les mises à jour sont gratuites.</p>
    <h3>Logiciels métier : TAMTUI Agriculture, Élevage, Pisciculture, Maraîchage <small>(les mêmes prix pour les quatre)</small></h3>
    <div class="tableau"><table><tr>${EDITIONS.map(ed => `<th>${ed}</th>`).join("")}</tr><tr>${EDITIONS.map(ed => `<td>${fcfa(PRIX[ed])}</td>`).join("")}</tr></table></div>
    <h3 class="violet">TAMTUI SAHEL 360 <small>(plusieurs activités connectées, à partir de GESTION)</small></h3>
    <div class="tableau"><table><tr><th>Édition</th><th>2 activités</th><th>3 activités</th><th>4 activités</th></tr>${EDITIONS.slice(1).map(ed => `<tr><td><b>${ed}</b></td>${[2, 3, 4].map(n => `<td>${fcfa(prix360(ed, n))}</td>`).join("")}</tr>`).join("")}</table></div>
    <p class="petit">Le prix de TAMTUI SAHEL 360 correspond aux logiciels séparés + 15 % : vos activités sont connectées dans une seule base (liens entre activités, Bilan 360°, carte et rapports communs). Pour une seule activité, choisissez le logiciel métier.</p>
    <ul class="conditions">
      <li><b>Ordinateur supplémentaire</b> : −20 % sur le prix de la licence.</li>
      <li><b>Formation</b> (facultative, conseillée) : une seule fois, 30 % du prix de la licence.</li>
      <li><b>Changement d'ordinateur</b> (panne, vol, remplacement) : nouvelle licence à 40 % du prix.</li>
      <li><b>Activité ou édition en plus</b> plus tard : vous payez seulement la différence, vos données sont conservées.</li>
      <li><b>Déjà client d'un logiciel TAMTUI ?</b> Pour passer à TAMTUI SAHEL 360, votre licence est déduite et vos données sont reprises.</li>
      <li><b>Projets, ONG, services de l'État</b> : licence projet, régionale ou nationale sur devis.</li>
    </ul>
  </section>`;
const contact = [CONTACT.telephone && `📞 ${e(CONTACT.telephone)}`, CONTACT.whatsapp && `💬 WhatsApp ${e(CONTACT.whatsapp)}`, CONTACT.email && `✉️ <a href="mailto:${e(CONTACT.email)}">${e(CONTACT.email)}</a>`].filter(Boolean).join(" · ");
writeFileSync(join(RACINE, "index.html"), `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Télécharger les logiciels TAMTUI</title>
<meta name="description" content="Téléchargement officiel des logiciels TAMTUI : TAMTUI SAHEL 360 (toutes les activités), Agriculture, Élevage, Pisciculture et Maraîchage, pour Windows et Mac.">
<style>
:root{--vert:#0d6538;--vert-fonce:#073e25;--vert-doux:#e6f4ea;--orange:#a85b13;--gris:#5c6b62;--bord:#d8e4dc;--fond:#f2f6f3}
*{box-sizing:border-box}body{margin:0;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:#17231c;background:var(--fond);line-height:1.55}
a{color:var(--vert)}.bandeau{background:linear-gradient(125deg,var(--vert-fonce),var(--vert) 65%,#17844c);color:#fff;padding:42px 20px 92px}
.conteneur{max-width:1150px;margin:0 auto}.marque{display:flex;align-items:center;gap:16px}.marque img{width:72px;height:72px;border-radius:50%;background:#fff;padding:5px;object-fit:contain}
.marque b{font-size:24px;letter-spacing:.06em;display:block}.marque span{color:#cfeedb;font-size:13px;letter-spacing:.18em}
h1{font-size:clamp(28px,4vw,42px);margin:34px 0 10px;max-width:760px}.bandeau p{color:#d7f0e0;max-width:720px;font-size:17px;margin:0}
.atouts{display:flex;gap:10px;flex-wrap:wrap;margin-top:22px}.atouts span{background:#ffffff1c;border:1px solid #ffffff33;border-radius:99px;padding:7px 13px;font-size:13px;font-weight:650}
main{margin-top:-62px;padding:0 20px 50px}.grille{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}
.carte{background:#fff;border:1px solid var(--bord);border-top:6px solid var(--c);border-radius:20px;padding:24px;box-shadow:0 14px 34px #1d3b2814;display:flex;flex-direction:column}
.carte header{display:flex;align-items:center;gap:14px}.icone{font-size:34px}.carte h2{margin:0;font-size:21px}.activite{color:var(--c);font-weight:800;font-size:13px;text-transform:uppercase;letter-spacing:.08em}
.version{margin-left:auto;background:var(--vert-doux);color:var(--vert);font-weight:800;border-radius:99px;padding:5px 11px;font-size:13px}
.carte p{color:#43524a;flex:1}.carte p.aPartir{flex:0;font-size:14px;margin:0 0 12px;color:#2c3a32}.carte p.aPartir a{color:var(--c)}.carte.vedette{grid-column:1/-1;position:relative;border-top-width:8px}.nouveau{position:absolute;top:-14px;right:22px;background:var(--c);color:#fff;font-weight:800;font-size:12px;letter-spacing:.1em;border-radius:99px;padding:5px 12px}.puces{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 16px}.puces span{background:#f1ecf8;color:var(--c);border-radius:99px;padding:5px 11px;font-weight:700;font-size:13px}.boutons{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.bouton{display:block;text-decoration:none;text-align:center;background:var(--c);color:#fff;border-radius:12px;padding:12px 10px;font-weight:800}.bouton:hover{filter:brightness(1.1)}
.bouton small{display:block;font-weight:600;opacity:.88;font-size:12px}.carte footer{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:14px;font-size:13px;color:var(--gris)}
code{background:#eef3ef;border-radius:5px;padding:1px 6px;font-weight:700}
section.infos{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px;margin-top:30px}
.info{background:#fff;border:1px solid var(--bord);border-radius:18px;padding:22px}.info h3{margin:0 0 10px;font-size:17px;color:var(--vert)}.info ol,.info ul{margin:0;padding-left:20px}.info li{margin:6px 0}
.horsConnexion{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:24px;align-items:center;background:#fff;border:1px solid var(--bord);border-left:6px solid #1f6fa8;border-radius:18px;padding:22px;margin-top:24px}
.horsConnexion h3{margin:0 0 8px;color:#1f6fa8;font-size:17px}.horsConnexion p{margin:0 0 8px;color:#43524a}.horsConnexion ol{margin:0;padding-left:20px}.horsConnexion li{margin:5px 0}
.bouton.composant{background:#1f6fa8}
@media(max-width:860px){.horsConnexion{grid-template-columns:1fr}}
.tarifs{background:#fff;border:1px solid var(--bord);border-radius:18px;padding:22px;margin-top:24px}.tarifs h2{margin:0 0 6px;color:var(--vert)}.tarifs h3{margin:18px 0 8px;font-size:16px;color:var(--vert)}.tarifs h3.violet{color:#6b3fa0}.tarifs h3 small{font-weight:500;color:var(--gris);font-size:13px}
.sousTitre{color:#43524a;margin:0}.tableau{overflow-x:auto}.tarifs table{width:100%;border-collapse:collapse;font-size:14px;min-width:420px}.tarifs th{background:var(--vert);color:#fff;padding:8px;text-align:center}.tarifs h3.violet + .tableau th{background:#6b3fa0}.tarifs td{border:1px solid var(--bord);padding:8px;text-align:center;font-weight:700}.tarifs td:first-child b{font-weight:800}
.conditions{margin:12px 0 0;padding-left:20px;color:#43524a}.conditions li{margin:5px 0}.petit{font-size:13px;color:var(--gris)}
.note{background:#fff8ec;border:1px solid #ecd3a8;border-radius:16px;padding:16px 20px;margin-top:24px;color:#6b4710;font-size:14px}
footer.pied{text-align:center;color:var(--gris);font-size:13px;padding:30px 20px 40px}
@media(max-width:860px){.grille,section.infos{grid-template-columns:1fr}.boutons{grid-template-columns:1fr}}
</style></head><body>
<div class="bandeau"><div class="conteneur">
  <div class="marque">${logo ? '<img src="logo.png" alt="TAMTUI">' : ""}<div><b>TAMTUI</b><span>SAHEL</span></div></div>
  <h1>Téléchargez votre logiciel de gestion agro-pastorale</h1>
  <p>Logiciels professionnels hors connexion pour les producteurs, coopératives, ONG et services techniques : agriculture, élevage, pisciculture et maraîchage.</p>
  <div class="atouts"><span>✓ Fonctionne sans Internet</span><span>✓ Windows et Mac</span><span>✓ Essai gratuit 14 jours</span><span>✓ Mises à jour automatiques</span><span>✓ Sauvegarde quotidienne</span></div>
</div></div>
<main class="conteneur">
  <div class="grille">${cartes}</div>
  <section class="infos">
    <div class="info"><h3>1 · Installer</h3><ol><li><b>Windows</b> : lancez le fichier <code>.exe</code>. Si Windows affiche un avertissement : <i>Informations complémentaires › Exécuter quand même</i>.</li><li><b>Mac</b> : ouvrez le <code>.dmg</code>, glissez l'application dans <i>Applications</i>, puis au premier lancement : clic droit › <i>Ouvrir</i>.</li></ol></div>
    <div class="info"><h3>2 · Essayer puis activer</h3><ol><li>Cliquez sur <i>Essayer … pendant 14 jours</i> (START pour les logiciels métier, GESTION pour TAMTUI SAHEL 360).</li><li>Pour la version complète : <i>Copier le code</i> de l'ordinateur et envoyez-le à votre fournisseur TAMTUI.</li><li>Importez le fichier de licence reçu : le logiciel est activé définitivement.</li></ol></div>
    <div class="info"><h3>Configuration conseillée</h3><ul><li><b>Windows 10 ou 11 (64 bits)</b> — Windows 7 et 8 ne sont pas pris en charge</li><li>macOS 11 et plus récent (Intel ou Apple)</li><li>4 Go de mémoire, 500 Mo d'espace disque</li><li>Écran de 1280 × 800 au minimum</li><li>Internet uniquement pour la météo et les mises à jour</li></ul></div>
  </section>
  ${blocTarifs}
  ${blocHorsConnexion}
  <div class="note"><b>Déjà client ?</b> Votre logiciel se met à jour tout seul : au démarrage, il propose les nouvelles versions (« Nouvelle version disponible › Installer maintenant »). Vos données et votre licence sont conservées, et une sauvegarde est faite avant chaque mise à jour.</div>
</main>
<footer class="pied">TAMTUI SAHEL · Société experte fournisseur · Plateforme nationale du bien-être agro-pastoral${contact ? `<br>${contact}` : ""}<br>Téléchargements officiels — ne téléchargez les logiciels TAMTUI que depuis cette page.</footer>
</body></html>
`);
writeFileSync(fichierEtat, JSON.stringify(etat, null, 2) + "\n");
console.log("Page index.html régénérée.");
if (!SIMULATION && change) {
  const git = (...a) => execFileSync("git", ["-C", RACINE, ...a], { stdio: "inherit" });
  git("add", "-A"); git("commit", "-m", "Publication des nouvelles versions"); git("push", "origin", "main");
}
