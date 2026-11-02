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
const CONTACT = { telephone: "+227 82 46 54 40 / +227 81 35 53 48", whatsapp: "", email: "contact@tamtui.com" };
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

// ---------- Page de téléchargement (français à la racine, anglais dans en/, haoussa dans ha/) ----------
const e = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const LANGUES = [{ code: "fr", nom: "FR", dossier: "" }, { code: "en", nom: "EN", dossier: "en/" }, { code: "ha", nom: "HA", dossier: "ha/" }];
const dateLangue = (d, l) => new Date(d + "T12:00:00").toLocaleDateString(l === "en" ? "en-GB" : "fr-FR", l === "ha" ? undefined : { day: "numeric", month: "long", year: "numeric" });
// Textes des cartes de logiciels dans chaque langue (le français est dans PRODUITS).
const PRODUITS_TRAD = {
  en: {
    sahel360: { activite: "All your activities in one software", texte: "Build your own software: crops, livestock, fish farming and market gardening, as you choose, with a shared base (farmers, stocks, sales, finances), links between activities (manure, crop residues, pond water…) and the profitability of each activity. Takes over the data of the 4 TAMTUI software products.", activites: ["🌾 Crops", "🐄 Livestock", "🐟 Fish farming", "🥬 Market gardening"] },
    agriculture: { activite: "Agriculture", texte: "Farmers, farms, geolocated plots, crops by season, harvests, inputs, stocks, sales and finances." },
    elevage: { activite: "Livestock", texte: "Livestock farmers, herds and animals, health and vaccinations, breeding, weighing, feeding, pastures and production." },
    pisciculture: { activite: "Fish farming", texte: "Ponds and cages, fish batches, water quality, health, hatchery, growth, feeding and harvests." },
    maraichage: { activite: "Market gardening", texte: "Plots and beds, seeds and nursery, crops, protection, irrigation, fertilisation and successive harvests." },
  },
  ha: {
    sahel360: { activite: "Dukan ayyukanka a manhaja ɗaya", texte: "Haɗa manhajarka: noma, kiwo, kiwon kifi da lambu, yadda ka zaɓa, tare da tushe ɗaya (manoma, ma'aji, sayarwa, kuɗaɗe), alaƙa tsakanin ayyuka (taki, harawa, ruwan tafki…) da ribar kowane aiki. Yana ɗauko bayanan manhajojin TAMTUI 4.", activites: ["🌾 Noma", "🐄 Kiwo", "🐟 Kiwon kifi", "🥬 Lambu"] },
    agriculture: { activite: "Noma", texte: "Manoma, gonaki, filaye masu GPS, amfanin gona bisa lokacin noma, girbi, kayan noma, ma'aji, sayarwa da kuɗaɗe." },
    elevage: { activite: "Kiwo", texte: "Makiyaya, garkuna da dabbobi, lafiya da alluran rigakafi, haihuwa, auna nauyi, ciyarwa, makiyaya da samarwa." },
    pisciculture: { activite: "Kiwon kifi", texte: "Tafkuna da keji, rukunin kifaye, ingancin ruwa, lafiya, ƙyanƙyashe, girma, ciyarwa da girbi." },
    maraichage: { activite: "Lambu", texte: "Filaye da kunyoyi, iri da renon shuka, amfanin gona, kariya, ban ruwa, taki da girbi a jere." },
  },
};
const T = {
  fr: {
    titre: "Télécharger les logiciels TAMTUI", description: "Téléchargement officiel des logiciels TAMTUI : TAMTUI SAHEL 360 (toutes les activités), Agriculture, Élevage, Pisciculture et Maraîchage, pour Windows et Mac.",
    h1: "Téléchargez votre logiciel de gestion agro-pastorale", intro: "Logiciels professionnels hors connexion pour les producteurs, coopératives, ONG et services techniques : agriculture, élevage, pisciculture et maraîchage.",
    atouts: ["✓ Fonctionne sans Internet", "✓ Windows et Mac", "✓ Français, anglais, haoussa", "✓ Essai gratuit 14 jours", "✓ Mises à jour automatiques", "✓ Sauvegarde quotidienne"],
    nouveau: "NOUVEAU", intelApple: "Intel et Apple", aPartir360: x => `À partir de <b>${x} FCFA</b> (GESTION, 2 activités)`, aPartir: x => `À partir de <b>${x} FCFA</b> (START)`,
    unePaye: "licence payée une seule fois", voirTarifs: "voir les tarifs", guide: "📘 Guide de l'utilisateur (PDF)", publie: (d, c) => `Publié le ${d} · code ordinateur <code>${c}</code>`,
    installer: "1 · Installer", installerListe: ["<b>Windows</b> : lancez le fichier <code>.exe</code>. Si Windows affiche un avertissement : <i>Informations complémentaires › Exécuter quand même</i>.", "<b>Mac</b> : ouvrez le <code>.dmg</code>, glissez l'application dans <i>Applications</i>, puis au premier lancement : clic droit › <i>Ouvrir</i>.", "<b>Langue</b> : choisissez Français, English ou Hausa en haut de l'écran d'activation (ou dans Paramètres)."],
    essayer: "2 · Essayer puis activer", essayerListe: ["Cliquez sur <i>Essayer … pendant 14 jours</i> (START pour les logiciels métier, GESTION pour TAMTUI SAHEL 360).", "Pour la version complète : <i>Copier le code</i> de l'ordinateur et envoyez-le à votre fournisseur TAMTUI.", "Importez le fichier de licence reçu : le logiciel est activé définitivement."],
    config: "Configuration conseillée", configListe: ["<b>Windows 10 ou 11 (64 bits)</b> — Windows 7 et 8 ne sont pas pris en charge", "macOS 11 et plus récent (Intel ou Apple)", "4 Go de mémoire, 500 Mo d'espace disque", "Écran de 1280 × 800 au minimum", "Internet uniquement pour la météo et les mises à jour"],
    tarifs: "Tarifs", tarifsIntro: "Licence <b>perpétuelle</b>, payée <b>une seule fois</b>, par ordinateur. Prix hors taxes, en FCFA. Pas d'abonnement : les mises à jour sont gratuites.",
    metier: "Logiciels métier : TAMTUI Agriculture, Élevage, Pisciculture, Maraîchage", memesPrix: "(les mêmes prix pour les quatre)", s360: "(plusieurs activités connectées, à partir de GESTION)",
    edition: "Édition", activitesN: n => `${n} activités`, note360: "Le prix de TAMTUI SAHEL 360 correspond aux logiciels séparés + 15 % : vos activités sont connectées dans une seule base (liens entre activités, Bilan 360°, carte et rapports communs). Pour une seule activité, choisissez le logiciel métier.",
    conditions: ["<b>Ordinateur supplémentaire</b> : −20 % sur le prix de la licence.", "<b>Formation</b> (facultative, conseillée) : une seule fois, 30 % du prix de la licence.", "<b>Changement d'ordinateur</b> (panne, vol, remplacement) : nouvelle licence à 40 % du prix.", "<b>Activité ou édition en plus</b> plus tard : vous payez seulement la différence, vos données sont conservées.", "<b>Déjà client d'un logiciel TAMTUI ?</b> Pour passer à TAMTUI SAHEL 360, votre licence est déduite et vos données sont reprises.", "<b>Projets, ONG, services de l'État</b> : licence projet, régionale ou nationale sur devis."],
    hcTitre: "🔌 Ordinateur Windows sans Internet ?", hcTexte: "Windows 11 et les Windows 10 à jour sont prêts. Sur un Windows 10 <b>jamais mis à jour</b> et <b>sans Internet</b>, l'installation a besoin d'un composant de Microsoft (WebView2) : apportez-le avec le logiciel sur une clé USB.",
    hcListe: ["Là où il y a Internet, téléchargez l'installateur Windows du logiciel <b>et</b> le composant ci-contre, puis copiez les deux sur une clé USB.", "Sur l'ordinateur sans Internet, lancez d'abord le <b>composant Microsoft</b> (une seule fois par ordinateur, pour tous les logiciels TAMTUI).", "Lancez ensuite l'installateur TAMTUI : il s'installe sans Internet."],
    hcBouton: "Composant Microsoft WebView2", hcDetail: "officiel, signé par Microsoft · Windows 10/11 64 bits",
    client: "<b>Déjà client ?</b> Votre logiciel se met à jour tout seul : au démarrage, il propose les nouvelles versions (« Nouvelle version disponible › Installer maintenant »). Vos données et votre licence sont conservées, et une sauvegarde est faite avant chaque mise à jour.",
    pied: "TAMTUI SAHEL · Société experte fournisseur · Plateforme nationale du bien-être agro-pastoral", officiel: "Téléchargements officiels — ne téléchargez les logiciels TAMTUI que depuis cette page.",
  },
  en: {
    titre: "Download TAMTUI software", description: "Official download of TAMTUI software: TAMTUI SAHEL 360 (all activities), Agriculture, Livestock, Fish farming and Market gardening, for Windows and Mac.",
    h1: "Download your agro-pastoral management software", intro: "Professional offline software for farmers, cooperatives, NGOs and technical services: agriculture, livestock, fish farming and market gardening.",
    atouts: ["✓ Works without Internet", "✓ Windows and Mac", "✓ French, English, Hausa", "✓ 14-day free trial", "✓ Automatic updates", "✓ Daily backup"],
    nouveau: "NEW", intelApple: "Intel and Apple", aPartir360: x => `From <b>${x} FCFA</b> (GESTION, 2 activities)`, aPartir: x => `From <b>${x} FCFA</b> (START)`,
    unePaye: "licence paid only once", voirTarifs: "see prices", guide: "📘 User guide (PDF, in French)", publie: (d, c) => `Published on ${d} · computer code <code>${c}</code>`,
    installer: "1 · Install", installerListe: ["<b>Windows</b>: run the <code>.exe</code> file. If Windows shows a warning: <i>More info › Run anyway</i>.", "<b>Mac</b>: open the <code>.dmg</code>, drag the application into <i>Applications</i>, then on first launch: right-click › <i>Open</i>.", "<b>Language</b>: choose Français, English or Hausa at the top of the activation screen (or in Settings)."],
    essayer: "2 · Try, then activate", essayerListe: ["Click <i>Try … for 14 days</i> (START for the single-activity software, GESTION for TAMTUI SAHEL 360).", "For the full version: <i>Copy the code</i> of the computer and send it to your TAMTUI supplier.", "Import the licence file you receive: the software is permanently activated."],
    config: "Recommended configuration", configListe: ["<b>Windows 10 or 11 (64-bit)</b> — Windows 7 and 8 are not supported", "macOS 11 or later (Intel or Apple)", "4 GB of memory, 500 MB of disk space", "Screen of at least 1280 × 800", "Internet only for weather and updates"],
    tarifs: "Prices", tarifsIntro: "<b>Perpetual</b> licence, paid <b>only once</b>, per computer. Prices excluding tax, in FCFA. No subscription: updates are free.",
    metier: "Single-activity software: TAMTUI Agriculture, Livestock, Fish farming, Market gardening", memesPrix: "(the same prices for all four)", s360: "(several connected activities, from GESTION)",
    edition: "Edition", activitesN: n => `${n} activities`, note360: "The price of TAMTUI SAHEL 360 is that of the separate software + 15 %: your activities are connected in a single database (links between activities, 360° review, shared map and reports). For a single activity, choose the single-activity software.",
    conditions: ["<b>Additional computer</b>: −20 % on the licence price.", "<b>Training</b> (optional, recommended): once only, 30 % of the licence price.", "<b>Change of computer</b> (breakdown, theft, replacement): new licence at 40 % of the price.", "<b>Extra activity or edition</b> later: you only pay the difference, your data is kept.", "<b>Already using TAMTUI software?</b> To move to TAMTUI SAHEL 360, your licence is deducted and your data is carried over.", "<b>Projects, NGOs, government services</b>: project, regional or national licence on quotation."],
    hcTitre: "🔌 Windows computer without Internet?", hcTexte: "Windows 11 and updated Windows 10 are ready. On a Windows 10 that has <b>never been updated</b> and has <b>no Internet</b>, installation needs a Microsoft component (WebView2): bring it with the software on a USB stick.",
    hcListe: ["Where there is Internet, download the software's Windows installer <b>and</b> the component opposite, then copy both onto a USB stick.", "On the computer without Internet, first run the <b>Microsoft component</b> (once per computer, for all TAMTUI software).", "Then run the TAMTUI installer: it installs without Internet."],
    hcBouton: "Microsoft WebView2 component", hcDetail: "official, signed by Microsoft · Windows 10/11 64-bit",
    client: "<b>Already a customer?</b> Your software updates itself: at start-up, it offers new versions (“New version available › Install now”). Your data and licence are kept, and a backup is made before each update.",
    pied: "TAMTUI SAHEL · Expert supplier company · National platform for agro-pastoral well-being", officiel: "Official downloads — only download TAMTUI software from this page.",
  },
  ha: {
    titre: "Sauke manhajojin TAMTUI", description: "Saukewar hukuma ta manhajojin TAMTUI: TAMTUI SAHEL 360 (dukan ayyuka), Noma, Kiwo, Kiwon kifi da Lambu, don Windows da Mac.",
    h1: "Sauke manhajarka ta gudanar da noma da kiwo", intro: "Manhajojin ƙwararru da ke aiki ba tare da intanet ba ga manoma, ƙungiyoyin haɗin gwiwa, ƙungiyoyi masu zaman kansu da hukumomin fasaha: noma, kiwo, kiwon kifi da lambu.",
    atouts: ["✓ Yana aiki ba tare da intanet ba", "✓ Windows da Mac", "✓ Faransanci, Turanci, Hausa", "✓ Gwaji kyauta na kwanaki 14", "✓ Sabuntawa ta atomatik", "✓ Ajiya ta yau da kullum"],
    nouveau: "SABO", intelApple: "Intel da Apple", aPartir360: x => `Daga <b>FCFA ${x}</b> (GESTION, ayyuka 2)`, aPartir: x => `Daga <b>FCFA ${x}</b> (START)`,
    unePaye: "lasisi da ake biya sau ɗaya kawai", voirTarifs: "duba farashi", guide: "📘 Jagorar mai amfani (PDF, da Faransanci)", publie: (d, c) => `An wallafa ranar ${d} · lambar kwamfuta <code>${c}</code>`,
    installer: "1 · Saka", installerListe: ["<b>Windows</b>: buɗe fayil ɗin <code>.exe</code>. Idan Windows ya nuna gargaɗi: <i>Ƙarin bayani › Gudanar duk da haka</i>.", "<b>Mac</b>: buɗe <code>.dmg</code>, ja manhajar cikin <i>Applications</i>, sannan a farkon buɗewa: danna dama › <i>Buɗe</i>.", "<b>Harshe</b>: zaɓi Français, English ko Hausa a saman allon kunnawa (ko a Saituna)."],
    essayer: "2 · Gwada sannan ka kunna", essayerListe: ["Danna <i>Gwada … na kwanaki 14</i> (START ga manhajojin fanni ɗaya, GESTION ga TAMTUI SAHEL 360).", "Don cikakkiyar siga: <i>Kwafi lambar</i> kwamfutar ka aika wa mai ba ka TAMTUI.", "Shigo da fayil ɗin lasisin da ka karɓa: manhajar za ta kunna har abada."],
    config: "Saitin da aka ba da shawara", configListe: ["<b>Windows 10 ko 11 (64 bits)</b> — ba a tallafa wa Windows 7 da 8 ba", "macOS 11 ko sabo (Intel ko Apple)", "Ƙwaƙwalwa Go 4, wurin ajiya Mo 500", "Allo aƙalla 1280 × 800", "Intanet don yanayi da sabuntawa kawai"],
    tarifs: "Farashi", tarifsIntro: "Lasisin <b>dindindin</b>, ana biya <b>sau ɗaya kawai</b>, ga kowace kwamfuta. Farashi ba tare da haraji ba, a FCFA. Babu biyan wata-wata: sabuntawa kyauta ne.",
    metier: "Manhajojin fanni ɗaya: TAMTUI Noma, Kiwo, Kiwon kifi, Lambu", memesPrix: "(farashi ɗaya ga duka huɗun)", s360: "(ayyuka da yawa a haɗe, daga GESTION)",
    edition: "Siga", activitesN: n => `Ayyuka ${n}`, note360: "Farashin TAMTUI SAHEL 360 shi ne na manhajojin daban-daban + 15 %: ayyukanka suna haɗe a tushe ɗaya (alaƙa tsakanin ayyuka, Bita 360°, taswira da rahotanni na tare). Don aiki ɗaya kawai, zaɓi manhajar fanni ɗaya.",
    conditions: ["<b>Ƙarin kwamfuta</b>: ragi −20 % a farashin lasisi.", "<b>Horo</b> (ba dole ba, ana ba da shawara): sau ɗaya, 30 % na farashin lasisi.", "<b>Canza kwamfuta</b> (lalacewa, sata, maye gurbi): sabon lasisi a 40 % na farashi.", "<b>Ƙarin aiki ko siga</b> daga baya: za ka biya bambancin kawai, bayananka suna nan.", "<b>Kana amfani da manhajar TAMTUI tuni?</b> Don komawa TAMTUI SAHEL 360, za a cire kuɗin lasisinka kuma a ɗauko bayananka.", "<b>Ayyuka, ƙungiyoyi, hukumomin gwamnati</b>: lasisin aiki, na yanki ko na ƙasa bisa ƙiyasin farashi."],
    hcTitre: "🔌 Kwamfutar Windows ba tare da intanet ba?", hcTexte: "Windows 11 da Windows 10 da aka sabunta suna shirye. A kan Windows 10 da <b>ba a taɓa sabuntawa ba</b> kuma <b>babu intanet</b>, sakawa tana buƙatar wani abu na Microsoft (WebView2): kawo shi tare da manhajar a filasha.",
    hcListe: ["Inda akwai intanet, sauke mai saka manhajar na Windows <b>da</b> abin da ke gefe, sannan ka kwafe su biyun a filasha.", "A kan kwamfutar da babu intanet, da farko ka buɗe <b>abin na Microsoft</b> (sau ɗaya ga kowace kwamfuta, don dukan manhajojin TAMTUI).", "Sannan ka buɗe mai saka TAMTUI: zai saku ba tare da intanet ba."],
    hcBouton: "Abin Microsoft WebView2", hcDetail: "na hukuma, Microsoft ya sa hannu · Windows 10/11 64 bits",
    client: "<b>Kana amfani tuni?</b> Manhajarka tana sabunta kanta: lokacin farawa, tana ba da sababbin sigogi (« Akwai sabuwar siga › Saka yanzu »). Bayananka da lasisinka suna nan, kuma ana yin ajiya kafin kowace sabuntawa.",
    pied: "TAMTUI SAHEL · Kamfani ƙwararre mai samar da kayayyaki · Dandalin ƙasa na jin daɗin noma da kiwo", officiel: "Saukewar hukuma — ka sauke manhajojin TAMTUI daga wannan shafi kawai.",
  },
};
const guides = existsSync(join(RACINE, "guides")) ? readdirSync(join(RACINE, "guides")) : [];
const logo = existsSync(join(RACINE, "logo.png"));
const logoComplet = existsSync(join(RACINE, "logo-complet.png"));
// Composant Microsoft WebView2 hors connexion (publié par le workflow « Composant Windows hors connexion »).
let composant = null;
try {
  const a = JSON.parse(gh("api", `repos/${PUBLIC}/releases/tags/composant-webview2`)).assets.find(x => x.name.endsWith(".exe"));
  if (a) composant = { url: a.browser_download_url, taille: taille(a.size) };
} catch { /* pas encore publié */ }
const contact = [CONTACT.telephone && `📞 ${e(CONTACT.telephone)}`, CONTACT.whatsapp && `💬 WhatsApp ${e(CONTACT.whatsapp)}`, CONTACT.email && `✉️ <a href="mailto:${e(CONTACT.email)}">${e(CONTACT.email)}</a>`].filter(Boolean).join(" · ");
const STYLE = `<style>
:root{--vert:#0d6538;--vert-fonce:#073e25;--vert-doux:#e6f4ea;--orange:#a85b13;--gris:#5c6b62;--bord:#d8e4dc;--fond:#f2f6f3}
*{box-sizing:border-box}body{margin:0;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:#17231c;background:var(--fond);line-height:1.55}
a{color:var(--vert)}.bandeau{background:linear-gradient(125deg,var(--vert-fonce),var(--vert) 65%,#17844c);color:#fff;padding:42px 20px 92px}
.conteneur{max-width:1150px;margin:0 auto}.marque{display:flex;align-items:center;gap:16px}.marque img{width:72px;height:72px;border-radius:50%;background:#fff;padding:5px;object-fit:contain}
.marque img.complet{width:auto;height:74px;border-radius:14px;padding:7px 14px}.marque b{font-size:24px;letter-spacing:.06em;display:block}.marque span{color:#cfeedb;font-size:13px;letter-spacing:.18em}
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
.langues{position:absolute;top:18px;right:20px;display:flex;gap:6px}.langues a{color:#fff;text-decoration:none;font-weight:800;font-size:13px;border:1px solid #ffffff55;border-radius:99px;padding:5px 11px}.langues a.actif{background:#fff;color:var(--vert)}.bandeau{position:relative}
</style>`;
function page(L) {
  const t = T[L.code], r = L.dossier ? "../" : "";
  const cartes = PRODUITS.filter(p => etat[p.id]).map(p => {
    const s = etat[p.id], guide = guides.find(g => g.includes(p.base)), tr = { ...p, ...(PRODUITS_TRAD[L.code]?.[p.id] ?? {}) };
    return `<article class="carte${p.vedette ? " vedette" : ""}" style="--c:${p.couleur}">${p.vedette ? `<span class="nouveau">${t.nouveau}</span>` : ""}
    <header><span class="icone">${p.icone}</span><div><h2>${e(p.nom)}</h2><span class="activite">${e(tr.activite)}</span></div><span class="version">v${e(s.version)}</span></header>
    <p>${e(tr.texte)}</p>${tr.activites ? `<div class="puces">${tr.activites.map(a => `<span>${e(a)}</span>`).join("")}</div>` : ""}
    <div class="boutons">
      <a class="bouton" href="${e(s.windows.url)}" data-umami-event="telechargement" data-umami-event-logiciel="${e(p.nom)}" data-umami-event-systeme="Windows" data-umami-event-langue="${L.code}">⊞ Windows <small>${e(s.windows.taille)} · .exe</small></a>
      <a class="bouton" href="${e(s.mac.url)}" data-umami-event="telechargement" data-umami-event-logiciel="${e(p.nom)}" data-umami-event-systeme="Mac" data-umami-event-langue="${L.code}">🍎 Mac <small>${e(s.mac.taille)} · ${t.intelApple}</small></a>
    </div>
    <p class="aPartir">${p.vedette ? t.aPartir360(fcfa(prix360("GESTION", 2))) : t.aPartir(fcfa(PRIX.START))} · ${t.unePaye} · <a href="#tarifs">${t.voirTarifs}</a></p>
    <footer>${guide ? `<a href="${r}guides/${e(guide)}" data-umami-event="guide" data-umami-event-logiciel="${e(p.nom)}">${t.guide}</a>` : ""}<span>${t.publie(dateLangue(s.date, L.code), p.prefixe)}</span></footer>
  </article>`;
  }).join("\n");
  const liste = (tag, l) => `<${tag}>${l.map(x => `<li>${x}</li>`).join("")}</${tag}>`;
  const blocHorsConnexion = composant ? `<section class="horsConnexion">
    <div><h3>${t.hcTitre}</h3><p>${t.hcTexte}</p>${liste("ol", t.hcListe)}</div>
    <a class="bouton composant" href="${e(composant.url)}" data-umami-event="composant-microsoft">⊞ ${t.hcBouton}<small>${e(composant.taille)} · ${t.hcDetail}</small></a>
  </section>` : "";
  const blocTarifs = `<section class="tarifs" id="tarifs">
    <h2>${t.tarifs}</h2>
    <p class="sousTitre">${t.tarifsIntro}</p>
    <h3>${t.metier} <small>${t.memesPrix}</small></h3>
    <div class="tableau"><table><tr>${EDITIONS.map(ed => `<th>${ed}</th>`).join("")}</tr><tr>${EDITIONS.map(ed => `<td>${fcfa(PRIX[ed])}</td>`).join("")}</tr></table></div>
    <h3 class="violet">TAMTUI SAHEL 360 <small>${t.s360}</small></h3>
    <div class="tableau"><table><tr><th>${t.edition}</th>${[2, 3, 4].map(n => `<th>${t.activitesN(n)}</th>`).join("")}</tr>${EDITIONS.slice(1).map(ed => `<tr><td><b>${ed}</b></td>${[2, 3, 4].map(n => `<td>${fcfa(prix360(ed, n))}</td>`).join("")}</tr>`).join("")}</table></div>
    <p class="petit">${t.note360}</p>
    ${liste("ul class=\"conditions\"", t.conditions).replace("</ul class=\"conditions\">", "</ul>")}
  </section>`;
  const langues = `<nav class="langues" aria-label="Langue / Language / Harshe">${LANGUES.map(x => `<a href="${r}${x.dossier}" hreflang="${x.code}"${x.code === L.code ? ' class="actif" aria-current="page"' : ""}>${x.nom}</a>`).join("")}</nav>`;
  const alternates = LANGUES.map(x => `<link rel="alternate" hreflang="${x.code}" href="${SITE}/${x.dossier}">`).join("");
  return `<!doctype html>
<html lang="${L.code}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${t.titre}</title>
<meta name="description" content="${e(t.description)}">${alternates}
${STYLE}
<script defer src="https://cloud.umami.is/script.js" data-website-id="c5e464d4-0178-4b07-b062-bbfcd5ac9f43"></script></head><body>
<div class="bandeau"><div class="conteneur">
  ${langues}
  <div class="marque">${logoComplet ? `<img class="complet" src="${r}logo-complet.png" alt="TAMTUI Sahel">` : `${logo ? `<img src="${r}logo.png" alt="TAMTUI">` : ""}<div><b>TAMTUI</b><span>SAHEL</span></div>`}</div>
  <h1>${t.h1}</h1>
  <p>${t.intro}</p>
  <div class="atouts">${t.atouts.map(a => `<span>${a}</span>`).join("")}</div>
</div></div>
<main class="conteneur">
  <div class="grille">${cartes}</div>
  <section class="infos">
    <div class="info"><h3>${t.installer}</h3>${liste("ol", t.installerListe)}</div>
    <div class="info"><h3>${t.essayer}</h3>${liste("ol", t.essayerListe)}</div>
    <div class="info"><h3>${t.config}</h3>${liste("ul", t.configListe)}</div>
  </section>
  ${blocTarifs}
  ${blocHorsConnexion}
  <div class="note">${t.client}</div>
</main>
<footer class="pied">${t.pied}${contact ? `<br>${contact}` : ""}<br>${t.officiel}</footer>
</body></html>
`;
}
for (const L of LANGUES) {
  if (L.dossier) mkdirSync(join(RACINE, L.dossier), { recursive: true });
  writeFileSync(join(RACINE, L.dossier, "index.html"), page(L));
}
writeFileSync(fichierEtat, JSON.stringify(etat, null, 2) + "\n");
console.log("Pages index.html régénérées (fr, en/, ha/).");
if (!SIMULATION && change) {
  const git = (...a) => execFileSync("git", ["-C", RACINE, ...a], { stdio: "inherit" });
  git("add", "-A"); git("commit", "-m", "Publication des nouvelles versions"); git("push", "origin", "main");
}
