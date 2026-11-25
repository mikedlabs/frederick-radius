import { WALK_VIEW, projectWalkSite, walkCreek, walkSites, walkStreets, type WalkSiteId } from "@/data/downtown-walk-map";
import type { GuideStop } from "@/lib/today/local-outing-guides";
import styles from "./WalkStopMap.module.css";

export default function WalkStopMap({ stops }: { stops: GuideStop[] }) {
  const markers = stops.flatMap((stop, index) => {
    if (!stop.anchor || !Object.hasOwn(walkSites, stop.anchor)) return [];
    const site = walkSites[stop.anchor as WalkSiteId];
    const point = projectWalkSite(site.lng, site.lat);
    return [{ stop, site, point, number: index + 1, labelX: point.x + site.dx, labelY: point.y + site.dy }];
  });
  return (
    <figure className={styles.map} aria-label="Downtown stop locations">
      <div className={styles.frame}>
        <svg viewBox={`0 0 ${WALK_VIEW.width} ${WALK_VIEW.height}`} aria-hidden="true" className={styles.background}>
          <path d={walkCreek} className={styles.water} />
          {walkStreets.map(path => <path key={path} d={path} className={styles.streetEdge} />)}
          {walkStreets.map(path => <path key={path} d={path} className={styles.street} />)}
          <text x="9" y="18" transform="rotate(3 9 18)" className={styles.creekLabel}>Carroll Creek</text>
          <text x="10" y="145" transform="rotate(3 10 145)" className={styles.streetLabel}>E All Saints St</text>
          <text x="111" y="230" transform="rotate(-84 111 230)" className={styles.streetLabel}>S Carroll St</text>
          <text x="299" y="221" transform="rotate(-85 299 221)" className={styles.streetLabel}>S East St</text>
          {markers.map(({ stop, site, point, labelX, labelY }) => (
            <g key={stop.anchor}>
              <path d={site.footprint} className={styles.footprint} />
              <line x1={point.x} y1={point.y} x2={labelX} y2={labelY} className={styles.leader} />
              <circle cx={point.x} cy={point.y} r="3" className={styles.dot} />
            </g>
          ))}
        </svg>
        <span className={styles.north} aria-hidden="true">↑ N</span>
        {markers.map(({ stop, site, number, labelX, labelY }) => (
          <a key={stop.anchor} href={`#${stop.anchor}`} className={styles.pin} data-side={site.side}
            aria-label={`Stop ${number}, ${stop.routeName ?? stop.title}${stop.suggestedMinutes ? `, ${stop.suggestedMinutes} minutes` : ", start here"}`}
            style={{ left: `${100 * labelX / WALK_VIEW.width}%`, top: `${100 * labelY / WALK_VIEW.height}%` }}>
            <span className={styles.number}>{number}</span><span className={styles.name}>{site.label}</span>
          </a>
        ))}
      </div>
      <figcaption className={styles.caption}>
        <span>Choose a stop for details</span>
        <span className="sr-only">North is up. Community Bridge is northwest of the garage.{stops.some(stop => stop.anchor === "visitor-center") && " The Visitor Center is southeast of the garage. The Delaplaine is north of the garage, beside the creek."}</span>
        <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>
      </figcaption>
    </figure>
  );
}
