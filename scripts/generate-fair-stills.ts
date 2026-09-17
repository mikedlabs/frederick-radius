import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import sharp from "sharp";
import QRCode from "qrcode";

const ROOT = process.cwd();
const PHOTOS_DIR = path.join(ROOT, "public/images/fair");
const OUT_DIR = path.join(ROOT, "public/images/fair/stills");
const ARTIFACT_DIR = "/Users/miked/.gemini/antigravity/brain/dceb3d5d-7e08-4a56-88dc-c98859e92510";

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const caslonBase64 = fs.readFileSync(path.join(ROOT, "scripts/brand-fonts/LibreCaslonDisplay-Regular.ttf")).toString("base64");
const publicSansBoldBase64 = fs.readFileSync(path.join(ROOT, "scripts/brand-fonts/static/PublicSans-Bold.ttf")).toString("base64");
const publicSansMediumBase64 = fs.readFileSync(path.join(ROOT, "scripts/brand-fonts/static/PublicSans-Medium.ttf")).toString("base64");
const publicSansRegularBase64 = fs.readFileSync(path.join(ROOT, "scripts/brand-fonts/static/PublicSans-Regular.ttf")).toString("base64");

interface StillConfig {
  id: string;
  sourcePhoto: string;
  cropXOffset: number;
  cropYOffset: number;
  topKicker: string;
  badgeAccent: string;
  title: string;
  subtitleLines: string[];
  tags: string[];
  urlText: string;
  credit: string;
}

const STILLS: StillConfig[] = [
  {
    id: "fair-outro-master",
    sourcePhoto: "fairgrounds-night-mike-d-1920.jpg",
    cropXOffset: 0.5,
    cropYOffset: 0.4,
    topKicker: "THE GREAT FREDERICK FAIR · SEPT 18–26, 2026",
    badgeAccent: "#E14328",
    title: "The Great Frederick Fair",
    subtitleLines: [
      "Your daily pocket guide to tonight's live schedule,",
      "parking cash lots, grandstand tickets, and local food."
    ],
    tags: ["SEPT 18–26", "LIVE SCHEDULE", "PARKING $10", "GROUNDS MAP"],
    urlText: "frederickradius.com/fair",
    credit: "Photo by Mike D · Frederick Radius",
  },
  {
    id: "fair-outro-midway",
    sourcePhoto: "fairgrounds-ferris-wheel-mike-d-1920.jpg",
    cropXOffset: 0.52,
    cropYOffset: 0.45,
    topKicker: "CARNIVAL MIDWAY & NIGHT LIGHTS",
    badgeAccent: "#E59E28",
    title: "Lights on the Midway",
    subtitleLines: [
      "Unlimited ride wristbands, spinning coasters,",
      "carnival skill games, and classic night fairgrounds energy."
    ],
    tags: ["RIDE PASSES", "FERRIS WHEEL", "NIGHT HOURS", "MIDWAY GAMES"],
    urlText: "frederickradius.com/fair",
    credit: "Photo by Mike D · Frederick Radius",
  },
  {
    id: "fair-outro-grandstand",
    sourcePhoto: "fairgrounds-night-mike-d-1920.jpg",
    cropXOffset: 0.18,
    cropYOffset: 0.35,
    topKicker: "HISTORIC GRANDSTAND & ARENA",
    badgeAccent: "#388EAB",
    title: "Track Shows & Music",
    subtitleLines: [
      "Demolition Derby, Tractor & Truck Pulls, Danny Gokey,",
      "Let's Sing Taylor, and Warren Zeiders live on the track."
    ],
    tags: ["DEMOLITION DERBY", "TRACTOR PULL", "LIVE CONCERTS", "TRACK SEATS"],
    urlText: "frederickradius.com/fair",
    credit: "Photo by Mike D · Frederick Radius",
  },
  {
    id: "fair-outro-food",
    sourcePhoto: "fairgrounds-midway-mike-d-1920.jpg",
    cropXOffset: 0.72,
    cropYOffset: 0.5,
    topKicker: "LOCAL LEGENDS & FAIR FOOD",
    badgeAccent: "#4FA672",
    title: "Taste of the Fair",
    subtitleLines: [
      "Hemp's slow-roasted pit beef, famous Dairy Bar milkshakes,",
      "fresh-fried funnel cakes, and Maryland crab cakes."
    ],
    tags: ["HEMP'S MEATS", "DAIRY BAR SHAKES", "FUNNEL CAKES", "JB SEAFOOD"],
    urlText: "frederickradius.com/fair",
    credit: "Photo by Mike D · Frederick Radius",
  },
];

async function generateStillsAndVideos() {
  console.log("Generating 9x16 stills and motion video outros from Mike D's fair photography...");

  const qrSvgRaw = await QRCode.toString("https://frederickradius.com/fair", {
    type: "svg",
    margin: 0,
    color: { dark: "#F4EEE2", light: "#00000000" },
  });
  const qrInner = qrSvgRaw.replace(/<\/?svg[^>]*>/g, "");

  for (const config of STILLS) {
    console.log(`\nProcessing ${config.id}...`);
    const photoPath = path.join(PHOTOS_DIR, config.sourcePhoto);
    const photoMeta = await sharp(photoPath).metadata();

    if (!photoMeta.width || !photoMeta.height) {
      throw new Error(`Failed to read metadata for ${photoPath}`);
    }

    const targetPhotoWidth = 1080;
    const targetPhotoHeight = 1260;

    const cropWidth = Math.min(Math.round(photoMeta.height * (targetPhotoWidth / targetPhotoHeight)), photoMeta.width);
    const cropHeight = photoMeta.height;
    const cropLeft = Math.max(0, Math.min(Math.round((photoMeta.width - cropWidth) * config.cropXOffset), photoMeta.width - cropWidth));
    const cropTop = 0;

    const croppedPhotoBuffer = await sharp(photoPath)
      .extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight })
      .resize(targetPhotoWidth, targetPhotoHeight, { fit: "cover" })
      .toBuffer();

    // 1. Overlay SVG
    const svgOverlay = `
      <svg width="1080" height="1920" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <style>
            @font-face {
              font-family: 'Libre Caslon Display';
              src: url('data:font/truetype;charset=utf-8;base64,${caslonBase64}') format('truetype');
            }
            @font-face {
              font-family: 'Public Sans';
              font-weight: 700;
              src: url('data:font/truetype;charset=utf-8;base64,${publicSansBoldBase64}') format('truetype');
            }
            @font-face {
              font-family: 'Public Sans';
              font-weight: 500;
              src: url('data:font/truetype;charset=utf-8;base64,${publicSansMediumBase64}') format('truetype');
            }
            @font-face {
              font-family: 'Public Sans';
              font-weight: 400;
              src: url('data:font/truetype;charset=utf-8;base64,${publicSansRegularBase64}') format('truetype');
            }

            .editorial-title {
              font-family: 'Libre Caslon Display', serif;
              fill: #F4EEE2;
              font-size: 66px;
              letter-spacing: -0.5px;
            }
            .kicker {
              font-family: 'Public Sans', sans-serif;
              font-weight: 700;
              font-size: 19px;
              letter-spacing: 2.8px;
              fill: #F4EEE2;
            }
            .subtitle {
              font-family: 'Public Sans', sans-serif;
              font-weight: 400;
              font-size: 24px;
              fill: #C8C2B7;
            }
            .tag-text {
              font-family: 'Public Sans', sans-serif;
              font-weight: 700;
              font-size: 16px;
              letter-spacing: 1px;
              fill: #F4EEE2;
            }
            .url-text {
              font-family: 'Public Sans', sans-serif;
              font-weight: 700;
              font-size: 33px;
              letter-spacing: 0.5px;
              fill: #F4EEE2;
            }
            .credit-text {
              font-family: 'Public Sans', sans-serif;
              font-weight: 500;
              font-size: 18px;
              letter-spacing: 0.5px;
              fill: #988F80;
            }
          </style>

          <linearGradient id="topVignette" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#080B10" stop-opacity="0.96"/>
            <stop offset="40%" stop-color="#080B10" stop-opacity="0.75"/>
            <stop offset="75%" stop-color="#080B10" stop-opacity="0.25"/>
            <stop offset="100%" stop-color="#080B10" stop-opacity="0"/>
          </linearGradient>

          <linearGradient id="photoBottomFade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#080B10" stop-opacity="0"/>
            <stop offset="35%" stop-color="#080B10" stop-opacity="0.4"/>
            <stop offset="70%" stop-color="#080B10" stop-opacity="0.88"/>
            <stop offset="100%" stop-color="#080B10" stop-opacity="1"/>
          </linearGradient>

          <linearGradient id="cardGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#141A24" stop-opacity="0.96"/>
            <stop offset="100%" stop-color="#0B0E14" stop-opacity="0.99"/>
          </linearGradient>

          <linearGradient id="btnGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="${config.badgeAccent}"/>
            <stop offset="100%" stop-color="#B5300F"/>
          </linearGradient>
        </defs>

        <rect x="0" y="0" width="1080" height="360" fill="url(#topVignette)"/>

        <g transform="translate(540, 150)">
          <rect x="-330" y="-32" width="660" height="64" rx="32" fill="#0C1017" fill-opacity="0.92" stroke="${config.badgeAccent}" stroke-width="2.2"/>
          <circle cx="-285" cy="0" r="7" fill="${config.badgeAccent}"/>
          <text x="-260" y="7" class="kicker" text-anchor="start">${escapeXml(config.topKicker)}</text>
        </g>

        <rect x="0" y="880" width="1080" height="380" fill="url(#photoBottomFade)"/>

        <rect x="0" y="1260" width="1080" height="660" fill="#080B10"/>

        <g transform="translate(60, 1140)">
          <rect x="0" y="0" width="960" height="630" rx="36" fill="url(#cardGrad)" stroke="rgba(244, 238, 226, 0.12)" stroke-width="2"/>
          <path d="M 44,0 L 170,0" stroke="${config.badgeAccent}" stroke-width="4.5" stroke-linecap="round"/>

          <text x="56" y="92" class="editorial-title">${escapeXml(config.title)}</text>
          <text x="56" y="142" class="subtitle">${escapeXml(config.subtitleLines[0])}</text>
          <text x="56" y="176" class="subtitle">${escapeXml(config.subtitleLines[1])}</text>

          <g transform="translate(56, 225)">
            ${config.tags.map((tag, idx) => {
              const xPos = idx * 216;
              return `
                <g transform="translate(${xPos}, 0)">
                  <rect x="0" y="0" width="204" height="46" rx="14" fill="rgba(255, 255, 255, 0.05)" stroke="rgba(255, 255, 255, 0.1)" stroke-width="1.5"/>
                  <text x="102" y="29" class="tag-text" text-anchor="middle">${escapeXml(tag)}</text>
                </g>
              `;
            }).join("")}
          </g>

          <g transform="translate(56, 310)">
            <rect x="0" y="0" width="848" height="132" rx="24" fill="#18202C" stroke="${config.badgeAccent}" stroke-width="2.5"/>
            <rect x="22" y="24" width="84" height="84" rx="18" fill="url(#btnGrad)"/>
            <circle cx="64" cy="66" r="25" fill="none" stroke="#F4EEE2" stroke-width="3"/>
            <circle cx="64" cy="66" r="15" fill="none" stroke="#F4EEE2" stroke-width="2.5" stroke-dasharray="4 3"/>
            <circle cx="64" cy="66" r="5" fill="#F4EEE2"/>

            <text x="135" y="58" font-family="'Public Sans', sans-serif" font-size="16px" font-weight="700" letter-spacing="2px" fill="${config.badgeAccent}">VISIT THE OFFICIAL GUIDE</text>
            <text x="135" y="96" class="url-text">${escapeXml(config.urlText)}</text>

            <rect x="732" y="20" width="92" height="92" rx="14" fill="#0C1017" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>
            <g transform="translate(740, 28) scale(2.28)">
              ${qrInner}
            </g>
          </g>

          <g transform="translate(56, 490)">
            <circle cx="8" cy="18" r="5.5" fill="#48BB78"/>
            <text x="24" y="24" font-family="'Public Sans', sans-serif" font-size="20px" font-weight="700" fill="#E2E8F0">Frederick Radius</text>
            <text x="180" y="24" font-family="'Public Sans', sans-serif" font-size="20px" font-weight="400" fill="#A0AEC0">· Daily Verified Fair Data</text>
            <text x="848" y="24" class="credit-text" text-anchor="end">${escapeXml(config.credit)}</text>
          </g>
        </g>

        <g transform="translate(540, 1850)">
          <text x="0" y="0" font-family="'Public Sans', sans-serif" font-size="17px" font-weight="600" letter-spacing="2px" fill="#586070" text-anchor="middle">THE GREAT FREDERICK FAIR · CITY OF FREDERICK, MD</text>
        </g>
      </svg>
    `;

    // 2. Composite Still PNG and JPG
    const baseCanvas = sharp({
      create: {
        width: 1080,
        height: 1920,
        channels: 4,
        background: { r: 8, g: 11, b: 16, alpha: 1 },
      },
    });

    const finalImageBuffer = await baseCanvas
      .composite([
        { input: croppedPhotoBuffer, top: 0, left: 0 },
        { input: Buffer.from(svgOverlay), top: 0, left: 0 },
      ])
      .png({ compressionLevel: 8 })
      .toBuffer();

    const outPngPath = path.join(OUT_DIR, `${config.id}.png`);
    fs.writeFileSync(outPngPath, finalImageBuffer);
    console.log(`Saved PNG Still: ${outPngPath}`);

    const outJpgPath = path.join(OUT_DIR, `${config.id}.jpg`);
    const jpgBuffer = await sharp(finalImageBuffer).jpeg({ quality: 92 }).toBuffer();
    fs.writeFileSync(outJpgPath, jpgBuffer);
    console.log(`Saved JPG Still: ${outJpgPath}`);

    // Copy to artifact directory
    fs.writeFileSync(path.join(ARTIFACT_DIR, `${config.id}.png`), finalImageBuffer);
    fs.writeFileSync(path.join(ARTIFACT_DIR, `${config.id}.jpg`), jpgBuffer);

    // 3. Export standalone transparent graphics overlay for video compositing
    const overlayPngBuffer = await sharp(Buffer.from(svgOverlay)).png().toBuffer();
    const overlayPath = path.join(OUT_DIR, `${config.id}-overlay.png`);
    fs.writeFileSync(overlayPath, overlayPngBuffer);

    // 4. Also save the cropped base photo for video layer 0
    const photoBaseCanvas = sharp({
      create: {
        width: 1080,
        height: 1920,
        channels: 4,
        background: { r: 8, g: 11, b: 16, alpha: 1 },
      },
    });
    const photoFullCanvasBuffer = await photoBaseCanvas
      .composite([{ input: croppedPhotoBuffer, top: 0, left: 0 }])
      .png()
      .toBuffer();
    const photoFullCanvasPath = path.join(OUT_DIR, `${config.id}-base-photo.png`);
    fs.writeFileSync(photoFullCanvasPath, photoFullCanvasBuffer);

    // 5. Render 5-Second 1080x1920 60fps MP4 with Ken Burns subtle drift on photo + anchored graphics!
    const outMp4Path = path.join(OUT_DIR, `${config.id}-motion-5s.mp4`);
    console.log(`Encoding 5-second 60fps MP4 video outro: ${outMp4Path}...`);

    const ffmpegCmd = [
      "ffmpeg",
      "-y",
      "-loop", "1",
      "-t", "5",
      "-i", `"${photoFullCanvasPath}"`,
      "-loop", "1",
      "-t", "5",
      "-i", `"${overlayPath}"`,
      "-filter_complex",
      `"[0:v]scale=1200:2133,zoompan=z='min(zoom+0.00035,1.06)':d=300:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=60[bg]; [1:v]format=rgba[fg]; [bg][fg]overlay=0:0:format=auto[out]"`,
      "-map", `"[out]"`,
      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
      "-preset", "medium",
      "-crf", "19",
      `"${outMp4Path}"`
    ].join(" ");

    execSync(ffmpegCmd, { stdio: "ignore" });
    console.log(`Saved MP4 Video Outro: ${outMp4Path}`);

    // Copy MP4 to artifact directory
    const artifactMp4Path = path.join(ARTIFACT_DIR, `${config.id}-motion-5s.mp4`);
    fs.copyFileSync(outMp4Path, artifactMp4Path);
  }

  console.log("\nAll 4 authentic 9x16 stills AND motion video outros generated successfully!");
}

generateStillsAndVideos().catch((err) => {
  console.error("Error generating stills and videos:", err);
  process.exit(1);
});
